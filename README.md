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

En **Datos y fuentes**, ingresar `Client_ID` y `Client_Secret` (llamado `SECRET_KEY` en Finnegans). Ambos se muestran ocultos por defecto y tienen su propio botón **Mostrar / Ocultar**. **Probar conexión** permite comprobar las credenciales sin importar datos.

La función de Vercel intercambia las credenciales mediante POST a `https://api.finneg.com/api/oauth/token`, según el contrato de [Finnegans Developers](https://developers.finneg.com/). El secreto viaja en el encabezado `Authorization`, no en la URL. No se guarda en el proyecto, el servidor ni los logs de la aplicación.

Las credenciales se guardan automáticamente en el navegador y también mediante **Guardar credenciales**. Se cifran con AES-GCM en IndexedDB, con una clave local no exportable. Al volver a abrir el sitio se recuperan ambos campos; el secreto sigue oculto. Esta persistencia corresponde al navegador y al dominio utilizados: no se sincroniza entre dispositivos. El cifrado local no sustituye la seguridad del navegador y del equipo ni protege de código malicioso ejecutado dentro del mismo origen.

**Olvidar credenciales** elimina las credenciales y su clave local, vacía los campos y desconecta el token en memoria. **Desconectar** elimina solo el token, conservando las credenciales. Si el navegador bloquea el almacenamiento o se usa un contexto sin Web Crypto, la app informa que no pudo guardar y no recurre a texto plano.

Cada consulta de datos solicita un token nuevo con las credenciales recuperadas, aunque exista otro token vigente. El token recién obtenido se pasa a la función del reporte, que lo agrega como parámetro `ACCESS_TOKEN` a la URL de Finnegans. Cada consulta conserva su propio token, incluso cuando se consultan dos fuentes a la vez. Si falla la autenticación, no se consulta el reporte ni se reemplazan datos.

El último token se conserva únicamente en memoria de la página durante hasta una hora para mostrar el estado de conexión. Recargar, cerrar o seleccionar **Desconectar** lo elimina de la app; no revoca el token en Finnegans ni impide que la próxima consulta obtenga uno nuevo.

La autenticación requiere la versión desplegada en Vercel; abrir el HTML local mantiene las funciones de Excel, pero no ejecuta la función de servidor.

Cada tarjeta de fuente presenta **Subir Excel**, **Obtener por API** y **Quitar**. El botón API guía a completar las credenciales si faltan. **Quitar** se deshabilita cuando la fuente no tiene datos.

### Composición de saldos por API

Clientes y Proveedores consultan `composicionSaldoCliente` y `composicionSaldoProveedor`, respectivamente, a través de `api/finnegans-report.js`. Las otras fuentes todavía requieren configurar su integración.

1. Ingresar o recuperar las credenciales guardadas. Probar conexión es opcional.
2. En la tarjeta, abrir **Parámetros de composición de saldos** para agregar filtros. Se guardan automáticamente por fuente en este navegador y se recuperan al volver a abrir la app. Los filtros son códigos de Finnegans y, si están vacíos, se omiten. No se envían los textos de ejemplo de la documentación como valores.
3. Seleccionar **Obtener por API**. La app obtiene un token nuevo y luego consulta el reporte. Una respuesta válida y no vacía reemplaza los registros de esa fuente y borra sus reprogramaciones e incobrables, igual que una nueva carga de Excel.

Parámetros comunes: fecha, organización, circuito contable, cuenta, moneda y empresa. Proveedores agrega dimensión, valor de dimensión y tipo de documento. Los nombres y mayúsculas de los parámetros se conservan según los endpoints indicados.

La fecha del reporte es siempre el día de hoy en `America/Buenos_Aires`, es de solo lectura y se calcula nuevamente antes de cada consulta, después de obtener el token. No se guarda como parámetro reutilizable ni depende de la fecha de corte del flujo. Se actualiza al volver a la ventana y al cambiar el día. La fecha almacenada en los datos importados sigue indicando la fecha real de aquella consulta. Si todavía no hay filtros guardados, se recuperan los de la última carga API disponible; limpiar un filtro también persiste.

La llamada del navegador al servidor usa POST; el servidor realiza el GET requerido por Finnegans. El token no aparece en la URL del navegador ni se guarda con los filtros o datos. Los resultados permanecen en el navegador como las cargas de Excel.

El adaptador admite filas JSON directas o dentro de contenedores `data`, `rows`, `items`, `result`, `records`, entre otros. Reconoce los campos de composición `IMPORTEMONPPAL`, `IMPORTEMONTRAN`, `FECHAVTO` y sus equivalentes del Excel. Mantiene signos, importe original USD y vencimiento actual. Si falta el vencimiento, solo lo reconstruye con mora positiva respecto de la fecha del reporte o con una condición simple en días, informándolo al usuario.

Se rechazan respuestas con campos obligatorios faltantes, fechas/importes inválidos, monedas no soportadas, paginación pendiente o tamaño excesivo. Una respuesta vacía o fallida conserva la carga anterior. El mapeo debe validarse con la respuesta real de la instalación; no se han usado credenciales reales en las pruebas.

Después de cada consulta, **Ver llamada y respuesta de Finnegans** muestra el GET del reporte, sus parámetros, el estado HTTP del proveedor y una vista de la respuesta original. También está disponible si falla la conversión a movimientos. El token se oculta, los campos de secretos se redactan y el cuerpo se limita a 32.768 caracteres. El detalle se mantiene solo en memoria, no en localStorage ni en logs; **Copiar detalle** copia la misma versión redactada.

## Notas

- La identidad visual usa el sistema de diseño de Fisterra: Montserrat, fondo gris, navy y titulares rojos. Los recursos se conservan en `app/brand/`.
- El generador incorpora los tokens, las fuentes y el logo en el HTML final. El logo conserva su geometría; se amplió su área SVG para evitar recortar el wordmark.

- Las reprogramaciones, exclusiones, incobrables y cargas de plantillas se guardan en el navegador de cada usuario.
- Próximo paso: reemplazar los Excel por consultas al datawarehouse de Finnegans.
