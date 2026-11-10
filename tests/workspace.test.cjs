'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../lib/workspace-store.cjs');
let revision=0,payload=null,writes=0;
const oldRead=store.readWorkspace,oldWrite=store.writeWorkspace;
store.readWorkspace=async()=>({revision,payload,updatedAt:revision?'2026-11-10T12:00:00Z':null});
store.writeWorkspace=async(expected,next)=>{
  if(expected!==revision)return null;
  revision++;writes++;payload=next;return {revision,updatedAt:'2026-11-10T12:00:00Z'};
};
const handler=require('../api/workspace.js');
const reportHandler=require('../api/finnegans-report.js');
const configHandler=require('../api/finnegans-config.js');
const tokenHandler=require('../api/finnegans-token.js');
const variables=['CASHFLOW_DATABASE_DATABASE_URL','CASHFLOW_DATABASE_URL','DATABASE_URL','CASHFLOW_ACCESS_KEY','CASHFLOW_INSTALLATION_NAME'];
const original=Object.fromEntries(variables.map(k=>[k,process.env[k]]));
test.after(()=>{store.readWorkspace=oldRead;store.writeWorkspace=oldWrite;for(const [k,v]of Object.entries(original))if(v===undefined)delete process.env[k];else process.env[k]=v});

function setup(){process.env.CASHFLOW_DATABASE_DATABASE_URL='postgresql://unit-test.invalid/db';process.env.CASHFLOW_ACCESS_KEY='long-test-access-key';revision=0;payload=null;writes=0}
async function invoke(fn,method='GET',body=undefined,key=undefined,headers={}){
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
  await fn({method,headers:{host:'cashflow.example',origin:'https://cashflow.example','content-type':'application/json',...(key===undefined?{}:{'x-cashflow-key':key}),...headers},body},res);return res;
}
const state={version:1,state:{ref:'2026-11-10',tc:1517,saldo:1000,data:{CLI:{rows:[{s:'CLI',f:'2026-11-11',m:100,cat:'Cobranza clientes'}]},PRV:{rows:[]}}},filters:{CLI:{empresa:'EMPRE01'},PRV:{empresa:'EMPRE01'}}};

test('a protected installation requires its key for data and Finnegans APIs',async()=>{
  setup();
  assert.equal((await invoke(handler)).statusCode,401);
  assert.equal((await invoke(handler,'GET',undefined,'wrong')).statusCode,401);
  assert.equal((await invoke(reportHandler,'POST',{source:'CLI',shared:true})).statusCode,401);
  assert.equal((await invoke(configHandler)).statusCode,401);
  assert.equal((await invoke(tokenHandler,'POST',{client_id:'id',client_secret:'secret'})).statusCode,401);
  assert.equal(writes,0);
  const r=await invoke(handler,'GET',undefined,'long-test-access-key');assert.equal(r.statusCode,200);assert.equal(r.body.revision,0);
});

test('workspace persists state and parameters with revision checks',async()=>{
  setup();
  let r=await invoke(handler,'PUT',{revision:0,payload:state},'long-test-access-key');assert.equal(r.statusCode,200);assert.equal(r.body.revision,1);
  r=await invoke(handler,'GET',undefined,'long-test-access-key');assert.equal(r.statusCode,200);assert.deepEqual(r.body.payload,state);
  r=await invoke(handler,'PUT',{revision:0,payload:state},'long-test-access-key');assert.equal(r.statusCode,409);assert.equal(writes,1);
  r=await invoke(handler,'PUT',{revision:1,payload:{...state,state:{...state.state,saldo:2000}}},'long-test-access-key');assert.equal(r.statusCode,200);assert.equal(r.body.revision,2);
  assert.equal((await invoke(handler,'GET',undefined,'long-test-access-key')).body.payload.state.saldo,2000);
  const vaulted={...state,vault:{v:1,mode:'set',salt:'YWJj',iv:'ZGVm',data:'Z2hp'}};
  r=await invoke(handler,'PUT',{revision:2,payload:vaulted},'long-test-access-key');assert.equal(r.statusCode,200);
  assert.deepEqual((await invoke(handler,'GET',undefined,'long-test-access-key')).body.payload.vault,vaulted.vault);
});

test('invalid, oversized and secret-bearing payloads never reach storage',async()=>{
  setup();
  for(const next of [
    {revision:0,payload:{...state,filters:{constructor:{}}}},
    {revision:0,payload:{...state,state:{...state.state,client_secret:'private'}}},
    {revision:0,payload:{...state,state:{...state.state,data:{CLI:{rows:'not rows'}}}}},
    {revision:0,payload:{...state,vault:{v:1,mode:'set',salt:'x',iv:'y',data:'plain client_secret'}}},
    {revision:-1,payload:state}
  ])assert.equal((await invoke(handler,'PUT',next,'long-test-access-key')).statusCode,400);
  assert.equal((await invoke(handler,'PUT',{revision:0,payload:state},'long-test-access-key',{'content-length':'4000000'})).statusCode,413);
  assert.equal((await invoke(handler,'PUT',{revision:0,payload:state},'long-test-access-key',{origin:'https://elsewhere.example'})).statusCode,403);
  assert.equal(writes,0);
});

test('an incomplete deployment fails closed while local development stays available',async()=>{
  setup();delete process.env.CASHFLOW_ACCESS_KEY;
  assert.equal((await invoke(handler)).statusCode,503);
  process.env.CASHFLOW_ACCESS_KEY='twelvechars!';
  assert.equal((await invoke(handler)).statusCode,503);
  process.env.CASHFLOW_ACCESS_KEY='thirteenchars!';
  assert.equal((await invoke(handler)).statusCode,401);
  delete process.env.CASHFLOW_ACCESS_KEY;
  delete process.env.CASHFLOW_DATABASE_DATABASE_URL;delete process.env.CASHFLOW_DATABASE_URL;delete process.env.DATABASE_URL;
  process.env.CASHFLOW_INSTALLATION_NAME='Nubiral';
  assert.equal((await invoke(handler)).statusCode,503);
  delete process.env.CASHFLOW_INSTALLATION_NAME;
  const r=await invoke(handler);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{mode:'local'});
});
