# Autenticación y empresas: análisis de la aplicación actual

## Estado actual

- Cada instalación (Fisterra y Nubiral) tiene su propia base Neon PostgreSQL. `cashflow_workspace` contiene una sola fila con todo el estado de esa instalación en `payload jsonb`.
- El acceso actual usa una clave común `CASHFLOW_ACCESS_KEY`. `lib/workspace-auth.cjs` la aplica a las rutas de workspace y Finnegans; no existe una identidad de usuario ni una tabla de empresas.
- En Nubiral, los movimientos de varias empresas pueden convivir en ese mismo `payload`. El campo normalizado `company` es el **nombre** devuelto por los reportes. Las muestras compartidas no incluyen el **código** que exige el parámetro `Empresa` de Finnegans.
- Las credenciales Finnegans pueden estar en variables de Vercel o cifradas dentro del workspace y descifradas en el navegador con la clave común. Ese mecanismo no puede entregarse a usuarios con permisos por empresa.
- Presupuesto, algunas cargas Excel y parámetros globales no tienen empresa. No es seguro asignarlos automáticamente a una empresa durante una migración.

## Diseño de destino

1. Mantener una instalación y una base por cliente. Dentro de cada base, añadir `users`, `companies`, `user_companies`, `sessions`, `password_resets`, controles de intentos y auditoría, con claves foráneas y restricciones únicas.
2. Crear el primer administrador una sola vez mediante email y contraseña configurados en Vercel. Guardar únicamente el hash de contraseña. Retirar la contraseña inicial de Vercel después de la creación.
3. Usar sesión de servidor con cookie `HttpOnly`, `Secure` y `SameSite=Lax`. Cada API debe validar la sesión y la empresa seleccionada. La desactivación de un usuario revoca sus sesiones.
4. Guardar un workspace independiente por empresa (`company_id`, `revision`, `payload`). Ninguna API de un usuario estándar debe devolver el workspace global anterior. Mantener la fila global como respaldo hasta completar la migración.
5. El administrador asigna empresas a usuarios. La selección de empresa se valida en el servidor y se conserva en la sesión. El cambio de empresa vuelve a cargar el workspace correspondiente.
6. Las consultas Finnegans deben fijar el código de empresa en el servidor, sin aceptar un código de empresa enviado por el navegador. Las filas devueltas deben pertenecer a la empresa seleccionada; una respuesta sin empresa identificable no debe mezclarse en otro workspace.
7. Las credenciales Finnegans compartidas deben quedar del lado del servidor. El `vault` cifrado con la clave común no debe enviarse a usuarios estándar.
8. El restablecimiento genera tokens aleatorios de un solo uso, guarda solo el hash y vence rápidamente. La petición devuelve el mismo mensaje exista o no el correo. El envío queda deshabilitado hasta configurar un proveedor de correo.

## Migración necesaria

- Asociar cada nombre de empresa de los reportes con su código Finnegans antes de habilitar las consultas por empresa. Si los reportes no traen el código, hace falta una API de catálogo o una lista validada de pares código/nombre.
- Separar los movimientos existentes por `company`. Los movimientos, presupuestos y saldos manuales sin empresa requieren asignación explícita; no deben copiarse a todos los workspaces.
- Mover las credenciales Finnegans al servidor antes de retirar la clave compartida. Una instalación no debe activar el login hasta tener administrador inicial, catálogo de empresas y migración verificada.
- Mantener las instalaciones actuales operativas mientras se desarrolla y prueba la modalidad nueva. La activación por instalación debe ser explícita, con una ruta de reversión que no borre los datos anteriores.
