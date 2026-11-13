'use strict';
const tokenHandler=require('../api/finnegans-token.js');
const {REPORTS,reportUrl}=require('./finnegans-reports.cjs');

function sharedConfig(){
  const enabled=!!(process.env.FINNEGANS_CLIENT_ID?.trim()&&process.env.FINNEGANS_CLIENT_SECRET?.trim());
  const sources={};
  if(enabled)for(const source of Object.keys(REPORTS)){
    try{
      // Bank balances cover every company in this installation unless an optional filter narrows them.
      const raw=JSON.parse(process.env['FINNEGANS_'+source+'_FILTERS']||(source==='BCO'?'{}':'null'));
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||(REPORTS[source].scope||['empresa','cuenta']).some(k=>typeof raw[k]!=='string'||!raw[k].trim()))continue;
      const filters=Object.fromEntries(REPORTS[source].fields.filter(k=>typeof raw[k]==='string').map(k=>[k,raw[k].trim()]));
      reportUrl(source,{...filters,fecha:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Buenos_Aires'}).format(new Date())},'validation');
      sources[source]={filters};
    }catch{/* An incomplete source stays disabled; secrets never enter public configuration. */}
  }
  return {enabled,sources};
}

async function sharedToken(){
  if(!sharedConfig().enabled)throw Object.assign(new Error('La conexión compartida no está configurada en Vercel.'),{status:503});
  let status=200,result;
  const res={setHeader(){},status(value){status=value;return this},json(value){result=value;return this}};
  await tokenHandler({method:'POST',headers:{'content-type':'application/json'},body:{client_id:process.env.FINNEGANS_CLIENT_ID,client_secret:process.env.FINNEGANS_CLIENT_SECRET}},res);
  if(status!==200)throw Object.assign(new Error(result.error),{status});
  return result.access_token;
}
module.exports={sharedConfig,sharedToken};
