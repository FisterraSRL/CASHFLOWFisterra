const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/api/finnegans-config'){res.setHeader('Content-Type','application/json');return res.end('{"enabled":false,"sources":{}}')}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fs.readFileSync('dist/cashflow.html'))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}`);
  await p.getByRole('tab',{name:'Ejecutado',exact:true}).click();await p.getByRole('heading',{name:'Todavía no hay ejecutados cargados'}).waitFor();
  await p.getByRole('button',{name:'Ir a Datos y fuentes',exact:true}).click();assert.equal(await p.locator('[data-t=dat]').getAttribute('aria-selected'),'true');assert.equal(await p.locator('[data-exec-results]').count(),2);
  await p.evaluate(()=>{S.data.EJC={orig:'Excel · cobros.xlsx',at:'2026-11-10',rows:[{mes:'2026-10',cat:'Cobranza clientes',imp:1000000},{mes:'2026-11',cat:'Cobranza clientes',imp:2000000},{mes:'2026-11',cat:'Otros ingresos',imp:500000}]};S.data.EJP={orig:'Excel · pagos.xlsx',at:'2026-11-10',rows:[{mes:'2026-10',cat:'Proveedores',imp:800000},{mes:'2026-11',cat:'Proveedores',imp:1000000},{mes:'2026-11',cat:'Cheques emitidos',imp:500000}]};save()});
  await p.locator('[data-exec-results]').first().click();
  let r=await p.evaluate(()=>executedReport());assert.equal(r.income,3500000);assert.equal(r.payments,2300000);assert.equal(r.net,1200000);assert.equal(r.complete,true);assert.ok(Math.abs(r.coverage-3500000/2300000)<1e-10);
  assert.match(await p.locator('#v-eje').innerText(),/Proveedores/);assert.match(await p.locator('#v-eje').innerText(),/mayor categoría de cobros es Cobranza clientes/);assert.match(await p.locator('#v-eje').innerText(),/neto de nov 2026 mejoró/);
  await p.locator('#execMonth').selectOption('2026-11');r=await p.evaluate(()=>executedReport());assert.equal(r.net,1000000);assert.equal(r.inRows.length,2);assert.equal(r.outRows.length,2);assert.equal(r.monthly.length,1);
  await p.reload();assert.equal(await p.locator('[data-t=eje]').getAttribute('aria-selected'),'true');assert.equal(await p.locator('#execMonth').inputValue(),'2026-11');
  await p.getByText('Ver registros de los reportes (4)',{exact:true}).click();assert.equal(await p.locator('#v-eje details tbody tr').count(),4);assert.match(await p.locator('#v-eje details').innerText(),/−\$ 1\.000\.000/);
  await p.evaluate(()=>{S.data.EJP.rows=S.data.EJP.rows.filter(r=>r.mes!=='2026-11');renderAll()});r=await p.evaluate(()=>executedReport());assert.equal(r.net,null);assert.equal(r.coverage,null);assert.equal(r.income,2500000);assert.match(await p.locator('#v-eje').innerText(),/información parcial/);
  await p.locator('#execMonth').selectOption('all');assert.equal(await p.evaluate(()=>executedReport().net),null); // Do not mix totals from unmatched periods.
  await p.locator('#execMonth').selectOption('2026-10');assert.equal(await p.evaluate(()=>executedReport().net),200000);
  await p.evaluate(()=>{S.data.EJP.rows[0].imp=0;renderAll()});r=await p.evaluate(()=>executedReport());assert.equal(r.complete,true);assert.equal(r.net,1000000);assert.equal(r.coverage,null);assert.match(await p.locator('#v-eje').innerText(),/Sin pagos registrados/);
  await p.evaluate(()=>{S.data.EJP.rows[0].imp=2000000;renderAll()});assert.equal(await p.evaluate(()=>executedReport().net),-1000000);assert.match(await p.locator('#v-eje').innerText(),/pagos superaron a los cobros/);
  for(const width of [320,390,1280]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({newTab:true,emptyStateAndSourceNavigation:true,bothSourceResultLinks:true,noBudgetRequired:true,totalsAndCoverage:true,monthlyEvolutionAndAnalysis:true,categoryBreakdown:true,rawReportRecords:true,persistentPeriod:true,partialPeriodsNotMisstated:true,zeroPaymentsHandled:true,negativeNetHandled:true,responsive:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
