'use strict';

const {createHash} = require('node:crypto');
const REPORTS = {
  CLI: {name:'composicionSaldoCliente', fields:['organizacion','circuitocontable','cuenta','moneda','empresa']},
  PRV: {name:'composicionSaldoProveedor', fields:['organizacion','circuitocontable','cuenta','dimension','valor','moneda','empresa','tipoDocumento']},
};
const PARAMS = {organizacion:'organizacion',circuitocontable:'circuitocontable',cuenta:'cuenta',dimension:'dimension',valor:'valor',moneda:'moneda',empresa:'Empresa',tipoDocumento:'TipoDocumento'};
const key = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
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
  const report=REPORTS[source];
  if (!report) throw new Error('La fuente solicitada no tiene una API de composición de saldos.');
  if (!filters||!date(filters.fecha)) throw new Error('Ingresá una fecha de consulta válida.');
  const url=new URL('https://api.finneg.com/api/reports/'+report.name);
  url.searchParams.set('ACCESS_TOKEN',token);
  url.searchParams.set('PARAMWEBREPORT_fecha',filters.fecha);
  for (const field of report.fields) {
    const value=filters[field];
    if (value==null||value==='') continue;
    if (typeof value!=='string'||value.length>256||/[\r\n]/.test(value)) throw new Error('Uno de los filtros no es válido.');
    if (value.trim()) url.searchParams.set('PARAMWEBREPORT_'+PARAMS[field],value.trim());
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
function normalizeReport(source,payload,snapshot) {
  if (!REPORTS[source]||!date(snapshot)) throw new Error('La fuente o fecha del reporte no es válida.');
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
    if (!p||!doc) fail('falta identificar la organización o el comprobante');
    const principalRaw=get('IMPORTEMONPPAL','Importe ppal','ImporteMonedaPrincipal','ImportePrincipal');
    const originalRaw=get('IMPORTEMONTRAN','IMPORTEMONTRANS','Importe tran','ImporteMonedaTransaccion');
    const principal=number(principalRaw),original=number(originalRaw);
    if((principalRaw!==null&&principal===null)||(originalRaw!==null&&original===null))fail('el importe no es numérico');
    const moneda=key(get('Moneda','MonedaNombre','MonedaCodigo')||'ARS');
    let c,m;
    if (['usd','dolar','dolares','dolareeuu','dolaresestadounidenses','dolaresamericanos','dolarusa','uss'].includes(moneda)) {
      if (original===null) fail('falta el importe original en USD');
      if(original===0&&principal!==null&&principal!==0){c='ARS';m=principal;residual++}
      else {c='USD';m=original}
    } else if (['ars','peso','pesos','pesoargentino','pesosargentinos'].includes(moneda)) {
      c='ARS';m=principal??original;
    } else fail('la moneda no está soportada por el flujo en ARS/USD');
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
      const k=key(account);cat=k==='proveedores'?'Proveedores':k.includes('leasing')?'Leasing':k.includes('fondofijo')?'Fondo fijo':k.includes('socio')?'Retiros de socios':'Otras deudas';
    }
    const company=text(get('Empresa','EmpresaNombre','EmpresaCodigo'));
    const id=source+'-'+createHash('sha256').update(JSON.stringify([company,account,doc,f,i])).digest('hex').slice(0,24);
    rows.push({s:source,id,f,fc,m:Math.round(m*100)/100,c,p,doc,cat,x:terms,e:text(get('Vencimiento','Venc','Estado')),company,account});
  }
  if(inferred)warnings.push(`${inferred} vencimiento(s) calculado(s) con la fecha del reporte y la mora o condición de pago.`);
  if(zero)warnings.push(`${zero} fila(s) con saldo cero excluida(s).`);
  if(residual)warnings.push(`${residual} saldo(s) residual(es) en moneda principal: importe original USD igual a cero.`);
  return {rows,warnings,received:input.length};
}
module.exports={REPORTS,reportUrl,normalizeReport};
