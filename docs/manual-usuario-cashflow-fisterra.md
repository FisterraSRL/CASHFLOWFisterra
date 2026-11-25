# Manual de uso de Cashflow Fisterra

**Versión de la aplicación:** 1.0.38

**Fecha del manual:** 25 de noviembre de 2026

**Acceso:** https://cashflowfisterra.vercel.app/

Este manual explica el uso diario de Cashflow Fisterra y las tareas del usuario administrador. La aplicación guarda datos y parámetros por empresa. Las consultas a Finnegans se ejecutan cuando el usuario las solicita.

## 1. Ingreso y selección de empresa

1. Abrí la URL de Fisterra e ingresá tu correo y contraseña.
2. Si aparece la selección de empresa, elegí aquella con la que vas a trabajar y pulsá **Entrar**. Solo aparecen las empresas habilitadas para tu usuario.
3. La empresa actual se muestra en el encabezado. Al cambiarla, se cargan sus datos, filtros y cotizaciones propios.
4. Para terminar, pulsá **Salir**.

El administrador abre la sección **Usuarios y empresas** al ingresar. Si aún no tiene empresas asignadas, puede administrar usuarios y empresas, pero debe asignarse una empresa antes de abrir el cashflow.

**Contraseña olvidada:** el enlace de recuperación por correo está preparado, pero el envío todavía no está configurado. Pedí a un administrador que establezca una contraseña nueva desde la ficha de usuario. El manual no contiene contraseñas.

## 2. Qué puede hacer cada rol

- **Administrador:** crea y edita usuarios, asigna empresas, cambia roles y contraseñas, activa o desactiva usuarios, actualiza el catálogo de empresas y, si corresponde, migra datos anteriores. También puede usar el cashflow de las empresas que tenga asignadas.
- **Usuario estándar:** trabaja con los datos de sus empresas asignadas. No puede abrir la administración de usuarios ni ampliar sus permisos.

Para ver varias empresas juntas en **Flujo de fondos**, **Vencimientos** o **Ejecutado**, el usuario necesita acceso a cada una de ellas. La selección conjunta permite hasta ocho empresas y es de solo lectura.

## 3. Tareas del administrador

### Actualizar la lista de empresas

1. Entrá a **Usuarios** o a **Usuarios y empresas**.
2. Pulsá **Actualizar empresas activas desde Finnegans**.
3. Revisá **Empresas disponibles**. La lista muestra solamente empresas con `activo = true` en Finnegans.
4. Si necesitás agregar una empresa manualmente, ingresá su código Finnegans y su nombre exacto en **Agregar empresa**. El nombre debe coincidir con el campo `EMPRESA` de los reportes.

### Crear un usuario

1. En **Crear usuario**, completá nombre, correo y contraseña inicial de al menos 12 caracteres.
2. Elegí **Usuario estándar** o **Administrador**.
3. Marcá las **Empresas habilitadas** para esa persona.
4. Comprobá que **Activo** esté marcado y pulsá **Guardar usuario**.

Cada usuario debe tener su propia cuenta. La contraseña inicial se comunica por un canal privado y se cambia cuando corresponda. No la guardes en el manual ni en un archivo compartido.

### Editar o desactivar un usuario

1. Buscá al usuario por nombre o correo y pulsá **Editar**.
2. Cambiá nombre, correo, rol, empresas o estado. Para reemplazar la contraseña, escribí una nueva; si dejás el campo vacío, se conserva la existente.
3. Pulsá **Guardar usuario**. Al cambiar la contraseña o desactivar la cuenta, sus sesiones abiertas se revocan. La aplicación exige que permanezca al menos un administrador activo.

**Migrar datos anteriores** aparece solo cuando hay datos previos disponibles. Revisá la vista previa y migrá una empresa por vez. La copia conserva el origen; los registros sin empresa requieren revisión aparte.

## 4. Parámetros generales

- **Fecha de corte:** punto de partida de la proyección. Si cambia, volvé a consultar el saldo bancario para esa fecha o ingresá un saldo manual correspondiente.
- **Saldo bancos al corte:** suma de las cuentas obtenidas por API cuando la fecha coincide con el corte y existen las cotizaciones necesarias. Si no hay saldo API válido, se puede cargar uno manual.
- **TC USD y cotizaciones:** equivalencia de cada moneda en pesos argentinos. Se configuran en **Datos y fuentes**. Una moneda sin cotización impide calcular importes conjuntos confiables.
- **Horizonte:** 30 días, 90 días, 6 meses o 12 meses.
- En **Importes detallados**, elegí pesos con centavos, pesos sin decimales, **Miles** o **Millones**. En Miles, $125.000 se muestra como 125,00 mil pesos. El navegador recuerda la opción.
- **Agrupar por:** día, semana, mes o año para el flujo.
- **Cheques emitidos vencidos sin conciliar:** se incluyen solo si marcás la opción correspondiente.

La etiqueta **Vencido** del calendario compara el vencimiento con el día real de hoy en Argentina, aunque elijas otra fecha de corte para la proyección.

## 5. Solapas de análisis

### Resumen

Muestra saldo bancario, cobros y pagos próximos, atrasado neto, saldo mínimo proyectado, alertas y mayores pagos. Los indicadores de capital de trabajo usan los datos disponibles. **Días en la calle** mide la antigüedad ponderada de facturas pendientes; no equivale al DSO. DSO, DPO y solvencia requieren ventas, compras o balance cuando la aplicación los indique.

### Flujo de fondos

Presenta ingresos, egresos y saldos por período. Desplegá una categoría para ver organizaciones y luego comprobantes. En facturas se muestra **Comprobante**; en cheques, el número de cheque. Podés excluir organizaciones para simular escenarios y seleccionar cobros para marcarlos como **incobrables**. Los incobrables dejan de sumar a los ingresos proyectados.

Solo los documentos de Clientes y Proveedores que tengan `AsientoItemID` permiten modificar la fecha. Los cheques y los documentos sin ese identificador muestran la fecha sin editor. Una modificación queda guardada como cambio pendiente; no se envía a Finnegans automáticamente.

### Vencimientos

Elegí un día para abrir su detalle o pulsá **Ver vencimientos del mes** para revisar el mes visible. **Ordenar por** permite elegir fecha, organización de A a Z o importe de menor a mayor. **Agrupar por** separa los documentos por fecha o por organización y muestra la cantidad y el total neto de cada grupo. El calendario permite filtrar por **Todo**, **Cobros** o **Pagos**. La agenda muestra los próximos 14 días.

### Excluir y reincorporar documentos

1. En **Flujo de fondos**, marcá los documentos en la tabla o en su detalle. En **Vencimientos**, abrí un día o el mes y marcalos en el detalle.
2. Pulsá **Excluir seleccionados**. Los comprobantes y cheques seleccionados se retiran de las dos solapas y de los totales de la proyección.
3. Para recuperarlos, abrí **Documentos excluidos** desde cualquiera de las dos solapas y pulsá **Reincorporar** junto a cada documento.

Las exclusiones se guardan por empresa y se reflejan en el consolidado. Para gestionar una exclusión de otra empresa, seleccionala en el encabezado.

### Ejecutado

Reúne **Cobros ejecutados** y **Pagos ejecutados** ya registrados. Podés elegir un mes o todos los meses y ver totales, neto, cobertura, evolución mensual, categorías, cuentas y registros. Las aplicaciones a facturas aparecen como detalle y no vuelven a sumarse. Si falta una fuente o los períodos consultados no coinciden, el neto y la cobertura se muestran como **Sin datos**.

### Presupuesto vs real

Compara presupuesto mensual, proyección y cobros/pagos ejecutados por categoría. Si solo se cargó una parte del ejecutado, la pantalla indica que el mes está incompleto.

## 6. Ver varias empresas juntas

1. En **Flujo de fondos**, **Vencimientos** o **Ejecutado**, marcá las empresas habilitadas en **Empresas seleccionadas**. La empresa actual permanece incluida.
2. La misma selección se aplica a las tres solapas. Pulsá **Actualizar vista** para releer los datos guardados.
3. El flujo suma importes y saldos; el calendario suma por día e identifica la empresa de cada documento; Ejecutado suma cobros y pagos y muestra el desglose por empresa.

Esta vista no consulta Finnegans ni modifica datos. Para cargar reportes o editar un vencimiento, abrí la empresa correspondiente en el selector superior. Si faltan cotizaciones, fuentes o períodos comparables, revisá las advertencias antes de utilizar los totales. La selección conjunta se recuerda en este navegador.

## 7. Datos y fuentes

Cada fuente tiene su propia tarjeta. Las principales son **Saldo de bancos**, **Clientes**, **Proveedores**, **Cheques propios**, **Cheques de terceros**, **Cobros ejecutados** y **Pagos ejecutados**. También hay plantillas para préstamos, leasing, planes ARCA y presupuesto.

- **Obtener por API:** consulta una fuente. Sus filtros se guardan por empresa; el código de empresa lo incorpora la aplicación según la empresa seleccionada.
- **Actualizar APIs:** consulta consecutivamente las fuentes API configuradas. Al terminar, revisá el resultado individual y **Estado de los datos**. Una fuente fallida conserva los datos anteriores; el conjunto puede mezclar fechas.
- **Subir Excel:** carga la fuente desde un archivo compatible. **Quitar** elimina la carga de esa tarjeta; verificá la empresa actual antes de usarlo.
- **Cotizaciones a pesos argentinos:** cargá el valor de una unidad de moneda en pesos. Se usa en las vistas que convierten importes.
- **Saldo de bancos:** muestra cuenta, banco, moneda y saldo. Consultalo de nuevo al cambiar la fecha de corte. La conciliación bancaria se verifica aparte.

Los cambios de parámetros y datos se guardan automáticamente en la base de esta instalación. Recargar la página recupera el último estado guardado, pero **no ejecuta de nuevo las APIs**. **Actualizar vista** de varias empresas tampoco consulta Finnegans.

### Enviar cambios de fecha a Finnegans

1. Revisá **Datos y fuentes > Fechas para Finnegans**.
2. Verificá empresa, organización, comprobante, fecha original y nueva fecha. Si un cambio pendiente es incorrecto, usá **Descartar**.
3. Pulsá **Enviar pendientes a Finnegans** solo después de revisar la lista.
4. El cambio pasa a **Enviado** únicamente si Finnegans confirma `RESULTADO: OK`. Si falla o no confirma, permanece pendiente para revisión.

**Actualizar APIs** no envía estos cambios. Después de enviarlos, verificá el resultado en Finnegans antes de repetir una operación sin confirmar.

## 8. Rutina recomendada y problemas frecuentes

**Al comenzar:** elegí la empresa, revisá fecha de corte, saldo y cotizaciones. Ejecutá **Actualizar APIs** o las fuentes necesarias y comprobá el estado de cada una. Después revisá Resumen, Flujo y Vencimientos.

**Si falta una empresa:** pedí al administrador que confirme que esté activa y asignada a tu usuario. **Si falta una cotización:** cargala en Datos y fuentes de la empresa correspondiente. **Si una API falla:** revisá los filtros y el resultado de esa tarjeta; los datos anteriores se conservan. **Si los totales conjuntos no coinciden:** compará fechas de actualización, cotizaciones, exclusiones e incobrables de cada empresa. **Si olvidaste la contraseña:** solicitá al administrador una nueva hasta que se habilite la recuperación por correo.

**Importante:** el cashflow es una proyección basada en los datos cargados. Revisá alertas de datos incompletos, conciliación bancaria y comprobantes antes de tomar decisiones.

## 9. Preguntas frecuentes

### ¿Los datos se pierden si ingreso desde otra computadora?

No. Los datos y parámetros guardados pertenecen a la instalación y a la empresa, y se recuperan después de iniciar sesión. La selección de empresas para la vista conjunta se recuerda solo en el navegador donde la hiciste.

### ¿Qué diferencia hay entre Actualizar vista y Actualizar APIs?

**Actualizar vista** vuelve a leer los datos ya guardados de las empresas seleccionadas. **Actualizar APIs** consulta nuevamente los reportes de Finnegans para la empresa actual. Después de actualizar una empresa, usá Actualizar vista para renovar el consolidado.

### ¿Por qué el saldo bancario desaparece al cambiar la fecha de corte?

El saldo obtenido por API corresponde a una fecha determinada. Al elegir otra fecha, consultá de nuevo **Saldo de bancos** o cargá un saldo manual válido para el nuevo corte.

### ¿Por qué no puedo cambiar la fecha de un cheque?

El envío de cambios a Finnegans usa `AsientoItemID` de Clientes y Proveedores. Los cheques propios y de terceros no participan en ese procedimiento; por eso sus fechas no son editables desde Cashflow.

### ¿Por qué veo importes pero no un neto en Ejecutado?

Puede haber cobros o pagos sin su contraparte para el mes, o consultas con fechas distintas entre empresas. La pantalla deja visibles los importes disponibles y oculta el neto y la cobertura hasta que los períodos sean comparables.

