# Cashflow Fisterra

Versión **1.0.22**, visible en el encabezado de la aplicación. Al publicar una nueva versión, actualizar la etiqueta `.app-version` de la plantilla y regenerar el HTML.

App web de flujo de fondos que proyecta cobros y pagos a partir de los saldos exportados de Finnegans: clientes, proveedores, cheques propios y de terceros. Se complementa con plantillas para préstamos, leasing, planes de pago ARCA y presupuesto.

La evolución hacia una instalación comercial independiente por cliente está detallada en [docs/plan-comercializacion.md](docs/plan-comercializacion.md). La versión actual sigue siendo de desarrollo: la clave compartida, el respaldo y el aislamiento operativo deben evolucionar antes de usarla con clientes externos.

El frontend se genera como un único HTML. Las consultas a Finnegans y, cuando se configura, el almacenamiento compartido usan funciones de servidor en Vercel. El archivo local conserva la carga Excel sin conexión API.

## Qué incluye

- **Resumen**: saldo, cobros y pagos a 30 días, atrasado neto, saldo mínimo proyectado, gráfico de ingresos, egresos y saldo, alertas de vencimientos e indicadores de capital de trabajo (capital de trabajo neto, brecha financiera, liquidez corriente e inmediata, DSO, DPO, brecha de plazos y solvencia).
- **Flujo de fondos**: por día, semana, mes o año. Los importes de tablas y calendario se muestran en pesos con dos decimales por defecto; el selector «Importes detallados» permite volver a millones y se recuerda en este navegador. En millones, los importes pequeños conservan la precisión suficiente para no aparecer como un guion. Cada fila se despliega por organización y por documento. Para facturas, el listado muestra el campo `Comprobante` de Finnegans; para cheques, el número de cheque. Cada documento tiene un tilde de selección. La acción general marca o desmarca como incobrables solo los cobros seleccionados. También permite excluir organizaciones y reprogramar fechas.
- **Vencimientos**: calendario mensual y agenda de 14 días contados desde la fecha real de hoy en Argentina. La etiqueta «Vencido» y el resaltado de días pasados usan esa fecha, independientemente de la fecha de corte elegida para el flujo. El detalle muestra el campo `Comprobante` en facturas y el número en cheques.
- **Ejecutado**: resultados de cobros y pagos realizados, totales, neto, cobertura, evolución mensual, análisis por categoría y registros de los reportes.
- **Presupuesto vs real**: comparación mensual por categoría.
- **Datos y fuentes**: carga de los Excel de Finnegans y de las plantillas.

## Cobros y pagos ejecutados

La fuente anterior **Ejecutado** se divide en **Cobros ejecutados** y **Pagos ejecutados**, con cargas, ejemplos y botones Quitar independientes. Ambas usan las columnas `Mes`, `Categoría`, `Importe`: cobros admite categorías de ingreso y pagos categorías de egreso. Los importes se normalizan como magnitudes positivas; la comparación aplica el signo según la categoría. Una categoría del tipo contrario rechaza la carga y conserva los datos anteriores.

Al abrir esta versión, los datos de Ejecutado ya guardados se separan automáticamente por categoría, conservando mes, importes y procedencia. La carga original se mantiene como respaldo de migración en el navegador. **Presupuesto vs real** combina ambas fuentes; si para un mes solo hay cobros o solo pagos cargados, indica **Ejecutado parcial** y muestra **Sin datos** en el tipo faltante, sin calcularle un desvío ficticio contra cero.

Cobros ejecutados dispone de la API `analisisCobranza` y Pagos ejecutados de `AnalisisOrdenPago`. Ambas fuentes se incluyen en **Actualizar APIs**, además de conservar su carga por plantilla Excel.

### Resultados y análisis

La solapa **Ejecutado** presenta las dos fuentes juntas y funciona sin cargar un presupuesto. También se accede desde **Ver resultados** en las pastillas de cobros y pagos. Permite elegir un mes o todos los meses cargados y conserva la selección al recargar.

Muestra cobros, pagos, neto y cobertura de pagos (cobros / pagos del mismo período), evolución mensual, desglose y participación por categoría, procedencia de las cargas y detalle de los registros originales de las plantillas. El análisis identifica la categoría de mayor importe y el cambio del neto entre meses consecutivos completos. Los pagos se muestran con signo negativo; el neto es cobros menos pagos.

Si falta una de las dos fuentes en algún mes seleccionado o sus fechas consultadas no coinciden, informa que los datos son parciales y no calcula un neto o cobertura que mezcle períodos distintos. Las APIs conservan el rango consultado: un mes cubierto por una consulta exitosa puede tener cero movimientos sin ser una carga faltante. Los importes cargados siguen visibles por tipo y por mes. La carga continúa en **Datos y fuentes**; **Presupuesto vs real** conserva su comparación independiente.

## Estructura

```
app/cashflow.src.html     Plantilla de la app (HTML + CSS + JS). Lleva el marcador /*DATA*/
scripts/normalize.py      Convierte los Excel de Finnegans en el JSON de movimientos
scripts/build.py          Inyecta el JSON en la plantilla y genera la app
scripts/build-deployment.cjs Genera cada instalación de Vercel desde el mismo código
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
- Vercel instala la dependencia PostgreSQL declarada en `package.json` y genera el HTML para cada instalación durante el despliegue.
- La ruta `/` sirve `dist/cashflow.html`.
- Vercel también publica la función Node.js `api/finnegans-token.js` para autenticar con Finnegans.

Los cambios enviados a `main` disparan el despliegue si está activa la integración con GitHub. El proyecto de Fisterra conserva la versión de ejemplo. Para una instalación nueva, crear otro proyecto de Vercel conectado al mismo repositorio y definir `CASHFLOW_INSTALLATION_NAME` con el nombre del cliente. El proceso de compilación genera esa publicación con la etiqueta del cliente y sin movimientos, saldos ni tipo de cambio de Fisterra. Cada proyecto debe tener su propia base PostgreSQL y `CASHFLOW_ACCESS_KEY`. Hasta completar ambas, las APIs de esa instalación responden con error y no exponen datos. Las credenciales y filtros de Finnegans se cargan después desde **Datos y fuentes**; los reportes son los mismos para todas las instalaciones.

Para regenerar el HTML local de Fisterra: `node scripts/build-deployment.cjs`. Para verificar una instalación nueva sin alterar ese archivo: definir `CASHFLOW_INSTALLATION_NAME=Nubiral` y ejecutar `node scripts/build-deployment.cjs tmp/nubiral.html`.

### Varias empresas y monedas

En **Datos y fuentes → Cotizaciones a pesos argentinos** se pueden guardar cotizaciones por moneda para cada instalación. USD conserva su campo superior y también aparece en esta sección; MXN, CLP, COP y cualquier código ISO de tres letras se pueden agregar. Una unidad de la moneda indicada equivale a los pesos argentinos ingresados. El reporte de Finnegans mantiene su importe original; la conversión se aplica al flujo proyectado y se actualiza al cambiar la cotización. Si un reporte trae una moneda sin cotización, la carga se detiene sin reemplazar los datos anteriores y se muestra qué cotización falta. Las fuentes de varias empresas pueden así coexistir en el mismo flujo sin convertir silenciosamente importes desconocidos. Si una organización aparece en más de una empresa, cada una se muestra por separado en el detalle del flujo.

### Persistencia compartida por instalación

Para compartir parámetros y datos entre navegadores, conectar **una base PostgreSQL propia de esta instalación** desde Vercel Storage. La integración Neon del proyecto actual creó `CASHFLOW_DATABASE_DATABASE_URL` para Production; el adaptador también admite `CASHFLOW_DATABASE_URL` o `DATABASE_URL` en otras instalaciones. Configurar además `CASHFLOW_ACCESS_KEY` como variable de proyecto con una clave distinta para cada cliente, de al menos 13 caracteres. Una clave aleatoria larga ofrece mayor protección. Ambas variables deben estar disponibles en Production y requieren un nuevo despliegue. No poner la clave en el repositorio ni compartir una base o clave entre clientes.

Con ambas variables presentes, la aplicación pide la clave al abrirse. La clave se conserva solo durante la sesión de esa pestaña; **Cerrar acceso en este navegador** la elimina. El servidor exige la misma clave para leer y guardar el estado y para usar las APIs de Finnegans. Si falta una de las dos variables, la instalación protegida no abre los datos. Sin ninguna de ellas, continúa el modo local de desarrollo.

En el primer acceso se puede **importar los datos de ese navegador** o **comenzar sin datos**. La segunda opción no carga los ejemplos del HTML. A partir de ahí se guardan centralmente saldo, fecha de corte, tipo de cambio, horizonte, filtros de reportes, cargas Excel, resultados API y cambios del escenario. El navegador deja de conservar una copia local sin cifrar del estado compartido. Una actualización fallida muestra un error y no reemplaza la última versión guardada; dos pestañas con versiones distintas no pueden sobrescribirse silenciosamente.

**Guardar datos** y **consultar Finnegans** son acciones distintas: los cambios que hace el usuario se guardan automáticamente, mientras que los reportes de Finnegans solo se vuelven a consultar al pulsar **Obtener por API** o **Actualizar APIs**. Abrir o recargar la página lee el último resultado guardado sin pedir un reporte nuevo.

Las pruebas automatizadas de esta modalidad están en `tests/workspace.test.cjs` y `tests/browser/workspace-persistence.cjs`. La base y la clave del despliegue actual están configuradas y la persistencia se verificó con dos sesiones contra Neon.

## Conexión API con Finnegans

### Actualizar todas las APIs

En **Datos y fuentes**, el botón **Actualizar APIs** consulta todos los orígenes habilitados desde una sola acción. En modo local actualiza Clientes, Proveedores, Cheques propios, Cheques de terceros, Cobros ejecutados y Pagos ejecutados, usando las credenciales y los parámetros guardados. En modo compartido consulta únicamente las fuentes habilitadas en Vercel.

Las consultas se ejecutan una a continuación de otra, con un token vigente y la fecha de hoy para cada origen. El token se renueva al vencer; las seis fuentes pueden reutilizar el mismo token durante la sesión, según la recomendación de Finnegans. La pantalla muestra progreso y el resultado individual: actualizado, sin registros o error. Un error de reporte no detiene las demás fuentes; si falla la autenticación, se detiene la tanda y se indican las fuentes no consultadas. Las consultas vacías o fallidas conservan los datos anteriores, y los orígenes disponibles solo por Excel no se modifican. Se bloquean ejecuciones duplicadas y cambios de las cargas durante la actualización.

La prueba de navegador `tests/browser/update-apis.cjs` verifica esta acción con respuestas simuladas, incluidos fallos parciales, resultados vacíos y configuración compartida. Requiere Playwright y Microsoft Edge; `PLAYWRIGHT_MODULE` permite indicar la ruta de instalación de Playwright.

### Credenciales y conexión

En **Datos y fuentes**, ingresar `Client_ID` y `Client_Secret` (llamado `SECRET_KEY` en Finnegans). Ambos se muestran ocultos por defecto y tienen su propio botón **Mostrar / Ocultar**. **Probar conexión** permite comprobar las credenciales sin importar datos.

La función de Vercel intercambia las credenciales mediante POST a `https://api.finneg.com/api/oauth/token`, según el contrato de [Finnegans Developers](https://developers.finneg.com/). El secreto viaja en el encabezado `Authorization`, no en la URL. No se guarda en el proyecto, el servidor ni los logs de la aplicación.

Las credenciales se guardan automáticamente en el navegador y también mediante **Guardar credenciales**. Se cifran con AES-GCM en IndexedDB, con una clave local no exportable. En modo compartido también se cifran con AES-GCM y una clave derivada de la clave de acceso de la instalación; solo el texto cifrado se guarda en PostgreSQL y puede recuperarse en otro navegador al ingresar la clave. El token se genera nuevamente en cada consulta. Tras cambiar la clave de instalación, abrir primero un navegador que tenga las credenciales guardadas localmente permite volver a cifrarlas con la nueva clave; en otro caso hay que ingresarlas de nuevo. El cifrado no protege de código malicioso ejecutado dentro del mismo origen ni sustituye la protección del equipo y la clave.

En modo local, las cargas también se guardan en ese navegador y no se sincronizan. En modo compartido se guardan en PostgreSQL detrás de la clave de instalación. La clave es provisoria: no identifica a usuarios individuales ni permite atribuir cambios a una persona.

Las cuentas API como `Proveedores en Cta. Cte.` se muestran en la categoría **Proveedores**. Las cargas API anteriores con esa cuenta se reclasifican al abrir la versión 1.0.1, conservando documentos, fechas y escenarios.

### Conexión compartida entre computadoras (desarrollo sin login)

Para que un navegador nuevo pueda consultar clientes y proveedores sin volver a ingresar credenciales, configurar estas variables en **Vercel → proyecto CASHFLOWFisterra → Settings → Environment Variables**, para **Production**, y volver a desplegar:

| Variable | Valor |
| --- | --- |
| `FINNEGANS_CLIENT_ID` | Client_ID del usuario de integración |
| `FINNEGANS_CLIENT_SECRET` | Client_Secret / SECRET_KEY del mismo usuario |
| `FINNEGANS_CLI_FILTERS` | `{"empresa":"EMPRE01","cuenta":"DxVta","moneda":"PES"}` |
| `FINNEGANS_PRV_FILTERS` | `{"empresa":"EMPRE01","cuenta":"2.1.1/01/01","moneda":"PES"}` |
| `FINNEGANS_EJC_FILTERS` | `{"empresa":"EMPRE01","detallarAplicacion":"true"}` |
| `FINNEGANS_EJP_FILTERS` | `{"empresa":"EMPRE01","fechaDesde":"2026-10-01","detallarAplicacion":"true"}` |

Los filtros de ejemplo corresponden a los códigos usados en la instalación actual; verificar que sean los deseados. El servidor exige empresa y cuenta para saldos/cheques; cobranza y pagos exigen empresa y no tienen filtro de cuenta. No permite ampliar estos filtros desde el navegador. La fecha hasta se calcula en el servidor con el día actual de Argentina. Se pueden agregar los otros filtros admitidos por el reporte dentro del JSON.

`GET /api/finnegans-config` informa si está habilitada la conexión y sus filtros; no devuelve credenciales ni tokens. **Probar conexión** valida las credenciales desde el servidor sin devolver el token. Cada consulta compartida obtiene un token nuevo desde Vercel y lo usa para consultar el reporte. No guardar las credenciales en GitHub ni en variables con prefijo público.

Con las variables configuradas, la app muestra **Conexión compartida con Finnegans**. Las credenciales locales existentes se conservan, pero no son necesarias para las fuentes compartidas. Los reportes se consultan únicamente cuando el usuario pulsa el botón correspondiente. Sin esas variables, se mantiene la conexión local anterior.

La conexión compartida solo debe activarse junto con `DATABASE_URL` y `CASHFLOW_ACCESS_KEY`. Sin la clave de instalación, el modo de desarrollo anterior deja sus reportes accesibles para quien conozca la URL. El botón local **Guardar credenciales** no modifica las variables de Vercel.

**Olvidar credenciales** elimina las credenciales locales y, en modo compartido, marca como eliminada la copia central; vacía los campos y desconecta el token en memoria. **Desconectar** elimina solo el token. Si el navegador bloquea el almacenamiento o se usa un contexto sin Web Crypto, la app informa que no pudo guardar y no recurre a texto plano.

Cada consulta de datos usa un token vigente con las credenciales recuperadas. La app solicita uno nuevo si no tiene token o si falta menos de un minuto para su vencimiento; el token se pasa a la función del reporte, que lo agrega como parámetro `ACCESS_TOKEN` a la URL de Finnegans. **Probar conexión** solicita un token nuevo. Si falla la autenticación, no se consulta el reporte ni se reemplazan datos. El servidor reintenta una vez los errores HTTP 5xx de autenticación y muestra el código HTTP, sin revelar la respuesta ni las credenciales. La app no vuelve a guardar credenciales idénticas por cada consulta.

El último token se conserva únicamente en memoria de la página durante hasta una hora para mostrar el estado de conexión. Recargar, cerrar o seleccionar **Desconectar** lo elimina de la app; no revoca el token en Finnegans ni impide que la próxima consulta obtenga uno nuevo.

La autenticación requiere la versión desplegada en Vercel; abrir el HTML local mantiene las funciones de Excel, pero no ejecuta la función de servidor.

Cada tarjeta de fuente presenta **Subir Excel**, **Obtener por API** y **Quitar**. El botón API guía a completar las credenciales si faltan. **Quitar** se deshabilita cuando la fuente no tiene datos.

### Composición de saldos por API

Clientes y Proveedores consultan `composicionSaldoCliente` y `composicionSaldoProveedor`, respectivamente, a través de `api/finnegans-report.js`. Cheques propios y de terceros consultan `ApiSituacionCheques`, con `PARAMWEBREPORT_TipoCheque` fijo: `0` (Propio) y `1` (De tercero), respectivamente. Las otras fuentes todavía requieren configurar su integración.

### Cheques propios por API

La pastilla **Cheques propios → Parámetros de cheques propios** permite guardar Estado, Tercero, Circuito contable, Cuenta contable, Empresa/sucursal, Vencimiento desde/hasta y Mostrar solo no conciliados. No hay selector de tipo: el servidor siempre envía `TipoCheque=0`, aunque existiera otro valor guardado en el navegador o en Vercel. Los nombres de parámetros respetan las mayúsculas del endpoint: `FechaHasta`, `TipoCheque`, `Estado`, `Organizacion`, `CircuitoContable`, `CuentaContable`, `Empresa`, `FechaVencimientoDesde`, `FechaVencimientoHasta` y `MostrarSoloNoConciliados`, todos con prefijo `PARAMWEBREPORT_`.

`FechaHasta` siempre es hoy (Argentina); los límites de vencimiento son opcionales y persisten. No se fijan las fechas de 2020 del ejemplo. `MostrarSoloNoConciliados` se envía explícitamente como `false` por defecto, o `true` si se elige Sí. Seleccionar el estado y/o solo no conciliados que corresponda para evitar proyectar cheques ya pagados. Cada consulta usa un token vigente y lo envía como `ACCESS_TOKEN`.

El adaptador reconoce fecha de vencimiento, tercero, número/documento, importe, moneda, estado, cuenta y banco. Reconoce los campos reales `IMPORTEMONTRANSACCION`, `FECHAVENCIMIENTO`, `FECHAEMISION`, `TERCERO` y `CONCILIADO`, verificados en la respuesta del 10/11/2026 con `TipoCheque=0`. Los importes se incorporan como egresos en **Cheques emitidos**, conservando su vencimiento. Los registros conciliados se conservan en la carga pero no generan flujo ni alertas pendientes. Si la respuesta usa campos no reconocidos, falla la carga completa y **Ver llamada y respuesta de Finnegans** permite revisar el JSON sin perder la carga anterior.

En modo compartido se habilita con `FINNEGANS_CHP_FILTERS`, por ejemplo `{"empresa":"EMPRE01","cuenta":"CODIGO_CUENTA_BANCARIA","mostrarSoloNoConciliados":"false"}`. La cuenta bancaria debe ser un código real de Finnegans; no usar el código de cuenta de proveedores. Admite también `estado`, `organizacion`, `circuitocontable`, `fechaVencimientoDesde` y `fechaVencimientoHasta` como cadenas. El tipo sigue siendo siempre `0`.

### Cheques de terceros por API

**Cheques de terceros → Obtener por API** usa el mismo endpoint de situación de cheques, con `PARAMWEBREPORT_TipoCheque=1` fijo en el servidor, sin selector. Tiene los mismos parámetros que Cheques propios, guardados de forma independiente: Estado, Tercero, Circuito, Cuenta contable, Empresa/sucursal, fechas de vencimiento desde/hasta y Mostrar solo no conciliados. `FechaHasta` siempre es hoy en Argentina y cada consulta usa un token vigente.

Los importes son positivos, en su moneda original. Se conservan banco, cuenta, estado, conciliación y vencimiento. Se aplican las reglas existentes del flujo: **En Cartera** genera cobro; **Cheque Depositado** solo se proyecta si la cuenta es de valores a depositar y el vencimiento es desde el corte. Endosados, descontados, conciliados y otros estados sin disponibilidad no generan un nuevo ingreso. Los estados no reconocidos se conservan con advertencia y no se proyectan; la falta de estado o una fila inválida rechaza la importación completa.

En modo compartido se habilita con `FINNEGANS_CHT_FILTERS`, por ejemplo `{"empresa":"EMPRE01","cuenta":"CODIGO_VALORES_A_DEPOSITAR","mostrarSoloNoConciliados":"false"}`. Los filtros no se heredan de cheques propios. En esta fuente el tipo es siempre `1`, aunque existiera un valor distinto guardado.

### Cobros ejecutados por API

La pastilla **Cobros ejecutados → Obtener por API** consulta `analisisCobranza`. Parámetros con prefijo `PARAMWEBREPORT_`: `FechaDesde`, `FechaHasta`, `TransaccionSubtipoID`, `CircuitoContable`, `DetallarAplicacion`, `Cliente`, `Empresa`. Los filtros vacíos se omiten; por defecto FechaDesde es el inicio del mes actual y DetallarAplicacion es `true`. Los filtros persisten; FechaHasta siempre es hoy en Argentina y cada consulta usa un token vigente. La carga reemplaza los cobros del período anterior consultado en esta fuente; no modifica pagos ni otras fuentes.

La respuesta real contiene medios de cobro `TIPOOP=OPT` y aplicaciones a facturas `TIPOOP=APL`. El total se obtiene sumando **IMPORTE de las filas OPT**, incluidos bancos, cheques y retenciones según lo solicitado. Las APL se conservan como detalle y no vuelven a sumarse. Se usa **FECHACOBRANZA** para el día y mes del ejecutado: FECHA puede ser la fecha de una factura anterior. IMPORTE es el valor en moneda principal; el tipo de cambio actual de la pantalla no revaloriza lo ejecutado.

En **Ejecutado** se muestran cuentas/medios, cliente, comprobante, fecha de cobranza y detalle de aplicaciones. Las retenciones se agrupan en Otros ingresos y los cheques en Cheques en cartera, conservando siempre su cuenta original. El total de cobranza incluye las retenciones y cheques recibidos, no solo los movimientos bancarios.

La consulta real de noviembre de 2026 se reconcilió sumando los medios de cobro por cuenta y comprobando que las aplicaciones no duplican el total. Los importes y datos reales de auditoría quedan en `data/private/`, fuera de Git; las pruebas publicadas usan datos simulados.

En modo compartido, `FINNEGANS_EJC_FILTERS` admite `empresa`, `fechaDesde`, `transaccionSubtipoID`, `circuitocontable`, `detallarAplicacion` y `cliente`. Sin fechaDesde, el servidor usa el inicio del mes actual. No incluye tokens ni credenciales en el navegador.

### Pagos ejecutados por API

La pastilla **Pagos ejecutados → Obtener por API** consulta `AnalisisOrdenPago` (respetando mayúsculas). Parámetros con prefijo `PARAMWEBREPORT_`: `FechaDesde`, `FechaHasta`, `TransaccionSubtipoID`, `CircuitoContable`, `DetallarAplicacion`, `Proveedor`, `Empresa`. Los filtros persisten por separado de cobranza. La fecha hasta es siempre hoy en Argentina, la fecha desde es editable y cada consulta usa un token vigente. DetallarAplicacion es `true` por defecto.

El total suma **IMPORTE de las filas OPT**, incluidos todos los medios y retenciones registrados. Las APL se conservan como detalle sin volver a sumarse. Para movimientos OPT se usa **FECHA** (o FechaPago si estuviera disponible); no se exige FECHACOBRANZA, que puede estar vacío en este reporte. En aplicaciones sin fecha explícita se vincula Empresa + Documento a los movimientos de su propia orden de pago. Solo se utiliza una fecha inequívoca de pago; nunca se usa la fecha de la factura aplicada. Fechas inválidas, fuera de rango o ambiguas rechazan la importación sin reemplazar la carga anterior.

Los importes quedan como magnitudes del pagado en moneda principal (se conservan los signos de reversas); la vista los muestra como egresos. No se revalorizan con el tipo de cambio actual. Se agrupan en Proveedores, con detalle de la cuenta y medio originales para bancos, caja, retenciones y otras formas de cancelación. La solapa **Ejecutado** incluye cuentas de pago y aplicaciones identificadas como Pago o Cobro.

En modo compartido se habilita con `FINNEGANS_EJP_FILTERS`, que admite `empresa`, `fechaDesde`, `transaccionSubtipoID`, `circuitocontable`, `detallarAplicacion` y `proveedor`. Solo requiere empresa como filtro de alcance; no requiere cuenta. Los datos reales de conciliación quedan fuera de Git, en `data/private/`.

1. Ingresar o recuperar las credenciales guardadas. Probar conexión es opcional.
2. En la tarjeta, abrir **Parámetros de composición de saldos** para agregar filtros. Se guardan automáticamente por fuente en este navegador y se recuperan al volver a abrir la app. Los filtros son códigos de Finnegans y, si están vacíos, se omiten. No se envían los textos de ejemplo de la documentación como valores.
3. Seleccionar **Obtener por API**. La app usa un token vigente o solicita uno nuevo si hace falta y luego consulta el reporte. Una respuesta válida y no vacía reemplaza los registros de esa fuente y borra sus reprogramaciones e incobrables, igual que una nueva carga de Excel.

Parámetros comunes: fecha, organización, circuito contable, cuenta, moneda y empresa. Proveedores agrega dimensión, valor de dimensión y tipo de documento. Los nombres y mayúsculas de los parámetros se conservan según los endpoints indicados.

La fecha del reporte es siempre el día de hoy en `America/Buenos_Aires`, es de solo lectura y se calcula nuevamente antes de cada consulta, después de obtener el token. No se guarda como parámetro reutilizable ni depende de la fecha de corte del flujo. Se actualiza al volver a la ventana y al cambiar el día. La fecha almacenada en los datos importados sigue indicando la fecha real de aquella consulta. Si todavía no hay filtros guardados, se recuperan los de la última carga API disponible; limpiar un filtro también persiste.

La llamada del navegador al servidor usa POST; el servidor realiza el GET requerido por Finnegans. El token no aparece en la URL del navegador ni se guarda con los filtros o datos. Los resultados se guardan en PostgreSQL cuando está habilitada la persistencia compartida; de lo contrario, permanecen en el navegador como las cargas de Excel.

El adaptador admite filas JSON directas o dentro de contenedores `data`, `rows`, `items`, `result`, `records`, entre otros. Reconoce los campos de composición `IMPORTEMONPPAL`, `IMPORTEMONTRAN` y sus equivalentes del Excel. En la API, `Fecha` es la fecha del comprobante y `FechaVto` la fecha de vencimiento; tienen prioridad sobre los alias del Excel. Las fechas admiten `AAAA-MM-DD`, `DD/MM/AAAA` y `DD-MM-AAAA` (formato observado en Finnegans), con validación del calendario. `Vencimiento` / `Venc.` se conserva como clasificación de texto, nunca como fecha. Mantiene signos e importe original USD. Si falta la fecha de vencimiento, solo la reconstruye con mora positiva respecto de la fecha del reporte o con una condición simple en días, informándolo al usuario.

Se rechazan respuestas con campos obligatorios faltantes, fechas/importes inválidos, monedas no soportadas, paginación pendiente o tamaño excesivo. Una respuesta vacía o fallida conserva la carga anterior. Las pruebas automatizadas usan datos y credenciales simulados; las verificaciones manuales con la instalación real se indican por integración.

Después de cada consulta, **Ver llamada y respuesta de Finnegans** muestra el GET del reporte, sus parámetros, el estado HTTP del proveedor y una vista de la respuesta original. También está disponible si falla la conversión a movimientos. El token se oculta, los campos de secretos se redactan y el cuerpo se limita a 32.768 caracteres. El detalle se mantiene solo en memoria, no en localStorage ni en logs; **Copiar detalle** copia la misma versión redactada.

## Notas

- La identidad visual usa el sistema de diseño de Fisterra: Montserrat, fondo gris, navy y titulares rojos. Los recursos se conservan en `app/brand/`.
- El generador incorpora los tokens, las fuentes y el logo en el HTML final. El logo conserva su geometría; se amplió su área SVG para evitar recortar el wordmark.

- Las reprogramaciones, exclusiones, incobrables y cargas de plantillas se guardan centralmente cuando la instalación tiene PostgreSQL y clave de acceso; en modo local permanecen en el navegador.
- Próximo paso: reemplazar los Excel por consultas al datawarehouse de Finnegans.
