'use strict';
const {authorize}=require('../lib/workspace-auth.cjs');
const {usersEnabled}=require('../lib/auth-session.cjs');
const {readWorkspace}=require('../lib/workspace-store.cjs');
const {readCompanyWorkspace,writeCompanyWorkspace}=require('../lib/company-workspace.cjs');
const {previewLegacy,splitLegacy}=require('../lib/company-migration.cjs');
const {audit}=require('../lib/auth-store.cjs');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');
  if(!usersEnabled())return res.status(404).json({error:'Función no disponible.'});
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'Solicitud de otro origen.'})}}
  if(!await authorize(req,res,{admin:true,company:false}))return;
  try{
    const legacy=await readWorkspace();
    if(req.method==='GET')return res.status(200).json({available:!!legacy.payload,preview:previewLegacy(legacy.payload)});
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método no permitido.'})}
    if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato debe ser JSON.'});
    let body=req.body;if(typeof body==='string')body=JSON.parse(body);
    if(typeof body?.companyId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.companyId))return res.status(400).json({error:'Empresa no válida.'});
    const rows=await req.cashflowAuth.sql`SELECT id,code,name FROM cashflow_companies WHERE id=${body.companyId} AND active=true LIMIT 1`;
    if(!rows.length)return res.status(404).json({error:'Empresa inexistente.'});
    const target=await readCompanyWorkspace(body.companyId);
    if(target.payload&&Object.values(target.payload.state?.data||{}).some(d=>d.rows?.length)||Object.keys(target.payload?.state?.dateChanges||{}).length)return res.status(409).json({error:'Esta empresa ya tiene datos. No se reemplazaron.'});
    const result=splitLegacy(legacy.payload,rows[0]);
    const saved=await writeCompanyWorkspace(body.companyId,target.revision,result.payload);
    if(!saved)return res.status(409).json({error:'Los datos de esta empresa cambiaron durante la migración. Volvé a intentar.'});
    await audit(req.cashflowAuth.sql,req.cashflowAuth.user.id,null,'company_migrated',{companyId:body.companyId,count:result.count});
    return res.status(200).json({companyId:body.companyId,count:result.count,revision:saved.revision});
  }catch(error){return res.status(503).json({error:error.message==='No hay movimientos con el nombre de esta empresa en los datos anteriores.'?error.message:'No se pudo completar la migración. Los datos anteriores siguen intactos.'})}
};
