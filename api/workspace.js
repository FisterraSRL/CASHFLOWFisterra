'use strict';
const {authorize,protectedDeployment}=require('../lib/workspace-auth.cjs');
const {readWorkspace,writeWorkspace}=require('../lib/workspace-store.cjs');
const {usersEnabled}=require('../lib/auth-session.cjs');
const {readCompanyWorkspace,writeCompanyWorkspace}=require('../lib/company-workspace.cjs');

const SOURCES=new Set(['BCO','CLI','PRV','CHP','CHT','PRE','LEA','ARCA','PPTO','EJC','EJP']);
const MAX_BYTES=3*1024*1024;

function validPayload(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.version!==1)return false;
  const state=payload.state,filters=payload.filters;
  if(!state||typeof state!=='object'||Array.isArray(state)||!state.data||typeof state.data!=='object'||Array.isArray(state.data))return false;
  if(state.excludedDocuments!==undefined&&(!Array.isArray(state.excludedDocuments)||state.excludedDocuments.some(entry=>
    !entry||['key','document','organization','company','category','date','currency'].some(field=>typeof entry[field]!=='string')||
    !entry.key||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||!Number.isFinite(entry.amount))))return false;
  if(state.fx!==undefined&&(!state.fx||typeof state.fx!=='object'||Array.isArray(state.fx)||Object.entries(state.fx).some(([currency,rate])=>!(/^[A-Z]{3}$/.test(currency))||currency==='ARS'||typeof rate!=='number'||!Number.isFinite(rate)||rate<=0||rate>=1e12)))return false;
  if(!filters||typeof filters!=='object'||Array.isArray(filters))return false;
  if(payload.vault!==undefined){
    const vault=payload.vault;
    if(!vault||typeof vault!=='object'||Array.isArray(vault)||vault.v!==1||!['set','removed'].includes(vault.mode))return false;
    if(vault.mode==='set'&&(!['salt','iv','data'].every(k=>typeof vault[k]==='string'&&vault[k].length>0&&vault[k].length<10000&&/^[A-Za-z0-9+/]+={0,2}$/.test(vault[k]))))return false;
  }
  if(Object.keys(state.data).some(k=>!SOURCES.has(k))||Object.keys(filters).some(k=>!SOURCES.has(k)))return false;
  for(const source of Object.values(state.data)){
    if(!source||typeof source!=='object'||Array.isArray(source)||!Array.isArray(source.rows)||source.rows.length>20000)return false;
  }
  const stack=[payload];
  while(stack.length){
    const item=stack.pop();if(!item||typeof item!=='object')continue;
    for(const [key,value] of Object.entries(item)){
      if(/^(?:__proto__|prototype|constructor|client_?secret|client_?id|access_?token|password|credentials|access_?key)$/i.test(key))return false;
      if(value&&typeof value==='object')stack.push(value);
    }
  }
  return true;
}
function validCompanyPayload(payload,company){
  if(payload.vault!==undefined)return false;
  const names=new Set([company.name,company.code]);
  for(const source of Object.values(payload.state.data)){
    for(const row of source.rows)if(row.company&&(!names.has(row.company)))return false;
    for(const row of source.applications||[])if(row.company&&(!names.has(row.company)))return false;
  }
  for(const filters of Object.values(payload.filters))if(filters.empresa&&filters.empresa!==company.code)return false;
  for(const change of Object.values(payload.state.dateChanges||{}))if(change.company&&!names.has(change.company))return false;
  for(const entry of payload.state.excludedDocuments||[])if(entry.company&&!names.has(entry.company))return false;
  return true;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','PUT'].includes(req.method)){
    res.setHeader('Allow','GET, PUT');return res.status(405).json({error:'Método no permitido.'});
  }
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'La solicitud debe realizarse desde esta aplicación.'})}}
  if(!usersEnabled()&&!protectedDeployment())return req.method==='GET'?res.status(200).json({mode:'local'}):res.status(503).json({error:'El almacenamiento compartido no está configurado.'});
  if(!await authorize(req,res))return;
  if(req.method==='GET'){
    try{return res.status(200).json(await(usersEnabled()?readCompanyWorkspace(req.cashflowAuth.company.id):readWorkspace()))}
    catch{return res.status(503).json({error:'No se pudo leer el almacenamiento compartido.'})}
  }
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato de la solicitud debe ser JSON.'});
  if(Number(req.headers['content-length'])>MAX_BYTES)return res.status(413).json({error:'Los datos exceden el límite de almacenamiento por operación.'});
  let body=req.body;
  try{if(typeof body==='string')body=JSON.parse(body)}catch{return res.status(400).json({error:'La solicitud no contiene JSON válido.'})}
  let encoded;
  try{encoded=JSON.stringify(body)}catch{return res.status(400).json({error:'Los datos no son válidos.'})}
  if(!encoded||Buffer.byteLength(encoded)>MAX_BYTES)return res.status(413).json({error:'Los datos exceden el límite de almacenamiento por operación.'});
  if(!Number.isSafeInteger(body?.revision)||body.revision<0||!validPayload(body.payload)||usersEnabled()&&!validCompanyPayload(body.payload,req.cashflowAuth.company))return res.status(400).json({error:'El estado enviado no es válido.'});
  try{
    const result=await(usersEnabled()?writeCompanyWorkspace(req.cashflowAuth.company.id,body.revision,body.payload):writeWorkspace(body.revision,body.payload));
    if(!result)return res.status(409).json({error:'Los datos cambiaron en otra sesión. Recargá antes de guardar para evitar sobrescribirlos.'});
    return res.status(200).json(result);
  }catch{return res.status(503).json({error:'No se pudieron guardar los datos compartidos. Los cambios siguen en este navegador.'})}
};
