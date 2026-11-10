'use strict';

// Each customer deployment points to its own Postgres database. No tenant id is
// accepted from the browser, so a deployment cannot select another customer.
function databaseUrl(){return process.env.CASHFLOW_DATABASE_DATABASE_URL||process.env.CASHFLOW_DATABASE_URL||process.env.DATABASE_URL||''}
function configured(){return Boolean(databaseUrl()&&process.env.CASHFLOW_ACCESS_KEY?.length>=13)}

function query(){
  const {neon}=require('@neondatabase/serverless');
  return neon(databaseUrl());
}

async function ensureTable(sql){
  await sql`CREATE TABLE IF NOT EXISTS cashflow_workspace (
    id integer PRIMARY KEY CHECK (id = 1),
    revision bigint NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

async function readWorkspace(){
  const sql=query();await ensureTable(sql);
  const rows=await sql`SELECT revision,payload,updated_at FROM cashflow_workspace WHERE id = 1`;
  if(!rows.length)return {revision:0,payload:null,updatedAt:null};
  return {revision:Number(rows[0].revision),payload:rows[0].payload,updatedAt:rows[0].updated_at};
}

async function writeWorkspace(expectedRevision,payload){
  const sql=query();await ensureTable(sql);
  const rows=await sql`INSERT INTO cashflow_workspace (id,revision,payload,updated_at)
    VALUES (1,1,${JSON.stringify(payload)}::jsonb,now())
    ON CONFLICT (id) DO UPDATE SET
      revision=cashflow_workspace.revision+1,
      payload=EXCLUDED.payload,
      updated_at=now()
    WHERE cashflow_workspace.revision=${expectedRevision}
    RETURNING revision,updated_at`;
  if(!rows.length)return null;
  return {revision:Number(rows[0].revision),updatedAt:rows[0].updated_at};
}

module.exports={configured,readWorkspace,writeWorkspace};
