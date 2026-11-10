# Plan de comercialización · Cashflow

Decisión de producto: **una instalación independiente por cliente**. Cada cliente tendrá su propio despliegue, configuración de Finnegans, almacenamiento y dirección web. El código fuente y las versiones de la aplicación serán comunes.

## Estado actual (v1.0.10)

El cálculo del flujo, las cargas Excel y las seis consultas a Finnegans funcionan. La aplicación es un HTML generado con datos de demostración y funciones de Vercel para obtener el token y consultar reportes.

| Tema | Implementación actual | Necesario para una instalación comercial |
| --- | --- | --- |
| Acceso | No hay identificación de usuarios. La conexión compartida permite consultar datos a quien conozca la URL. | Restringir el acceso a la aplicación y a **todas** sus APIs antes de cargar datos reales de un cliente. |
| Credenciales | Se guardan cifradas en un navegador o en variables globales de un proyecto Vercel. | Usar credenciales propias por instalación, guardadas solo en el servidor; definir rotación y revocación. |
| Datos y escenarios | Cargas, exclusiones, reprogramaciones y parámetros se guardan en el navegador. | Guardarlos en un almacenamiento central y persistente propio de esa instalación, con copias de seguridad. |
| Configuración | La empresa, los filtros de reportes y algunos textos están ligados al despliegue o al HTML. | Configurar nombre del cliente, empresas de Finnegans, moneda, zona horaria, reportes y branding sin modificar la lógica. |
| Demostración | El HTML publicado trae un conjunto de datos de ejemplo. | Separar demostración y producción; una instalación nueva empieza vacía y la demo usa datos totalmente sintéticos. |
| Operación | Las consultas se ejecutan desde la interfaz. | Registrar estado de sincronización, errores y fecha de cada fuente; permitir reintentos y una actualización programada si el cliente la requiere. |
| Entrega | Un proyecto Vercel conectado al repositorio. | Procedimiento reproducible para crear, configurar, verificar, actualizar y recuperar una instalación. |

## Primera versión comercial

1. **Aislar cada cliente.** Crear un proyecto de despliegue y una base de datos separados. No compartir credenciales, archivos, variables de entorno ni respaldos entre clientes. Identificar la instalación con un código interno estable.
2. **Cerrar el acceso.** Exigir una sesión válida tanto para abrir los datos como para ejecutar `/api/finnegans-*`. La comprobación de `Origin` actual no autentica al usuario. Para empezar, alcanza un administrador y usuarios de consulta por instalación; los permisos más finos pueden llegar después.
3. **Mover la conexión al servidor.** El navegador nunca recibe `Client_Secret` ni un token de Finnegans. El servidor obtiene un token nuevo cuando lo necesita y aplica filtros propios de la instalación. El modo actual de credenciales guardadas en el navegador queda como mecanismo de desarrollo, no como configuración comercial.
4. **Persistir información y decisiones.** Guardar por fuente el último resultado válido, fecha y rango consultado, parámetros, advertencias y origen. Guardar también saldo inicial, tipo de cambio, presupuesto, exclusiones, reprogramaciones e incobrables. Una consulta fallida conserva la última versión válida. Las importaciones Excel pasan por el mismo almacenamiento central.
5. **Parametrizar la presentación.** Mantener el producto Cashflow de Fisterra, con nombre y logo del cliente configurables donde corresponda. El mismo código debe funcionar para un segundo cliente cambiando solo la configuración y sus datos.
6. **Operar y dar soporte.** Incorporar registro de actualizaciones sin secretos ni datos sensibles, copias de seguridad y prueba de restauración, límites razonables de consultas, monitoreo de errores y una guía de incorporación y actualización de versiones.

La [protección estándar de Vercel](https://vercel.com/docs/deployment-protection) deja público el dominio de producción. Si se usa protección del despliegue, debe cubrir expresamente producción y sus APIs; de lo contrario, implementar acceso en la aplicación. Las [variables por proyecto](https://vercel.com/docs/environment-variables) permiten configurar cada instalación por separado. La comprobación de permisos debe ejecutarse en el servidor, según la [guía de autorización de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

## Criterios de aceptación para el primer cliente externo

- Un visitante sin acceso autorizado no puede ver el flujo, descargar datos ni consultar ninguna API que use credenciales del cliente.
- Dos instalaciones de prueba pueden usar distintas credenciales y empresas de Finnegans sin intercambiar información.
- Una carga Excel, una exclusión y una reprogramación sobreviven al cierre del navegador y aparecen al volver a entrar desde otro equipo autorizado.
- Las seis fuentes API se actualizan con los filtros de esa instalación; cada una conserva el último resultado válido si falla la consulta.
- Una instalación recién creada no expone datos de demostración ni credenciales en el HTML, el repositorio, las respuestas públicas o los registros.
- Existe un respaldo recuperable y está verificado el procedimiento de restauración.
- Una versión nueva se puede desplegar en una instalación de prueba antes de aplicarla a las demás.

## Orden recomendado de trabajo

**Etapa 1: base segura.** Separar demo y producción, agregar control de acceso a interfaz y APIs, y llevar las credenciales de Finnegans exclusivamente al servidor de cada instalación. Esto es condición previa para usar datos de un cliente externo.

**Etapa 2: persistencia.** Incorporar la base central, migrar las cargas y escenarios desde el navegador, y sumar respaldos. El modelo puede ser simple porque cada instalación pertenece a un solo cliente; no hace falta construir multiempresa en una base compartida.

**Etapa 3: parametrización y entrega.** Configurar identidad, filtros, empresas y fuentes por instalación; automatizar la creación, pruebas, actualización y recuperación de cada despliegue.

**Etapa 4: piloto comercial.** Probar con una segunda empresa que use Finnegans, reconciliar los reportes con su contabilidad, medir tiempos de actualización y completar la documentación de uso, soporte y condiciones comerciales.

La decisión anterior de posponer el login sigue siendo razonable durante el desarrollo interno. **No debe llegar a una instalación comercial que maneje información real.**

## Avance de persistencia compartida

Se incorporó una implementación local de PostgreSQL por instalación con una clave de acceso provisional. Guarda parámetros, cargas, resultados de reportes y escenarios; conserva la última versión válida y evita sobrescrituras simultáneas mediante una revisión. La importación inicial desde un navegador es voluntaria. Las consultas a Finnegans ahora se realizan solo cuando el usuario lo solicita.

Esta modalidad **todavía no está activa en el despliegue actual**: la base Neon Free `cashflow-fisterra-prod` y `CASHFLOW_ACCESS_KEY` ya están configuradas en Production en São Paulo. Falta publicar el código y verificarlo con dos navegadores contra la instalación real. La clave compartida no reemplaza usuarios individuales para un producto comercial definitivo. También quedan pendientes respaldo/recuperación y la separación completa de la demo respecto de producción.
