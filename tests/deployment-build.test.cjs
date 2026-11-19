'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('one source builds an empty customer installation and keeps Fisterra data separate',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cashflow-build-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  function build(name,file,auth=false){
    const output=path.join(dir,file);
    const env={...process.env};
    delete env.CASHFLOW_INSTALLATION_NAME;
    if(name)env.CASHFLOW_INSTALLATION_NAME=name;
    if(auth)env.CASHFLOW_AUTH_MODE='users';else delete env.CASHFLOW_AUTH_MODE;
    const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/build-deployment.cjs'),output],{env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const html=fs.readFileSync(output,'utf8');
    const raw=html.match(/const RAW = (.*);/);
    assert.ok(raw);
    return {html,data:JSON.parse(raw[1])};
  }
  const nubiral=build('Nubiral','nubiral.html');
  assert.match(nubiral.html,/<title>Nubiral · Cashflow<\/title>/);
  assert.match(nubiral.html,/<span class="company">NUBIRAL<\/span>/);
  assert.deepEqual(nubiral.data.mov,[]);
  assert.deepEqual(nubiral.data.cartera,[]);
  assert.equal(nubiral.data.tc,0);
  assert.doesNotMatch(nubiral.html,/<span class="company">FISTERRA<\/span>/);
  const fisterra=build(null,'fisterra.html');
  assert.ok(fisterra.data.mov.length>0);
  assert.ok(fisterra.data.mov.length>nubiral.data.mov.length);
  assert.match(fisterra.html,/<span class="company">FISTERRA<\/span>/);
  const protectedFisterra=build(null,'fisterra-auth.html',true);
  assert.deepEqual(protectedFisterra.data.mov,[]);
  assert.deepEqual(protectedFisterra.data.cartera,[]);
});
