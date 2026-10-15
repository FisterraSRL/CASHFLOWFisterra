# Cashflow Fisterra

App web de flujo de fondos que proyecta cobros y pagos a partir de los saldos exportados de Finnegans: clientes, proveedores, cheques propios y de terceros. Se complementa con plantillas para préstamos, leasing, planes de pago ARCA y presupuesto.

La app es un único archivo HTML, sin servidor: se abre en cualquier navegador.

## Qué incluye

- **Resumen**: saldo, cobros y pagos a 30 días, atrasado neto, saldo mínimo proyectado, gráfico de ingresos, egresos y saldo, alertas de vencimientos e indicadores de capital de trabajo (capital de trabajo neto, brecha financiera, liquidez corriente e inmediata, DSO, DPO, brecha de plazos y solvencia).
- **Flujo de fondos**: por día, semana, mes o año. Cada fila se despliega por organización y por documento. Permite excluir organizaciones, reprogramar la fecha de cualquier ítem y marcar cobros como incobrables.
- **Vencimientos**: calendario mensual y agenda de 14 días.
- **Presupuesto vs real**: comparación mensual por categoría.
- **Datos y fuentes**: carga de los Excel de Finnegans y de las plantillas.

## Estructura

```
app/cashflow.src.html     Plantilla de la app (HTML + CSS + JS). Lleva el marcador /*DATA*/
scripts/normalize.py      Convierte los Excel de Finnegans en el JSON de movimientos
scripts/build.py          Inyecta el JSON en la plantilla y genera la app
data/sample/data.json     Datos de demostración con clientes y proveedores anonimizados
dist/cashflow.html        App lista para abrir, con los datos de demostración
docs/                     Presentación comercial
```

## Cómo generar la app con datos reales

Requisitos: Python 3.10 o superior con `pandas` y `openpyxl`.

```bash
pip install pandas openpyxl
# 1. Copiar los 4 Excel exportados de Finnegans en data/private/
#    (Cheques_propios, Cheques_Terceros, Clientes, Proveedores)
python scripts/normalize.py data/private 2026-10-13 data/private/data.json
# 2. Generar la app
python scripts/build.py data/private/data.json dist/cashflow-private.html
```

`data/private/` y los archivos `*private*` de `dist/` están en `.gitignore`, para que los datos de clientes no se suban al repositorio.

## Publicación en Vercel

El repositorio incluye `vercel.json` para servir la app como sitio estático:

- Carpeta raíz del proyecto: la raíz del repositorio.
- Carpeta publicada: `dist`.
- Sin instalación de dependencias ni compilación del frontend: el HTML generado ya está versionado.
- La ruta `/` sirve `dist/cashflow.html`.
- Vercel también publica la función Node.js `api/finnegans-token.js` para autenticar con Finnegans.

Los cambios enviados a `main` disparan el despliegue si está activa la integración con GitHub. Después de editar la plantilla, regenerar `dist/cashflow.html` con `scripts/build.py` antes de subirla.

## Conexión API con Finnegans

En **Datos y fuentes**, ingresar `Client_ID` y `Client_Secret` (llamado `SECRET_KEY` en Finnegans) y seleccionar **Obtener token**.

La función de Vercel intercambia las credenciales mediante POST a `https://api.finneg.com/api/oauth/token`, según el contrato de [Finnegans Developers](https://developers.finneg.com/). El secreto viaja en el encabezado `Authorization`, no en la URL. No se guarda en el proyecto, el navegador ni los logs de la aplicación.

El token se conserva únicamente en memoria de la página durante hasta una hora. Recargar, cerrar o seleccionar **Desconectar** lo elimina de la app; no revoca el token en Finnegans. **Renovar token** requiere ingresar nuevamente el secreto. Esta etapa habilita autenticación; todavía no importa datasets desde APIs ni reemplaza las cargas de Excel.

La autenticación requiere la versión desplegada en Vercel; abrir el HTML local mantiene las funciones de Excel, pero no ejecuta la función de servidor.

## Notas

- La identidad visual usa el sistema de diseño de Fisterra: Montserrat, fondo gris, navy y titulares rojos. Los recursos se conservan en `app/brand/`.
- El generador incorpora los tokens, las fuentes y el logo en el HTML final. El logo conserva su geometría; se amplió su área SVG para evitar recortar el wordmark.

- Las reprogramaciones, exclusiones, incobrables y cargas de plantillas se guardan en el navegador de cada usuario.
- Próximo paso: reemplazar los Excel por consultas al datawarehouse de Finnegans.
