const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/finnegans-token.js');

function request(overrides = {}) {
  return {method:'POST', headers:{host:'cashflow.example','content-type':'application/json',origin:'https://cashflow.example'}, body:{client_id:'test-id',client_secret:'test-secret'}, ...overrides};
}
function response() {
  return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};
}
async function invoke(req, fetcher) {
  const original=global.fetch;
  global.fetch=fetcher||(()=>{throw new Error('Unexpected upstream request')});
  try {const res=response();await handler(req,res);return res} finally {global.fetch=original}
}

test('exchanges credentials using the documented POST header and plain-text token', async()=>{
  const res=await invoke(request(),async(url,init)=>{
    assert.equal(url,'https://api.finneg.com/api/oauth/token');
    assert.equal(init.method,'POST');
    assert.equal(init.headers.authorization,'Basic test-secret');
    assert.equal(init.redirect,'error');
    const params=new URLSearchParams(init.body);
    assert.equal(params.get('client_id'),'test-id');
    assert.equal(params.get('grant_type'),'client_credentials');
    assert.equal(params.has('client_secret'),false);
    return new Response('  header.payload.signature\n',{status:200});
  });
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{access_token:'header.payload.signature',expires_in:3600});
  assert.match(res.headers['Cache-Control'],/no-store/);
  assert.equal(res.headers['Vercel-CDN-Cache-Control'],'no-store');
});
test('rejects GET without making a provider request',async()=>{
  const r=await invoke(request({method:'GET'}));assert.equal(r.statusCode,405);assert.equal(r.headers.Allow,'POST');
});
test('rejects another website origin',async()=>{
  const r=await invoke(request({headers:{host:'cashflow.example',origin:'https://other.example','content-type':'application/json'}}));assert.equal(r.statusCode,403);
});
test('requires JSON instead of form or query credentials',async()=>{
  const r=await invoke(request({headers:{host:'cashflow.example','content-type':'text/plain'}}));assert.equal(r.statusCode,415);
});
test('rejects missing, invalid, oversized, or header-injection credentials',async()=>{
  for(const body of [null,{},[],{client_id:'a',client_secret:''},{client_id:12,client_secret:'x'},{client_id:'a',client_secret:'a\r\nb'},{client_id:'x'.repeat(513),client_secret:'a'}]){
    const r=await invoke(request({body}));assert.equal(r.statusCode,400);
  }
});
test('rejects malformed JSON and oversized request body',async()=>{
  assert.equal((await invoke(request({body:'{not json'}))).statusCode,400);
  assert.equal((await invoke(request({body:' '.repeat(12001)}))).statusCode,413);
});
test('accepts JSON string request bodies and trims client id',async()=>{
  const r=await invoke(request({body:JSON.stringify({client_id:' test-id ',client_secret:'test-secret'})}),async(_,init)=>{
    assert.equal(new URLSearchParams(init.body).get('client_id'),'test-id');return new Response('token');
  });assert.equal(r.statusCode,200);
});
test('returns credential errors without exposing provider response or secrets',async()=>{
  for(const status of [400,401,403]){
    const r=await invoke(request(),async()=>new Response('test-secret provider internal detail',{status}));
    assert.equal(r.statusCode,401);assert.ok(!JSON.stringify(r.body).includes('test-secret'));assert.ok(!JSON.stringify(r.body).includes('internal detail'));
  }
});
test('handles provider outage and throttling separately',async()=>{
  for(const [upstream,expected]of [[500,502],[429,429]]){
    const r=await invoke(request(),async()=>new Response('internal',{status:upstream}));assert.equal(r.statusCode,expected);
  }
});
test('does not accept empty or HTML responses as a token',async()=>{
  for(const token of ['', '<html>Provider error</html>']){
    const r=await invoke(request(),async()=>new Response(token));assert.equal(r.statusCode,502);
  }
});
test('network and timeout failures do not leak request credentials',async()=>{
  for(const [name,status]of [['Error',502],['TimeoutError',504],['AbortError',504]]){
    const r=await invoke(request(),async()=>{const e=new Error('test-secret');e.name=name;throw e});
    assert.equal(r.statusCode,status);assert.ok(!JSON.stringify(r.body).includes('test-secret'));
  }
});
