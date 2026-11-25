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
    const dates=await page.evaluate(()=>{
      for(const key of Object.keys(S.data))S.data[key]={rows:[],orig:'Prueba'};
      const today=reportToday(),tomorrow=addD(today,1),yesterday=addD(today,-1);
      S.ref=addD(today,20);S.calM=tomorrow.slice(0,7);S.calF='all';
      S.data.CLI.rows=[{s:'CLI',id:'CLI-future',f:tomorrow,m:300,c:'ARS',p:'Factura futura',doc:'FCV-07 - 315',comprobante:'A-00007-00000535',cat:'Cobranza clientes'}];
      S.data.CHT.rows=[
        {s:'CHT',id:'CHT-future',f:tomorrow,m:100,c:'ARS',p:'Cheque futuro',doc:'Ch 111 · COB - 1',cat:'Cheques en cartera',e:'En Cartera'},
        {s:'CHT',id:'CHT-past',f:yesterday,m:200,c:'ARS',p:'Cheque pasado',doc:'Ch 222 · COB - 2',cat:'Cheques en cartera',e:'En Cartera'}
      ];
      renderAll();return{today,tomorrow,yesterday};
    });
    await page.locator('[data-t=ven]').click();
    assert.match(await page.locator('#v-ven .agenda').innerText(),/Cheque futuro/);
    assert.equal(await page.locator(`#v-ven [data-f="${dates.tomorrow}"]`).evaluate(el=>el.classList.contains('past')),false);
    await page.locator(`#v-ven [data-f="${dates.tomorrow}"]`).click();
    assert.equal(await page.locator('#drawerHost .chip').filter({hasText:'Vencido'}).count(),0);
    assert.equal(await page.locator('#drawerHost .li').count(),2);
    const detail=await page.locator('#drawerHost .body').innerText();
    assert.match(detail,/A-00007-00000535/);
    assert.match(detail,/Ch 111/);
    assert.doesNotMatch(detail,/FCV-07 - 315|COB - 1/);
    await page.locator('#drawerHost [data-x].btn').click();
    await page.evaluate(month=>{S.calM=month;renderVen()},dates.yesterday.slice(0,7));
    await page.locator(`#v-ven [data-f="${dates.yesterday}"]`).click();
    assert.equal(await page.locator('#drawerHost .chip').filter({hasText:'Vencido'}).count(),1);
    await page.locator('#drawerHost [data-x].btn').click();
    await page.locator('#cHoy').click();
    assert.equal(await page.locator(`#v-ven [data-f="${dates.today}"]`).evaluate(el=>el.classList.contains('today')),true);
    await page.evaluate(()=>{
      const row=S.data.CLI.rows[0];S.calM='2026-11';
      S.data.CHT.rows=[];
      S.data.CLI.rows=[{...row,id:'CLI-z',p:'Zeta',f:'2026-11-01'},{...row,id:'CLI-a2',p:'Alfa',f:'2026-11-02'},{...row,id:'CLI-a3',p:'Alfa',f:'2026-11-03'},{...row,id:'CLI-next',p:'Otro mes',f:'2026-12-01'}];
      renderVen();
    });
    await page.getByRole('button',{name:'Ver vencimientos del mes'}).click();
    const drawer=page.locator('#drawerHost');
    assert.deepEqual(await drawer.locator('.li .p').allTextContents(),['Zeta','Alfa','Alfa']);
    await drawer.getByLabel('Ordenar por').selectOption('org');
    assert.deepEqual(await drawer.locator('.li .p').allTextContents(),['Alfa','Alfa','Zeta']);
    await drawer.getByLabel('Agrupar por').selectOption('org');
    assert.match(await drawer.locator('.drawer-group h3').first().innerText(),/Alfa.*2 movimientos/);
    await drawer.getByLabel('Agrupar por').selectOption('date');
    assert.deepEqual((await drawer.locator('.drawer-group h3').allTextContents()).map(text=>text.slice(0,10)),['01/11/2026','02/11/2026','03/11/2026']);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({futureChequeNotOverdue:true,pastChequeOverdue:true,todayUsesActualDate:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
