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
      S.data.CLI.rows=[{s:'CLI',id:'CLI-1',f:'2026-11-20',m:1000000,c:'ARS',p:'Cliente A',doc:'FCV-02 - 54',comprobante:'A-00007-00000535',cat:'Cobranza clientes'}];
      S.data.PRV.rows=[{s:'PRV',id:'PRV-1',f:'2026-11-20',m:-500000,c:'ARS',p:'Proveedor A',doc:'FCP-01 - 77',comprobante:'B-00002-00000077',cat:'Proveedores'}];
      S.data.CHP.rows=[{s:'CHP',id:'CHP-1',f:'2026-11-20',m:-300000,c:'ARS',p:'Proveedor cheque',doc:'Ch 2345 · OP - 8',cat:'Cheques emitidos'}];
      S.data.CHT.rows=[{s:'CHT',id:'CHT-1',f:'2026-11-20',m:200000,c:'ARS',p:'Cliente cheque',doc:'Ch 7890 · COB - 9',cat:'Cheques en cartera',e:'En Cartera'}];
      S.ref='2026-11-10';S.hor=90;S.view='org';S.inc={};S.excl=[];S.exp={};
      S.expO={'Cobranza clientes|Cliente A':true,'Proveedores|Proveedor A':true,'Cheques emitidos|Proveedor cheque':true,'Cheques en cartera|Cliente cheque':true};
      renderAll();
    });
    await page.locator('[data-t=flu]').click();
    const labels=await page.locator('tr.doc .doc-number').allTextContents();
    for(const number of ['A-00007-00000535','B-00002-00000077','Ch 2345','Ch 7890'])assert.ok(labels.includes(number),number);
    assert.equal(labels.includes('FCV-02 - 54'),false);
    assert.equal(await page.locator('tr.doc [data-inc1],tr.doc [data-inc0]').count(),0);
    await page.getByRole('checkbox',{name:'Seleccionar comprobante A-00007-00000535'}).check();
    assert.equal(await page.locator('#flowMarkInc').isEnabled(),true);
    await page.locator('#flowMarkInc').click();
    assert.equal(await page.evaluate(()=>!!S.inc['CLI-1']),true);
    assert.equal(await page.evaluate(()=>flowMovs().some(r=>r.id==='CLI-1')),false);
    await page.getByRole('checkbox',{name:'Seleccionar cheque Ch 7890'}).check();
    await page.locator('#flowMarkInc').click();
    assert.equal(await page.evaluate(()=>!!S.inc['CHT-1']),true);
    await page.locator('#flowUnmarkInc').click();
    assert.equal(await page.evaluate(()=>!!S.inc['CLI-1']||!!S.inc['CHT-1']),false);
    await page.locator('#flowClearSelection').click();
    await page.getByRole('checkbox',{name:'Seleccionar comprobante B-00002-00000077'}).check();
    await page.getByRole('checkbox',{name:'Seleccionar cheque Ch 2345'}).check();
    assert.equal(await page.locator('#flowMarkInc').isDisabled(),true);
    assert.equal(await page.locator('#flowUnmarkInc').isDisabled(),true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({invoiceAndChequeNumbersVisible:true,bulkIncobrableOnlyForReceipts:true,selectionReversible:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
