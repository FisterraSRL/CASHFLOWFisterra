# Autenticación por usuarios y empresas

## Estado y activación

El módulo está integrado al código, pero permanece apagado mientras `CASHFLOW_AUTH_MODE` no sea `users`. En ese estado continúa la clave compartida y el workspace anterior. Cada instalación (Fisterra y Nubiral) se configura por separado. No activar el modo de usuarios hasta completar el catálogo de empresas, las credenciales Finnegans del servidor y la migración de datos.

Para activarlo en una instalación:

1. Respaldar la fila existente de `cashflow_workspace` en su propia base Neon. Verificar que `DATABASE_URL` o `CASHFLOW_DATABASE_URL` apunte a la base correcta de esa instalación.
2. Definir `CASHFLOW_ADMIN_EMAIL` con el correo del primer administrador y `CASHFLOW_ADMIN_PASSWORD` con una contraseña fuerte de 12 a 256 caracteres directamente en las variables protegidas de Vercel. No poner la contraseña en el repositorio. La inicialización crea ese administrador solo si no hay usuarios; luego puede retirarse la variable de contraseña.
3. Para una instalación existente, conservar `CASHFLOW_ACCESS_KEY` en Vercel: el servidor usa esa clave para abrir las credenciales Finnegans ya cifradas en el workspace anterior. Esas credenciales no se entregan a los usuarios del modo nuevo. Como alternativa, configurar `FINNEGANS_CLIENT_ID`, `FINNEGANS_CLIENT_SECRET` y los filtros `FINNEGANS_<FUENTE>_FILTERS` directamente en el servidor. No retirar la clave anterior mientras se utilice el vault.
4. Usar «Actualizar empresas activas desde Finnegans» para obtener los pares `codigo`/`nombre` de `empresaSucursal/list`. Solo se incorporan las filas con `activo: true`; las empresas que dejan de estar activas se desactivan localmente sin borrar sus datos. Las consultas envían automáticamente el código de la empresa seleccionada como filtro; el nombre debe coincidir con `EMPRESA` de las filas devueltas para comprobar la separación en el servidor. Asignar las empresas al administrador.
5. Activar `CASHFLOW_AUTH_MODE=users` y publicar. Ingresar como administrador, revisar el resumen de migración y copiar una empresa por vez. El proceso solo copia filas con nombre de empresa coincidente, deja afuera las filas sin empresa, excluye el saldo manual y el vault de credenciales y conserva intacto el workspace anterior.
6. Seleccionar cada empresa, verificar movimientos, saldos, parámetros y consultas Finnegans contra sus reportes originales. Cargar o asignar explícitamente presupuestos y otros datos sin empresa. Recién entonces crear usuarios estándar y asignarles empresas.

La reversión consiste en quitar `CASHFLOW_AUTH_MODE=users` y republicar. El workspace anterior sigue intacto. Los cambios creados en workspaces por empresa durante el modo nuevo no se vuelcan automáticamente al workspace anterior; hay que exportarlos o conciliarlos antes de revertir.

## Modelo de datos

`lib/auth-store.cjs` crea de forma idempotente en la base Neon de cada instalación:

| Tabla | Uso |
| --- | --- |
| `cashflow_roles` | Roles iniciales `admin` y `user` |
| `cashflow_users` | Email único, nombre, hash scrypt, rol, estado, versión de sesión, fechas |
| `cashflow_companies` | Código Finnegans y nombre único, estado |
| `cashflow_user_companies` | Asignaciones muchos a muchos, sin duplicados |
| `cashflow_sessions` | Sesiones revocables con hash del token y empresa seleccionada |
| `cashflow_password_resets` | Hash de token de un solo uso y vencimiento |
| `cashflow_auth_limits` | Límites de intentos de login y recuperación |
| `cashflow_auth_audit` | Cambios de usuarios, empresas y migraciones |
| `cashflow_company_workspace` | Estado y revisión independientes por empresa |

La tabla anterior `cashflow_workspace` no se modifica ni se elimina.

## APIs

- `GET/POST /api/auth`: sesión, login, logout, selección de empresa, solicitud y confirmación de restablecimiento.
- `GET/POST/PATCH /api/users`: listado y mantenimiento de usuarios, solo administradores.
- `GET/POST/PATCH /api/companies`: catálogo de empresas, solo administradores. `POST {"action":"sync"}` consulta `empresaSucursal/list` con un token obtenido en el servidor y sincroniza únicamente las empresas activas.
- `GET/POST /api/migrate`: vista previa y copia por empresa desde el workspace anterior, solo administradores.
- `/api/workspace`, `/api/finnegans-config`, `/api/finnegans-report` y `/api/finnegans-date-change`: exigen sesión y empresa seleccionada en modo nuevo. El workspace usa siempre el ID de empresa de la sesión. Cada fuente conserva sus filtros editables por empresa; el servidor agrega automáticamente el código de la empresa seleccionada como parámetro `Empresa` y comprueba que las filas devueltas correspondan a ella.
- `POST /api/consolidated`: lee hasta ocho espacios de empresas asignadas al usuario para mostrar un flujo de fondos y calendario de vencimientos conjuntos. No modifica los espacios ni consulta Finnegans. La vista usa una fecha de corte, un horizonte y una agrupación comunes; cada empresa aporta sus propios movimientos, escenarios, cotizaciones y saldo inicial. Si falta una cotización, no muestra importes parciales; si falta un saldo inicial, muestra `s/d` en los saldos finales. Los documentos del calendario conjunto son de solo lectura y muestran su empresa.

## Recuperación por correo

La interfaz y los tokens de restablecimiento están implementados. El envío queda deshabilitado hasta configurar un proveedor. La integración preparada usa `RESEND_API_KEY`, `CASHFLOW_FROM_EMAIL` y `CASHFLOW_PUBLIC_URL` (URL HTTPS de esta instalación). Antes de habilitarla, verificar el dominio remitente y probar un correo real en cada instalación. Sin proveedor, un administrador puede asignar una contraseña nueva desde la ficha de usuario.

## Seguridad y límites

Las contraseñas usan scrypt con sal aleatoria. Las cookies de sesión son `HttpOnly`, `SameSite=Lax` y `Secure` en HTTPS. Se guardan hashes de tokens de sesión y recuperación. La desactivación o el cambio de contraseña revoca sesiones. Las rutas administrativas comprueban el rol en el servidor. La validación de empresa se aplica en la base y en las APIs, además de la interfaz. No hay registro público.

La separación de reportes depende de que Finnegans devuelva el nombre correcto de la empresa en cada fila. Las fuentes que no identifiquen la empresa se rechazan en modo nuevo hasta acordar una regla verificable. La respuesta original de Finnegans no se muestra en el diagnóstico de un usuario, porque puede contener datos de otras empresas. La sincronización del catálogo usa las credenciales Finnegans propias de cada instalación: variables del servidor o el vault anterior descifrado únicamente en el servidor. No habilitar producción sin comparar nombres de empresas de los reportes con el catálogo real.

## Pruebas

Ejecutar `node --test tests/*.test.cjs`, `node tests/browser/auth-ui.cjs` y `node tests/browser/workspace-persistence.cjs`. Cubren hash y tokens, login, bloqueo de empresas ajenas y rutas administrativas, migración sin borrar el origen, interfaz de login y persistencia anterior. Antes de activar, falta una prueba contra respuestas reales de Finnegans y una migración supervisada en las bases de Fisterra y Nubiral.
