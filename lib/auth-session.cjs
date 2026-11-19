'use strict';
const {readyStore,sessionByToken,userCompanies}=require('./auth-store.cjs');
const COOKIE='cashflow_session';
function usersEnabled(){return process.env.CASHFLOW_AUTH_MODE==='users'}
function cookieToken(req){
  const header=req.headers?.cookie;if(typeof header!=='string')return null;
  for(const part of header.split(';')){const [key,...value]=part.trim().split('=');if(key===COOKIE)return value.join('=')}
  return null;
}
function sessionCookie(token,req,maxAge){
  const secure=req.headers?.['x-forwarded-proto']==='https'||process.env.VERCEL==='1';
  return `${COOKIE}=${token||''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;
}
async function currentSession(req){
  const token=cookieToken(req);if(!token)return null;
  const sql=await readyStore(),session=await sessionByToken(sql,token);
  if(!session)return null;
  const companies=await userCompanies(sql,session.user_id);
  return {sql,token,user:{id:session.user_id,name:session.name,email:session.email,role:session.role},
    company:session.company_id?{id:session.company_id,code:session.company_code,name:session.company_name}:null,companies};
}
async function authorizeUsers(req,res,{admin=false,company=true}={}){
  let session;try{session=await currentSession(req)}catch{return res.status(503).json({error:'No se pudo verificar la sesión.'}),false}
  if(!session)return res.status(401).json({error:'Iniciá sesión para continuar.'}),false;
  if(admin&&session.user.role!=='admin')return res.status(403).json({error:'Esta función requiere el rol de administrador.'}),false;
  if(company&&!session.company)return res.status(409).json({error:'Seleccioná una empresa habilitada para continuar.'}),false;
  req.cashflowAuth=session;return true;
}
module.exports={COOKIE,usersEnabled,cookieToken,sessionCookie,currentSession,authorizeUsers};
