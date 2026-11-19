'use strict';
const {sharedToken}=require('./finnegans-shared.cjs');

function activeCompanies(payload){
  if(!Array.isArray(payload)||payload.length>5000)throw new Error('Finnegans no devolvió un listado de empresas válido.');
  const result=[],codes=new Set(),names=new Set();
  for(const row of payload){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Finnegans devolvió una empresa inválida.');
    if(row.activo!==true)continue;
    const code=typeof row.codigo==='string'?row.codigo.trim():'';
    const name=typeof row.nombre==='string'?row.nombre.trim().replace(/\s+/g,' '):'';
    if(!/^[A-Za-z0-9_./-]{1,64}$/.test(code)||name.length<2||name.length>120)throw new Error('Una empresa activa no tiene código o nombre válidos.');
    if(codes.has(code)||names.has(name.toLocaleUpperCase('es-AR')))throw new Error('El catálogo contiene empresas activas con código o nombre repetido.');
    codes.add(code);names.add(name.toLocaleUpperCase('es-AR'));result.push({code,name});
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name,'es-AR'));
}

async function fetchActiveCompanies(){
  const token=await sharedToken();
  const url=new URL('https://api.finneg.com/api/empresaSucursal/list');
  url.searchParams.set('[updatedSince]','');url.searchParams.set('ACCESS_TOKEN',token);
  let response;
  try{response=await fetch(url,{method:'GET',redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)})}
  catch{throw new Error('No se pudo consultar el catálogo de empresas de Finnegans.')}
  if(!response.ok)throw new Error(response.status===401||response.status===403?'Finnegans rechazó el acceso al catálogo de empresas.':'Finnegans no pudo devolver el catálogo de empresas.');
  const raw=await response.text();
  if(Buffer.byteLength(raw)>2*1024*1024)throw new Error('El catálogo de empresas supera el límite permitido.');
  let payload;try{payload=JSON.parse(raw)}catch{throw new Error('Finnegans no devolvió un catálogo JSON válido.')}
  return activeCompanies(payload);
}
module.exports={activeCompanies,fetchActiveCompanies};
