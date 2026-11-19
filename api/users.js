'use strict';
const {randomUUID}=require('node:crypto');
const {authorize}=require('../lib/workspace-auth.cjs');
const {normalizeEmail,hashPassword,validPassword}=require('../lib/auth-crypto.cjs');
const {audit}=require('../lib/auth-store.cjs');
const {usersEnabled}=require('../lib/auth-session.cjs');
const sameOrigin=req=>!req.headers.origin||(()=>{try{return new URL(req.headers.origin).host===req.headers.host}catch{return false}})();
const unique=items=>Array.isArray(items)&&items.length<=100&&items.every(id=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id))&&new Set(items).size===items.length;

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  if(!usersEnabled())return res.status(404).json({error:'Función no disponible.'});
  if(!sameOrigin(req))return res.status(403).json({error:'Solicitud de otro origen.'});
  if(!await authorize(req,res,{admin:true,company:false}))return;
  const sql=req.cashflowAuth.sql;
  try{
    if(req.method==='GET'){
      const users=await sql`SELECT u.id,u.name,u.email,u.role,u.active,u.created_at,u.updated_at,
        COALESCE(json_agg(uc.company_id) FILTER (WHERE uc.company_id IS NOT NULL),'[]'::json) AS company_ids
        FROM cashflow_users u LEFT JOIN cashflow_user_companies uc ON uc.user_id=u.id
        GROUP BY u.id ORDER BY u.name`;
      return res.status(200).json({users});
    }
    if(!['POST','PATCH'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH');return res.status(405).json({error:'Método no permitido.'})}
    if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato debe ser JSON.'});
    if(Number(req.headers['content-length'])>12000)return res.status(413).json({error:'La solicitud es demasiado grande.'});
    let body=req.body;if(typeof body==='string')body=JSON.parse(body);
    const name=typeof body?.name==='string'?body.name.trim():'',email=normalizeEmail(body?.email),role=body?.role,companyIds=body?.companyIds;
    if(name.length<2||name.length>120||!email||!['admin','user'].includes(role)||!unique(companyIds))return res.status(400).json({error:'Revisá nombre, email, rol y empresas asignadas.'});
    for(const companyId of companyIds){
      const found=await sql`SELECT id FROM cashflow_companies WHERE id=${companyId} AND active=true LIMIT 1`;
      if(!found.length)return res.status(400).json({error:'Una de las empresas seleccionadas no está disponible.'});
    }
    let id=body.id;
    if(req.method==='POST'){
      if(!validPassword(body.password))return res.status(400).json({error:'La contraseña inicial debe tener entre 12 y 256 caracteres.'});
      const existing=await sql`SELECT id FROM cashflow_users WHERE email=${email} LIMIT 1`;
      if(existing.length)return res.status(409).json({error:'Ya existe un usuario con ese email.'});
      id=randomUUID();const hash=await hashPassword(body.password);
      await sql`INSERT INTO cashflow_users (id,name,email,password_hash,role,active) VALUES (${id},${name},${email},${hash},${role},true)`;
    }else{
      if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Usuario no válido.'});
      const users=await sql`SELECT id,email,role,active FROM cashflow_users WHERE id=${id} LIMIT 1`;
      if(!users.length)return res.status(404).json({error:'Usuario inexistente.'});
      const active=body.active===true;
      if(users[0].role==='admin'&&users[0].active&&(!active||role!=='admin')){
        const admins=await sql`SELECT count(*)::integer AS n FROM cashflow_users WHERE role='admin' AND active=true`;
        if(admins[0].n<=1)return res.status(409).json({error:'Debe permanecer al menos un administrador activo.'});
      }
      if(body.password!==undefined&&!validPassword(body.password))return res.status(400).json({error:'La contraseña debe tener entre 12 y 256 caracteres.'});
      const hash=body.password?await hashPassword(body.password):null;
      await sql`UPDATE cashflow_users SET name=${name},email=${email},role=${role},active=${active},
        password_hash=COALESCE(${hash},password_hash),
        session_version=session_version+CASE WHEN ${!active||!!hash} THEN 1 ELSE 0 END,updated_at=now() WHERE id=${id}`;
      if(!active||hash)await sql`UPDATE cashflow_sessions SET revoked_at=now() WHERE user_id=${id}`;
    }
    await sql`DELETE FROM cashflow_user_companies WHERE user_id=${id}`;
    for(const companyId of companyIds)await sql`INSERT INTO cashflow_user_companies (user_id,company_id) VALUES (${id},${companyId})`;
    await sql`UPDATE cashflow_sessions SET company_id=NULL WHERE user_id=${id} AND company_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM cashflow_user_companies uc WHERE uc.user_id=${id} AND uc.company_id=cashflow_sessions.company_id)`;
    await audit(sql,req.cashflowAuth.user.id,id,req.method==='POST'?'user_created':'user_updated',{email,role,active:req.method==='POST'?true:body.active,companyIds});
    return res.status(200).json({id});
  }catch(error){
    if(error?.code==='23505')return res.status(409).json({error:'Ya existe un usuario con ese email.'});
    return res.status(503).json({error:'No se pudo guardar el usuario. Intentá nuevamente.'});
  }
};
