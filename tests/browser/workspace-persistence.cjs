const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const key='local-test-installation-key',html=fs.readFileSync('dist/cashflow.html');
  let revision=0,payload=null,reportCalls=0,sharedConfig=false;
  const server=http.createServer(async(req,res)=>{
    const json=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))};
    if(req.url==='/api/workspace'){
      if(req.headers['x-cashflow-key']!==key)return json(401,{error:'Clave requerida'});
      if(req.method==='GET')return json(200,{revision,payload,updatedAt:revision?'2026-11-10T12:00:00Z':null});
      let body='';for await(const part of req)body+=part;const next=JSON.parse(body);
      if(next.revision!==revision)return json(409,{error:'Estado modificado en otro equipo'});
      payload=next.payload;revision++;return json(200,{revision,updatedAt:'2026-11-10T12:00:00Z'});
    }
    if(req.url==='/api/finnegans-config')return json(200,sharedConfig?{enabled:true,sources:{PRV:{filters:{empresa:'EMPRE01',cuenta:'PRV'}}}}:{enabled:false,sources:{}});
    if(req.url==='/api/finnegans-report'||req.url==='/api/finnegans-token'){reportCalls++;return json(500,{error:'No debe consultarse al abrir'});}
    res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const url=`http://127.0.0.1:${server.address().port}`;
  const opened=[];
  async function page(){const context=await browser.newContext(),p=await context.newPage();opened.push(context);await p.goto(url);return p}
  async function unlock(p){await p.locator('#workspaceKeyInput').fill(key);await p.getByRole('button',{name:'Abrir cashflow'}).click()}
  async function settled(p){await p.waitForFunction(()=>WORKSPACE.mode==='ready'&&!WORKSPACE.busy&&!WORKSPACE.dirty,{timeout:12000})}
  try{
    const a=await page();
    await a.waitForFunction(()=>document.body.className==='workspace-locked');
    assert.equal(await a.locator('body').getAttribute('class'),'workspace-locked');
    await a.locator('#workspaceKeyInput').fill('wrong-key');await a.getByRole('button',{name:'Abrir cashflow'}).click();
    await a.waitForFunction(()=>document.body.className==='workspace-locked');
    assert.equal(await a.locator('body').getAttribute('class'),'workspace-locked');
    await unlock(a);await a.getByRole('button',{name:'Comenzar sin datos'}).click();
    await a.waitForFunction(()=>WORKSPACE.mode==='ready');assert.equal(await a.evaluate(()=>S.data.CLI.rows.length),0);
    await a.locator('#pSaldo').fill('1000');await a.locator('#pSaldo').dispatchEvent('change');
    await a.locator('[data-t=dat]').click();
    await a.getByText('Parámetros de composición de saldos').first().click();
    await a.locator('#report-CLI-empresa').fill('EMPRE01');
    await a.locator('[data-ex=EJC]').click();await settled(a);
    await a.locator('#apiClientId').fill('test-client-id');
    await a.locator('#apiClientSecret').fill('test-client-secret');
    await a.locator('#apiSaveCredentials').click();
    await a.getByText('Credenciales cifradas y guardadas para esta instalación.').waitFor();
    await settled(a);
    assert.equal(payload.vault.mode,'set');
    assert.ok(!JSON.stringify(payload).includes('test-client-secret'));
    assert.equal(payload.state.saldo,1000);assert.equal(payload.filters.CLI.empresa,'EMPRE01');assert.ok(payload.state.data.EJC.rows.length>0);
    const firstRevision=revision;

    const b=await page();await unlock(b);await b.waitForFunction(()=>WORKSPACE.mode==='ready');
    assert.equal(await b.locator('#pSaldo').inputValue(),'1.000');
    assert.equal(await b.evaluate(()=>S.data.EJC.rows.length),payload.state.data.EJC.rows.length);
    await b.locator('[data-t=dat]').click();await b.getByText('Parámetros de composición de saldos').first().click();
    assert.equal(await b.locator('#report-CLI-empresa').inputValue(),'EMPRE01');
    await b.getByText('Credenciales compartidas recuperadas.').waitFor();
    assert.equal(await b.locator('#apiClientId').inputValue(),'test-client-id');
    assert.equal(await b.locator('#apiClientSecret').inputValue(),'test-client-secret');
    await b.locator('[data-t=flu]').click();await b.locator('[data-t=dat]').click();
    await b.waitForTimeout(500);
    assert.equal(revision,firstRevision);assert.equal(reportCalls,0);

    await b.locator('#pSaldo').fill('1500');await b.locator('#pSaldo').dispatchEvent('change');await settled(b);
    await a.locator('#pSaldo').fill('2000');await a.locator('#pSaldo').dispatchEvent('change');
    await a.waitForFunction(()=>WORKSPACE.mode==='conflict');
    assert.match(await a.locator('#storageMessage').innerText(),/Otro equipo guardó cambios/);
    assert.equal(payload.state.saldo,1500);

    sharedConfig=true;
    const c=await page();await unlock(c);await c.waitForFunction(()=>WORKSPACE.mode==='ready');await c.evaluate(()=>sharedReady);
    assert.equal(await c.evaluate(()=>S.saldo),1500);assert.equal(reportCalls,0);
    console.log(JSON.stringify({keyRequired:true,firstUseBlank:true,parametersAndDataShared:true,noAutomaticFinnegansUpdate:true,conflictPreventsOverwrite:true}));
  }finally{for(const context of opened)await context.close();await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
