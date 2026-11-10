# Cashflow Fisterra

Versión **1.0.5**, visible en el encabezado de la aplicación. Al publicar una nueva versión, actualizar la etiqueta `.app-version` de la plantilla y regenerar el HTML.

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

Las cargas de clientes, proveedores y demás fuentes también se guardan en ese navegador. Publicar en Vercel no las convierte en datos compartidos: otro navegador o computadora tiene su almacenamiento propio. No hay una base central de cargas ni inicio de sesión. Los fallos al guardar cargas se muestran en una alerta visible.

Las cuentas API como `Proveedores en Cta. Cte.` se muestran en la categoría **Proveedores**. Las cargas API anteriores con esa cuenta se reclasifican al abrir la versión 1.0.1, conservando documentos, fechas y escenarios.

### Conexión compartida entre computadoras (desarrollo sin login)

Para que un navegador nuevo pueda consultar clientes y proveedores sin volver a ingresar credenciales, configurar estas variables en **Vercel → proyecto CASHFLOWFisterra → Settings → Environment Variables**, para **Production**, y volver a desplegar:

| Variable | Valor |
| --- | --- |
| `FINNEGANS_CLIENT_ID` | Client_ID del usuario de integración |
| `FINNEGANS_CLIENT_SECRET` | Client_Secret / SECRET_KEY del mismo usuario |
| `FINNEGANS_CLI_FILTERS` | `{"empresa":"EMPRE01","cuenta":"DxVta","moneda":"PES"}` |
| `FINNEGANS_PRV_FILTERS` | `{"empresa":"EMPRE01","cuenta":"2.1.1/01/01","moneda":"PES"}` |

Los filtros de ejemplo corresponden a los códigos usados en la instalación actual; verificar que sean los deseados. El servidor exige empresa y cuenta para habilitar cada fuente y no permite ampliarlas desde el navegador. La fecha se calcula en el servidor con el día actual de Argentina. Se pueden agregar los otros filtros admitidos por el reporte dentro del JSON.

`GET /api/finnegans-config` informa si está habilitada la conexión y sus filtros; no devuelve credenciales ni tokens. **Probar conexión** valida las credenciales desde el servidor sin devolver el token. Cada consulta compartida obtiene un token nuevo desde Vercel y lo usa para consultar el reporte. No guardar las credenciales en GitHub ni en variables con prefijo público.

Con las variables configuradas, la app muestra **Conexión compartida con Finnegans** y carga automáticamente las fuentes habilitadas en navegadores sin cargas propias. Las credenciales locales existentes se conservan, pero no son necesarias para las fuentes compartidas. Sin esas variables, se mantiene el modo local anterior.

Esta modalidad no tiene login: cualquier persona con acceso a la URL puede consultar los reportes habilitados. Los datos se vuelven a obtener desde Finnegans; las cargas de Excel, exclusiones y reprogramaciones no se sincronizan entre computadoras. El botón local **Guardar credenciales** no modifica las variables de Vercel.

**Olvidar credenciales** elimina las credenciales y su clave local, vacía los campos y desconecta el token en memoria. **Desconectar** elimina solo el token, conservando las credenciales. Si el navegador bloquea el almacenamiento o se usa un contexto sin Web Crypto, la app informa que no pudo guardar y no recurre a texto plano.

Cada consulta de datos solicita un token nuevo con las credenciales recuperadas, aunque exista otro token vigente. El token recién obtenido se pasa a la función del reporte, que lo agrega como parámetro `ACCESS_TOKEN` a la URL de Finnegans. Cada consulta conserva su propio token, incluso cuando se consultan dos fuentes a la vez. Si falla la autenticación, no se consulta el reporte ni se reemplazan datos.

El último token se conserva únicamente en memoria de la página durante hasta una hora para mostrar el estado de conexión. Recargar, cerrar o seleccionar **Desconectar** lo elimina de la app; no revoca el token en Finnegans ni impide que la próxima consulta obtenga uno nuevo.

La autenticación requiere la versión desplegada en Vercel; abrir el HTML local mantiene las funciones de Excel, pero no ejecuta la función de servidor.

Cada tarjeta de fuente presenta **Subir Excel**, **Obtener por API** y **Quitar**. El botón API guía a completar las credenciales si faltan. **Quitar** se deshabilita cuando la fuente no tiene datos.

### Composición de saldos por API

Clientes y Proveedores consultan `composicionSaldoCliente` y `composicionSaldoProveedor`, respectivamente, a través de `api/finnegans-report.js`. Cheques propios y de terceros consultan `ApiSituacionCheques`, con `PARAMWEBREPORT_TipoCheque` fijo: `0` (Propio) y `1` (De tercero), respectivamente. Las otras fuentes todavía requieren configurar su integración.

### Cheques propios por API

La pastilla **Cheques propios → Parámetros de cheques propios** permite guardar Estado, Tercero, Circuito contable, Cuenta contable, Empresa/sucursal, Vencimiento desde/hasta y Mostrar solo no conciliados. No hay selector de tipo: el servidor siempre envía `TipoCheque=0`, aunque existiera otro valor guardado en el navegador o en Vercel. Los nombres de parámetros respetan las mayúsculas del endpoint: `FechaHasta`, `TipoCheque`, `Estado`, `Organizacion`, `CircuitoContable`, `CuentaContable`, `Empresa`, `FechaVencimientoDesde`, `FechaVencimientoHasta` y `MostrarSoloNoConciliados`, todos con prefijo `PARAMWEBREPORT_`.

`FechaHasta` siempre es hoy (Argentina); los límites de vencimiento son opcionales y persisten. No se fijan las fechas de 2020 del ejemplo. `MostrarSoloNoConciliados` se envía explícitamente como `false` por defecto, o `true` si se elige Sí. Seleccionar el estado y/o solo no conciliados que corresponda para evitar proyectar cheques ya pagados. Cada consulta obtiene un token nuevo y lo envía como `ACCESS_TOKEN`.

El adaptador reconoce fecha de vencimiento, tercero, número/documento, importe, moneda, estado, cuenta y banco. Reconoce los campos reales `IMPORTEMONTRANSACCION`, `FECHAVENCIMIENTO`, `FECHAEMISION`, `TERCERO` y `CONCILIADO`, verificados en la respuesta del 10/11/2026 con `TipoCheque=0`. Los importes se incorporan como egresos en **Cheques emitidos**, conservando su vencimiento. Los registros conciliados se conservan en la carga pero no generan flujo ni alertas pendientes. Si la respuesta usa campos no reconocidos, falla la carga completa y **Ver llamada y respuesta de Finnegans** permite revisar el JSON sin perder la carga anterior.

En modo compartido se habilita con `FINNEGANS_CHP_FILTERS`, por ejemplo `{"empresa":"EMPRE01","cuenta":"CODIGO_CUENTA_BANCARIA","mostrarSoloNoConciliados":"false"}`. La cuenta bancaria debe ser un código real de Finnegans; no usar el código de cuenta de proveedores. Admite también `estado`, `organizacion`, `circuitocontable`, `fechaVencimientoDesde` y `fechaVencimientoHasta` como cadenas. El tipo sigue siendo siempre `0`.

### Cheques de terceros por API

**Cheques de terceros → Obtener por API** usa el mismo endpoint de situación de cheques, con `PARAMWEBREPORT_TipoCheque=1` fijo en el servidor, sin selector. Tiene los mismos parámetros que Cheques propios, guardados de forma independiente: Estado, Tercero, Circuito, Cuenta contable, Empresa/sucursal, fechas de vencimiento desde/hasta y Mostrar solo no conciliados. `FechaHasta` siempre es hoy en Argentina y cada consulta obtiene un token nuevo.

Los importes son positivos, en su moneda original. Se conservan banco, cuenta, estado, conciliación y vencimiento. Se aplican las reglas existentes del flujo: **En Cartera** genera cobro; **Cheque Depositado** solo se proyecta si la cuenta es de valores a depositar y el vencimiento es desde el corte. Endosados, descontados, conciliados y otros estados sin disponibilidad no generan un nuevo ingreso. Los estados no reconocidos se conservan con advertencia y no se proyectan; la falta de estado o una fila inválida rechaza la importación completa.

En modo compartido se habilita con `FINNEGANS_CHT_FILTERS`, por ejemplo `{"empresa":"EMPRE01","cuenta":"CODIGO_VALORES_A_DEPOSITAR","mostrarSoloNoConciliados":"false"}`. Los filtros no se heredan de cheques propios. En esta fuente el tipo es siempre `1`, aunque existiera un valor distinto guardado.

1. Ingresar o recuperar las credenciales guardadas. Probar conexión es opcional.
2. En la tarjeta, abrir **Parámetros de composición de saldos** para agregar filtros. Se guardan automáticamente por fuente en este navegador y se recuperan al volver a abrir la app. Los filtros son códigos de Finnegans y, si están vacíos, se omiten. No se envían los textos de ejemplo de la documentación como valores.
3. Seleccionar **Obtener por API**. La app obtiene un token nuevo y luego consulta el reporte. Una respuesta válida y no vacía reemplaza los registros de esa fuente y borra sus reprogramaciones e incobrables, igual que una nueva carga de Excel.

Parámetros comunes: fecha, organización, circuito contable, cuenta, moneda y empresa. Proveedores agrega dimensión, valor de dimensión y tipo de documento. Los nombres y mayúsculas de los parámetros se conservan según los endpoints indicados.

La fecha del reporte es siempre el día de hoy en `America/Buenos_Aires`, es de solo lectura y se calcula nuevamente antes de cada consulta, después de obtener el token. No se guarda como parámetro reutilizable ni depende de la fecha de corte del flujo. Se actualiza al volver a la ventana y al cambiar el día. La fecha almacenada en los datos importados sigue indicando la fecha real de aquella consulta. Si todavía no hay filtros guardados, se recuperan los de la última carga API disponible; limpiar un filtro también persiste.

La llamada del navegador al servidor usa POST; el servidor realiza el GET requerido por Finnegans. El token no aparece en la URL del navegador ni se guarda con los filtros o datos. Los resultados permanecen en el navegador como las cargas de Excel.

El adaptador admite filas JSON directas o dentro de contenedores `data`, `rows`, `items`, `result`, `records`, entre otros. Reconoce los campos de composición `IMPORTEMONPPAL`, `IMPORTEMONTRAN` y sus equivalentes del Excel. En la API, `Fecha` es la fecha del comprobante y `FechaVto` la fecha de vencimiento; tienen prioridad sobre los alias del Excel. Las fechas admiten `AAAA-MM-DD`, `DD/MM/AAAA` y `DD-MM-AAAA` (formato observado en Finnegans), con validación del calendario. `Vencimiento` / `Venc.` se conserva como clasificación de texto, nunca como fecha. Mantiene signos e importe original USD. Si falta la fecha de vencimiento, solo la reconstruye con mora positiva respecto de la fecha del reporte o con una condición simple en días, informándolo al usuario.

Se rechazan respuestas con campos obligatorios faltantes, fechas/importes inválidos, monedas no soportadas, paginación pendiente o tamaño excesivo. Una respuesta vacía o fallida conserva la carga anterior. Las pruebas automatizadas usan datos y credenciales simulados; las verificaciones manuales con la instalación real se indican por integración.

Después de cada consulta, **Ver llamada y respuesta de Finnegans** muestra el GET del reporte, sus parámetros, el estado HTTP del proveedor y una vista de la respuesta original. También está disponible si falla la conversión a movimientos. El token se oculta, los campos de secretos se redactan y el cuerpo se limita a 32.768 caracteres. El detalle se mantiene solo en memoria, no en localStorage ni en logs; **Copiar detalle** copia la misma versión redactada.

## Notas

- La identidad visual usa el sistema de diseño de Fisterra: Montserrat, fondo gris, navy y titulares rojos. Los recursos se conservan en `app/brand/`.
- El generador incorpora los tokens, las fuentes y el logo en el HTML final. El logo conserva su geometría; se amplió su área SVG para evitar recortar el wordmark.

- Las reprogramaciones, exclusiones, incobrables y cargas de plantillas se guardan en el navegador de cada usuario.
- Próximo paso: reemplazar los Excel por consultas al datawarehouse de Finnegans.
