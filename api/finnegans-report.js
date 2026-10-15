'use strict';
const {reportUrl,normalizeReport}=require('../lib/finnegans-reports.cjs');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Usá POST para consultar el reporte.'})}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'La solicitud debe realizarse desde esta aplicación.'})}}
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato de la solicitud debe ser JSON.'});
  if(Number(req.headers['content-length'])>24000)return res.status(413).json({error:'La solicitud es demasiado grande.'});
  let body=req.body;
  try{if(typeof body==='string'){if(Buffer.byteLength(body)>24000)throw new Error();body=JSON.parse(body)}}catch{return res.status(400).json({error:'La solicitud no contiene JSON válido.'})}
  const token=body?.access_token;
  if(typeof token!=='string'||!token||token.length>16384||!/^[A-Za-z0-9._~+\/-]+=*$/.test(token))return res.status(400).json({error:'Obtené un token válido antes de consultar el reporte.'});
  let url;
  try{url=reportUrl(body.source,body.filters,token)}catch(error){return res.status(400).json({error:error.message})}
  try{
    const response=await fetch(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)});
    if(!response.ok){
      if(response.status===401||response.status===403)return res.status(401).json({error:'Finnegans rechazó el acceso. Renová el token y verificá los permisos del usuario.'});
      if(response.status===400)return res.status(400).json({error:'Finnegans rechazó los parámetros. Revisá los códigos de los filtros.'});
      if(response.status===404)return res.status(502).json({error:'El reporte no está disponible para este usuario de Finnegans.'});
      if(response.status===429)return res.status(429).json({error:'Finnegans recibió demasiadas consultas. Intentá nuevamente en unos minutos.'});
      return res.status(502).json({error:'Finnegans no pudo completar el reporte. Intentá nuevamente más tarde.'});
    }
    const text=await response.text();
    if(Buffer.byteLength(text)>4*1024*1024)return res.status(413).json({error:'El reporte es demasiado grande. Acotá los filtros.'});
    let payload;
    try{payload=JSON.parse(text)}catch{return res.status(502).json({error:'Finnegans no devolvió un reporte JSON válido. Se conservaron los datos anteriores.'})}
    let normalized;
    try{normalized=normalizeReport(body.source,payload,body.filters.fecha)}catch(error){return res.status(422).json({error:error.message})}
    if(Buffer.byteLength(JSON.stringify(normalized))>4*1024*1024)return res.status(413).json({error:'El reporte es demasiado grande. Acotá los filtros.'});
    return res.status(200).json({...normalized,source:body.source,date:body.filters.fecha});
  }catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError')return res.status(504).json({error:'La consulta a Finnegans demoró demasiado. Acotá los filtros e intentá nuevamente.'});
    return res.status(502).json({error:'No se pudo consultar Finnegans. Intentá nuevamente más tarde.'});
  }
};
