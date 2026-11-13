const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const html=fs.readFileSync('dist/cashflow.html');
  const server=http.createServer((req,res)=>{
    if(req.url==='/api/workspace'){res.setHeader('Content-Type','application/json');return res.end('{"mode":"local"}')}
    if(req.url==='/api/finnegans-config'){res.setHeader('Content-Type','application/json');return res.end('{"enabled":false,"sources":{},"defaults":{"BCO":{"empresa":"EMPRE01"}}}')}
    res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>REPORT_STATE.BCO.filters.empresa==='EMPRE01');
    await page.evaluate(()=>{
      const today=reportToday();
      for(const key of Object.keys(S.data))S.data[key]={rows:[]};
      S.saldo=100;S.saldoManualSet=true;S.saldoFecha=today;S.ref=today;
      for(const key of ['CLI','PRV','CHP','CHT'])S.data[key]={rows:[{id:key+'-1',s:key,f:today,m:key==='PRV'||key==='CHP'?-100:100,c:'ARS',p:'Prueba',cat:key==='CLI'?'Cobranza clientes':key==='PRV'?'Proveedores':key==='CHP'?'Cheques emitidos':'Cheques en cartera',e:'En Cartera'}],at:today,orig:'Prueba'};
      save();renderAll();
    });
    assert.equal(await page.locator('#sourceBanner').innerText(),'');
    await page.evaluate(()=>{S.data.BCO={rows:[{id:'BCO-1',s:'BCO',account:'CC 1',bank:'Banco A',company:'E1',m:500,c:'ARS',f:S.ref}],at:S.ref,orig:'Finnegans · API'};save();renderAll()});
    assert.equal(await page.evaluate(()=>openingBalance()),500);
    await page.evaluate(()=>{S.ref=addD(S.ref,-1);save();renderAll()});
    assert.equal(await page.evaluate(()=>openingBalance()),0);
    assert.match(await page.locator('#sourceBanner').innerText(),/proyección puede estar incompleta/);
    await page.evaluate(()=>{S.ref=reportToday();save();renderAll()});
    assert.equal(await page.evaluate(()=>openingBalance()),500);
    await page.evaluate(()=>{S.data.CLI.orig='Excel · clientes.xlsx';renderAll()});
    assert.match(await page.locator('#sourceBanner').innerText(),/proyección puede estar incompleta/);
    assert.match(await page.locator('#sub').innerText(),/Excel de Clientes cargado/);
    await page.evaluate(()=>{S.data.CLI.orig='Prueba';renderAll()});
    await page.evaluate(()=>{S.data.PRV.at=addD(reportToday(),-1);save();renderAll()});
    assert.match(await page.locator('#sourceBanner').innerText(),/distintas fechas/);
    await page.locator('#sourceDetails').click();
    assert.match(await page.locator('#v-dat').innerText(),/Las fuentes del flujo tienen fechas diferentes/);
    assert.match(await page.locator('#v-dat').innerText(),/Proveedores: datos del/);
    await page.reload();
    assert.match(await page.locator('#sourceBanner').innerText(),/distintas fechas/);
    await page.evaluate(()=>{S.data.PRV.at=reportToday();S.data.CHT={rows:[],lastCheck:{status:'empty',at:reportToday()}};save();renderAll()});
    assert.equal(await page.locator('#sourceBanner').innerText(),'');
    await page.evaluate(()=>{S.data.CLI.lastCheck={status:'error',at:reportToday()};save();renderAll()});
    assert.match(await page.locator('#sourceBanner').innerText(),/proyección puede estar incompleta/);
    await page.reload();
    assert.equal(await page.evaluate(()=>S.data.CLI.lastCheck.status),'error');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({sameDateClean:true,excelUploadNotMisidentifiedAsSnapshot:true,mixedDateWarning:true,confirmedEmptyAccepted:true,failedRefreshWarning:true,persistsAfterReload:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
