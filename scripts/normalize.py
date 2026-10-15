"""Normaliza los listados exportados de Finnegans a movimientos de caja.

Uso:
  python scripts/normalize.py <carpeta_con_excel> <fecha_corte AAAA-MM-DD> <salida.json>

La carpeta debe tener 4 archivos cuyo nombre contenga:
  Cheques_propios, Cheques_Terceros, Clientes, Proveedores
"""
import pandas as pd, json, re, sys, glob, os
U, REFS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
REF=pd.Timestamp(REFS)
def f(pat):
    m=[p for p in glob.glob(os.path.join(U,'*.xls*')) if pat.lower() in os.path.basename(p).lower()]
    if not m: sys.exit(f'No se encontró el archivo de {pat} en {U}')
    return pd.read_excel(m[0])
cp=f('Cheques_propios');ct=f('Cheques_Terceros');cl=f('Clientes');pv=f('Proveedores')
M=[]
def d(x): return pd.Timestamp(x).strftime('%Y-%m-%d')
def title(s): return str(s).strip()
for _,r in cl.iterrows():
    mora=int(r['Días de mora'] or 0)
    if mora>0: due=REF-pd.Timedelta(days=mora)
    else:
        m=re.search(r'\d+',str(r.Condicionpago)); due=r['Fecha comprobante']+pd.Timedelta(days=int(m.group()) if m else 30)
    M.append(dict(s='CLI',f=d(due),m=round(float(r['Importe ppal']),2),c='ARS',p=title(r.Cliente),doc=r.Documento,cat='Cobranza clientes',fc=d(r['Fecha comprobante']),x=str(r.Condicionpago),e='Vencido' if mora>0 else 'A vencer'))
cat={'PROVEEDORES':'Proveedores','LEASING':'Leasing','Fondo Fijo':'Fondo fijo','SOCIO CORREA JAVIER CTA RETIRO':'Retiros de socios'}
for _,r in pv.iterrows():
    usd=r.Moneda=='Dólares' and r['Importe tran']!=0
    amt=float(r['Importe tran']) if usd else float(r['Importe ppal'])
    if amt==0: continue
    fa=r['Fecha de vencimiento actual'];fv=fa if fa>=REF else r['Fecha vto']
    M.append(dict(s='PRV',f=d(fv),fc=d(r['Fecha comprobante']),m=round(amt,2),c='USD' if usd else 'ARS',p=title(r.Proveedor),doc=r.Documento,cat=cat.get(r.Cuenta,'Otras deudas'),x=str(r.Condicionpago) if pd.notna(r.Condicionpago) else '',e=r['Venc.']))
for _,r in cp.iterrows():
    M.append(dict(s='CHP',f=d(r['Fecha de vto.']),m=-round(float(r['Imp. moneda trans.']),2),c='ARS',p=title(r.Razonsocial),doc=f"Ch {r['Número']} · {r.Documento}",cat='Cheques emitidos',x='Galicia' if 'GALICIA' in r.Cuenta else 'ICBC',e=r.Estado))
CT=[]
for _,r in ct.iterrows():
    due=pd.Timestamp(r['Fecha de vto.']); est=r.Estado
    flujo = est=='En Cartera' or (est=='Cheque Depositado' and r.Cuenta=='VALORES A DEPOSITAR' and due>=REF)
    row=dict(s='CHT',f=d(due),m=round(float(r['Imp. moneda trans.']),2),c='ARS',p=title(r.Razonsocial),doc=f"Ch {r['Número']} · {title(r.Banco)}",cat='Cheques en cartera' if est=='En Cartera' else 'Cheques depositados',x=r.Cuenta.title(),e=est)
    CT.append(row)
    if flujo: M.append(row)
d2=pv[(pv.Moneda=='Dólares')&(pv['Importe tran']!=0)]
tc=float((d2.Importecotfechavendedor/d2['Importe tran']).replace([float('inf')],None).dropna().loc[lambda s:s>100].median())
json.dump(dict(ref=d(REF),tc=round(tc,2),mov=M,cartera=CT),open(OUT,'w'),ensure_ascii=False,separators=(',',':'))
print(f'{len(M)} movimientos · TC {tc} · guardado en {OUT}')
