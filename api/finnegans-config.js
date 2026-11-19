'use strict';
const {sharedConfig,sharedToken}=require('../lib/finnegans-shared.cjs');
const {authorize}=require('../lib/workspace-auth.cjs');
const {REPORTS}=require('../lib/finnegans-reports.cjs');
const {usersEnabled}=require('../lib/auth-session.cjs');
const {legacyCredentials}=require('../lib/legacy-credentials.cjs');
const {readCompanyWorkspace}=require('../lib/company-workspace.cjs');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'La solicitud debe realizarse desde esta aplicación.'})}}
  if(!await authorize(req,res))return;
  if(req.method==='GET'){
    const config=sharedConfig();
    if(usersEnabled()){
      if(!config.enabled)try{await legacyCredentials();config.enabled=true}catch{}
      if(config.enabled){
        const workspace=await readCompanyWorkspace(req.cashflowAuth.company.id);
        for(const [source,report] of Object.entries(REPORTS)){
          const saved=workspace.payload?.filters?.[source]||{};
          const filters=Object.fromEntries(report.fields.filter(key=>typeof saved[key]==='string').map(key=>[key,saved[key]]));
          config.sources[source]={filters:{...(config.sources[source]?.filters||{}),...filters}};
        }
      }
    }
    return res.status(200).json(config);
  }
  if(req.method==='POST'){
    if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato de la solicitud debe ser JSON.'});
    try{await sharedToken();return res.status(200).json({connected:true})}catch(e){return res.status(e.status||502).json({error:e.message})}
  }
  res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método no permitido.'});
};
