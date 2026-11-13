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
    const first=await page.evaluate(()=>{
      for(const key of Object.keys(S.data))S.data[key]={rows:[],orig:'Prueba'};
      S.data.CLI.at='2026-11-10';S.ref='2026-11-30';S.bal={};S.excl=[];S.inc={};
      S.data.CLI.rows=[
        {s:'CLI',id:'CLI-1',fc:'2026-10-31',f:'2026-12-01',m:100,c:'ARS',p:'Cliente A',cat:'Cobranza clientes'},
        {s:'CLI',id:'CLI-2',fc:'2026-10-11',f:'2026-12-02',m:300,c:'ARS',p:'Cliente B',cat:'Cobranza clientes'},
        {s:'CLI',id:'CLI-3',fc:'2026-11-01',f:'2026-12-03',m:-50,c:'ARS',p:'Nota de crédito',cat:'Cobranza clientes'},
        {s:'CLI',id:'CLI-4',fc:null,f:'2026-12-04',m:50,c:'ARS',p:'Sin fecha',cat:'Cobranza clientes'}
      ];
      renderAll();return calcIdx(buildFlow(),flowMovs());
    });
    assert.equal(first.diasCalle,25);
    assert.equal(first.agingCount,2);
    assert.equal(first.cliPositiveCount,3);
    assert.equal(first.dso,null);
    const tile=page.locator('#v-res .it').filter({hasText:'Días en la calle · clientes'});
    assert.match(await tile.innerText(),/25 días/);
    assert.match(await tile.innerText(),/10\/11\/2026/);
    assert.match(await tile.innerText(),/Se omitieron comprobantes sin fecha válida/);
    const next=await page.evaluate(()=>{S.ref='2027-01-31';S.data.CLI.rows[0].f='2027-02-10';renderAll();return calcIdx(buildFlow(),flowMovs()).diasCalle});
    assert.equal(next,25);
    await page.evaluate(()=>{S.data.CLI.rows=[];renderAll()});
    assert.match(await tile.innerText(),/s\/d/);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({weightedAge:25,usesSnapshotDate:true,ignoresCredits:true,cutoffDoesNotChangeAge:true,missingDateExplained:true,noDataHandled:true,noPageErrors:true}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
