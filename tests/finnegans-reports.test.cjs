const test=require('node:test');
const assert=require('node:assert/strict');
const {reportUrl,normalizeReport}=require('../lib/finnegans-reports.cjs');
const handler=require('../api/finnegans-report.js');
const fixture=(extra={})=>({ORGANIZACION:'Cliente de prueba',DOCUMENTO:'FV - 1',FECHA:'2026-09-01',FECHAVTO:'2026-10-01',IMPORTEMONPPAL:151700,IMPORTEMONTRAN:100,MONEDA:'Dólares',EMPRESA:'Empresa de prueba',...extra});
test('customer URL uses exact report name and parameters and encodes filter values',()=>{
 const u=reportUrl('CLI',{fecha:'2026-10-15',organizacion:'A&B',empresa:'E1',cuenta:'',dimension:'ignored'},'test.token');
 assert.equal(u.origin,'https://api.finneg.com');assert.equal(u.pathname,'/api/reports/composicionSaldoCliente');
 assert.equal(u.searchParams.get('ACCESS_TOKEN'),'test.token');assert.equal(u.searchParams.get('PARAMWEBREPORT_fecha'),'2026-10-15');
 assert.equal(u.searchParams.get('PARAMWEBREPORT_organizacion'),'A&B');assert.equal(u.searchParams.get('PARAMWEBREPORT_Empresa'),'E1');
 assert.ok(!u.searchParams.has('PARAMWEBREPORT_cuenta'));assert.ok(!u.searchParams.has('PARAMWEBREPORT_dimension'));
});
test('supplier URL supports dimension, value and case-sensitive document parameter',()=>{
 const u=reportUrl('PRV',{fecha:'2026-10-15',dimension:'Centro',valor:'Valor 1',tipoDocumento:'FC'},'token');
 assert.equal(u.pathname,'/api/reports/composicionSaldoProveedor');assert.equal(u.searchParams.get('PARAMWEBREPORT_dimension'),'Centro');assert.equal(u.searchParams.get('PARAMWEBREPORT_valor'),'Valor 1');assert.equal(u.searchParams.get('PARAMWEBREPORT_TipoDocumento'),'FC');
});
test('rejects unknown source, invalid date and non-string filters',()=>{
 assert.throws(()=>reportUrl('CHP',{fecha:'2026-10-15'},'token'));
 assert.throws(()=>reportUrl('CLI',{fecha:'2026-02-31'},'token'));
 assert.throws(()=>reportUrl('CLI',{fecha:'2026-10-15',empresa:{}},'token'));
});
test('normalizes official field names, USD original amount, snapshot, and company',()=>{
 const out=normalizeReport('CLI',{data:{rows:[fixture()]}},'2026-10-15');const r=out.rows[0];
 assert.equal(r.m,100);assert.equal(r.c,'USD');assert.equal(r.f,'2026-10-01');assert.equal(r.company,'Empresa de prueba');assert.match(r.id,/^CLI-/);assert.equal(out.warnings.length,0);
});
test('supplier FechaVto takes priority over other date aliases, and signs are preserved',()=>{
 const f=fixture({PROVEEDOR:'Proveedor de prueba',ORGANIZACION:undefined,CUENTA:'PROVEEDORES',MONEDA:'Pesos',IMPORTEMONPPAL:-500,FechaVencimientoActual:'2026-10-10'});
 const r=normalizeReport('PRV',[f],'2026-10-15').rows[0];assert.equal(r.f,'2026-10-01');assert.equal(r.m,-500);assert.equal(r.cat,'Proveedores');
 const credit=normalizeReport('PRV',[{...f,IMPORTEMONPPAL:300}],'2026-10-15').rows[0];assert.equal(credit.m,300);
});

test('Fecha and FechaVto are dates while Vencimiento and Venc. preserve text',()=>{
 for(const source of ['CLI','PRV'])for(const field of ['Vencimiento','Venc.']){
  const f=fixture({PROVEEDOR:'Proveedor de prueba',CUENTA:'PROVEEDORES',
   FECHA:'15/09/2026',FECHAVTO:'20/10/2026',FechaComprobante:'invalid alias',
   FechaVencimientoActual:'not a date',[field]:'A vencer'});
  const r=normalizeReport(source,[f],'2026-10-15').rows[0];
  assert.equal(r.fc,'2026-09-15');assert.equal(r.f,'2026-10-20');assert.equal(r.e,'A vencer');
 }
 assert.throws(()=>normalizeReport('CLI',[fixture({FECHAVTO:undefined,Vencimiento:'20/10/2026'})],'2026-10-15'),/falta vencimiento/);
 assert.throws(()=>normalizeReport('CLI',[fixture({FECHAVTO:'invalid',Vencimiento:'A vencer',FechaVencimientoActual:'2026-10-20'})],'2026-10-15'),/campo FechaVto no contiene una fecha válida/);
});

test('accepts Finnegans DD-MM-YYYY dates without parsing VENCIMIENTO text',async()=>{
 const payload=[fixture({FECHA:'13-08-2026',FECHAVTO:'12-09-2026',VENCIMIENTO:'Vencido 1 a 2 meses',FECHACASHFLOW:'08-10-2026'})];
 const r=await invoke(req(),async()=>new Response(JSON.stringify(payload)));
 assert.equal(r.statusCode,200);assert.equal(r.body.rows[0].fc,'2026-08-13');
 assert.equal(r.body.rows[0].f,'2026-09-12');assert.equal(r.body.rows[0].e,'Vencido 1 a 2 meses');
 for(const source of ['CLI','PRV']){
  const out=normalizeReport(source,[fixture({FECHA:'01-10-2026',FECHAVTO:'31-10-2026',CUENTA:'PROVEEDORES',VENCIMIENTO:'A vencer 0 a 1 mes'})],'2026-10-15');
  assert.equal(out.rows[0].f,'2026-10-31');assert.equal(out.rows[0].fc,'2026-10-01');
 }
 for(const FECHAVTO of ['31-02-2026','29-02-2026','12-09/2026'])assert.throws(()=>normalizeReport('CLI',[fixture({FECHAVTO})],'2026-10-15'),/campo FechaVto/);
 assert.equal(normalizeReport('CLI',[fixture({FECHAVTO:'29-02-2024'})],'2026-10-15').rows[0].f,'2024-02-29');
});
test('missing due date uses report snapshot, not browser projection date',()=>{
 const f=fixture({FECHAVTO:undefined,DiasDeMora:12});
 const out=normalizeReport('CLI',[f],'2026-10-13');assert.equal(out.rows[0].f,'2026-10-01');assert.equal(out.warnings.length,1);
});
test('simple terms allow inference but ambiguous multi-installment terms do not',()=>{
 const f=fixture({FECHAVTO:undefined,CondicionPago:'30 días FF'});
 assert.equal(normalizeReport('CLI',[f],'2026-10-15').rows[0].f,'2026-10-01');
 assert.throws(()=>normalizeReport('CLI',[{...f,CondicionPago:'ECHEQ 30-60-90'}],'2026-10-15'),/falta vencimiento/);
});
test('rejects partial pages and malformed response envelopes',()=>{
 assert.throws(()=>normalizeReport('CLI',{rows:[fixture()],totalRecords:2},'2026-10-15'),/paginado/);
 assert.throws(()=>normalizeReport('CLI',{rows:[fixture()],hasMore:true},'2026-10-15'),/paginado/);
 assert.throws(()=>normalizeReport('CLI',{error:'secret detail'},'2026-10-15'),/lista de comprobantes/);
 assert.deepEqual(normalizeReport('CLI',{rows:[]},'2026-10-15').rows,[]);
});
test('invalid rows fail the whole import instead of losing part of the balance',()=>{
 for(const bad of [{FECHAVTO:'2026-02-31'},{DOCUMENTO:null},{IMPORTEMONPPAL:'not a number'},{MONEDA:'EUR'},{MONEDA:'USD',IMPORTEMONTRAN:null}]){
  assert.throws(()=>normalizeReport('CLI',[fixture(),fixture(bad)],'2026-10-15'),/Fila 2/);
 }
});
test('reads Excel-like aliases and reports zero balances and FX residuals',()=>{
 const f={Cliente:'C',Documento:'FV - 1','Fecha comprobante':'2026-09-01','Fecha de vencimiento':'2026-10-01','Importe ppal':'1.250.000,00',Moneda:'Pesos'};
 assert.equal(normalizeReport('CLI',[f],'2026-10-15').rows[0].m,1250000);
 assert.equal(normalizeReport('CLI',[{...f,'Importe ppal':0}],'2026-10-15').rows.length,0);
 const out=normalizeReport('CLI',[fixture({IMPORTEMONTRAN:0,IMPORTEMONPPAL:0.01})],'2026-10-15');assert.equal(out.rows[0].c,'ARS');assert.equal(out.warnings.length,1);
});

function req(extra={}){return {method:'POST',headers:{host:'cashflow.example',origin:'https://cashflow.example','content-type':'application/json'},body:{source:'CLI',access_token:'test.token',filters:{fecha:'2026-10-15'}},...extra}}
async function invoke(request,fetcher=()=>{throw new Error('Unexpected fetch')}){
 const old=global.fetch;global.fetch=fetcher;
 try{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};await handler(request,res);return res}finally{global.fetch=old}
}
test('report proxy returns normalized movements and never persists token in results',async()=>{
 const r=await invoke(req(),async(url,options)=>{assert.equal(new URL(url).searchParams.get('ACCESS_TOKEN'),'test.token');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return new Response(JSON.stringify([fixture()]))});
 assert.equal(r.statusCode,200);assert.equal(r.body.rows.length,1);assert.equal(r.body.date,'2026-10-15');assert.ok(!JSON.stringify(r.body).includes('test.token'));assert.equal(r.headers['Cache-Control'],'no-store, private');
});
test('proxy rejects unsafe or incomplete requests before contacting provider',async()=>{
 assert.equal((await invoke(req({method:'GET'}))).statusCode,405);
 assert.equal((await invoke(req({headers:{host:'cashflow.example',origin:'https://other.example'}}))).statusCode,403);
 assert.equal((await invoke(req({body:{source:'CLI',filters:{fecha:'2026-10-15'}}}))).statusCode,400);
 assert.equal((await invoke(req({body:{source:'CHP',access_token:'token',filters:{fecha:'2026-10-15'}}}))).statusCode,400);
});
test('provider failures are mapped and tokens remain redacted in diagnostics',async()=>{
 for(const [up,status]of [[401,401],[403,401],[400,400],[404,502],[500,502],[429,429]]){
  const r=await invoke(req(),async()=>new Response('test.token secret provider details',{status:up}));assert.equal(r.statusCode,status);assert.ok(!JSON.stringify(r.body).includes('test.token'));
 }
 assert.equal((await invoke(req(),async()=>new Response('<html>Error</html>'))).statusCode,502);
 const unknown=await invoke(req(),async()=>new Response(JSON.stringify([{unexpected:123}])));
 assert.equal(unknown.statusCode,422);
 assert.equal((await invoke(req(),async()=>{const e=new Error();e.name='TimeoutError';throw e})).statusCode,504);
});
test('invalid due dates include the actual response and masked request for diagnosis',async()=>{
 const payload=[fixture({FECHAVTO:'31-02-2026',ACCESS_TOKEN:'test.token'})];
 const r=await invoke(req(),async()=>new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json'}}));
 assert.equal(r.statusCode,422);assert.match(r.body.error,/campo FechaVto no contiene una fecha válida/);
 const d=r.body.diagnostics;assert.equal(d.status,200);assert.equal(d.method,'GET');assert.equal(d.parameters.ACCESS_TOKEN,'[OCULTO]');
 assert.equal(d.parameters.PARAMWEBREPORT_fecha,'2026-10-15');assert.match(d.url,/composicionSaldoCliente/);
 assert.equal(JSON.parse(d.responseBody)[0].FECHAVTO,'31-02-2026');assert.ok(!JSON.stringify(d).includes('test.token'));
});
test('diagnostics limit large responses and mask secret fields',()=>{
 const {reportDiagnostics}=require('../lib/finnegans-diagnostics.cjs');
 const url=reportUrl('CLI',{fecha:'2026-10-15'},'test.token');
 const body=JSON.stringify({client_secret:'do-not-show',secret_key:'also-hidden',rows:'x'.repeat(40000)});
 const d=reportDiagnostics(url,new Response(''),body,'test.token');
 assert.equal(d.responseBody.length,32768);assert.equal(d.responseTruncated,true);
 assert.ok(!d.responseBody.includes('do-not-show'));assert.ok(!d.responseBody.includes('also-hidden'));
});
