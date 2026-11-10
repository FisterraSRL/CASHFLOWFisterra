// Run against the generated HTML with Playwright available (PLAYWRIGHT_MODULE may point to its installation).
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const tokenHandler=require('../../api/finnegans-token.js'),reportHandler=require('../../api/finnegans-report.js'),configHandler=require('../../api/finnegans-config.js');
(async()=>{
 const original=global.fetch;let mode='local',serial=0,failSupplier=true;const calls=[],bodyCalls=[];
 const envKeys=['FINNEGANS_CLIENT_ID','FINNEGANS_CLIENT_SECRET','FINNEGANS_CLI_FILTERS','FINNEGANS_PRV_FILTERS','FINNEGANS_CHP_FILTERS','FINNEGANS_CHT_FILTERS'];
 const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));envKeys.forEach(k=>delete process.env[k]);
 global.fetch=async(url)=>{
  const u=new URL(url);if(u.pathname==='/api/oauth/token')return new Response('batch.test.'+(++serial));
  calls.push({path:u.pathname,token:u.searchParams.get('ACCESS_TOKEN'),type:u.searchParams.get('PARAMWEBREPORT_TipoCheque')});
  await new Promise(r=>setTimeout(r,30));
  if(u.pathname.endsWith('composicionSaldoProveedor')&&failSupplier)return new Response('provider rejected parameters',{status:400});
  if(u.searchParams.get('PARAMWEBREPORT_TipoCheque')==='1')return new Response('[]');
  if(u.pathname.endsWith('ApiSituacionCheques'))return new Response(JSON.stringify([{TERCERO:'Proveedor cheque',NUMERO:'1',FECHAVENCIMIENTO:'20-11-2026',IMPORTEMONTRANSACCION:250,ESTADO:'Emitido',CONCILIADO:'No'}]));
  if(u.pathname.endsWith('analisisCobranza'))return new Response(JSON.stringify([{TIPOOP:'OPT',FECHACOBRANZA:u.searchParams.get('PARAMWEBREPORT_FechaHasta'),DOCUMENTO:'COB-1',TERCERO:'Cliente',CUENTA:'Banco de prueba',IMPORTE:1000,MONEDA:'Pesos'}]));
  if(u.pathname.endsWith('AnalisisOrdenPago'))return new Response(JSON.stringify([{TIPOOP:'OPT',FECHA:u.searchParams.get('PARAMWEBREPORT_FechaHasta'),DOCUMENTO:'OP-1',TERCERO:'Proveedor',CUENTA:'Banco de prueba',IMPORTE:500,MONEDA:'Pesos'}]));
  if(mode==='multi'&&u.pathname.endsWith('composicionSaldoCliente'))return new Response(JSON.stringify([{ORGANIZACION:'Cliente México',DOCUMENTO:'MX-1',FECHA:'01-11-2026',FECHAVTO:'20-11-2026',MONEDA:'MXN',IMPORTEMONTRAN:100,IMPORTEMONPPAL:2000}]));
  return new Response(JSON.stringify([{ORGANIZACION:'Cliente prueba',DOCUMENTO:'FC-1',FECHA:'01-11-2026',FECHAVTO:'20-11-2026',MONEDA:'Pesos',IMPORTEMONPPAL:u.pathname.endsWith('Proveedor')?-500:1000,CUENTA:'PROVEEDORES'}]));
 };
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/api/finnegans-config'&&mode==='local'){res.setHeader('Content-Type','application/json');return res.end('{"enabled":false,"sources":{}}')}
  const handler=req.url==='/api/finnegans-token'?tokenHandler:req.url==='/api/finnegans-report'?reportHandler:req.url==='/api/finnegans-config'?configHandler:null;
  if(handler){let b='';for await(const c of req)b+=c;req.body=b?JSON.parse(b):{};if(req.url==='/api/finnegans-report')bodyCalls.push(req.body);res.status=n=>{res.statusCode=n;return res};res.json=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));return res};return handler(req,res)}
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fs.readFileSync('dist/cashflow.html'));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const url=`http://127.0.0.1:${server.address().port}`,p=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.locator('[data-t=dat]').click();await p.locator('#apiClientId').fill('batch-id');await p.locator('#apiClientSecret').fill('batch-secret');await p.waitForFunction(()=>FAPI.saved);
  await p.evaluate(()=>{S.data.PRV={orig:'previous supplier',rows:[{s:'PRV',id:'PRV-old',cat:'Proveedores',p:'Proveedor anterior',doc:'FC-old',f:'2026-11-20',m:-100,c:'ARS'}]};S.data.CHT={orig:'previous cheque',rows:[{s:'CHT',id:'CHT-old',cat:'Cheques en cartera',p:'Cliente anterior',doc:'Ch-old',f:'2026-11-20',m:100,c:'ARS',e:'En Cartera'}]};save()});
  const prior=await p.evaluate(()=>({prv:JSON.stringify(S.data.PRV),cht:JSON.stringify(S.data.CHT),pre:JSON.stringify(S.data.PRE)}));
  await p.getByRole('button',{name:'Actualizar APIs',exact:true}).click();
  assert.equal(await p.locator('#updateAllApis').isDisabled(),true);assert.equal(await p.locator('[data-api=CLI]').isDisabled(),true);
  await p.evaluate(()=>updateAllApis()); // Duplicate invocation must not run another batch.
  await p.waitForFunction(()=>!API_BATCH.busy);assert.equal(serial,6);assert.equal(calls.length,6);
  assert.deepEqual(calls.map(c=>c.token),['batch.test.1','batch.test.2','batch.test.3','batch.test.4','batch.test.5','batch.test.6']);assert.deepEqual(calls.slice(2,4).map(c=>c.type),['0','1']);
  assert.deepEqual(await p.evaluate(()=>API_BATCH.results.map(r=>r.status)),['updated','error','updated','empty','updated','updated']);
  assert.equal(await p.evaluate(()=>JSON.stringify(S.data.PRV)),prior.prv);assert.equal(await p.evaluate(()=>JSON.stringify(S.data.CHT)),prior.cht);assert.equal(await p.evaluate(()=>JSON.stringify(S.data.PRE)),prior.pre);
  assert.match(await p.locator('#v-dat').innerText(),/4 fuente\(s\) actualizada\(s\), 1 sin registros y 1 con error/);assert.equal(await p.locator('#updateAllApis').isDisabled(),false);
  for(const width of [320,390,1280]){await p.setViewportSize({width,height:950});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
  mode='multi';const previousClient=await p.evaluate(()=>JSON.stringify(S.data.CLI));
  await p.locator('[data-api=CLI]').click();await p.waitForFunction(()=>!REPORT_STATE.CLI.busy);
  assert.equal(await p.evaluate(()=>JSON.stringify(S.data.CLI)),previousClient);
  assert.match(await p.locator('#msg-CLI').innerText(),/Faltan cotizaciones.*MXN/);
  await p.locator('#fx-MXN').fill('80');await p.locator('#fx-MXN').dispatchEvent('change');
  await p.locator('[data-api=CLI]').click();await p.waitForFunction(()=>!REPORT_STATE.CLI.busy);
  assert.equal(await p.evaluate(()=>S.data.CLI.rows[0].c),'MXN');
  assert.equal(await p.evaluate(()=>ars(S.data.CLI.rows[0])),8000);
  const separate=await p.evaluate(()=>{
    const original=S.data.CLI.rows,prior=S.excl;
    S.data.CLI.rows=[{s:'CLI',id:'a',cat:'Cobranza clientes',p:'Cliente compartido',company:'Empresa A',f:'2026-11-20',m:100,c:'ARS'},{s:'CLI',id:'b',cat:'Cobranza clientes',p:'Cliente compartido',company:'Empresa B',f:'2026-11-20',m:200,c:'ARS'}];
    const names=Object.keys(orgTree()['Cobranza clientes']);S.excl=['Cobranza clientes|Cliente compartido · Empresa A'];
    const included=flowMovs().filter(r=>r.p==='Cliente compartido').map(r=>r.company);
    S.data.CLI.rows=original;S.excl=prior;return {names,included};
  });
  assert.deepEqual(separate.names,['Cliente compartido · Empresa A','Cliente compartido · Empresa B']);
  assert.deepEqual(separate.included,['Empresa B']);
  mode='local';
  await p.getByRole('button',{name:'Olvidar credenciales',exact:true}).click();await p.waitForFunction(()=>!FAPI.clientId);const n=calls.length;await p.getByRole('button',{name:'Actualizar APIs',exact:true}).click();await p.waitForFunction(()=>!API_BATCH.busy);assert.equal(calls.length,n);assert.match(await p.locator('#v-dat').innerText(),/Completá Client_ID y Client_Secret antes/);
  mode='shared';failSupplier=false;Object.assign(process.env,{FINNEGANS_CLIENT_ID:'server-id',FINNEGANS_CLIENT_SECRET:'server-secret',FINNEGANS_PRV_FILTERS:JSON.stringify({empresa:'E1',cuenta:'PRV'})});
  const c=await browser.newContext(),shared=await c.newPage();await shared.goto(url);await shared.evaluate(()=>sharedReady);calls.length=0;bodyCalls.length=0;serial=0;
  await shared.locator('[data-t=dat]').click();await shared.getByRole('button',{name:'Actualizar APIs',exact:true}).click();await shared.waitForFunction(()=>!API_BATCH.busy);
  assert.equal(calls.length,1);assert.equal(serial,1);assert.deepEqual(await shared.evaluate(()=>API_BATCH.results.map(r=>r.k)),['PRV']);assert.equal(bodyCalls[0].shared,true);assert.equal(bodyCalls[0].access_token,undefined);
  assert.equal(await shared.locator('#apiClientSecret').count(),0);assert.equal(await shared.evaluate(()=>API_BATCH.results[0].status),'updated');await c.close();
  delete process.env.FINNEGANS_PRV_FILTERS;const emptyContext=await browser.newContext(),empty=await emptyContext.newPage();await empty.goto(url);await empty.evaluate(()=>sharedReady);const countBefore=calls.length;await empty.locator('[data-t=dat]').click();await empty.getByRole('button',{name:'Actualizar APIs',exact:true}).click();await empty.waitForFunction(()=>!API_BATCH.busy);assert.equal(calls.length,countBefore);assert.match(await empty.locator('#v-dat').innerText(),/No hay fuentes API configuradas/);await emptyContext.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({allSixSources:true,freshTokenEachReport:true,duplicateBatchPrevented:true,partialFailureContinues:true,emptyAndFailurePreserveData:true,excelSourcesUntouched:true,perSourceResults:true,missingCredentialsNoNetwork:true,sharedOnlyConfiguredSources:true,noSharedTokenInBrowser:true,noConfiguredSourcesHandled:true,responsive:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));global.fetch=original;for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v}
})().catch(e=>{console.error(e);process.exitCode=1});
