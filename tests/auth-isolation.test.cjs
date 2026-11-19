'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const store=require('../lib/auth-store.cjs');
const workspace=require('../lib/company-workspace.cjs');
const shared=require('../lib/finnegans-shared.cjs');
const original={mode:process.env.CASHFLOW_AUTH_MODE,readyStore:store.readyStore,sessionByToken:store.sessionByToken,userCompanies:store.userCompanies,
  readCompanyWorkspace:workspace.readCompanyWorkspace,writeCompanyWorkspace:workspace.writeCompanyWorkspace,
  sharedConfig:shared.sharedConfig,sharedToken:shared.sharedToken,fetch:global.fetch};
process.env.CASHFLOW_AUTH_MODE='users';
const own={id:'a0000000-0000-4000-8000-000000000001',code:'EMPRE01',name:'FISTERRA SRL'};
const other={id:'a0000000-0000-4000-8000-000000000002',code:'EMPRE02',name:'OTRA EMPRESA'};
let role='user',seenCompanyId=null,saved=null;
const sql=async()=>[];
store.readyStore=async()=>sql;
store.sessionByToken=async(_sql,token)=>token==='valid-token-placeholder-aaaaaaaaaaaaaaaa'?{
  user_id:'b0000000-0000-4000-8000-000000000001',company_id:own.id,name:'Usuario',email:'user@example.com',role,
  company_code:own.code,company_name:own.name}:null;
store.userCompanies=async()=>[own];
workspace.readCompanyWorkspace=async companyId=>{seenCompanyId=companyId;return {revision:1,payload:{version:1,state:{data:{CLI:{rows:[]}}},filters:{}},updatedAt:null}};
workspace.writeCompanyWorkspace=async(companyId,revision,payload)=>{seenCompanyId=companyId;saved=payload;return {revision:revision+1,updatedAt:new Date().toISOString()}};
shared.sharedConfig=()=>({enabled:true,sources:{CLI:{filters:{empresa:other.code}}},defaults:{}});
shared.sharedToken=async()=> 'server.token';
for(const path of ['../lib/auth-session.cjs','../lib/workspace-auth.cjs','../api/workspace.js','../api/users.js','../api/companies.js','../api/finnegans-report.js'])delete require.cache[require.resolve(path)];
const workspaceHandler=require('../api/workspace.js'),usersHandler=require('../api/users.js'),companiesHandler=require('../api/companies.js'),reportHandler=require('../api/finnegans-report.js');
test.after(()=>{Object.assign(store,{readyStore:original.readyStore,sessionByToken:original.sessionByToken,userCompanies:original.userCompanies});
  Object.assign(workspace,{readCompanyWorkspace:original.readCompanyWorkspace,writeCompanyWorkspace:original.writeCompanyWorkspace});
  Object.assign(shared,{sharedConfig:original.sharedConfig,sharedToken:original.sharedToken});global.fetch=original.fetch;
  if(original.mode===undefined)delete process.env.CASHFLOW_AUTH_MODE;else process.env.CASHFLOW_AUTH_MODE=original.mode});
async function call(handler,method,body,cookie='cashflow_session=valid-token-placeholder-aaaaaaaaaaaaaaaa'){
  const req={method,headers:{host:'cashflow.example',origin:'https://cashflow.example','content-type':'application/json',cookie},body};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
  await handler(req,res);return res;
}
const payload=company=>({version:1,state:{data:{CLI:{rows:[{id:'invoice-1',company}]}}},filters:{CLI:{empresa:own.code}}});
test('workspace requires a session and reads only the selected company row',async()=>{
  assert.equal((await call(workspaceHandler,'GET',null,'')).statusCode,401);
  const result=await call(workspaceHandler,'GET');assert.equal(result.statusCode,200);assert.equal(seenCompanyId,own.id);
});
test('a direct workspace PUT cannot insert another company or widen its report filter',async()=>{
  assert.equal((await call(workspaceHandler,'PUT',{revision:1,payload:payload(other.name)})).statusCode,400);
  assert.equal(saved,null);
  const foreignFilter=payload(own.name);foreignFilter.filters.CLI.empresa=other.code;
  assert.equal((await call(workspaceHandler,'PUT',{revision:1,payload:foreignFilter})).statusCode,400);
  assert.equal((await call(workspaceHandler,'PUT',{revision:1,payload:payload(own.name)})).statusCode,200);
  assert.equal(seenCompanyId,own.id);
});
test('standard user cannot call administrative routes by URL',async()=>{
  role='user';
  assert.equal((await call(usersHandler,'GET')).statusCode,403);
  assert.equal((await call(companiesHandler,'GET')).statusCode,403);
});
test('Finnegans query uses the selected company and returns only its rows',async()=>{
  const queried=[];
  global.fetch=async url=>{
    const request=new URL(url);queried.push(request.searchParams.get('PARAMWEBREPORT_Empresa'));
    return new Response(JSON.stringify([{ORGANIZACION:'Cliente',DOCUMENTO:'FV-1',FECHA:'2026-11-01',FECHAVTO:'2026-11-20',IMPORTEMONPPAL:100,MONEDA:'Pesos',EMPRESA:other.name},{ORGANIZACION:'Cliente',DOCUMENTO:'FV-2',FECHA:'2026-11-01',FECHAVTO:'2026-11-20',IMPORTEMONPPAL:200,MONEDA:'Pesos',EMPRESA:own.name}]));
  };
  const result=await call(reportHandler,'POST',{source:'CLI',filters:{empresa:other.code},access_token:'browser.token'});
  assert.equal(result.statusCode,200);assert.deepEqual(queried,[own.code]);
  assert.equal(result.body.rows.length,1);assert.equal(result.body.rows[0].company,own.name);
  assert.equal(result.body.diagnostics.responseBody,'[OCULTO: EL REPORTE INCLUYE OTRAS EMPRESAS]');
});
