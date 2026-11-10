'use strict';
const {createHash,timingSafeEqual}=require('node:crypto');
const {configured}=require('./workspace-store.cjs');

function protectedDeployment(){
  return Boolean(process.env.CASHFLOW_DATABASE_DATABASE_URL||process.env.CASHFLOW_DATABASE_URL||process.env.DATABASE_URL||process.env.CASHFLOW_ACCESS_KEY);
}

function authorize(req,res){
  if(!protectedDeployment())return true; // Existing local development mode.
  if(!configured()){
    res.status(503).json({error:'Falta completar el almacenamiento y la clave de acceso de esta instalación.'});
    return false;
  }
  const supplied=req.headers['x-cashflow-key'];
  const expected=process.env.CASHFLOW_ACCESS_KEY;
  if(typeof supplied!=='string'||supplied.length>512){
    res.status(401).json({error:'Ingresá la clave de acceso de esta instalación.'});return false;
  }
  const a=createHash('sha256').update(supplied).digest();
  const b=createHash('sha256').update(expected).digest();
  if(!timingSafeEqual(a,b)){
    res.status(401).json({error:'La clave de acceso no es válida.'});return false;
  }
  return true;
}
module.exports={authorize,protectedDeployment};
