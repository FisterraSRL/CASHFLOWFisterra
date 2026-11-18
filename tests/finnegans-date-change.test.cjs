const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../lib/workspace-store.cjs'),shared=require('../lib/finnegans-shared.cjs');
const oldRead=store.readWorkspace,oldToken=shared.sharedToken,oldFetch=global.fetch;
const variables=['CASHFLOW_DATABASE_DATABASE_URL','CASHFLOW_DATABASE_URL','DATABASE_URL','CASHFLOW_ACCESS_KEY','CASHFLOW_INSTALLATION_NAME'];
const original=Object.fromEntries(variables.map(k=>[k,process.env[k]]));
let saved={source:'CLI',asientoItemId:1369927,date:'2026-11-25',status:'pending'};
store.readWorkspace=async()=>({payload:{state:{dateChanges:{'CLI|1369927':saved}}}});
shared.sharedToken=async()=> 'shared.test.token';
const handler=require('../api/finnegans-date-change.js');
test.after(()=>{store.readWorkspace=oldRead;shared.sharedToken=oldToken;global.fetch=oldFetch;for(const[k,v]of Object.entries(original))if(v===undefined)delete process.env[k];else process.env[k]=v});

function protectedMode(){process.env.CASHFLOW_DATABASE_DATABASE_URL='postgresql://test.invalid/db';process.env.CASHFLOW_ACCESS_KEY='long-test-access-key'}
async function invoke(body,headers={}){
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
  await handler({method:'POST',headers:{host:'cashflow.example',origin:'https://cashflow.example','content-type':'application/json','x-cashflow-key':'long-test-access-key',...headers},body},res);return res;
}
const change={source:'CLI',asientoItemId:1369927,date:'2026-11-25',shared:true};

test('sends only a saved pending journal item using the documented GET parameters and a server token',async()=>{
  protectedMode();saved={...saved,status:'pending'};
  let calls=0;
  global.fetch=async(url,options)=>{calls++;const u=new URL(url);assert.equal(options.method,'GET');assert.equal(u.pathname,'/api/reports/ActualizarFechaCashflowAsientoItem');assert.equal(u.searchParams.get('ACCESS_TOKEN'),'shared.test.token');assert.equal(u.searchParams.get('AsientoItemID'),'1369927');assert.equal(u.searchParams.get('FechaCashflow'),'2026-11-25');return new Response('[{"RESULTADO":"OK"}]')};
  const r=await invoke(change);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{confirmed:true,source:'CLI',asientoItemId:'1369927',date:'2026-11-25'});assert.equal(calls,1);assert.ok(!JSON.stringify(r.body).includes('token'));
});

test('never confirms an absent, malformed or unsuccessful Finnegans result',async()=>{
  protectedMode();saved={...saved,status:'pending'};
  for(const response of ['[]','[{"RESULTADO":"ERROR"}]','{"RESULTADO":"OK"}','not json','']){
    global.fetch=async()=>new Response(response);
    const r=await invoke(change);assert.equal(r.statusCode,502,response);assert.equal(r.body.confirmed,undefined);
  }
  global.fetch=async()=>new Response('[{"RESULTADO":"OK"}]',{status:500});
  assert.equal((await invoke(change)).statusCode,502);
});

test('rejects unauthorized, invalid, stale or already sent changes before contacting Finnegans',async()=>{
  protectedMode();let calls=0;global.fetch=async()=>{calls++;return new Response('[{"RESULTADO":"OK"}]')};
  assert.equal((await invoke(change,{'x-cashflow-key':'wrong'})).statusCode,401);
  for(const invalid of [{...change,source:'CHP'},{...change,asientoItemId:0},{...change,date:'2026-02-31'},{...change,date:'2026-11-26'}])assert.notEqual((await invoke(invalid)).statusCode,200);
  saved={...saved,status:'sent'};assert.equal((await invoke(change)).statusCode,409);
  assert.equal(calls,0);
});
