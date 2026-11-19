'use strict';
const {randomUUID}=require('node:crypto');
const {authorize}=require('../lib/workspace-auth.cjs');
const {audit}=require('../lib/auth-store.cjs');
const {usersEnabled}=require('../lib/auth-session.cjs');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  if(!usersEnabled())return res.status(404).json({error:'Función no disponible.'});
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'Solicitud de otro origen.'})}}
  if(!await authorize(req,res,{admin:true,company:false}))return;
  const sql=req.cashflowAuth.sql;
  try{
    if(req.method==='GET')return res.status(200).json({companies:await sql`SELECT id,code,name,active,created_at,updated_at FROM cashflow_companies ORDER BY name`});
    if(!['POST','PATCH'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH');return res.status(405).json({error:'Método no permitido.'})}
    if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato debe ser JSON.'});
    if(Number(req.headers['content-length'])>12000)return res.status(413).json({error:'La solicitud es demasiado grande.'});
    let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>12000)return res.status(413).json({error:'La solicitud es demasiado grande.'});body=JSON.parse(body)}
    const code=typeof body?.code==='string'?body.code.trim():'',name=typeof body?.name==='string'?body.name.trim().replace(/\s+/g,' '):'';
    if(!/^[A-Za-z0-9_./-]{1,64}$/.test(code)||name.length<2||name.length>120)return res.status(400).json({error:'Ingresá el código y nombre de empresa de Finnegans.'});
    let id=body.id;
    if(req.method==='POST'){
      id=randomUUID();await sql`INSERT INTO cashflow_companies (id,code,name) VALUES (${id},${code},${name})`;
    }else{
      if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Empresa no válida.'});
      const updated=await sql`UPDATE cashflow_companies SET code=${code},name=${name},active=${body.active===true},updated_at=now() WHERE id=${id} RETURNING id`;
      if(!updated.length)return res.status(404).json({error:'Empresa inexistente.'});
    }
    await audit(sql,req.cashflowAuth.user.id,null,req.method==='POST'?'company_created':'company_updated',{companyId:id,code,name});
    return res.status(200).json({id});
  }catch(error){
    if(error?.code==='23505')return res.status(409).json({error:'Ya existe una empresa con ese código o nombre.'});
    return res.status(503).json({error:'No se pudo guardar la empresa.'});
  }
};
