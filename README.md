# Ecosistema Kioskos — Playa Grande Brew House

Sistema de operaciones para los kioskos de cerveza y cocteles (Playa Grande,
Liberia, Nosara, Playa Hermosa, con planes de abrir más), adaptado del
Ecosistema Lorito (Grupo del Sol / Casa Aguizotes). Misma arquitectura:
Google Apps Script + Google Sheets como backend, HTML/JS plano de frontend
(sin framework), un `.gs` por módulo desplegado como Web App.

## Estado actual

Primer módulo: **Cierre de Caja**, con selector de kiosko (en vez de un punto
de venta fijo como en Lorito) y categorías de venta simplificadas — sin
crédito, plataformas de delivery ni 10% de servicio, porque no aplican a un
kiosko de playa.

Segundo módulo: **Depósitos**, adaptado de `depositos.html`/`Code-cierres-backend.gs`
(hoja "Depositos") de Ecosistema Lorito, con selector de **Kiosko** (Lorito es
un solo punto de venta y agrupa directo por fecha; acá primero se filtra por
el kiosko elegido arriba de las 3 pestañas y recién ahí se agrupa por fecha):

- `depositos.html` — 3 pestañas: **Resumen diario** (efectivo sin depósito
  asignado, por fecha, con detalle desplegable por denominación), **Asignar
  depósito** (foto del comprobante, fecha/referencia/monto, selección de una
  o varias fechas pendientes a cubrir, comparación comprobante vs. calculado
  con tolerancia ±₡500/±$1, botón de WhatsApp con el resumen) e **Historial
  de depósitos** (depósitos ya asignados, con las fechas que cubre cada uno).
  El backend (`guardarDeposito`/`agregarEncabezadosDepositos` en
  `Code-cierres-kioskos-backend.gs`) ya venía armado con el campo Kiosko —
  solo faltaba esta pantalla para poder usarlo.

Tercer módulo: **RRHH completo**, adaptado 1:1 de la lógica de
`Code-rrhh-backend.gs`/las 8 pantallas `rrhh-*.html` + `horarios.html` de
Ecosistema Lorito, con el campo **Kiosko** agregado en Personal y Horarios
(Lorito es un solo punto de venta y no lo necesita):

- `rrhh-acciones.html` — hub con las 9 pantallas del módulo (link principal
  desde `index.html`).
- `rrhh-personal.html` — expedientes digitales del equipo (datos personales,
  laborales, bancarios, documentos, amonestaciones), con búsqueda y filtro
  por kiosko/departamento/estado. Botón **"✎ Editar"** en cada expediente:
  abre un modal para corregir cualquier dato editable (nombre, cédula,
  contacto, kiosko/departamento/puesto, banco, documentos, observaciones) y
  para subir o reemplazar la foto de cédula. A propósito no permite tocar
  **salario** ni **estado** — esos cambios siguen pasando por
  `rrhh-cambio-salario.html`, `rrhh-terminacion.html` y
  `rrhh-liquidaciones.html` para no perder el historial que esas pantallas
  registran aparte.
- `rrhh-nuevo-ingreso.html` — alta completa de colaborador (ficha larga:
  cédula, nacionalidad, kiosko, departamento, puesto, salario, datos
  bancarios, checklist de documentos entregados).
- `rrhh-vacaciones.html` / `rrhh-control-vacaciones.html` — solicitud de
  vacaciones y panel de control (saldos por colaborador, pendientes de
  aprobar, historial). Saldo calculado automáticamente por antigüedad (1 día
  por mes trabajado) si no hay un saldo manual cargado en el Sheet.
- `rrhh-amonestaciones.html` — llamadas de atención, amonestaciones verbales/
  escritas y suspensiones sin goce de salario, con historial por
  colaborador.
- `rrhh-terminacion.html` — registra la salida de un colaborador (cambia su
  Estado a LIQUIDACIÓN).
- `rrhh-cambio-salario.html` — actualiza el salario de un colaborador y
  guarda el historial de cambios.
- `rrhh-liquidaciones.html` — cálculo preliminar de liquidación (preaviso,
  cesantía, vacaciones, aguinaldo) según el Código de Trabajo de Costa Rica,
  para colaboradores en estado LIQUIDACIÓN, y confirmación de pago (pasa el
  Estado a INACTIVO).
- `horarios.html` / `horarios-historial.html` — turnos semanales **por
  kiosko** (pestañas Playa Grande/Liberia/Nosara/Playa Hermosa — un
  colaborador sin Kiosko asignado aparece como "rotativo" en las 4), con
  vacaciones aplicadas automáticamente desde las solicitudes aprobadas,
  cierre de semana en PDF (guardado en Drive) e historial de semanas
  guardadas. **Importante:** el cierre de semana ("Cerrar horario") es
  global para esa semana en las 4 pestañas — no hay un cierre independiente
  por kiosko; el PDF que se genera/descarga sí es el de la pestaña activa en
  ese momento.
- `rrhh.html` — la pantalla simple original (alta rápida + listado con
  activar/desactivar) queda intacta y sigue funcionando contra el mismo
  backend, pero ya no es el punto de entrada del módulo — usá
  `rrhh-acciones.html`.

El resto de módulos (inventario/compras, reportes) quedan como
"Próximamente" en `index.html`, a construir después.

Archivos:
- `index.html` — home con navegación entre módulos.
- `login.html` — acceso por PIN (mismo patrón simple que Lorito, sin backend
  propio — roles guardados en `localStorage`; ver "Pendiente" más abajo).
- `configuracion.html` — sección de configuración inicial: alta/edición/
  activación de kioskos (nombre, ubicación, encargado, contacto, WhatsApp,
  horario de atención desplegado por día con hora de apertura y cierre).
  Única fuente de la lista de kioskos que consume el resto del sistema (ver
  "Kioskos activos" más abajo). Incluye un mapa (Leaflet + OpenStreetMap,
  sin API key) con un marcador por kiosko: el campo "Ubicación" acepta
  coordenadas `lat,lng`, un link de Google Maps, o una dirección/nombre de
  lugar (en ese caso se geocodifica con Nominatim y se cachea en
  `localStorage` para no repetir la consulta). El popup de cada marcador y
  la tarjeta de la lista muestran el horario de hoy; cada tarjeta tiene un
  desplegable "Ver horario semanal" con los 7 días.
- `cierres.html` — módulo de cierre de caja (formulario + historial).
- `depositos.html` — módulo de depósitos bancarios (resumen diario, asignar
  depósito, historial — ver detalle arriba).
- `rrhh.html`, `rrhh-acciones.html`, `rrhh-personal.html`,
  `rrhh-nuevo-ingreso.html`, `rrhh-vacaciones.html`,
  `rrhh-control-vacaciones.html`, `rrhh-amonestaciones.html`,
  `rrhh-terminacion.html`, `rrhh-cambio-salario.html`,
  `rrhh-liquidaciones.html`, `horarios.html`, `horarios-historial.html` —
  módulo de RRHH completo (ver detalle arriba).
- `Code-cierres-kioskos-backend.gs` — backend del Sheet de ventas (hoja
  "Cierres") y de depósitos bancarios (hoja "Depositos", que alimenta
  `depositos.html`).
- `Code-rrhh-kioskos-backend.gs` — backend completo de RRHH (Personal,
  Vacaciones, Amonestaciones, Terminaciones, CambiosSalario, Liquidaciones,
  Horarios, HorariosEstado, Configuracion) — alimenta las 12 pantallas de
  arriba, el dropdown de "Encargado" en cierres.html y la lista de kioskos
  de `configuracion.html` + selects del resto del sistema.

## Pendiente de conexión (todo manual, vía script.google.com)

Apps Script no tiene API para automatizar el despliegue — estos pasos hay
que hacerlos una vez a mano.

### 1. Sheet de ventas (Cierres de Caja y Depósitos)

1. Creá un Google Sheet nuevo, ej. **"Registro Ventas - Kioskos"**.
2. Extensiones → Apps Script, pegá **todo** el contenido de
   `Code-cierres-kioskos-backend.gs`.
3. Corré **una vez** `agregarEncabezados()` desde el editor (▶ con esa
   función seleccionada) para crear la pestaña "Cierres" con encabezados, y
   **una vez más** `agregarEncabezadosDepositos()` para crear la pestaña
   "Depositos" con los suyos.
4. Implementar → Nueva implementación → Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
5. Copiá la URL `/exec` resultante y pegala en `cierres.html` **y en
   `depositos.html`**, constante `SHEETS_URL` (arriba del todo en el
   `<script>` de cada uno) — es el mismo Sheet para los dos módulos.
6. Creá una carpeta en Drive para las fotos de respaldo de los cierres (ej.
   **"Cierres de caja - Kioskos"**), copiá su ID (de la URL de la carpeta) y
   pegalo en `Code-cierres-kioskos-backend.gs`, constante
   `FOLDER_ID_CIERRES` — después de pegarlo, volvé a Implementar → Gestionar
   implementaciones → Editar → Nueva versión (la URL `/exec` no cambia). Esta
   misma carpeta se usa también para los comprobantes de depósito (subcarpeta
   "Depósitos - Comprobantes", se crea sola).

Sin el paso 6, guardar un cierre con foto va a fallar (`DriveApp.getFolderById`
con un ID inválido) — si por ahora no vas a usar fotos, no pasa nada, se puede
guardar el cierre sin adjuntar ninguna.

### 2. Sheet de personal (RRHH completo)

1. Si ya tenías el Sheet **"RRHH - Kioskos"** con la versión mínima
   desplegada, seguí usando ese mismo Sheet — no hace falta crear uno
   nuevo. Si es la primera vez, creá un Google Sheet nuevo con ese nombre.
2. Extensiones → Apps Script, reemplazá **todo** el contenido por
   `Code-rrhh-kioskos-backend.gs` (la versión completa).
3. Corré **una vez** `configurarHojas()` desde el editor. Si el Sheet ya
   tenía datos en "Personal", esto **no los borra**: agrega al final las
   columnas nuevas (Departamento, Fecha nacimiento, Edad, Nacionalidad,
   Antigüedad, Banco, Cuenta, Tipo cuenta, Contrato, CCSS, INS RT, Carnet
   alimentos, Vence carnet, Saldo vacaciones, Observaciones, **Foto Cédula
   (URL)**) y crea las pestañas nuevas: Vacaciones, Amonestaciones,
   Terminaciones, CambiosSalario, Liquidaciones, Horarios, HorariosEstado,
   Configuracion (esta última sembrada automáticamente con los 4 kioskos
   originales, ver "Kioskos activos" más abajo). Si ya habías corrido
   `configurarHojas()` antes de sumar la foto de cédula, volvé a correrla
   una vez más: solo agrega la columna que falte, sin tocar las que ya
   tenías.
4. Implementar → Gestionar implementaciones → Editar → **Nueva versión**
   (si ya tenías el Web App desplegado, la URL `/exec` no cambia — no hace
   falta tocar ningún `.html`). Si es la primera vez: Implementar → Nueva
   implementación → Tipo: Aplicación web, Ejecutar como Yo, Acceso:
   Cualquiera, y pegá la URL resultante en `APPS_SCRIPT_RRHH`/
   `APPS_SCRIPT_URL` de `cierres.html` y las 12 pantallas de RRHH.
5. Para que **Horarios** pueda cerrar la semana en PDF, creá una carpeta en
   Drive (ej. **"Horarios - Kioskos"**), copiá su ID (de la URL de la
   carpeta) y pegalo en `Code-rrhh-kioskos-backend.gs`, constante
   `FOLDER_ID_HORARIOS` — después volvé a Implementar → Gestionar
   implementaciones → Editar → Nueva versión. Sin este paso, "Cerrar
   horario" en `horarios.html` va a fallar al generar el PDF (podés seguir
   usando Horarios sin cerrar semanas mientras tanto).
6. `rrhh-nuevo-ingreso.html` incluye un espacio para tomar/subir la foto de
   la cédula del colaborador (opcional) y se guarda en la carpeta de Drive
   fija `FOLDER_ID_CEDULAS` (ya viene con un ID real cargado en
   `Code-rrhh-kioskos-backend.gs`, no hace falta configurarlo — si en algún
   momento querés usar otra carpeta, reemplazá ese ID por el de tu carpeta y
   volvé a Implementar → Gestionar implementaciones → Editar → Nueva
   versión). La URL del archivo queda guardada en la columna nueva
   **"Foto Cédula (URL)"** de "Personal", visible desde el expediente en
   `rrhh-personal.html` ("Ver foto ↗"). `rrhh.html` (alta rápida) no tiene
   este campo todavía.
7. Cargá el personal desde `rrhh-nuevo-ingreso.html` (ficha completa, con
   foto de cédula) o `rrhh.html` (alta rápida, campos básicos) — ambos
   escriben en la misma pestaña "Personal". El campo `Kiosko` es opcional:
   si un colaborador trabaja fijo en un solo kiosko, completalo para que
   solo aparezca ahí; dejándolo vacío, aparece como "rotativo" — disponible
   en cualquier kiosko (dropdown de Encargado en cierres.html, y en las 4
   pestañas de Horarios).

Sin el paso 4, `cierres.html` y todas las pantallas de RRHH muestran
"Configurá APPS_SCRIPT_RRHH primero" (o el error de conexión equivalente).

**Nota:** `rrhh-personal.html` ya permite editar un expediente completo
(botón "✎ Editar" en cada colaborador) incluyendo la foto de cédula.
`rrhh.html` (alta rápida) sigue sin edición, solo activar/desactivar — para
corregir esos registros básicos, hacelo directamente en la pestaña
"Personal" del Sheet. En ambos casos, salario y estado siguen reservados a
sus propias pantallas (`rrhh-cambio-salario.html`, `rrhh-terminacion.html`,
`rrhh-liquidaciones.html`) para dejar historial.

## Kioskos activos — sección de Configuración

La lista de kioskos ya **no** está duplicada en cada `.html`. Vive en la
pestaña **"Configuracion"** del Sheet de RRHH, y se administra desde
`configuracion.html` (tile "Configuración" en `index.html`): nombre,
ubicación (link o ID de Google Maps), encargado, contacto, WhatsApp,
horario y estado activo/inactivo.

Para abrir un kiosko nuevo (o desactivar uno), entrá a `configuracion.html`
y usá "+ Agregar kiosko" — no hace falta tocar ningún archivo `.html` ni el
backend. Los siguientes archivos leen la lista de kioskos activos al cargar
(`fetch(APPS_SCRIPT_URL + '?modulo=kioskos')`, con un arreglo `KIOSKOS`
hardcodeado como respaldo si no hay conexión):

- `cierres.html`
- `depositos.html`
- `rrhh.html`
- `rrhh-nuevo-ingreso.html`
- `rrhh-personal.html`
- `horarios.html`

Backend (`Code-rrhh-kioskos-backend.gs`): `configurarHojas()` crea la
pestaña "Configuracion" y, si está vacía, la siembra con los 4 kioskos
originales (`sembrarConfiguracion()`). `doGet` con `?modulo=kioskos`
devuelve tanto los registros completos (para `configuracion.html`, que
también necesita ver los inactivos) como el array `kioskos` con solo los
nombres activos, en orden — eso es lo que consumen los selects del resto de
pantallas. `doPost` con `modulo: 'kiosko_guardar'` crea o edita un kiosko
(incluye renombrar, vía `kiosko_original`) y `modulo: 'kiosko_estado'`
activa/desactiva uno sin abrir el formulario completo.

El Sheet no necesita ningún cambio manual más allá de correr
`configurarHojas()` una vez — el nombre del kiosko se guarda tal cual en la
columna "Kiosko" de Personal/Horarios/Cierres, y en `horarios.html` aparece
automáticamente como una pestaña más.

## Extracción con IA (opcional, no incluida todavía)

En Lorito, `cierres.html` y `depositos.html` tienen un botón "Extraer datos
con IA" que lee la foto (del cierre o del comprobante de depósito) con un
extractor separado (Apps Script + `ANTHROPIC_API_KEY`, ver `EXTRACTOR_URL` en
el código de Lorito). Acá quedó **desconectado a propósito** en los dos
(`EXTRACTOR_URL = ''`) — el botón queda oculto y ambos formularios funcionan
100% manual. Si más adelante lo querés activar, hay que:

1. Copiar el proyecto `cierre-extractor/Code.gs` de Ecosistema-Lorito a un
   Sheet nuevo, desplegarlo como Web App con su propia `ANTHROPIC_API_KEY` en
   Propiedades del script.
2. Pegar esa URL `/exec` en `EXTRACTOR_URL` dentro de `cierres.html` y/o
   `depositos.html`, según cuál de los dos querás activar (son independientes
   — `depositos.html` manda `tipo:'deposito'` en el payload para que el
   extractor sepa qué formato de respuesta devolver).

## Login / control de accesos

`login.html` usa el mismo patrón simple que Lorito: PIN guardado en
`localStorage` (`portal_roles`), sin backend propio. Por ahora solo existe el
PIN de administrador por defecto (`admin`/`admin`) — para producción, sumale
un rol por persona/kiosko editando el arreglo `ADMIN_DEFAULT` en
`login.html`, o construí más adelante una pantalla de "Administrar accesos"
como `admin-accesos.html` en Lorito.

## Próximos módulos (sugeridos, sin construir todavía)

- **Inventario y compras** por kiosko (stock de cerveza/licores/insumos).
- **Reportes consolidados** — comparativo de ventas/balance entre los 4
  kioskos y los que se vayan sumando.
- **Cierre de semana de Horarios por kiosko** — hoy "Cerrar horario" bloquea
  la semana completa en las 4 pestañas a la vez (ver nota en la sección de
  RRHH); si hace falta cerrar cada kiosko por separado, requeriría cambiar
  la clave de `HorariosEstado` de "Semana inicio" a "Semana inicio + Kiosko".
