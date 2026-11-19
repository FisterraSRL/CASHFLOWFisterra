'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {previewLegacy,splitLegacy}=require('../lib/company-migration.cjs');
const payload={version:1,state:{ref:'2026-11-19',tc:1500,fx:{MXN:80},saldo:900,hor:90,gran:'S',incChq:false,
  data:{CLI:{rows:[{id:'CLI-1',company:'Empresa A',m:100},{id:'CLI-2',company:'Empresa B',m:200},{id:'CLI-3',m:300}]},PRV:{rows:[{id:'PRV-1',company:'Empresa A',m:-50}]}},
  ovr:{'CLI-1':'2026-12-01','CLI-2':'2026-12-02'},inc:{'CLI-1':true,'CLI-2':true},dateChanges:{'CLI|1':{company:'Empresa A'},'CLI|2':{company:'Empresa B'}}},
  filters:{CLI:{empresa:'OLD',cuenta:'CLIENTES'},PRV:{empresa:'OLD',cuenta:'PROVEEDORES'}}};
test('legacy preview counts company rows and flags records without company',()=>{
  const p=previewLegacy(payload);assert.equal(p.unassigned,1);assert.deepEqual(p.companies.map(c=>[c.name,c.count]),[['Empresa A',2],['Empresa B',1]]);
});
test('migration copies only one company, preserves its scenarios and leaves the legacy source untouched',()=>{
  const result=splitLegacy(payload,{code:'EMPRE01',name:'Empresa A'});
  assert.equal(result.count,2);assert.deepEqual(result.payload.state.data.CLI.rows.map(r=>r.id),['CLI-1']);
  assert.deepEqual(result.payload.state.data.PRV.rows.map(r=>r.id),['PRV-1']);
  assert.deepEqual(result.payload.state.ovr,{'CLI-1':'2026-12-01'});
  assert.deepEqual(Object.keys(result.payload.state.dateChanges),['CLI|1']);
  assert.equal(result.payload.state.saldo,0);assert.equal(result.payload.filters.CLI.empresa,'EMPRE01');
  assert.equal(payload.state.data.CLI.rows.length,3);
  assert.equal(result.payload.vault,undefined);
});
