'use strict';
const {sharedConfig,sharedToken}=require('../lib/finnegans-shared.cjs');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('Vercel-CDN-Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)throw new Error()}catch{return res.status(403).json({error:'La solicitud debe realizarse desde esta aplicación.'})}}
  if(req.method==='GET')return res.status(200).json(sharedConfig());
  if(req.method==='POST'){
    if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato de la solicitud debe ser JSON.'});
    try{await sharedToken();return res.status(200).json({connected:true})}catch(e){return res.status(e.status||502).json({error:e.message})}
  }
  res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método no permitido.'});
};
