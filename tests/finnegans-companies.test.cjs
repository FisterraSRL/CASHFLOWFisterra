'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const shared=require('../lib/finnegans-shared.cjs'),originalToken=shared.sharedToken,originalFetch=global.fetch;
shared.sharedToken=async()=> 'server.test.token';
delete require.cache[require.resolve('../lib/finnegans-companies.cjs')];
const {activeCompanies,fetchActiveCompanies}=require('../lib/finnegans-companies.cjs');
test.after(()=>{shared.sharedToken=originalToken;global.fetch=originalFetch});

test('company catalog accepts only activo true and preserves code and name',()=>{
  const result=activeCompanies([{codigo:'INACTIVA',nombre:'Inactiva',activo:false},
    {codigo:'3071022135578',nombre:'GEOLOG ARGENTINA S.A.',descripcion:'Geolog',activo:true},
    {codigo:'TEXTO',nombre:'No activa',activo:'true'}]);
  assert.deepEqual(result,[{code:'3071022135578',name:'GEOLOG ARGENTINA S.A.'}]);
  assert.throws(()=>activeCompanies([{codigo:'A',nombre:'Empresa A',activo:true},{codigo:'B',nombre:'Empresa A',activo:true}]),/repetido/);
});

test('company catalog calls the Finnegans list on the server with a fresh token',async()=>{
  global.fetch=async url=>{
    const request=new URL(url);
    assert.equal(request.pathname,'/api/empresaSucursal/list');
    assert.equal(request.searchParams.get('[updatedSince]'),'');
    assert.equal(request.searchParams.get('ACCESS_TOKEN'),'server.test.token');
    return new Response(JSON.stringify([{codigo:'EMPRE01',nombre:'Empresa Activa',activo:true},{codigo:'INACTIVA',nombre:'Empresa Inactiva',activo:false}]));
  };
  assert.deepEqual(await fetchActiveCompanies(),[{code:'EMPRE01',name:'Empresa Activa'}]);
});
