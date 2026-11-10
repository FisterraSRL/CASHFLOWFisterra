const test=require('node:test'),assert=require('node:assert/strict');
const {reportUrl,normalizeReport}=require('../lib/finnegans-reports.cjs');
const handler=require('../api/finnegans-report.js');
const cheque=(extra={})=>({RAZONSOCIAL:'Proveedor de prueba',NUMERO:'00123',DOCUMENTO:'OP - 10',FECHA:'01-11-2026',FECHAVTO:'20-11-2026',IMPMONEDATRANS:125000,MONEDA:'Pesos',ESTADO:'Emitido',CUENTA:'Banco Galicia',EMPRESA:'Empresa de prueba',...extra});

test('own cheque URL always fixes type 0 even if a previous saved type was 1',()=>{
 const u=reportUrl('CHP',{fecha:'2026-11-10',estado:'EMI',organizacion:'A&B',circuitocontable:'CC',cuenta:'BANK',empresa:'E1',fechaVencimientoDesde:'2020-10-31',fechaVencimientoHasta:'2026-12-31',mostrarSoloNoConciliados:'false',tipoCheque:'1'},'test.token');
 assert.equal(u.pathname,'/api/reports/ApiSituacionCheques');
 assert.deepEqual(Object.fromEntries(u.searchParams),{ACCESS_TOKEN:'test.token',PARAMWEBREPORT_FechaHasta:'2026-11-10',PARAMWEBREPORT_TipoCheque:'0',PARAMWEBREPORT_MostrarSoloNoConciliados:'false',PARAMWEBREPORT_Estado:'EMI',PARAMWEBREPORT_Organizacion:'A&B',PARAMWEBREPORT_CircuitoContable:'CC',PARAMWEBREPORT_CuentaContable:'BANK',PARAMWEBREPORT_Empresa:'E1',PARAMWEBREPORT_FechaVencimientoDesde:'2020-10-31',PARAMWEBREPORT_FechaVencimientoHasta:'2026-12-31'});
 assert.equal(u.searchParams.has('PARAMWEBREPORT_fecha'),false);
 assert.equal(reportUrl('CHP',{fecha:'2026-11-10'},'token').searchParams.get('PARAMWEBREPORT_TipoCheque'),'0');
 assert.equal(reportUrl('CHP',{fecha:'2026-11-10',tipoCheque:'0'},'token').searchParams.get('PARAMWEBREPORT_TipoCheque'),'0');
 assert.equal(reportUrl('CHP',{fecha:'2026-11-10',tipoCheque:'2'},'token').searchParams.get('PARAMWEBREPORT_TipoCheque'),'0');
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
 for(const extra of [{FECHAVTO:'Vencido'},{FECHAVTO:undefined,Vencimiento:'20-11-2026'},{IMPMONEDATRANS:'invalid'},{MONEDA:'EUR'},{NUMERO:null,DOCUMENTO:null}])assert.throws(()=>normalizeReport('CHP',[cheque(),cheque(extra)],'2026-11-10'),/Fila 2/);
 const out=normalizeReport('CHP',[cheque({IMPMONEDATRANS:0})],'2026-11-10');assert.equal(out.rows.length,0);assert.equal(out.warnings.length,1);
});
test('report proxy supports cheques and returns masked diagnostics on schema errors',async()=>{
 const old=global.fetch;let payload=[cheque()];
 global.fetch=async(url)=>{assert.equal(new URL(url).searchParams.get('PARAMWEBREPORT_TipoCheque'),'0');return new Response(JSON.stringify(payload))};
 const run=async()=>{const res={setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};await handler({method:'POST',headers:{'content-type':'application/json'},body:{source:'CHP',access_token:'test.token',filters:{fecha:'2026-11-10'}}},res);return res};
 try{let r=await run();assert.equal(r.statusCode,200);assert.equal(r.body.rows[0].m,-125000);assert.ok(!JSON.stringify(r.body).includes('test.token'));payload=[cheque({FECHAVTO:'invalid'})];r=await run();assert.equal(r.statusCode,422);assert.equal(r.body.diagnostics.status,200);assert.equal(r.body.diagnostics.parameters.ACCESS_TOKEN,'[OCULTO]')}finally{global.fetch=old}
});

test('recognizes real ApiSituacionCheques amount and reconciliation fields',()=>{
 const real={TERCERO:'Proveedor de prueba',NUMERO:'96730751',DOCUMENTO:'MOVFONDOS - 1',FECHAEMISION:'06-12-2018',FECHAVENCIMIENTO:'06-01-2019',IMPORTEMONTRANSACCION:6449.33,MONEDA:'Pesos',CONCILIADO:'Si',ESTADO:'Emitido',BANCO:'Banco de prueba',CUENTA:'Cuenta bancaria'};
 const r=normalizeReport('CHP',[real],'2026-11-10').rows[0];
 assert.equal(r.m,-6449.33);assert.equal(r.f,'2019-01-06');assert.equal(r.conciliado,true);
 for(const CONCILIADO of ['No',false,'0'])assert.equal(normalizeReport('CHP',[{...real,CONCILIADO}],'2026-11-10').rows[0].conciliado,false);
 for(const CONCILIADO of ['Sí',true,1])assert.equal(normalizeReport('CHP',[{...real,CONCILIADO}],'2026-11-10').rows[0].conciliado,true);
 assert.throws(()=>normalizeReport('CHP',[{...real,CONCILIADO:'Unknown'}],'2026-11-10'),/Conciliado/);
 const anonymous=normalizeReport('CHP',[{...real,TERCERO:null,BENEFICIARIO:''}],'2026-11-10');assert.equal(anonymous.rows[0].p,'Sin tercero informado');assert.equal(anonymous.rows[0].m,-6449.33);assert.equal(anonymous.warnings.length,1);
});

test('third party cheque URL fixes type 1 independently of own cheque filters',()=>{
 const filters={fecha:'2026-11-10',tipoCheque:'0',estado:'CARTERA',organizacion:'A&B',cuenta:'VALORES',empresa:'E1',fechaVencimientoDesde:'2026-11-01',mostrarSoloNoConciliados:'true'};
 const u=reportUrl('CHT',filters,'third.token');
 assert.equal(u.pathname,'/api/reports/ApiSituacionCheques');assert.equal(u.searchParams.get('PARAMWEBREPORT_TipoCheque'),'1');
 assert.equal(u.searchParams.get('PARAMWEBREPORT_FechaHasta'),'2026-11-10');assert.equal(u.searchParams.get('PARAMWEBREPORT_CuentaContable'),'VALORES');assert.equal(u.searchParams.get('PARAMWEBREPORT_Organizacion'),'A&B');
 assert.equal(u.searchParams.get('PARAMWEBREPORT_MostrarSoloNoConciliados'),'true');assert.equal(u.searchParams.get('PARAMWEBREPORT_FechaVencimientoDesde'),'2026-11-01');
 assert.equal(reportUrl('CHP',filters,'own.token').searchParams.get('PARAMWEBREPORT_TipoCheque'),'0');
});
test('third party cheques are positive receipts preserving account, bank, state and reconciliation',()=>{
 const f={TERCERO:'Cliente de prueba',NUMERO:'345',DOCUMENTO:'REC-1',FECHAEMISION:'01-11-2026',FECHAVENCIMIENTO:'20-11-2026',IMPORTEMONTRANSACCION:1000,MONEDA:'Pesos',ESTADO:'En Cartera',CONCILIADO:'No',CUENTA:'Valores A Depositar',BANCO:'Banco de prueba'};
 const r=normalizeReport('CHT',[f],'2026-11-10').rows[0];
 assert.equal(r.s,'CHT');assert.match(r.id,/^CHT-/);assert.equal(r.m,1000);assert.equal(r.cat,'Cheques en cartera');assert.equal(r.f,'2026-11-20');assert.equal(r.x,'Valores A Depositar');assert.equal(r.bank,'Banco de prueba');assert.equal(r.conciliado,false);
 const deposited=normalizeReport('CHT',[{...f,ESTADO:'Cheque Depositado'}],'2026-11-10').rows[0];assert.equal(deposited.cat,'Cheques depositados');assert.equal(deposited.e,'Cheque Depositado');
 const settled=normalizeReport('CHT',[{...f,CONCILIADO:'Si'}],'2026-11-10').rows[0];assert.equal(settled.conciliado,true);
 const usd=normalizeReport('CHT',[{...f,MONEDA:'USD',IMPORTEMONTRANSACCION:-25}],'2026-11-10').rows[0];assert.equal(usd.c,'USD');assert.equal(usd.m,25);
 assert.throws(()=>normalizeReport('CHT',[{...f,ESTADO:null}],'2026-11-10'),/falta el estado/);
 const unknown=normalizeReport('CHT',[{...f,ESTADO:'Estado futuro'}],'2026-11-10');assert.equal(unknown.rows[0].e,'Estado futuro');assert.match(unknown.warnings[0],/estado no reconocido/);
 for(const ESTADO of ['Endosado','Descontado','Cobrado','Anulado'])assert.equal(normalizeReport('CHT',[{...f,ESTADO}],'2026-11-10').rows[0].e,ESTADO);
});
