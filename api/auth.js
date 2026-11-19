'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {normalizeEmail,validPassword,hashPassword,verifyPassword,randomToken,tokenHash}=require('../lib/auth-crypto.cjs');
const {readyStore,currentSession,userCompanies,sessionCookie,cookieToken,usersEnabled}=(()=>{
  const store=require('../lib/auth-store.cjs'),session=require('../lib/auth-session.cjs');
  return {...store,...session};
})();
const {recoveryAvailable,sendRecovery}=require('../lib/auth-mail.cjs');

function publicSession(session){return session?{mode:'users',authenticated:true,user:session.user,companies:session.companies,company:session.company,recoveryAvailable:recoveryAvailable()}:{mode:'users',authenticated:false,recoveryAvailable:recoveryAvailable()}}
function sameOrigin(req){if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host}catch{return false}}
function clientAddress(req){return String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim().slice(0,100)}
async function blocked(sql,key){const rows=await sql`SELECT blocked_until FROM cashflow_auth_limits WHERE key_hash=${key} AND blocked_until>now()`;return rows.length>0}
async function failedAttempt(sql,key){
  await sql`INSERT INTO cashflow_auth_limits (key_hash,attempts,window_started_at,blocked_until)
    VALUES (${key},1,now(),NULL)
    ON CONFLICT (key_hash) DO UPDATE SET
      attempts=CASE WHEN cashflow_auth_limits.window_started_at<now()-interval '15 minutes' THEN 1 ELSE cashflow_auth_limits.attempts+1 END,
      window_started_at=CASE WHEN cashflow_auth_limits.window_started_at<now()-interval '15 minutes' THEN now() ELSE cashflow_auth_limits.window_started_at END,
      blocked_until=CASE WHEN cashflow_auth_limits.window_started_at>=now()-interval '15 minutes' AND cashflow_auth_limits.attempts>=4 THEN now()+interval '15 minutes' ELSE NULL END`;
}
async function clearAttempts(sql,key){await sql`DELETE FROM cashflow_auth_limits WHERE key_hash=${key}`}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(!usersEnabled())return res.status(200).json({mode:'legacy'});
  if(req.method==='GET'){
    try{return res.status(200).json(publicSession(await currentSession(req)))}
    catch{return res.status(503).json({error:'No se pudo verificar la sesión.'})}
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método no permitido.'})}
  if(!sameOrigin(req))return res.status(403).json({error:'Solicitud de otro origen.'});
  if((req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')return res.status(415).json({error:'El formato debe ser JSON.'});
  if(Number(req.headers['content-length'])>4096)return res.status(413).json({error:'La solicitud es demasiado grande.'});
  let body=req.body;try{if(typeof body==='string'){if(Buffer.byteLength(body)>4096)throw new Error();body=JSON.parse(body)}}catch{return res.status(400).json({error:'JSON inválido.'})}
  const action=body?.action;
  try{
    if(action==='login'){
      const email=normalizeEmail(body.email),password=body.password;
      if(!email||typeof password!=='string'||password.length>256)return res.status(400).json({error:'Ingresá un email y una contraseña válidos.'});
      const sql=await readyStore(),key=createHash('sha256').update(clientAddress(req)+'|'+email).digest('hex'),accountKey=createHash('sha256').update('account|'+email).digest('hex');
      if(await blocked(sql,key)||await blocked(sql,accountKey))return res.status(429).json({error:'Demasiados intentos. Esperá 15 minutos antes de volver a intentar.'});
      const rows=await sql`SELECT id,name,email,role,active,password_hash,session_version FROM cashflow_users WHERE email=${email} LIMIT 1`;
      const user=rows[0],valid=user?.active&&await verifyPassword(password,user.password_hash);
      if(!valid){await failedAttempt(sql,key);await failedAttempt(sql,accountKey);return res.status(401).json({error:'Email o contraseña incorrectos.'})}
      await clearAttempts(sql,key);await clearAttempts(sql,accountKey);
      const companies=await userCompanies(sql,user.id),companyId=companies.length===1?companies[0].id:null;
      const token=randomToken(),expiresAt=new Date(Date.now()+12*60*60*1000).toISOString();
      await sql`INSERT INTO cashflow_sessions (token_hash,user_id,company_id,session_version,expires_at)
        VALUES (${tokenHash(token)},${user.id},${companyId},${user.session_version},${expiresAt})`;
      res.setHeader('Set-Cookie',sessionCookie(token,req,12*60*60));
      return res.status(200).json({mode:'users',authenticated:true,user:{id:user.id,name:user.name,email:user.email,role:user.role},companies,company:companies.length===1?companies[0]:null,recoveryAvailable:recoveryAvailable()});
    }
    if(action==='logout'){
      const token=cookieToken(req);if(token){const sql=await readyStore();await sql`UPDATE cashflow_sessions SET revoked_at=now() WHERE token_hash=${tokenHash(token)}`}
      res.setHeader('Set-Cookie',sessionCookie('',req,0));return res.status(200).json({authenticated:false});
    }
    if(action==='select-company'){
      const session=await currentSession(req);if(!session)return res.status(401).json({error:'Iniciá sesión para continuar.'});
      const company=session.companies.find(c=>c.id===body.companyId);
      if(!company)return res.status(403).json({error:'No tenés acceso a esa empresa.'});
      await session.sql`UPDATE cashflow_sessions SET company_id=${company.id} WHERE token_hash=${tokenHash(session.token)}`;
      return res.status(200).json({company});
    }
    if(action==='request-reset'){
      const email=normalizeEmail(body.email);if(!email)return res.status(400).json({error:'Ingresá un email válido.'});
      if(!recoveryAvailable())return res.status(503).json({error:'La recuperación por correo todavía no está configurada.'});
      const sql=await readyStore(),key=createHash('sha256').update('reset|'+clientAddress(req)+'|'+email).digest('hex'),accountKey=createHash('sha256').update('reset-account|'+email).digest('hex');
      if(await blocked(sql,key)||await blocked(sql,accountKey))return res.status(429).json({error:'Esperá unos minutos antes de solicitar otro enlace.'});
      await failedAttempt(sql,key);await failedAttempt(sql,accountKey);
      const users=await sql`SELECT id,email FROM cashflow_users WHERE email=${email} AND active=true LIMIT 1`;
      if(users.length){
        const token=randomToken(),expiresAt=new Date(Date.now()+30*60*1000).toISOString();
        await sql`INSERT INTO cashflow_password_resets (token_hash,user_id,expires_at) VALUES (${tokenHash(token)},${users[0].id},${expiresAt})`;
        try{await sendRecovery(email,token)}catch{/* Do not disclose whether the account exists. */}
      }
      return res.status(200).json({message:'Si el email existe, recibirás un enlace para restablecer tu contraseña.'});
    }
    if(action==='reset'){
      if(typeof body.token!=='string'||!/^[A-Za-z0-9_-]{40,64}$/.test(body.token)||!validPassword(body.password)||body.password!==body.confirmPassword)return res.status(400).json({error:'El enlace o la nueva contraseña no son válidos.'});
      const sql=await readyStore(),hash=await hashPassword(body.password);
      const rows=await sql`UPDATE cashflow_password_resets SET used_at=now() WHERE token_hash=${tokenHash(body.token)} AND used_at IS NULL AND expires_at>now() RETURNING user_id`;
      if(!rows.length)return res.status(400).json({error:'El enlace venció o ya fue utilizado.'});
      await sql`UPDATE cashflow_users SET password_hash=${hash},session_version=session_version+1,updated_at=now() WHERE id=${rows[0].user_id}`;
      await sql`UPDATE cashflow_sessions SET revoked_at=now() WHERE user_id=${rows[0].user_id}`;
      return res.status(200).json({message:'Contraseña actualizada. Iniciá sesión nuevamente.'});
    }
    return res.status(400).json({error:'Acción no válida.'});
  }catch{return res.status(503).json({error:'No se pudo completar la solicitud. Intentá nuevamente.'})}
};
