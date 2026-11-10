const test=require('node:test'),assert=require('node:assert/strict');
const {reportUrl,normalizeReport}=require('../lib/finnegans-reports.cjs');
const handler=require('../api/finnegans-report.js');
const fixture=(extra={})=>({TIPOOP:'OPT',FECHA:'04-11-2026',FECHACOBRANZA:'04-11-2026',DOCUMENTO:'COBRANZA-1',TERCERO:'Cliente de prueba',CUENTA:'Banco de prueba',IMPORTE:100,MONEDA:'Pesos',IMPORTEMONEDATX:100,EMPRESA:'Empresa de prueba',...extra});
test('collection query preserves exact report parameters and defaults month start/detail',()=>{
 const u=reportUrl('EJC',{fecha:'2026-11-10',fechaDesde:'2026-11-01',transaccionSubtipoID:'23',circuitocontable:'CC',detallarAplicacion:'true',cliente:'A&B',empresa:'E1'},'fake.token');
 assert.equal(u.pathname,'/api/reports/analisisCobranza');assert.deepEqual(Object.fromEntries(u.searchParams),{ACCESS_TOKEN:'fake.token',PARAMWEBREPORT_FechaHasta:'2026-11-10',PARAMWEBREPORT_FechaDesde:'2026-11-01',PARAMWEBREPORT_DetallarAplicacion:'true',PARAMWEBREPORT_TransaccionSubtipoID:'23',PARAMWEBREPORT_CircuitoContable:'CC',PARAMWEBREPORT_Cliente:'A&B',PARAMWEBREPORT_Empresa:'E1'});
 const d=reportUrl('EJC',{fecha:'2026-12-05',detallarAplicacion:'false'},'token');assert.equal(d.searchParams.get('PARAMWEBREPORT_FechaDesde'),'2026-12-01');assert.equal(d.searchParams.get('PARAMWEBREPORT_DetallarAplicacion'),'false');assert.equal(d.searchParams.has('PARAMWEBREPORT_Cliente'),false);
 for(const extra of [{fechaDesde:'2026-11-11'},{fechaDesde:'2026-02-31'},{detallarAplicacion:'yes'}])assert.throws(()=>reportUrl('EJC',{fecha:'2026-11-10',...extra},'token'));
});
test('treasury means count once; invoice applications are detail only and use collection date',()=>{
 const apl=fixture({TIPOOP:'APL',CUENTA:null,IMPORTE:null,IMPORTEAPLICADO:170,DOCUMENTOAPLICADO:'FCV-1',FECHA:'01-09-2026'});
 const out=normalizeReport('EJC',[fixture(),fixture({CUENTA:'Valores a Depositar',IMPORTE:50}),fixture({CUENTA:'Retenciones Ganancias Recibidas',IMPORTE:20}),apl],'2026-11-10');
 assert.equal(out.rows.length,3);assert.equal(out.applications.length,1);assert.equal(out.summary.total,170);assert.equal(out.summary.banks,100);assert.equal(out.summary.cheques,50);assert.equal(out.summary.withholdings,20);
 assert.equal(out.rows[0].cat,'Cobranza clientes');assert.equal(out.rows[1].cat,'Cheques en cartera');assert.equal(out.rows[2].cat,'Otros ingresos');assert.equal(out.rows[2].kind,'withholding');
 assert.equal(out.applications[0].mes,'2026-11');assert.equal(out.applications[0].documentDate,'2026-09-01');assert.equal(out.applications[0].appliedDoc,'FCV-1');assert.equal(out.received,4);
});
test('uses principal amount without current FX or absolute-value distortion',()=>{
 const out=normalizeReport('EJC',[fixture({MONEDA:'Dolar Divisa',IMPORTEMONEDATX:1,COTIZACION:1500,IMPORTE:1500}),fixture({IMPORTE:-25})],'2026-11-10');
 assert.equal(out.summary.total,1475);assert.equal(out.rows[0].c,'ARS');assert.equal(out.rows[0].imp,1500);assert.equal(out.rows[0].originalAmount,1);assert.equal(out.rows[1].imp,-25);
});
test('rejects unknown types, malformed means, invalid collection dates and partial pages',()=>{
 for(const extra of [{TIPOOP:'unknown'},{IMPORTE:'invalid'},{CUENTA:null},{FECHACOBRANZA:'31-02-2026'},{FECHACOBRANZA:'01-09-2026'},{FECHACOBRANZA:'11-11-2026'},{DOCUMENTO:null}])assert.throws(()=>normalizeReport('EJC',[fixture(),fixture(extra)],'2026-11-10'),/Fila 2/);
 assert.throws(()=>normalizeReport('EJC',[fixture({TIPOOP:'APL',IMPORTEAPLICADO:100,IMPORTE:null})],'2026-11-10'),/no medios de cobro/);
 assert.throws(()=>normalizeReport('EJC',{rows:[fixture()],totalRecords:10},'2026-11-10'),/paginado/);
 assert.equal(normalizeReport('EJC',[],'2026-11-10').rows.length,0);
});
test('proxy returns collection records, applications and redacted diagnostics',async()=>{
 const old=global.fetch;global.fetch=async(url)=>{assert.equal(new URL(url).searchParams.get('PARAMWEBREPORT_DetallarAplicacion'),'true');return new Response(JSON.stringify([fixture(),fixture({TIPOOP:'APL',IMPORTE:null,IMPORTEAPLICADO:100})]))};
 try{const res={setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await handler({method:'POST',headers:{'content-type':'application/json'},body:{source:'EJC',access_token:'fake.token',filters:{fecha:'2026-11-10',fechaDesde:'2026-11-01'}}},res);assert.equal(res.statusCode,200);assert.equal(res.body.summary.total,100);assert.equal(res.body.applications.length,1);assert.ok(!JSON.stringify(res.body).includes('fake.token'));assert.equal(res.body.diagnostics.parameters.ACCESS_TOKEN,'[OCULTO]')}finally{global.fetch=old}
});
