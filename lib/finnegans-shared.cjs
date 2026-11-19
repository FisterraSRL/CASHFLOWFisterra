'use strict';
const tokenHandler=require('../api/finnegans-token.js');
const {REPORTS,reportUrl}=require('./finnegans-reports.cjs');
const {usersEnabled}=require('./auth-session.cjs');
const {legacyCredentials}=require('./legacy-credentials.cjs');

function sharedConfig(){
  const enabled=!!(process.env.FINNEGANS_CLIENT_ID?.trim()&&process.env.FINNEGANS_CLIENT_SECRET?.trim());
  const sources={},defaults={};
  if(enabled)for(const source of Object.keys(REPORTS)){
    try{
      const raw=JSON.parse(process.env['FINNEGANS_'+source+'_FILTERS']||'null');
      const scope=REPORTS[source].scope||['cuenta'];
      if(!raw||typeof raw!=='object'||Array.isArray(raw)||scope.some(k=>typeof raw[k]!=='string'||!raw[k].trim()))continue;
      const filters=Object.fromEntries(REPORTS[source].fields.filter(k=>typeof raw[k]==='string').map(k=>[k,raw[k].trim()]));
      reportUrl(source,{...filters,fecha:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Buenos_Aires'}).format(new Date())},'validation');
      sources[source]={filters};
    }catch{/* An incomplete source stays disabled; secrets never enter public configuration. */}
  }
  return {enabled,sources,defaults};
}

async function sharedToken(){
  let credentials;
  if(sharedConfig().enabled)credentials={clientId:process.env.FINNEGANS_CLIENT_ID,clientSecret:process.env.FINNEGANS_CLIENT_SECRET};
  else if(usersEnabled())try{credentials=await legacyCredentials()}catch{throw Object.assign(new Error('No se pudieron recuperar las credenciales Finnegans de esta instalación.'),{status:503})}
  else throw Object.assign(new Error('La conexión compartida no está configurada en Vercel.'),{status:503});
  let status=200,result;
  const res={setHeader(){},status(value){status=value;return this},json(value){result=value;return this}};
  await tokenHandler({internal:true,method:'POST',headers:{'content-type':'application/json'},body:{client_id:credentials.clientId,client_secret:credentials.clientSecret}},res);
  if(status!==200)throw Object.assign(new Error(result.error),{status});
  return result.access_token;
}
module.exports={sharedConfig,sharedToken};
