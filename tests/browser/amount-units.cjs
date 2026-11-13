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
    const tomorrow=await page.evaluate(()=>{
      for(const key of Object.keys(S.data))S.data[key]={rows:[],orig:'Prueba'};
      S.ref=reportToday();S.hor=30;S.gran='D';S.view='org';S.exp={};S.expO={'Cobranza clientes|Cliente pequeño':true};
      S.data.CLI.rows=[{s:'CLI',id:'CLI-small',f:addD(S.ref,1),m:950.45,c:'ARS',p:'Cliente pequeño',doc:'FCV - 1',comprobante:'A-00001-00000001',cat:'Cobranza clientes'}];
      S.data.PPTO.rows=[{mes:S.ref.slice(0,7),cat:'Cobranza clientes',imp:950.45}];
      renderAll();return addD(S.ref,1);
    });
    await page.locator('[data-t=flu]').click();
    assert.equal(await page.locator('#pAmounts').inputValue(),'ARS');
    const row=page.locator('#v-flu tr.doc').filter({hasText:'A-00001-00000001'});
    assert.match(await row.innerText(),/950,45/);
    await page.locator('#pAmounts').selectOption('M');
    assert.match(await row.innerText(),/0,00095045/);
    await page.reload();
    assert.equal(await page.locator('#pAmounts').inputValue(),'M');
    await page.locator('#pAmounts').selectOption('ARS');
    assert.match(await row.innerText(),/950,45/);
    await page.locator('#pAmounts').selectOption('ARS0');
    assert.match(await row.innerText(),/950/);
    assert.doesNotMatch(await row.innerText(),/950,45/);
    await page.reload();
    assert.equal(await page.locator('#pAmounts').inputValue(),'ARS0');
    await page.locator('[data-t=flu]').click();
    assert.doesNotMatch(await row.innerText(),/950,45/);
    await page.locator('[data-t=ven]').click();
    assert.match(await page.locator(`#v-ven [data-f="${tomorrow}"] .amt`).innerText(),/950/);
    assert.doesNotMatch(await page.locator(`#v-ven [data-f="${tomorrow}"] .amt`).innerText(),/950,45/);
    await page.locator(`#v-ven [data-f="${tomorrow}"]`).click();
    assert.match(await page.locator('#drawerHost .body').innerText(),/\$ 950/);
    assert.doesNotMatch(await page.locator('#drawerHost .body').innerText(),/950,45/);
    await page.locator('#drawerHost [data-x].btn').click();
    await page.locator('[data-t=ppt]').click();
    assert.match(await page.locator('#v-ppt table tbody').innerText(),/950/);
    assert.doesNotMatch(await page.locator('#v-ppt table tbody').innerText(),/950,45/);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({smallAmountVisible:true,pesosTwoDecimals:true,pesosWithoutDecimals:true,millionsOptional:true,preferencePersists:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
