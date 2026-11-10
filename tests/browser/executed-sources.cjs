const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const server=http.createServer((req,res)=>{if(req.url==='/api/finnegans-config'){res.setHeader('Content-Type','application/json');return res.end('{"enabled":false,"sources":{}}')}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fs.readFileSync('dist/cashflow.html'))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({channel:'msedge',headless:true});
 try{
  const p=await b.newPage({viewport:{width:1280,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}`);
  // Simulate the last saved state from the previous version, then reload the new app.
  await p.evaluate(()=>{delete S.data.EJC;delete S.data.EJP;S.data.EJE={orig:'Excel · ejecutado anterior.xlsx',at:'2026-11-01',rows:[{mes:'2026-11',cat:'Cobranza clientes',imp:8000000},{mes:'2026-11',cat:'Proveedores',imp:2000000}]};S.data.PPTO={rows:[{mes:'2026-11',cat:'Cobranza clientes',imp:10000000},{mes:'2026-11',cat:'Proveedores',imp:3000000}]};S.pptM='2026-11';save()});
  await p.reload();await p.locator('[data-t=dat]').click();
  assert.equal(await p.locator('[data-k=EJE]').count(),0);assert.equal(await p.locator('[data-k=EJC]').count(),1);assert.equal(await p.locator('[data-k=EJP]').count(),1);
  assert.equal(await p.evaluate(()=>S.data.EJC.rows.length),1);assert.equal(await p.evaluate(()=>S.data.EJP.rows.length),1);assert.equal(await p.evaluate(()=>S.data.EJE),undefined);assert.equal(await p.evaluate(()=>S.legacyExecuted.rows.length),2);
  await p.locator('[data-t=ppt]').click();
  const income=await p.locator('#v-ppt tbody tr').filter({hasText:'Cobranza clientes'}).locator('td').allTextContents();
  const expense=await p.locator('#v-ppt tbody tr').filter({hasText:'Proveedores'}).locator('td').allTextContents();
  assert.equal(income[1],'10,0');assert.equal(income[3],'8,0');assert.equal(income[4],'−2,0');assert.equal(expense[1],'−3,0');assert.equal(expense[3],'−2,0');assert.equal(expense[4],'1,0');
  await p.locator('[data-t=dat]').click();await p.locator('[data-clr=EJP]').click();assert.equal(await p.evaluate(()=>S.data.EJC.rows.length),1);
  await p.locator('[data-t=ppt]').click();assert.match(await p.locator('#v-ppt').innerText(),/faltan pagos ejecutados/);assert.match(await p.locator('#v-ppt tbody tr').filter({hasText:'Proveedores'}).innerText(),/Sin datos/);
  await p.reload();assert.equal(await p.evaluate(()=>S.data.EJC.rows.length),1);assert.equal(await p.evaluate(()=>S.data.EJP.rows.length),0);
  // Category separation and normalization use the same parser as Excel uploads.
  const parsed=await p.evaluate(()=>({in:parse('EJC',[{mes:'2026-11',categoria:'Cobranza clientes',importe:-1500000}]),out:parse('EJP',[{mes:'2026-11',categoria:'Proveedores',importe:-500000}])}));
  assert.equal(parsed.in[0].imp,1500000);assert.equal(parsed.out[0].imp,500000);
  for(const [source,category]of [['EJC','Proveedores'],['EJP','Cobranza clientes']]){
   const msg=await p.evaluate(([k,cat])=>{try{parse(k,[{mes:'2026-11',categoria:cat,importe:1}]);return ''}catch(e){return e.message}},[source,category]);assert.match(msg,/corresponde a/);
  }
  await p.locator('[data-t=dat]').click();await p.locator('[data-ex=EJP]').click();assert.equal(await p.evaluate(()=>S.data.EJP.rows.every(r=>CATS_OUT.includes(r.cat))),true);assert.equal(await p.evaluate(()=>S.data.EJC.rows.length),1);
  await p.locator('[data-ex=EJC]').click();assert.equal(await p.evaluate(()=>S.data.EJC.rows.every(r=>CATS_IN.includes(r.cat))),true);
  // Exercise both upload controls with the production CSV reader when SheetJS is loaded.
  await p.waitForFunction(()=>typeof XLSX!=='undefined');
  for(const [source,category,amount]of [['EJC','Cobranza clientes',1200000],['EJP','Proveedores',600000]]){
   await p.locator(`[data-k=${source}]`).setInputFiles({name:`${source}.csv`,mimeType:'text/csv',buffer:Buffer.from('\uFEFF'+`Mes,Categoría,Importe\n2026-11,${category},${amount}\n`)});
   await p.waitForFunction(k=>S.data[k].orig?.includes(k+'.csv')||document.querySelector('#msg-'+k).textContent.startsWith('No se pudo'),source);assert.equal(await p.evaluate(k=>S.data[k].orig?.includes(k+'.csv'),source),true,await p.locator('#msg-'+source).innerText());assert.equal(await p.evaluate(k=>S.data[k].rows.length,source),1);
  }
  const saved=await p.evaluate(()=>JSON.stringify(S.data.EJC));await p.locator('[data-k=EJC]').setInputFiles({name:'wrong.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFFMes,Categoría,Importe\n2026-11,Proveedores,1\n')});await p.locator('#msg-EJC').getByText(/corresponde a Pagos ejecutados/).waitFor();assert.equal(await p.evaluate(()=>JSON.stringify(S.data.EJC)),saved);
  await p.reload();assert.equal(await p.evaluate(()=>S.data.EJC.rows[0].imp),1200000);assert.equal(await p.evaluate(()=>S.data.EJP.rows[0].imp),600000);
  for(const width of [320,390,1280]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({separateCards:true,legacyMigration:true,noMigrationDuplication:true,preservesAmountsAndSigns:true,partialExecutedNotZero:true,independentClear:true,independentExamples:true,bothCsvUploads:true,wrongCategoryPreservesData:true,persistence:true,responsive:true}));
 }finally{await b.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
