'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hashPassword}=require('../lib/auth-crypto.cjs');
const store=require('../lib/auth-store.cjs');
const original={readyStore:store.readyStore,sessionByToken:store.sessionByToken,userCompanies:store.userCompanies,mode:process.env.CASHFLOW_AUTH_MODE};
process.env.CASHFLOW_AUTH_MODE='users';
const company={id:'a0000000-0000-4000-8000-000000000001',code:'EMPRE01',name:'FISTERRA SRL'};
let passwordHash,sessionTokenHash,insertedCompanyId;
const user={id:'b0000000-0000-4000-8000-000000000001',name:'Administrador',email:'admin@example.com',role:'admin',active:true,session_version:1};
const sql=async(strings,...values)=>{
  const statement=strings.join('?');
  if(statement.includes('FROM cashflow_auth_limits WHERE'))return [];
  if(statement.includes('FROM cashflow_users WHERE email='))return [{...user,password_hash:passwordHash}];
  if(statement.includes('INSERT INTO cashflow_sessions')){sessionTokenHash=values[0];insertedCompanyId=values[2];return []}
  if(statement.includes('FROM cashflow_sessions s'))return [{token_hash:sessionTokenHash,user_id:user.id,company_id:company.id,expires_at:new Date(Date.now()+3600000),name:user.name,email:user.email,role:user.role,active:true,session_version:1,company_code:company.code,company_name:company.name}];
  return [];
};
store.readyStore=async()=>sql;
store.sessionByToken=async(_sql,token)=>sessionTokenHash&&token?{token_hash:sessionTokenHash,user_id:user.id,company_id:company.id,name:user.name,email:user.email,role:user.role,company_code:company.code,company_name:company.name}:null;
store.userCompanies=async()=>[company];
delete require.cache[require.resolve('../lib/auth-session.cjs')];
const handler=require('../api/auth.js');
test.after(()=>{Object.assign(store,{readyStore:original.readyStore,sessionByToken:original.sessionByToken,userCompanies:original.userCompanies});if(original.mode===undefined)delete process.env.CASHFLOW_AUTH_MODE;else process.env.CASHFLOW_AUTH_MODE=original.mode});
function call(method,body,cookie=''){
  const req={method,headers:{host:'cashflow.example',origin:'https://cashflow.example','content-type':'application/json',cookie},body};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
  return handler(req,res).then(()=>res);
}
test('login accepts an active user, sets HttpOnly session cookie and selects the only company',async()=>{
  passwordHash=await hashPassword('a private admin password');
  const r=await call('POST',{action:'login',email:'ADMIN@example.com',password:'a private admin password'});
  assert.equal(r.statusCode,200);assert.equal(r.body.user.email,'admin@example.com');assert.equal(r.body.company.id,company.id);
  assert.equal(insertedCompanyId,company.id);assert.match(r.headers['Set-Cookie'],/HttpOnly; SameSite=Lax/);
  const cookie=r.headers['Set-Cookie'].split(';')[0];
  const me=await call('GET',undefined,cookie);assert.equal(me.statusCode,200);assert.equal(me.body.authenticated,true);
  assert.equal(me.body.company.code,'EMPRE01');
});
test('incorrect password and unassigned company cannot access data',async()=>{
  passwordHash=await hashPassword('a private admin password');
  const invalid=await call('POST',{action:'login',email:'admin@example.com',password:'incorrect password'});
  assert.equal(invalid.statusCode,401);assert.equal(invalid.body.user,undefined);
  const denied=await call('POST',{action:'select-company',companyId:'c0000000-0000-4000-8000-000000000001'},'cashflow_session=valid-token-placeholder-aaaaaaaaaaaaaaaa');
  assert.equal(denied.statusCode,403);
});
