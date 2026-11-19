'use strict';
const {REPORTS,reportUrl,normalizeReport}=require('../lib/finnegans-reports.cjs');
const {reportDiagnostics}=require('../lib/finnegans-diagnostics.cjs');
const {sharedConfig,sharedToken}=require('../lib/finnegans-shared.cjs');
const {authorize}=require('../lib/workspace-auth.cjs');
const {usersEnabled}=require('../lib/auth-session.cjs');
const {readCompanyWorkspace}=require('../lib/company-workspace.cjs');
const companyName=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('es-AR');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Usá POST para consultar el reporte.'})}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'La solicitud debe realizarse desde esta aplicación.'})}}
  if(!await authorize(req,res))return;
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato de la solicitud debe ser JSON.'});
  if(Number(req.headers['content-length'])>24000)return res.status(413).json({error:'La solicitud es demasiado grande.'});
  let body=req.body;
  try{if(typeof body==='string'){if(Buffer.byteLength(body)>24000)throw new Error();body=JSON.parse(body)}}catch{return res.status(400).json({error:'La solicitud no contiene JSON válido.'})}
  const shared=usersEnabled()||body?.shared===true,config=shared?sharedConfig():null;
  if(usersEnabled()&&Object.hasOwn(REPORTS,body?.source)){
    try{
      const workspace=await readCompanyWorkspace(req.cashflowAuth.company.id),saved=workspace.payload?.filters?.[body.source]||{};
      const filters=Object.fromEntries(REPORTS[body.source].fields.filter(key=>typeof saved[key]==='string').map(key=>[key,saved[key]]));
      config.sources[body.source]={filters:{...(config.sources[body.source]?.filters||{}),...filters}};
    }catch{return res.status(503).json({error:'No se pudieron leer los filtros guardados de esta empresa.'})}
  }
  if(shared&&(!Object.hasOwn(REPORTS,body.source)||!config.sources[body.source]))return res.status(503).json({error:'Esta fuente compartida requiere configurar sus filtros en Vercel.'});
  if(shared)body.filters={...config.sources[body.source].filters,fecha:body.source==='BCO'?body.fecha:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Buenos_Aires'}).format(new Date()),...(usersEnabled()?{empresa:req.cashflowAuth.company.code}:{})};
  let token=body?.access_token;
  if(shared){try{token=await sharedToken()}catch(e){return res.status(e.status||502).json({error:e.message})}}
  if(typeof token!=='string'||!token||token.length>16384||!/^[A-Za-z0-9._~+\/-]+=*$/.test(token))return res.status(400).json({error:'Obtené un token válido antes de consultar el reporte.'});
  let url;
  try{url=reportUrl(body.source,body.filters,token)}catch(error){return res.status(400).json({error:error.message})}
  try{
    const response=await fetch(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)});
    const text=await response.text();
    const diagnostics=reportDiagnostics(url,response,text,token);
    if(usersEnabled()){
      diagnostics.responseBody='[OCULTO: EL REPORTE INCLUYE OTRAS EMPRESAS]';
      diagnostics.responseTruncated=false;diagnostics.responseCharacters=0;
    }
    const fail=(status,error)=>res.status(status).json({error,diagnostics});
    if(!response.ok){
      if(response.status===401||response.status===403)return fail(401,'Finnegans rechazó el acceso. Renová el token y verificá los permisos del usuario.');
      if(response.status===400)return fail(400,'Finnegans rechazó los parámetros. Revisá los códigos de los filtros.');
      if(response.status===404)return fail(502,'El reporte no está disponible para este usuario de Finnegans.');
      if(response.status===429)return fail(429,'Finnegans recibió demasiadas consultas. Intentá nuevamente en unos minutos.');
      return fail(502,'Finnegans no pudo completar el reporte. Intentá nuevamente más tarde.');
    }
    if(Buffer.byteLength(text)>4*1024*1024)return fail(413,'El reporte es demasiado grande. Acotá los filtros.');
    let payload;
    try{payload=JSON.parse(text)}catch{return fail(502,'Finnegans no devolvió un reporte JSON válido. Se conservaron los datos anteriores.')}
    let normalized;
    try{normalized=normalizeReport(body.source,payload,body.filters.fecha,body.filters)}catch(error){return fail(422,error.message)}
    if(usersEnabled()){
      const allowed=new Set([companyName(req.cashflowAuth.company.name),companyName(req.cashflowAuth.company.code)]);
      if([...normalized.rows,...(normalized.applications||[])].some(row=>!companyName(row.company)))return fail(422,'El reporte contiene movimientos sin empresa identificable. No se modificaron los datos anteriores.');
      normalized.rows=normalized.rows.filter(row=>allowed.has(companyName(row.company)));
      if(normalized.applications)normalized.applications=normalized.applications.filter(row=>allowed.has(companyName(row.company)));
      normalized.received=normalized.rows.length+(normalized.applications?.length||0);
      if(normalized.summary){
        const sum=rows=>Math.round(rows.reduce((total,row)=>total+row.imp,0)*100)/100;
        normalized.summary={records:normalized.rows.length,applicationRecords:normalized.applications.length,
          total:sum(normalized.rows),withholdings:sum(normalized.rows.filter(row=>row.kind==='withholding')),
          cheques:sum(normalized.rows.filter(row=>row.kind==='cheque')),
          banks:sum(normalized.rows.filter(row=>row.kind==='bank'))};
      }
      normalized.warnings=[];
    }
    if(Buffer.byteLength(JSON.stringify({...normalized,diagnostics}))>4*1024*1024)return fail(413,'El reporte es demasiado grande. Acotá los filtros.');
    return res.status(200).json({...normalized,source:body.source,date:body.filters.fecha,diagnostics});
  }catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError')return res.status(504).json({error:'La consulta a Finnegans demoró demasiado. Acotá los filtros e intentá nuevamente.'});
    return res.status(502).json({error:'No se pudo consultar Finnegans. Intentá nuevamente más tarde.'});
  }
};
