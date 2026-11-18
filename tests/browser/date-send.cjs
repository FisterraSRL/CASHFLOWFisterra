const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const html=fs.readFileSync('dist/cashflow.html');let calls=[];
  const server=http.createServer(async(req,res)=>{
    const json=(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))};
    if(req.url==='/api/workspace')return json(200,{mode:'local'});
    if(req.url==='/api/finnegans-config')return json(200,{enabled:false,sources:{}});
    if(req.url==='/api/finnegans-date-change'){
      let text='';for await(const part of req)text+=part;const body=JSON.parse(text);calls.push(body);
      return body.source==='CLI'?json(200,{confirmed:true,source:body.source,asientoItemId:String(body.asientoItemId),date:body.date}):json(502,{error:'Finnegans no devolvió RESULTADO: OK. El cambio sigue pendiente.'});
    }
    res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(()=>credentialsReady);
    await page.evaluate(()=>{
      for(const k of Object.keys(S.data))S.data[k]={rows:[],orig:'Prueba'};
      S.data.CLI.rows=[{s:'CLI',id:'CLI-one',asientoItemId:1369927,f:'2026-11-20',m:1000,c:'ARS',p:'Cliente',doc:'Factura 1',cat:'Cobranza clientes'}];
      S.data.PRV.rows=[{s:'PRV',id:'PRV-one',asientoItemId:1369953,f:'2026-11-20',m:-500,c:'ARS',p:'Proveedor',doc:'Factura 2',cat:'Proveedores'}];
      FAPI.token='test.token';FAPI.expiresAt=Date.now()+3600000;
      setDate('CLI-one','2026-11-25');setDate('PRV-one','2026-11-26');
    });
    await page.locator('[data-t=dat]').click();
    assert.equal(calls.length,0);
    await page.getByRole('button',{name:'Enviar pendientes a Finnegans'}).click();
    await page.waitForFunction(()=>!DATE_SEND.busy);
    assert.equal(calls.length,2);assert.equal(calls[0].access_token,'test.token');
    assert.deepEqual(await page.evaluate(()=>[S.dateChanges['CLI|1369927'].status,S.dateChanges['PRV|1369953'].status]),['sent','pending']);
    assert.equal(await page.evaluate(()=>S.ovr['CLI-one']),'2026-11-25');
    assert.match(await page.locator('#v-dat').innerText(),/1 pendiente · 1 enviado/);
    await page.evaluate(()=>{const rows=S.data.CLI.rows.map(r=>({...r,id:'CLI-refreshed'}));clearOvr('CLI');restorePendingDates('CLI',rows);S.data.CLI.rows=rows;renderAll()});
    assert.equal(await page.evaluate(()=>S.ovr['CLI-refreshed']),'2026-11-25');
    await page.evaluate(()=>setDate('CLI-refreshed','2026-11-28'));
    assert.equal(await page.evaluate(()=>S.dateChanges['CLI|1369927'].status),'pending');
    assert.equal(await page.evaluate(()=>S.dateChanges['CLI|1369927'].lastSentDate),'2026-11-25');
    await page.evaluate(()=>setDate('CLI-refreshed',null));
    assert.equal(await page.evaluate(()=>S.dateChanges['CLI|1369927'].status),'pending');
    assert.equal(await page.evaluate(()=>S.dateChanges['CLI|1369927'].date),'2026-11-20');
    await page.evaluate(()=>setDate('CLI-refreshed','2026-11-25'));
    assert.equal(await page.evaluate(()=>S.dateChanges['CLI|1369927'].status),'sent');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({manualOnly:true,exactConfirmationRequired:true,failedChangeRetained:true,sentDateSurvivesRefresh:true,newChangeRequeues:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
