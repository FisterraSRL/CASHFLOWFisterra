'use strict';
const {randomBytes,createHash,timingSafeEqual,scrypt}=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(scrypt);
const COST=16384,BLOCK=8,PARALLEL=1,KEY_BYTES=64;

function normalizeEmail(value){
  if(typeof value!=='string')return null;
  const email=value.trim().toLowerCase();
  if(email.length<3||email.length>254||!(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))return null;
  return email;
}
function validPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=256&&Buffer.byteLength(value,'utf8')<=1024}
async function hashPassword(password){
  if(!validPassword(password))throw new Error('La contraseña debe tener entre 12 y 256 caracteres.');
  const salt=randomBytes(24),hash=await derive(password,salt,KEY_BYTES,{N:COST,r:BLOCK,p:PARALLEL,maxmem:64*1024*1024});
  return `scrypt$${COST}$${BLOCK}$${PARALLEL}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
async function verifyPassword(password,encoded){
  if(typeof password!=='string'||typeof encoded!=='string'||password.length>256)return false;
  const parts=encoded.split('$');
  if(parts.length!==6||parts[0]!=='scrypt'||parts[1]!==String(COST)||parts[2]!==String(BLOCK)||parts[3]!==String(PARALLEL))return false;
  let salt,expected;try{salt=Buffer.from(parts[4],'base64url');expected=Buffer.from(parts[5],'base64url')}catch{return false}
  if(salt.length!==24||expected.length!==KEY_BYTES)return false;
  const actual=await derive(password,salt,KEY_BYTES,{N:COST,r:BLOCK,p:PARALLEL,maxmem:64*1024*1024});
  return timingSafeEqual(actual,expected);
}
function randomToken(){return randomBytes(32).toString('base64url')}
function tokenHash(token){return createHash('sha256').update(token).digest('hex')}

module.exports={normalizeEmail,validPassword,hashPassword,verifyPassword,randomToken,tokenHash};
