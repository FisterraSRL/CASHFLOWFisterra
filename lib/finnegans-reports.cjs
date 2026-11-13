'use strict';

const {createHash} = require('node:crypto');
const REPORTS = {
  BCO: {name:'SaldoCuentasBanco',fields:['empresa'],scope:['empresa']},
  CLI: {name:'composicionSaldoCliente', fields:['organizacion','circuitocontable','cuenta','moneda','empresa']},
  PRV: {name:'composicionSaldoProveedor', fields:['organizacion','circuitocontable','cuenta','dimension','valor','moneda','empresa','tipoDocumento']},
  CHP: {name:'ApiSituacionCheques',fields:['estado','organizacion','circuitocontable','cuenta','empresa','fechaVencimientoDesde','fechaVencimientoHasta','mostrarSoloNoConciliados']},
  CHT: {name:'ApiSituacionCheques',fields:['estado','organizacion','circuitocontable','cuenta','empresa','fechaVencimientoDesde','fechaVencimientoHasta','mostrarSoloNoConciliados']},
  EJC: {name:'analisisCobranza',fields:['fechaDesde','transaccionSubtipoID','circuitocontable','detallarAplicacion','cliente','empresa'],scope:['empresa']},
  EJP: {name:'AnalisisOrdenPago',fields:['fechaDesde','transaccionSubtipoID','circuitocontable','detallarAplicacion','proveedor','empresa'],scope:['empresa']},
};
const PARAMS = {organizacion:'organizacion',circuitocontable:'circuitocontable',cuenta:'cuenta',dimension:'dimension',valor:'valor',moneda:'moneda',empresa:'Empresa',tipoDocumento:'TipoDocumento'};
const key = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function currencyCode(value){
  const v=key(value||'ARS');
  const names={peso:'ARS',pesos:'ARS',pesoargentino:'ARS',pesosargentinos:'ARS',dolar:'USD',dolares:'USD',dolareeuu:'USD',dolaresestadounidenses:'USD',dolaresamericanos:'USD',dolarusa:'USD',uss:'USD',pesomexicano:'MXN',pesosmexicanos:'MXN',pesochileno:'CLP',pesoschilenos:'CLP',pesocolombiano:'COP',pesoscolombianos:'COP',realbrasileno:'BRL',realesbrasilenos:'BRL',euro:'EUR',euros:'EUR'};
  return names[v]||(/^[a-z]{3}$/.test(v)?v.toUpperCase():null);
}
function date(value) {
  if (typeof value !== 'string') return null;
  let s=value.trim(), match=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*|\s.*)?$/);
  if (!match) {
    const d=s.match(/^(\d{2})([/-])(\d{2})\2(\d{4})(?:\s.*)?$/);
    if (!d) return null;
    match=[d[0],d[4],d[3],d[1]];
  }
  s=`${match[1]}-${match[2]}-${match[3]}`;
  const parsed=new Date(s+'T00:00:00Z');
  return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===s?s:null;
}
function number(value) {
  if (typeof value==='number') return Number.isFinite(value)?value:null;
  if (typeof value!=='string'||!value.trim()) return null;
  let s=value.trim().replace(/\s/g,'');
  if (!/^-?[\d.,]+$/.test(s)) return null;
  if (s.includes(',')&&s.includes('.')) {
    s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
  } else if (s.includes(',')) s=s.replace(',','.');
  else if (/^-?\d{1,3}(?:\.\d{3}){2,}$/.test(s)) s=s.replace(/\./g,'');
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function reportUrl(source, filters, token) {
  const report=Object.hasOwn(REPORTS,source)?REPORTS[source]:null;
  if (!report) throw new Error('La fuente solicitada no tiene una API configurada.');
  if (!filters||!date(filters.fecha)) throw new Error('Ingresá una fecha de consulta válida.');
  if(source==='BCO'&&(typeof filters.empresa!=='string'||!filters.empresa.trim()))throw new Error('Ingresá la empresa de Finnegans para consultar el saldo bancario.');
  const url=new URL('https://api.finneg.com/api/reports/'+report.name);
  const bank=source==='BCO';
  const cheque=source==='CHP'||source==='CHT';
  const executed=source==='EJC'||source==='EJP';
  url.searchParams.set('ACCESS_TOKEN',token);
  url.searchParams.set(bank?'PARAMETER_FechaCorte':cheque||executed?'PARAMWEBREPORT_FechaHasta':'PARAMWEBREPORT_fecha',filters.fecha);
  const params=bank?{empresa:'Empresa'}:executed?{fechaDesde:'FechaDesde',transaccionSubtipoID:'TransaccionSubtipoID',circuitocontable:'CircuitoContable',detallarAplicacion:'DetallarAplicacion',cliente:'Cliente',proveedor:'Proveedor',empresa:'Empresa'}:cheque?{estado:'Estado',organizacion:'Organizacion',circuitocontable:'CircuitoContable',cuenta:'CuentaContable',empresa:'Empresa',fechaVencimientoDesde:'FechaVencimientoDesde',fechaVencimientoHasta:'FechaVencimientoHasta',mostrarSoloNoConciliados:'MostrarSoloNoConciliados'}:PARAMS;
  if(executed){
    const from=filters.fechaDesde||filters.fecha.slice(0,7)+'-01',detail=filters.detallarAplicacion||'true';
    if(date(from)!==from||from>filters.fecha)throw new Error('Ingresá una fecha desde válida y anterior o igual a hoy.');
    if(!['true','false'].includes(detail))throw new Error('Detallar aplicación debe ser true o false.');
    url.searchParams.set('PARAMWEBREPORT_FechaDesde',from);url.searchParams.set('PARAMWEBREPORT_DetallarAplicacion',detail);
  }
  if(cheque){
    url.searchParams.set('PARAMWEBREPORT_TipoCheque',source==='CHT'?'1':'0');
    const flag=filters.mostrarSoloNoConciliados??'false';
    if(!['true','false',''].includes(flag))throw new Error('Mostrar solo no conciliados debe ser true o false.');
    url.searchParams.set('PARAMWEBREPORT_MostrarSoloNoConciliados',flag||'false');
    for(const field of ['fechaVencimientoDesde','fechaVencimientoHasta'])if(filters[field]&&date(filters[field])!==filters[field])throw new Error('Ingresá una fecha de vencimiento válida (AAAA-MM-DD).');
    if(filters.fechaVencimientoDesde&&filters.fechaVencimientoHasta&&filters.fechaVencimientoDesde>filters.fechaVencimientoHasta)throw new Error('El vencimiento desde no puede ser posterior al vencimiento hasta.');
  }
  for (const field of report.fields) {
    const value=filters[field];
    if (value==null||value==='') continue;
    if (typeof value!=='string'||value.length>256||/[\r\n]/.test(value)) throw new Error('Uno de los filtros no es válido.');
    if (value.trim()) url.searchParams.set((bank?'PARAMETER_':'PARAMWEBREPORT_')+params[field],value.trim());
  }
  return url;
}
function reportRows(payload) {
  const wrappers=['data','items','result','results','rows','records','lista','values','report','reportdata','datos','table'];
  function find(value, depth=0) {
    if (depth>8) return null;
    if (Array.isArray(value)) {
      if (!value.length) return [];
      if (!value.every(r=>r&&typeof r==='object'&&!Array.isArray(r))) return null;
      const nested=value.map(r=>Object.entries(r).some(([k])=>wrappers.includes(key(k))));
      if (nested.every(Boolean)) {
        const lists=value.map(r=>find(r,depth+1));
        return lists.every(r=>r!==null)?lists.flat():null;
      }
      return value;
    }
    if (value&&typeof value==='object') {
      for (const [name, child] of Object.entries(value)) {
        if (wrappers.includes(key(name))) {
          const found=find(child,depth+1);
          if (found!==null) return found;
        }
      }
    }
    return null;
  }
  const rows=find(payload);
  if (rows===null) throw new Error('La respuesta no contiene una lista de comprobantes reconocible. Se conservaron los datos anteriores.');
  // Never treat a first page as the complete outstanding balance.
  function partial(value,depth=0) {
    if (!value||typeof value!=='object'||Array.isArray(value)||depth>8) return false;
    for (const [name,v] of Object.entries(value)) {
      const k=key(name);
      if (['total','totalrecords','totalcount'].includes(k)&&number(v)>rows.length) return true;
      if (['hasmore','hasnextpage'].includes(k)&&(v===true||v==='true')) return true;
      if (['nextpage','nextpagetoken','nextcursor'].includes(k)&&v!=null&&v!==''&&v!==false) return true;
      if (v&&typeof v==='object'&&!Array.isArray(v)&&partial(v,depth+1)) return true;
    }
    return false;
  }
  if (partial(payload)) throw new Error('Finnegans devolvió un reporte paginado o incompleto. Se conservaron los datos anteriores.');
  if (rows.length>20000) throw new Error('El reporte supera 20.000 filas. Acotá los filtros para consultarlo.');
  return rows;
}
function normalizeReport(source,payload,snapshot,filters={}) {
  if (!REPORTS[source]||!date(snapshot)) throw new Error('La fuente o fecha del reporte no es válida.');
  if(source==='BCO')return normalizeBank(payload,snapshot);
  if(source==='EJC'||source==='EJP')return normalizeExecuted(source,payload,snapshot,filters);
  if(source==='CHP'||source==='CHT')return normalizeCheques(source,payload);
  const input=reportRows(payload), rows=[], warnings=[];
  let inferred=0,zero=0,residual=0;
  const addDays=(s,n)=>new Date(new Date(s+'T00:00:00Z').getTime()+n*86400000).toISOString().slice(0,10);
  for (let i=0;i<input.length;i++) {
    const raw=input[i], r=Object.fromEntries(Object.entries(raw).map(([k,v])=>[key(k),v]));
    const get=(...names)=>{for (const n of names){const v=r[key(n)];if(v!==null&&v!==undefined&&v!=='')return v}return null};
    const text=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
    const fail=reason=>{throw new Error(`Fila ${i+1}: ${reason}. Se conservaron los datos anteriores.`)};
    const p=text(get(source==='CLI'?'Cliente':'Proveedor','Organizacion','OrganizacionNombre','NombreOrganizacion','RazonSocial'));
    const doc=text(get('Documento','Comprobante','IdentificacionExterna','DocumentoID'));
    const comprobante=text(get('Comprobante'));
    if (!p||!doc) fail('falta identificar la organización o el comprobante');
    const principalRaw=get('IMPORTEMONPPAL','Importe ppal','ImporteMonedaPrincipal','ImportePrincipal');
    const originalRaw=get('IMPORTEMONTRAN','IMPORTEMONTRANS','Importe tran','ImporteMonedaTransaccion');
    const principal=number(principalRaw),original=number(originalRaw);
    if((principalRaw!==null&&principal===null)||(originalRaw!==null&&original===null))fail('el importe no es numérico');
    const moneda=currencyCode(get('Moneda','MonedaNombre','MonedaCodigo'));
    if(!moneda)fail('la moneda no tiene un código reconocido');
    let c,m;
    if (moneda==='USD') {
      if (original===null) fail('falta el importe original en USD');
      if(original===0&&principal!==null&&principal!==0){c='ARS';m=principal;residual++}
      else {c='USD';m=original}
    } else if (moneda==='ARS') {
      c='ARS';m=principal??original;
    } else {
      if(original===null)fail(`falta el importe original en ${moneda}`);
      c=moneda;m=original;
    }
    if (m===null||!Number.isFinite(m)) fail('el importe no es numérico');
    if (m===0){zero++;continue}
    // API contract: Fecha and FechaVto are dates; Vencimiento / Venc. is text.
    const fc=date(text(get('Fecha','FechaComprobante')));
    const dueNames=['FechaVto','Fecha de vencimiento actual','FechaVencimientoActual','FechaCashflow','Fecha de vencimiento','FechaVencimiento'];
    const dueField=dueNames.find(n=>get(n)!==null);
    const originalDue=dueField?get(dueField):null;
    let f=date(text(originalDue));
    if (originalDue!==null&&!f) fail(`el campo ${dueField} no contiene una fecha válida (formatos admitidos: AAAA-MM-DD, DD/MM/AAAA o DD-MM-AAAA)`);
    const mora=number(get('Dias de mora','DiasMora','DiasDeMora'));
    const terms=text(get('Condicionpago','CondicionPagoNombre','CondicionDePago'));
    if (!f&&mora>0&&Number.isInteger(mora)){f=addDays(snapshot,-mora);inferred++}
    if (!f&&fc) {
      const days=terms.match(/(\d+)\s*d[ií]as?/i), numbers=terms.match(/\d+/g)||[];
      if(days&&numbers.length===1){f=addDays(fc,Number(days[1]));inferred++}
    }
    if (!f) fail('falta vencimiento y no puede calcularse con la mora o la condición de pago');
    const account=text(get('Cuenta','CuentaNombre','CuentaContable','CuentaContableNombre'));
    if(source==='PRV'&&!account)fail('falta la cuenta para clasificar la deuda');
    let cat='Cobranza clientes';
    if(source==='PRV'){
      const k=key(account);cat=k.includes('leasing')?'Leasing':k.includes('fondofijo')?'Fondo fijo':k.includes('socio')?'Retiros de socios':k.startsWith('proveedor')?'Proveedores':'Otras deudas';
    }
    const company=text(get('Empresa','EmpresaNombre','EmpresaCodigo'));
    const id=source+'-'+createHash('sha256').update(JSON.stringify([company,account,doc,f,i])).digest('hex').slice(0,24);
    rows.push({s:source,id,f,fc,m:Math.round(m*100)/100,c,p,doc,comprobante:comprobante||doc,cat,x:terms,e:text(get('Vencimiento','Venc','Estado')),company,account});
  }
  if(inferred)warnings.push(`${inferred} vencimiento(s) calculado(s) con la fecha del reporte y la mora o condición de pago.`);
  if(zero)warnings.push(`${zero} fila(s) con saldo cero excluida(s).`);
  if(residual)warnings.push(`${residual} saldo(s) residual(es) en moneda principal: importe original USD igual a cero.`);
  return {rows,warnings,received:input.length};
}

function normalizeBank(payload,snapshot){
  const input=reportRows(payload),rows=[],seen=new Set();
  for(let i=0;i<input.length;i++){
    const raw=Object.fromEntries(Object.entries(input[i]).map(([k,v])=>[key(k),v]));
    const get=(...names)=>{for(const name of names){const value=raw[key(name)];if(value!==null&&value!==undefined&&value!=='')return value}return null};
    const asText=value=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
    const fail=reason=>{throw new Error(`Fila ${i+1}: ${reason}. Se conservaron los datos anteriores.`)};
    const account=asText(get('CuentaBancaria','CuentaBanco','Cuenta','CuentaNombre','NumeroCuenta','NroCuenta','CBU'));
    const accountId=asText(get('CuentaID','CuentaBancoID','CuentaBancariaID'));
    const bank=asText(get('Banco','BancoNombre','EntidadBancaria'));
    const company=asText(get('Empresa','EmpresaNombre','EmpresaCodigo'));
    if(!account)fail('falta identificar la cuenta bancaria');
    const currencyRaw=get('Moneda','MonedaCuenta','MonedaCodigo','CodigoMoneda');
    const accountCurrency=()=>{
      if(/(?:U\$S|US\$|\bUSD\b|D[ÓO]LARES?)/i.test(account))return 'USD';
      const code=account.toUpperCase().match(/\b(ARS|MXN|CLP|COP|BRL|EUR)\b/);
      if(code)return code[1];
      if(/(?:^|\s)\$(?:\s|$)|\bPESOS?(?:\s+ARGENTINOS?)?\b/i.test(account))return 'ARS';
      return null;
    };
    const currency=currencyRaw===null?accountCurrency():currencyCode(currencyRaw);
    if(!currency)fail('falta la moneda; la cuenta debe indicar un código o símbolo de moneda reconocido');
    const amountRaw=get('SaldoMonedaCuenta','SaldoMonedaOrigen','SaldoCuenta','SaldoFinal','SaldoAlCorte','Saldo','SaldoActual');
    const amount=number(amountRaw);
    if(amount===null)fail('falta un saldo final numérico en moneda de la cuenta');
    const rowDate=get('FechaCorte','FechaSaldo','Fecha');
    if(rowDate!==null&&date(asText(rowDate))!==snapshot)fail('la fecha del saldo no coincide con la fecha de corte consultada');
    const identity=JSON.stringify([company,accountId||account,currency]);
    if(seen.has(identity))fail('la cuenta aparece más de una vez; no se puede sumar sin duplicar saldos');
    seen.add(identity);
    rows.push({s:'BCO',id:'BCO-'+createHash('sha256').update(identity).digest('hex').slice(0,24),f:snapshot,m:Math.round(amount*100)/100,c:currency,account,accountId,bank,company});
  }
  return{rows,warnings:[],received:input.length};
}

function normalizeCheques(source,payload){
  const input=reportRows(payload),rows=[],warnings=[];let zero=0,withoutParty=0,unknownStates=0;
  for(let i=0;i<input.length;i++){
    const r=Object.fromEntries(Object.entries(input[i]).map(([k,v])=>[key(k),v]));
    const get=(...names)=>{for(const name of names){const v=r[key(name)];if(v!==null&&v!==undefined&&v!=='')return v}return null};
    const text=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
    const fail=reason=>{throw new Error(`Fila ${i+1}: ${reason}. Se conservaron los datos anteriores.`)};
    const party=text(get('Razonsocial','Organizacion','OrganizacionNombre','Tercero','Beneficiario'));
    const p=party||'Sin tercero informado';
    const cheque=text(get('NumeroCheque','ChequeNumero','Numero','Cheque'));
    const document=text(get('Documento','Comprobante','IdentificacionExterna','DocumentoID'));
    if(!cheque&&!document)fail('falta identificar el cheque o el comprobante');
    const f=date(text(get('FechaVto','Fecha de vto','FechaVencimiento')));
    if(!f)fail('el campo de fecha del cheque (FechaVto / FechaVencimiento / Fecha de vto.) no contiene una fecha válida');
    const fc=date(text(get('Fecha','FechaEmision','FechaComprobante')));
    const currency=currencyCode(get('Moneda','MonedaTransaccion','MonedaCodigo'));
    if(!currency)fail('la moneda del cheque no tiene un código reconocido');
    const originalRaw=get('Imp moneda trans','ImporteMonTransaccion','ImporteMonTran','ImporteMonTrans','ImporteMonedaTransaccion','Importe');
    const principalRaw=get('Imp moneda ppal','ImporteMonPpal','ImporteMonedaPrincipal');
    const original=number(originalRaw),principal=number(principalRaw);
    if((originalRaw!==null&&original===null)||(principalRaw!==null&&principal===null))fail('el importe del cheque no es numérico');
    let c,m;
    if(currency==='ARS'){c='ARS';m=original??principal}
    else {c=currency;m=original}
    if(m===null||!Number.isFinite(m))fail('falta el importe del cheque en su moneda original');
    if(m===0){zero++;continue}
    const account=text(get('Cuenta','CuentaContable','CuentaNombre','CuentaBancaria'));
    const company=text(get('Empresa','EmpresaNombre','EmpresaCodigo'));
    const bank=text(get('Banco','BancoNombre'));
    const doc=(cheque?'Ch '+cheque:'')+(cheque&&document?' · ':'')+document;
    const id=source+'-'+createHash('sha256').update(JSON.stringify([company,account,cheque,document,f,i])).digest('hex').slice(0,24);
    const reconciledRaw=get('Conciliado'),reconciled=key(reconciledRaw??'no');
    if(!['si','true','1','no','false','0'].includes(reconciled))fail('el campo Conciliado no tiene un valor reconocido');
    const estadoOriginal=text(get('Estado','EstadoNombre'));
    let estado=estadoOriginal;
    if(source==='CHT'){
      if(!estado)fail('falta el estado del cheque de terceros para determinar su disponibilidad');
      const states={encartera:'En Cartera',chequedepositado:'Cheque Depositado',depositado:'Cheque Depositado',endosado:'Endosado',descontado:'Descontado',rechazado:'Rechazado',anulado:'Anulado',cancelado:'Cancelado',cobrado:'Cobrado'};
      estado=states[key(estadoOriginal)]||estadoOriginal;if(!states[key(estadoOriginal)])unknownStates++;
    }
    if(!party)withoutParty++;
    const amount=Math.round(Math.abs(m)*100)/100;
    rows.push({s:source,id,f,fc,m:source==='CHT'?amount:-amount,c,p,doc,chequeNumber:cheque,cat:source==='CHP'?'Cheques emitidos':estado==='Cheque Depositado'?'Cheques depositados':'Cheques en cartera',x:source==='CHT'?account:bank||account,e:estado,estadoOriginal,conciliado:['si','true','1'].includes(reconciled),company,account,bank});
  }
  if(zero)warnings.push(`${zero} cheque(s) con importe cero excluido(s).`);
  if(withoutParty)warnings.push(`${withoutParty} cheque(s) sin tercero o beneficiario, agrupado(s) como “Sin tercero informado”.`);
  if(unknownStates)warnings.push(`${unknownStates} cheque(s) de terceros con estado no reconocido: se conservan en la carga y se excluyen del flujo hasta verificar su disponibilidad.`);
  return {rows,warnings,received:input.length};
}
module.exports={REPORTS,reportUrl,normalizeReport};

function normalizeExecuted(source,payload,snapshot,filters){
  const input=reportRows(payload),rows=[],applications=[],warnings=[];
  const from=filters.fechaDesde||snapshot.slice(0,7)+'-01';
  const payment=source==='EJP',noun=payment?'pago':'cobro',byOrder=new Map();let inferredDates=0;
  if(payment)for(const raw of input){
    const r=Object.fromEntries(Object.entries(raw).map(([k,v])=>[key(k),v]));
    if(key(r.tipoop)!=='opt')continue;
    const f=date(r.fechapago||r.fecha),order=JSON.stringify([String(r.empresa||'').trim(),String(r.documento||'').trim()]);
    if(f){const dates=byOrder.get(order)||new Set();dates.add(f);byOrder.set(order,dates)}
  }
  for(let i=0;i<input.length;i++){
    const r=Object.fromEntries(Object.entries(input[i]).map(([k,v])=>[key(k),v]));
    const get=(...names)=>{for(const name of names){const v=r[key(name)];if(v!==null&&v!==undefined&&v!=='')return v}return null};
    const text=v=>typeof v==='string'||typeof v==='number'?String(v).trim():'';
    const fail=reason=>{throw new Error(`Fila ${i+1}: ${reason}. Se conservaron los datos anteriores.`)};
    const type=key(get('TIPOOP'));
    if(!['opt','apl'].includes(type))fail(`TIPOOP no identifica un medio de ${noun} (OPT) o una aplicación (APL)`);
    const p=text(get('Tercero',payment?'Proveedor':'Cliente'))||(payment?'Sin proveedor informado':'Sin cliente informado'),doc=text(get('Documento'));
    if(!doc)fail(`falta identificar el comprobante de ${payment?'pago':'cobranza'}`);
    const company=text(get('Empresa')),originalCurrency=text(get('Moneda')),originalAmount=number(get('ImporteMonedaTX'));
    // APL.FECHA belongs to the invoice, never to the executed payment.
    const rawDate=payment?(type==='opt'?get('FechaPago','Fecha'):get('FechaPago','FechaCobranza')):get('FechaCobranza');
    let f=date(text(rawDate));
    if(rawDate!==null&&!f)fail(`la fecha de ${payment?'pago':'cobranza'} no es válida`);
    if(payment&&type==='apl'){
      const dates=byOrder.get(JSON.stringify([company,doc]));
      if(!f&&dates?.size===1){f=[...dates][0];inferredDates++}
      if(f&&dates&&!dates.has(f))fail('la fecha de aplicación no coincide con su orden de pago');
    }
    if(!f)fail(payment?'no se pudo determinar la fecha de pago; verificá la orden y sus movimientos':'FECHACOBRANZA no contiene una fecha válida');
    if(f<from||f>snapshot)fail(`la fecha de ${payment?'pago':'cobranza'} está fuera del período consultado`);
    if(type==='apl'){
      const amount=number(get('ImporteAplicado'));if(amount===null)fail('IMPORTEAPLICADO no es numérico');
      applications.push({f,mes:f.slice(0,7),p,doc,appliedDoc:text(get('DocumentoAplicado')),documentDate:date(text(get('Fecha'))),imp:amount,company,originalCurrency,originalAmount});continue;
    }
    const imp=number(get('Importe'));if(imp===null)fail(`IMPORTE del medio de ${noun} no es numérico`);
    const account=text(get('Cuenta'));if(!account)fail(`falta la cuenta del medio de ${noun}`);
    const operation=text(get('OperacionBancaria')),medium=key(account+' '+operation);
    const kind=/retencion/.test(medium)?'withholding':/cheque|valoresadepositar/.test(medium)?'cheque':/banco|transferencia|caja|efectivo/.test(medium)?'bank':'other';
    const cat=payment?'Proveedores':kind==='cheque'?'Cheques en cartera':kind==='withholding'||kind==='other'?'Otros ingresos':'Cobranza clientes';
    const id=source+'-'+createHash('sha256').update(JSON.stringify([company,doc,f,account,i])).digest('hex').slice(0,24);
    rows.push({s:source,id,f,mes:f.slice(0,7),cat,imp:Math.round(imp*100)/100,c:'ARS',p,doc,account,company,operation,kind,originalCurrency,originalAmount,cheque:text(get('Cheque'))});
  }
  if(applications.length&&!rows.length)throw new Error(`El reporte contiene aplicaciones pero no medios de ${noun} OPT. Se conservaron los datos anteriores.`);
  const sum=list=>Math.round(list.reduce((total,r)=>total+r.imp,0)*100)/100;
  const summary={records:rows.length,applicationRecords:applications.length,total:sum(rows),withholdings:sum(rows.filter(r=>r.kind==='withholding')),cheques:sum(rows.filter(r=>r.kind==='cheque')),banks:sum(rows.filter(r=>r.kind==='bank'))};
  if(applications.length)warnings.push(`${applications.length} aplicación(es) a comprobantes conservada(s) como detalle, sin sumarlas nuevamente al ${payment?'pagado':'cobrado'}.`);
  if(inferredDates)warnings.push(`${inferredDates} fecha(s) de aplicación obtenida(s) de los movimientos de su orden de pago.`);
  warnings.push(`El total incluye todos los medios de ${noun} y retenciones. IMPORTE está expresado en moneda principal; no se aplica el tipo de cambio actual.`);
  return {rows,applications,summary,warnings,received:input.length,period:{from,to:snapshot}};
}
