const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
  const html=fs.readFileSync('dist/cashflow.html');
  const server=http.createServer((req,res)=>{
    if(req.url==='/api/workspace'){res.setHeader('Content-Type','application/json');return res.end('{"mode":"local"}')}
    if(req.url==='/api/finnegans-config'){res.setHeader('Content-Type','application/json');return res.end('{"enabled":false,"sources":{}}')}
    res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(()=>{
      for(const key of Object.keys(S.data))S.data[key]={rows:[],orig:'Prueba'};
      const f='2026-11-20';
      S.data.CLI.rows=[
        {s:'CLI',id:'CLI-with-id',asientoItemId:1369927,f,m:1000,c:'ARS',p:'Cliente mixto',doc:'Factura 1',cat:'Cobranza clientes'},
        {s:'CLI',id:'CLI-without-id',f,m:2000,c:'ARS',p:'Cliente mixto',doc:'Factura 2',cat:'Cobranza clientes'}
      ];
      S.data.PRV.rows=[{s:'PRV',id:'PRV-with-id',asientoItemId:1369953,f,m:-500,c:'ARS',p:'Proveedor',doc:'Factura 3',cat:'Proveedores'}];
      S.data.CHP.rows=[{s:'CHP',id:'CHP-without-id',f,m:-300,c:'ARS',p:'Cheque propio',doc:'Ch 10',cat:'Cheques emitidos'}];
      S.data.CHT.rows=[{s:'CHT',id:'CHT-without-id',f,m:400,c:'ARS',p:'Cheque tercero',doc:'Ch 20',cat:'Cheques en cartera',e:'En Cartera'}];
      S.ref='2026-11-18';S.hor=90;S.view='org';S.inc={};S.ovr={};S.excl=[];S.exp={};S.expO={
        'Cobranza clientes|Cliente mixto':true,'Proveedores|Proveedor':true,
        'Cheques emitidos|Cheque propio':true,'Cheques en cartera|Cheque tercero':true
      };
      renderAll();
    });
    await page.locator('[data-t=flu]').click();
    assert.equal(await page.locator('tr.doc input.dch[data-id]').count(),2);
    for(const id of ['CLI-without-id','CHP-without-id','CHT-without-id']){
      assert.equal(await page.locator(`tr.doc input.dch[data-id="${id}"]`).count(),0,id);
    }
    assert.equal(await page.locator('input.dch[data-all]').count(),2);
    const bulk=page.locator('input.dch[data-all]').first();
    await bulk.fill('2026-11-25');
    await bulk.dispatchEvent('change');
    assert.deepEqual(await page.evaluate(()=>Object.keys(S.ovr).sort()),['CLI-with-id']);
    await page.evaluate(()=>{
      setDate('CLI-without-id','2026-11-26');
      setDate('CHP-without-id','2026-11-26');
      setDate('CHT-without-id','2026-11-26');
    });
    assert.deepEqual(await page.evaluate(()=>Object.keys(S.ovr).sort()),['CLI-with-id']);
    await page.locator('[data-t=ven]').click();
    await page.evaluate(()=>openDrawer('Prueba',allMovs(),''));
    assert.equal(await page.locator('#drawerHost input.dch2').count(),2);
    for(const id of ['CLI-without-id','CHP-without-id','CHT-without-id']){
      assert.equal(await page.locator(`#drawerHost input.dch2[data-id="${id}"]`).count(),0,id);
    }
    await page.locator('#drawerHost input.dch2[data-id="PRV-with-id"]').fill('2026-11-27');
    await page.locator('#drawerHost input.dch2[data-id="PRV-with-id"]').dispatchEvent('change');
    assert.deepEqual(await page.evaluate(()=>Object.keys(S.ovr).sort()),['CLI-with-id','PRV-with-id']);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({onlyRowsWithAsientoItemIdEditable:true,bulkChangeSkipsOtherRows:true,drawerAndFlowConsistent:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
