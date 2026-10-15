"""Arma la app (un único HTML) inyectando el JSON de datos en la plantilla.

Uso:
  python scripts/build.py <datos.json> <salida.html>
"""
import base64, json, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'app' / 'cashflow.src.html').read_text(encoding='utf-8')
data = json.load(open(sys.argv[1], encoding='utf-8'))
# Keep the delivered HTML portable, including the Fisterra fonts and logo.
src = src.replace('@import url("brand/tokens/fisterra.tokens.css");',
                  (root / 'app/brand/tokens/fisterra.tokens.css').read_text(encoding='utf-8'))
for name in ['Montserrat-Variable-400-700.woff2', 'Montserrat-Variable-Italic.woff2']:
    font = base64.b64encode((root / 'app/brand/fonts' / name).read_bytes()).decode('ascii')
    src = src.replace(f'brand/fonts/{name}', f'data:font/woff2;base64,{font}')
src = src.replace('<!--FISTERRA_LOGO-->',
                  (root / 'app/brand/logo/fisterra-lockup-horizontal.svg').read_text(encoding='utf-8'))
out = pathlib.Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(src.replace('/*DATA*/', json.dumps(data, ensure_ascii=False, separators=(',', ':'))), encoding='utf-8')
print(f'App generada en {out}')
