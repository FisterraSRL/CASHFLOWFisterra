'use strict';
const {readyStore}=require('./auth-store.cjs');
async function readCompanyWorkspace(companyId){
  const sql=await readyStore();
  const rows=await sql`SELECT revision,payload,updated_at FROM cashflow_company_workspace WHERE company_id=${companyId} LIMIT 1`;
  if(!rows.length)return {revision:0,payload:null,updatedAt:null};
  return {revision:Number(rows[0].revision),payload:rows[0].payload,updatedAt:rows[0].updated_at};
}
async function writeCompanyWorkspace(companyId,expectedRevision,payload){
  const sql=await readyStore();
  const rows=await sql`INSERT INTO cashflow_company_workspace (company_id,revision,payload,updated_at)
    VALUES (${companyId},1,${JSON.stringify(payload)}::jsonb,now())
    ON CONFLICT (company_id) DO UPDATE SET revision=cashflow_company_workspace.revision+1,
      payload=EXCLUDED.payload,updated_at=now()
    WHERE cashflow_company_workspace.revision=${expectedRevision}
    RETURNING revision,updated_at`;
  if(!rows.length)return null;
  return {revision:Number(rows[0].revision),updatedAt:rows[0].updated_at};
}
module.exports={readCompanyWorkspace,writeCompanyWorkspace};
