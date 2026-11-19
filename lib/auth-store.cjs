'use strict';
const {randomUUID}=require('node:crypto');
const {hashPassword,normalizeEmail,tokenHash}=require('./auth-crypto.cjs');
const {databaseUrl}=require('./workspace-store.cjs');

function sqlClient(){
  if(!databaseUrl())throw new Error('Falta configurar la base de datos.');
  return require('@neondatabase/serverless').neon(databaseUrl());
}

async function ensureAuthTables(sql){
  await sql`CREATE TABLE IF NOT EXISTS cashflow_roles (
    code text PRIMARY KEY, label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`INSERT INTO cashflow_roles (code,label) VALUES ('admin','Administrador'),('user','Usuario estándar') ON CONFLICT (code) DO NOTHING`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_users (
    id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
    password_hash text NOT NULL, role text NOT NULL REFERENCES cashflow_roles(code),
    active boolean NOT NULL DEFAULT true, session_version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_companies (
    id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
    active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  // Report rows identify a company by its display name. A duplicate name would
  // make the company boundary ambiguous even when the Finnegans codes differ.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS cashflow_companies_name_unique ON cashflow_companies (upper(name))`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_user_companies (
    user_id uuid NOT NULL REFERENCES cashflow_users(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES cashflow_companies(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id,company_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_sessions (
    token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES cashflow_users(id) ON DELETE CASCADE,
    company_id uuid REFERENCES cashflow_companies(id), session_version integer NOT NULL,
    expires_at timestamptz NOT NULL, revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_password_resets (
    token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES cashflow_users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL, used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_auth_limits (
    key_hash text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL DEFAULT now(), blocked_until timestamptz
  )`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_auth_audit (
    id uuid PRIMARY KEY, actor_user_id uuid REFERENCES cashflow_users(id),
    target_user_id uuid REFERENCES cashflow_users(id), action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS cashflow_company_workspace (
    company_id uuid PRIMARY KEY REFERENCES cashflow_companies(id) ON DELETE CASCADE,
    revision bigint NOT NULL, payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

async function bootstrapAdmin(sql){
  const email=normalizeEmail(process.env.CASHFLOW_ADMIN_EMAIL),password=process.env.CASHFLOW_ADMIN_PASSWORD;
  if(!email||!password)return;
  const users=await sql`SELECT id FROM cashflow_users LIMIT 1`;
  if(users.length)return;
  const passwordHash=await hashPassword(password),id=randomUUID();
  await sql`INSERT INTO cashflow_users (id,name,email,password_hash,role)
    SELECT ${id},'Administrador inicial',${email},${passwordHash},'admin'
    WHERE NOT EXISTS (SELECT 1 FROM cashflow_users)
    ON CONFLICT (email) DO NOTHING`;
}

let storePromise;
function readyStore(){
  if(!storePromise)storePromise=(async()=>{const sql=sqlClient();await ensureAuthTables(sql);await bootstrapAdmin(sql);return sql})()
    .catch(error=>{storePromise=null;throw error});
  return storePromise;
}
async function audit(sql,actorUserId,targetUserId,action,details={}){
  await sql`INSERT INTO cashflow_auth_audit (id,actor_user_id,target_user_id,action,details)
    VALUES (${randomUUID()},${actorUserId},${targetUserId},${action},${JSON.stringify(details)}::jsonb)`;
}
async function userCompanies(sql,userId){
  return sql`SELECT c.id,c.code,c.name FROM cashflow_companies c
    JOIN cashflow_user_companies uc ON uc.company_id=c.id
    WHERE uc.user_id=${userId} AND c.active=true ORDER BY c.name`;
}
async function sessionByToken(sql,token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{40,64}$/.test(token))return null;
  const rows=await sql`SELECT s.token_hash,s.user_id,s.company_id,s.expires_at,
      u.name,u.email,u.role,u.active,u.session_version,c.code AS company_code,c.name AS company_name
    FROM cashflow_sessions s JOIN cashflow_users u ON u.id=s.user_id
    LEFT JOIN cashflow_companies c ON c.id=s.company_id
    WHERE s.token_hash=${tokenHash(token)} AND s.revoked_at IS NULL
      AND s.expires_at>now() AND s.session_version=u.session_version AND u.active=true
      AND (s.company_id IS NULL OR (c.active=true AND EXISTS (
        SELECT 1 FROM cashflow_user_companies uc WHERE uc.user_id=u.id AND uc.company_id=s.company_id)))
    LIMIT 1`;
  return rows[0]||null;
}
module.exports={sqlClient,ensureAuthTables,bootstrapAdmin,readyStore,audit,userCompanies,sessionByToken};
