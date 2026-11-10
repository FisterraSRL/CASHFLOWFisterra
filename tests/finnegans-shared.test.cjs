const test=require('node:test'),assert=require('node:assert/strict');
const configHandler=require('../api/finnegans-config.js'),reportHandler=require('../api/finnegans-report.js');
const {sharedConfig}=require('../lib/finnegans-shared.cjs');
const vars={FINNEGANS_CLIENT_ID:'shared-id',FINNEGANS_CLIENT_SECRET:'shared-secret',FINNEGANS_CLI_FILTERS:JSON.stringify({empresa:'E1',cuenta:'DxVta',moneda:'PES',unknown:'ignored'}),FINNEGANS_PRV_FILTERS:JSON.stringify({empresa:'E1',cuenta:'PRV',moneda:'PES'}),FINNEGANS_CHP_FILTERS:JSON.stringify({empresa:'E1',cuenta:'BANCO',mostrarSoloNoConciliados:'true'})};
async function configured(run,changes={}){
 const before=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]])),oldFetch=global.fetch;
 Object.assign(process.env,vars,changes);
 try{return await run()}finally{global.fetch=oldFetch;for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v}
}
async function invoke(handler,body={},method='POST',headers={}){
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
 await handler({method,headers:{host:'cashflow.example',origin:'https://cashflow.example','content-type':'application/json',...headers},body},res);return res;
}
test('public shared configuration exposes only whitelisted filters, never credentials',()=>configured(async()=>{
 const r=await invoke(configHandler,{},'GET');assert.equal(r.statusCode,200);assert.equal(r.body.enabled,true);
 assert.deepEqual(r.body.sources.CLI.filters,{cuenta:'DxVta',moneda:'PES',empresa:'E1'});
 assert.ok(!JSON.stringify(r.body).includes('shared-id'));assert.ok(!JSON.stringify(r.body).includes('shared-secret'));
 assert.equal(r.headers['Cache-Control'],'no-store, private');
}));
test('missing credentials disable shared mode; incomplete scope disables the source',()=>configured(async()=>{
 assert.equal(sharedConfig().enabled,false);process.env.FINNEGANS_CLIENT_SECRET='shared-secret';
 process.env.FINNEGANS_CLI_FILTERS='{}';assert.equal(sharedConfig().sources.CLI,undefined);
 process.env.FINNEGANS_CLI_FILTERS='invalid JSON';assert.equal(sharedConfig().sources.CLI,undefined);
},{FINNEGANS_CLIENT_SECRET:''}));
test('shared requests obtain fresh tokens server-side and cannot override company/account/date',()=>configured(async()=>{
 let count=0;const used=[];
 global.fetch=async(url,options)=>{
  const u=new URL(url);
  if(u.pathname==='/api/oauth/token'){
   assert.equal(options.headers.authorization,'Basic shared-secret');assert.equal(new URLSearchParams(options.body).get('client_id'),'shared-id');return new Response('server.token.'+(++count));
  }
  assert.equal(u.searchParams.get('PARAMWEBREPORT_Empresa'),'E1');assert.equal(u.searchParams.get('PARAMWEBREPORT_cuenta'),'PRV');
  assert.equal(u.searchParams.get('PARAMWEBREPORT_fecha'),new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Buenos_Aires'}).format(new Date()));
  used.push(u.searchParams.get('ACCESS_TOKEN'));
  return new Response(JSON.stringify([{ORGANIZACION:'Proveedor de prueba',DOCUMENTO:'FC-1',FECHA:'01-10-2026',FECHAVTO:'31-10-2026',CUENTA:'Proveedores en Cta. Cte.',MONEDA:'Pesos',IMPORTEMONPPAL:-100}]));
 };
 for(let i=0;i<2;i++){
  const r=await invoke(reportHandler,{source:'PRV',shared:true,filters:{empresa:'other',cuenta:'other',fecha:'1999-01-01'},access_token:'browser.token'});
  assert.equal(r.statusCode,200);assert.equal(r.body.rows[0].cat,'Proveedores');assert.equal(r.body.rows[0].m,-100);
  for(const secret of ['shared-secret','shared-id','server.token','browser.token'])assert.ok(!JSON.stringify(r.body).includes(secret));
 }
 assert.deepEqual(used,['server.token.1','server.token.2']);
}));
test('shared connection test never returns an access token',()=>configured(async()=>{
 global.fetch=async()=>new Response('server.token');const r=await invoke(configHandler);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{connected:true});
}));
test('shared authentication failures preserve provider secrecy and never fetch a report',()=>configured(async()=>{
 let n=0;global.fetch=async()=>{n++;return new Response('shared-secret private provider error',{status:401})};
 const r=await invoke(reportHandler,{shared:true,source:'CLI'});assert.equal(r.statusCode,401);assert.equal(n,1);assert.ok(!JSON.stringify(r.body).includes('shared-secret'));
}));
test('shared own cheque requests keep configured type, scope and a server-side token',()=>configured(async()=>{
 global.fetch=async(url)=>{
  const u=new URL(url);if(u.pathname==='/api/oauth/token')return new Response('server.token');
  assert.equal(u.pathname,'/api/reports/ApiSituacionCheques');assert.equal(u.searchParams.get('PARAMWEBREPORT_TipoCheque'),'0');
  assert.equal(u.searchParams.get('PARAMWEBREPORT_Empresa'),'E1');assert.equal(u.searchParams.get('PARAMWEBREPORT_CuentaContable'),'BANCO');assert.equal(u.searchParams.get('PARAMWEBREPORT_MostrarSoloNoConciliados'),'true');
  return new Response(JSON.stringify([{RAZONSOCIAL:'Tercero',NUMERO:1,FECHAVTO:'20-11-2026',IMPMONEDATRANS:100,ESTADO:'Emitido'}]));
 };
 const r=await invoke(reportHandler,{source:'CHP',shared:true,filters:{empresa:'OTHER',tipoCheque:'2'}});assert.equal(r.statusCode,200);assert.equal(r.body.rows[0].m,-100);assert.ok(!JSON.stringify(r.body).includes('server.token'));
}));
test('disabled sources and invalid origins do not reach Finnegans',()=>configured(async()=>{
 global.fetch=async()=>{throw new Error('Unexpected network')};
 assert.equal((await invoke(reportHandler,{shared:true,source:'CHT'})).statusCode,503);
 assert.equal((await invoke(reportHandler,{shared:true,source:'constructor'})).statusCode,503);
 assert.equal((await invoke(configHandler,{},'POST',{origin:'https://other.example'})).statusCode,403);
}));
