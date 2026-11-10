const test=require('node:test'),assert=require('node:assert/strict');
const {reportUrl,normalizeReport}=require('../lib/finnegans-reports.cjs');
const handler=require('../api/finnegans-report.js');
const cheque=(extra={})=>({RAZONSOCIAL:'Proveedor de prueba',NUMERO:'00123',DOCUMENTO:'OP - 10',FECHA:'01-11-2026',FECHAVTO:'20-11-2026',IMPMONEDATRANS:125000,MONEDA:'Pesos',ESTADO:'Emitido',CUENTA:'Banco Galicia',EMPRESA:'Empresa de prueba',...extra});

test('own cheque URL matches the supplied contract including case and fixed type',()=>{
 const u=reportUrl('CHP',{fecha:'2026-11-10',estado:'EMI',organizacion:'A&B',circuitocontable:'CC',cuenta:'BANK',empresa:'E1',fechaVencimientoDesde:'2020-10-31',fechaVencimientoHasta:'2026-12-31',mostrarSoloNoConciliados:'false',tipoCheque:'2'},'test.token');
 assert.equal(u.pathname,'/api/reports/ApiSituacionCheques');
 assert.deepEqual(Object.fromEntries(u.searchParams),{ACCESS_TOKEN:'test.token',PARAMWEBREPORT_FechaHasta:'2026-11-10',PARAMWEBREPORT_TipoCheque:'1',PARAMWEBREPORT_MostrarSoloNoConciliados:'false',PARAMWEBREPORT_Estado:'EMI',PARAMWEBREPORT_Organizacion:'A&B',PARAMWEBREPORT_CircuitoContable:'CC',PARAMWEBREPORT_CuentaContable:'BANK',PARAMWEBREPORT_Empresa:'E1',PARAMWEBREPORT_FechaVencimientoDesde:'2020-10-31',PARAMWEBREPORT_FechaVencimientoHasta:'2026-12-31'});
 assert.equal(u.searchParams.has('PARAMWEBREPORT_fecha'),false);
});
test('own cheque optional dates are omitted, reconciliation false is explicit and true is supported',()=>{
 const f={fecha:'2026-11-10',fechaVencimientoDesde:'',fechaVencimientoHasta:''};
 const u=reportUrl('CHP',f,'token');assert.equal(u.searchParams.get('PARAMWEBREPORT_MostrarSoloNoConciliados'),'false');
 assert.equal(u.searchParams.has('PARAMWEBREPORT_FechaVencimientoDesde'),false);
 assert.equal(reportUrl('CHP',{...f,mostrarSoloNoConciliados:'true'},'token').searchParams.get('PARAMWEBREPORT_MostrarSoloNoConciliados'),'true');
 for(const extra of [{fechaVencimientoDesde:'2026-02-31'},{fechaVencimientoHasta:'31-12-2026'},{fechaVencimientoDesde:'2026-12-31',fechaVencimientoHasta:'2026-11-01'},{mostrarSoloNoConciliados:'yes'}])assert.throws(()=>reportUrl('CHP',{...f,...extra},'token'));
});
test('issued cheques are expenses with their original due date, number, bank and state',()=>{
 const out=normalizeReport('CHP',{data:[cheque() ]},'2026-11-10'),r=out.rows[0];
 assert.equal(r.s,'CHP');assert.equal(r.cat,'Cheques emitidos');assert.equal(r.m,-125000);assert.equal(r.c,'ARS');assert.equal(r.f,'2026-11-20');assert.equal(r.fc,'2026-11-01');assert.equal(r.p,'Proveedor de prueba');assert.equal(r.doc,'Ch 00123 · OP - 10');assert.equal(r.x,'Banco Galicia');assert.equal(r.e,'Emitido');assert.match(r.id,/^CHP-/);
 assert.equal(normalizeReport('CHP',[cheque({IMPMONEDATRANS:-125000})],'2026-11-10').rows[0].m,-125000);
});
test('own cheques support Excel aliases and USD without inferring due dates from status',()=>{
 const f={Razonsocial:'Tercero',Número:123,Documento:'OP-1','Fecha de vto.':'20/11/2026','Imp. moneda trans.':'2.000,50',Moneda:'USD',Estado:'Emitido',Banco:'ICBC'};
 const r=normalizeReport('CHP',[f],'2026-11-10').rows[0];assert.equal(r.m,-2000.5);assert.equal(r.c,'USD');assert.equal(r.x,'ICBC');
 for(const extra of [{FECHAVTO:'Vencido'},{FECHAVTO:undefined,Vencimiento:'20-11-2026'},{IMPMONEDATRANS:'invalid'},{MONEDA:'EUR'},{RAZONSOCIAL:null}])assert.throws(()=>normalizeReport('CHP',[cheque(),cheque(extra)],'2026-11-10'),/Fila 2/);
 const out=normalizeReport('CHP',[cheque({IMPMONEDATRANS:0})],'2026-11-10');assert.equal(out.rows.length,0);assert.equal(out.warnings.length,1);
});
test('report proxy supports cheques and returns masked diagnostics on schema errors',async()=>{
 const old=global.fetch;let payload=[cheque()];
 global.fetch=async(url)=>{assert.equal(new URL(url).searchParams.get('PARAMWEBREPORT_TipoCheque'),'1');return new Response(JSON.stringify(payload))};
 const run=async()=>{const res={setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await handler({method:'POST',headers:{'content-type':'application/json'},body:{source:'CHP',access_token:'test.token',filters:{fecha:'2026-11-10'}}},res);return res};
 try{let r=await run();assert.equal(r.statusCode,200);assert.equal(r.body.rows[0].m,-125000);assert.ok(!JSON.stringify(r.body).includes('test.token'));payload=[cheque({FECHAVTO:'invalid'})];r=await run();assert.equal(r.statusCode,422);assert.equal(r.body.diagnostics.status,200);assert.equal(r.body.diagnostics.parameters.ACCESS_TOKEN,'[OCULTO]')}finally{global.fetch=old}
});
