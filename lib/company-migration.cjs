'use strict';
const same=(a,b)=>String(a||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('es-AR')===String(b||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('es-AR');
function previewLegacy(payload){
  const companies=new Map();let unassigned=0;
  for(const [source,data]of Object.entries(payload?.state?.data||{}))for(const row of data.rows||[]){
    if(!row.company){unassigned++;continue}
    const item=companies.get(row.company)||{name:row.company,count:0,sources:{}};
    item.count++;item.sources[source]=(item.sources[source]||0)+1;companies.set(row.company,item);
  }
  return {companies:[...companies.values()].sort((a,b)=>a.name.localeCompare(b.name)),unassigned};
}
function splitLegacy(payload,company){
  if(payload?.version!==1||!payload.state?.data||!company?.code||!company?.name)throw new Error('Datos de migración no válidos.');
  const source=payload.state,data={},ids=new Set();let count=0;
  for(const [key,entry]of Object.entries(source.data)){
    const rows=(entry.rows||[]).filter(row=>same(row.company,company.name));
    rows.forEach(row=>{if(row.id)ids.add(row.id)});count+=rows.length;
    data[key]=rows.length?{...entry,rows,applications:(entry.applications||[]).filter(row=>same(row.company,company.name)),summary:null}:{rows:[]};
  }
  if(!count)throw new Error('No hay movimientos con el nombre de esta empresa en los datos anteriores.');
  const state={ref:source.ref,tc:source.tc,fx:source.fx||{},saldo:0,saldoFecha:null,saldoManualSet:false,hor:source.hor,gran:source.gran,incChq:source.incChq,
    bal:{},excl:[],ovr:Object.fromEntries(Object.entries(source.ovr||{}).filter(([id])=>ids.has(id))),
    inc:Object.fromEntries(Object.entries(source.inc||{}).filter(([id])=>ids.has(id))),
    dateChanges:Object.fromEntries(Object.entries(source.dateChanges||{}).filter(([,change])=>same(change.company,company.name))),data};
  const filters=Object.fromEntries(Object.entries(payload.filters||{}).map(([key,value])=>[key,Object.fromEntries(Object.entries(value).filter(([field])=>field!=='empresa'))]));
  return {count,payload:{version:1,state,filters}};
}
module.exports={previewLegacy,splitLegacy};
