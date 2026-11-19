'use strict';
const {pbkdf2Sync,createDecipheriv}=require('node:crypto');
const {readWorkspace}=require('./workspace-store.cjs');

function decryptLegacyVault(vault,accessKey){
  if(vault?.v!==1||vault.mode!=='set'||typeof accessKey!=='string'||accessKey.length<13)throw new Error('No hay credenciales compartidas para migrar.');
  const salt=Buffer.from(vault.salt||'','base64'),iv=Buffer.from(vault.iv||'','base64'),data=Buffer.from(vault.data||'','base64');
  if(salt.length!==16||iv.length!==12||data.length<17||data.length>10000)throw new Error('Las credenciales compartidas no tienen un formato válido.');
  const key=pbkdf2Sync(accessKey,salt,200000,32,'sha256');
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(data.subarray(-16));
  let parsed;try{parsed=JSON.parse(Buffer.concat([decipher.update(data.subarray(0,-16)),decipher.final()]).toString('utf8'))}
  catch{throw new Error('No se pudieron abrir las credenciales compartidas con la clave configurada.')}
  if(typeof parsed.clientId!=='string'||!parsed.clientId.trim()||typeof parsed.clientSecret!=='string'||!parsed.clientSecret.trim())throw new Error('Las credenciales compartidas están incompletas.');
  return {clientId:parsed.clientId.trim(),clientSecret:parsed.clientSecret};
}

async function legacyCredentials(){
  const workspace=await readWorkspace();
  return decryptLegacyVault(workspace.payload?.vault,process.env.CASHFLOW_ACCESS_KEY);
}
module.exports={decryptLegacyVault,legacyCredentials};
