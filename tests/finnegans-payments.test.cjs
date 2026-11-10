const test=require('node:test'),assert=require('node:assert/strict');
const {reportUrl,normalizeReport}=require('../lib/finnegans-reports.cjs');
const handler=require('../api/finnegans-report.js');
const fixture=(extra={})=>({TIPOOP:'OPT',FECHA:'05-10-2026',FECHACOBRANZA:null,DOCUMENTO:'PAGO-1',TERCERO:'Proveedor prueba',CUENTA:'Banco de prueba',IMPORTE:1000,MONEDA:'Pesos',IMPORTEMONEDATX:1000,EMPRESA:'Empresa prueba',...extra});
test('payment URL respects report case, supplier parameter and independent filters',()=>{
 const u=reportUrl('EJP',{fecha:'2026-11-10',fechaDesde:'2026-10-01',proveedor:'A&B',cliente:'ignored',circuitocontable:'CC',transaccionSubtipoID:'23',detallarAplicacion:'true',empresa:'E1'},'fake.token');
 assert.equal(u.pathname,'/api/reports/AnalisisOrdenPago');assert.deepEqual(Object.fromEntries(u.searchParams),{ACCESS_TOKEN:'fake.token',PARAMWEBREPORT_FechaHasta:'2026-11-10',PARAMWEBREPORT_FechaDesde:'2026-10-01',PARAMWEBREPORT_DetallarAplicacion:'true',PARAMWEBREPORT_TransaccionSubtipoID:'23',PARAMWEBREPORT_CircuitoContable:'CC',PARAMWEBREPORT_Proveedor:'A&B',PARAMWEBREPORT_Empresa:'E1'});assert.equal(u.searchParams.has('PARAMWEBREPORT_Cliente'),false);
 assert.equal(reportUrl('EJP',{fecha:'2026-11-10'},'token').searchParams.get('PARAMWEBREPORT_FechaDesde'),'2026-11-01');
 for(const extra of [{fechaDesde:'2026-12-01'},{fechaDesde:'2026-02-31'},{detallarAplicacion:'yes'}])assert.throws(()=>reportUrl('EJP',{fecha:'2026-11-10',...extra},'token'));
});
test('treasury payment means total once, including withholdings; undated APL joins its order',()=>{
 const apl=fixture({TIPOOP:'APL',IMPORTE:null,CUENTA:null,FECHA:'10-08-2026',IMPORTEAPLICADO:1100,DOCUMENTOAPLICADO:'FC-1'});
 const out=normalizeReport('EJP',[apl,fixture(),fixture({CUENTA:'Retenciones Ganancias',IMPORTE:100})],'2026-11-10',{fechaDesde:'2026-10-01'});
 assert.equal(out.summary.total,1100);assert.equal(out.summary.withholdings,100);assert.equal(out.rows.length,2);assert.equal(out.applications.length,1);assert.equal(out.applications[0].f,'2026-10-05');assert.equal(out.applications[0].documentDate,'2026-08-10');assert.equal(out.applications[0].mes,'2026-10');assert.equal(out.rows[0].s,'EJP');assert.match(out.rows[0].id,/^EJP-/);assert.equal(out.rows[0].cat,'Proveedores');assert.equal(out.rows[0].imp,1000);assert.deepEqual(out.period,{from:'2026-10-01',to:'2026-11-10'});
 assert.ok(out.warnings.some(w=>/fecha\(s\) de aplicación/.test(w)));
});
test('payment application cannot use an invoice date or an ambiguous/foreign order',()=>{
 const apl=fixture({TIPOOP:'APL',CUENTA:null,IMPORTE:null,IMPORTEAPLICADO:1000,FECHA:'01-01-2020'}),from={fechaDesde:'2026-10-01'};
 assert.throws(()=>normalizeReport('EJP',[apl],'2026-11-10',from),/fecha de pago/);
 assert.throws(()=>normalizeReport('EJP',[apl,fixture(),fixture({FECHA:'06-10-2026'})],'2026-11-10',from),/fecha de pago/);
 assert.throws(()=>normalizeReport('EJP',[apl,fixture({EMPRESA:'Other'})],'2026-11-10',from),/fecha de pago/);
 assert.throws(()=>normalizeReport('EJP',[{...apl,FECHACOBRANZA:'06-10-2026'},fixture()],'2026-11-10',from),/no coincide/);
});
test('payments retain original principal signs and reject invalid rows or dates',()=>{
 const f={fechaDesde:'2026-10-01'};const out=normalizeReport('EJP',[fixture({IMPORTE:-100,MONEDA:'USD',IMPORTEMONEDATX:-1,COTIZACION:100})],'2026-11-10',f);assert.equal(out.rows[0].imp,-100);assert.equal(out.rows[0].originalAmount,-1);assert.equal(out.rows[0].c,'ARS');
 for(const extra of [{FECHA:null},{FECHA:'31-02-2026'},{FECHA:'01-09-2026'},{IMPORTE:'invalid'},{TIPOOP:'unknown'},{CUENTA:null},{DOCUMENTO:null}])assert.throws(()=>normalizeReport('EJP',[fixture(),fixture(extra)],'2026-11-10',f),/Fila 2/);
});
test('payment proxy includes period and applications without exposing token',async()=>{
 const old=global.fetch;global.fetch=async(url)=>{assert.equal(new URL(url).pathname,'/api/reports/AnalisisOrdenPago');return new Response(JSON.stringify([fixture(),fixture({TIPOOP:'APL',IMPORTE:null,CUENTA:null,IMPORTEAPLICADO:1000,FECHA:'01-01-2020'})]))};
 try{const res={setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await handler({method:'POST',headers:{'content-type':'application/json'},body:{source:'EJP',access_token:'fake.token',filters:{fecha:'2026-11-10',fechaDesde:'2026-10-01'}}},res);assert.equal(res.statusCode,200);assert.equal(res.body.summary.total,1000);assert.equal(res.body.applications[0].mes,'2026-10');assert.ok(!JSON.stringify(res.body).includes('fake.token'))}finally{global.fetch=old}
});
