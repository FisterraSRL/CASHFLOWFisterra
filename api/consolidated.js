'use strict';
const {authorize}=require('../lib/workspace-auth.cjs');
const {usersEnabled}=require('../lib/auth-session.cjs');
const {readCompanyWorkspace}=require('../lib/company-workspace.cjs');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Usá POST para consultar el consolidado.'})}
  if(!usersEnabled())return res.status(404).json({error:'El consolidado requiere acceso por usuario.'});
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'Solicitud de otro origen.'})}}
  if(!await authorize(req,res))return;
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato debe ser JSON.'});
  if(Number(req.headers['content-length'])>4096)return res.status(413).json({error:'La solicitud es demasiado grande.'});
  let body=req.body;
  try{if(typeof body==='string'){if(Buffer.byteLength(body)>4096)throw new Error();body=JSON.parse(body)}}catch{return res.status(400).json({error:'JSON inválido.'})}
  const ids=body?.companyIds;
  if(!Array.isArray(ids)||ids.length<2||ids.length>8||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)return res.status(400).json({error:'Seleccioná entre 2 y 8 empresas distintas.'});
  const allowed=new Map(req.cashflowAuth.companies.map(company=>[company.id,company]));
  if(ids.some(id=>!allowed.has(id)))return res.status(403).json({error:'No tenés acceso a una de las empresas seleccionadas.'});
  try{
    const workspaces=await Promise.all(ids.map(async id=>{
      const {payload,updatedAt}=await readCompanyWorkspace(id);
      const state=payload?.state||null;
      return {company:allowed.get(id),updatedAt,state:state?{
        ref:state.ref,tc:state.tc,fx:state.fx,saldo:state.saldo,saldoFecha:state.saldoFecha,saldoManualSet:state.saldoManualSet,
        incChq:state.incChq,excl:state.excl,ovr:state.ovr,inc:state.inc,
        data:Object.fromEntries(['BCO','CLI','PRV','CHP','CHT','PRE','LEA','ARCA','EJC','EJP'].map(source=>[source,state.data?.[source]||{rows:[]}]))
      }:null};
    }));
    const result={workspaces};
    if(Buffer.byteLength(JSON.stringify(result))>6*1024*1024)return res.status(413).json({error:'El consolidado es demasiado grande. Seleccioná menos empresas.'});
    return res.status(200).json(result);
  }catch{return res.status(503).json({error:'No se pudieron leer los datos de todas las empresas.'})}
};
