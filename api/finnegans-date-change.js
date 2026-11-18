'use strict';
const {authorize,protectedDeployment}=require('../lib/workspace-auth.cjs');
const {readWorkspace}=require('../lib/workspace-store.cjs');
const {sharedToken}=require('../lib/finnegans-shared.cjs');

const validDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const day=new Date(value+'T00:00:00Z');return Number.isFinite(+day)&&day.toISOString().slice(0,10)===value;
};
const validId=value=>/^[1-9]\d{0,15}$/.test(String(value))&&Number.isSafeInteger(Number(value));

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Usá POST para confirmar un cambio de fecha.'})}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'La solicitud debe realizarse desde esta aplicación.'})}}
  if(!authorize(req,res))return;
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato de la solicitud debe ser JSON.'});
  if(Number(req.headers['content-length'])>2048)return res.status(413).json({error:'La solicitud es demasiado grande.'});
  let body=req.body;
  try{if(typeof body==='string'){if(Buffer.byteLength(body)>2048)throw new Error();body=JSON.parse(body)}}catch{return res.status(400).json({error:'La solicitud no contiene JSON válido.'})}
  const source=body?.source,id=body?.asientoItemId,date=body?.date;
  if(!['CLI','PRV'].includes(source)||!validId(id)||!validDate(date))return res.status(400).json({error:'El documento o la fecha no son válidos.'});
  if(protectedDeployment()){
    let workspace;try{workspace=await readWorkspace()}catch{return res.status(503).json({error:'No se pudieron verificar los cambios pendientes.'})}
    const pending=workspace.payload?.state?.dateChanges?.[source+'|'+String(id)];
    if(!pending||pending.status==='sent'||pending.source!==source||String(pending.asientoItemId)!==String(id)||pending.date!==date)return res.status(409).json({error:'El cambio pendiente ya no coincide con los datos guardados. Recargá la aplicación antes de enviarlo.'});
  }
  let token=body.access_token;
  if(body.shared===true){try{token=await sharedToken()}catch(e){return res.status(e.status||502).json({error:e.message})}}
  if(typeof token!=='string'||!token||token.length>16384||!/^[A-Za-z0-9._~+\/-]+=*$/.test(token))return res.status(400).json({error:'Obtené un token válido antes de enviar el cambio.'});
  const url=new URL('https://api.finneg.com/api/reports/ActualizarFechaCashflowAsientoItem');
  url.searchParams.set('ACCESS_TOKEN',token);url.searchParams.set('AsientoItemID',String(id));url.searchParams.set('FechaCashflow',date);
  try{
    const response=await fetch(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)});
    if(!response.ok){
      if(response.status===401||response.status===403)return res.status(401).json({error:'Finnegans rechazó el acceso. Verificá el token y los permisos.'});
      if(response.status===429)return res.status(429).json({error:'Finnegans recibió demasiadas solicitudes. Intentá nuevamente más tarde.'});
      return res.status(502).json({error:'Finnegans no confirmó la actualización. El cambio sigue pendiente.'});
    }
    const text=await response.text();if(Buffer.byteLength(text)>4096)return res.status(502).json({error:'La respuesta de Finnegans no es válida. El cambio sigue pendiente.'});
    let result;try{result=JSON.parse(text)}catch{return res.status(502).json({error:'Finnegans no devolvió JSON válido. El cambio sigue pendiente.'})}
    if(!Array.isArray(result)||result.length!==1||!result[0]||result[0].RESULTADO!=='OK')return res.status(502).json({error:'Finnegans no devolvió RESULTADO: OK. El cambio sigue pendiente.'});
    return res.status(200).json({confirmed:true,source,asientoItemId:String(id),date});
  }catch(error){
    if(error.name==='TimeoutError'||error.name==='AbortError')return res.status(504).json({error:'La actualización demoró demasiado. No se pudo confirmar el resultado; verificá Finnegans antes de reintentar.'});
    return res.status(502).json({error:'No se pudo confirmar la actualización en Finnegans. El cambio sigue pendiente.'});
  }
};
