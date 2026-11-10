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
    assert.equal(await page.locator('#drawerHost .li').count(),1);
    await page.locator('#drawerHost [data-x].btn').click();
    await page.evaluate(month=>{S.calM=month;renderVen()},dates.yesterday.slice(0,7));
    await page.locator(`#v-ven [data-f="${dates.yesterday}"]`).click();
    assert.equal(await page.locator('#drawerHost .chip').filter({hasText:'Vencido'}).count(),1);
    await page.locator('#drawerHost [data-x].btn').click();
    await page.locator('#cHoy').click();
    assert.equal(await page.locator(`#v-ven [data-f="${dates.today}"]`).evaluate(el=>el.classList.contains('today')),true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({futureChequeNotOverdue:true,pastChequeOverdue:true,todayUsesActualDate:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
