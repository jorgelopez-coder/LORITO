# Ecosistema Lorito
Sistema de operaciones para Restaurante Lorito (Grupo del Sol), adaptado del ecosistema de Casa Aguizotes/Batanga.

## Pendientes de conexión
Los siguientes backends de Apps Script aún no existen (sheets nuevas y vacías) y deben desplegarse y pegarse en el código donde aparece cada placeholder:
- `TODO_APPS_SCRIPT_COSTOS_LORITO` → hoja "COSTOS Y RECETAS - LORITO IA"
- `TODO_APPS_SCRIPT_COMPRAS_LORITO` → hoja "Operaciones - Lorito IA"
- `TODO_GERENCIA_LORITO@pendiente.com` → correo real de gerencia

mermas.html conserva `APPS_SCRIPT_URL = ''` (nunca estuvo conectado en el original).

## Cierre de Caja — despliegue pendiente

Destinos ya creados en Drive (dueño: jorge.lopez@casaaguizotes.com):
- Sheet de datos: "Registro ventas - LORITO IA" — `1wCiE4zH9ha1eie8T1JuOBU-YRL8qhGlMXhOriSAmgAo`
- Carpeta de fotos: "Cierres de caja" — `1s0hjm5NmtgSgkZhmThpogZRhFZcr527j`

Pasos para conectar (manuales, requieren script.google.com — no hay API de Apps Script disponible para automatizarlo):

1. ✅ Abrí el Sheet "Registro ventas - LORITO IA" → Extensiones → Apps Script, pegaste `Code-cierres-backend.gs` y lo desplegaste como Web App.
2. ✅ `SHEETS_URL` en `cierres.html` ya apunta a ese `/exec`.
3. Pendiente: en el editor de Apps Script del backend de cierres, correr UNA VEZ la función `agregarEncabezados()` para escribir los encabezados (incluye las columnas nuevas de propinas por forma de pago y revisión de tarjeta) si aún no se hizo.
4. ✅ Desplegaste `cierre-extractor/Code.gs` como su propio proyecto (con `ANTHROPIC_API_KEY` en Propiedades del script) y `EXTRACTOR_URL` en `cierres.html` ya apunta a ese `/exec`.

Las fotos de cada cierre se guardan automáticamente en la carpeta fija de Drive de arriba, en una subcarpeta por fecha (`YYYY-MM-DD`) — no requiere configuración adicional.

## Depósitos — despliegue pendiente

`depositos.html` reutiliza los mismos backends que `cierres.html` (mismo `SHEETS_URL` y `EXTRACTOR_URL`, sin proyectos nuevos ni API keys nuevas), pero ambos necesitan un redespliegue manual para activar las funciones agregadas:

1. Pendiente: abrí el proyecto de Apps Script pegado en el Sheet "Registro ventas - LORITO IA" (el mismo de `Code-cierres-backend.gs`), reemplazá el código por la versión actualizada de este repo, y Implementar → Gestionar implementaciones → Editar → Nueva versión (la URL `/exec` no cambia).
2. Pendiente: en ese mismo editor, corré UNA VEZ la función `agregarEncabezadosDepositos()` para crear la hoja "Depositos" con sus encabezados.
3. Pendiente: abrí el proyecto standalone de `cierre-extractor/Code.gs` (el que ya tiene `ANTHROPIC_API_KEY` configurada), reemplazá el código por la versión actualizada, y Nueva versión (la URL `/exec` tampoco cambia).
4. Hasta que se hagan los pasos 1-3, en `depositos.html` la pestaña "Historial de depósitos" va a mostrar datos incorrectos (porque `?action=depositos` todavía no existe en el backend viejo y cae al mismo endpoint que devuelve los cierres) y el botón "Asignar depósito" va a fallar al guardar — la pestaña "Resumen diario" sí funciona ya, porque solo lee `Cierres` con el endpoint que ya existe.

Las fotos de los comprobantes se guardan automáticamente en una carpeta "Depósitos - Comprobantes" en el mismo Drive donde vive "Cierres de caja" — no requiere configuración adicional.

## Mantenimiento — conectado

Destinos en Drive (dueño: jorge.lopez@casaaguizotes.com):
- Sheet de datos: `1Hd1CuITuquWIhSmT5CHIDliymUN0GwKhI8hvRc5ZAIQ` (https://docs.google.com/spreadsheets/d/1Hd1CuITuquWIhSmT5CHIDliymUN0GwKhI8hvRc5ZAIQ/edit), pestaña "Reportes".
- Carpeta de fotos: `1S6jva3a7ghN3rXmtrNzDHZHHs3O3JybL` (https://drive.google.com/drive/u/0/folders/1S6jva3a7ghN3rXmtrNzDHZHHs3O3JybL) — sin subcarpetas, un archivo por reporte.

`Code-mantenimiento-backend.gs` está desplegado como Web App y `MANT_URL` en `mantenimiento.html` ya apunta a ese `/exec`. `mantenimiento.html` también lee los encargados desde el backend de RRHH (`APPS_SCRIPT_RRHH` apunta al mismo `/exec` que usan las 8 páginas `rrhh-*.html`).

`index.html` también apunta su propio `MANT_URL` (widget "🔧 Mantenimiento" del home) a ese mismo `/exec` — muestra los reportes activos (no resueltos) con su badge de estado, igual que `mantenimiento.html`.

Verificado end-to-end (crear reporte → cambiar estado → agregar nota → subida de foto a Drive, todo reflejado en el Sheet y en el widget del home). Hay filas de prueba en la pestaña "Reportes" (encargado "PRUEBA BORRAR TEST") — se pueden borrar manualmente desde el Sheet sin afectar nada.

**Fix — "Guardando…" se quedaba trabado en celular:** las fotos de cámara pesan varios MB, y al convertirlas a base64 (+33%) el POST a `MANT_URL` se volvía gigante; en una red móvil lenta/inestable ese `fetch` podía quedar esperando para siempre sin resolver ni fallar, así que el `try/catch/finally` nunca llegaba a correr y el botón se quedaba en "Guardando…". Dos cambios en `mantenimiento.html`:
- `comprimirFoto()` redimensiona (máx. 1600px) y recomprime la foto a JPEG (calidad 0.75) client-side antes de convertirla a base64 — un ejemplo de prueba de 3000×2000 quedó en 18 KB de base64 en vez de varios MB.
- `fetchConTimeout()` envuelve todos los `fetch` a `MANT_URL`/`APPS_SCRIPT_RRHH` con un `AbortController` (30s general, 45s para el guardado con foto); si la conexión se cuelga, aborta y muestra el error en vez de trabarse — el reporte ya quedó guardado en `localStorage` como respaldo, así que no se pierde nada.

Si se agregan columnas, actualizar `ENCABEZADOS_REPORTES` en `Code-mantenimiento-backend.gs`, re-desplegar (Implementar → Gestionar implementaciones → Editar → Nueva versión — la URL `/exec` no cambia) y correr `configurarHoja()` de nuevo si hace falta.

## RRHH — conectado

Sheet de datos: "RRHH - LORITO IA" — `1m8RLK3GPB8rpJjA92D2_gGfIaU-7CIo_Bz9xKB1TbpA` (dueño: jorge.lopez@casaaguizotes.com), pestañas Personal / Vacaciones / Amonestaciones / Terminaciones / CambiosSalario / Liquidaciones.

`Code-rrhh-backend.gs` está desplegado como Web App y las 8 páginas (`rrhh-personal.html`, `rrhh-vacaciones.html`, `rrhh-control-vacaciones.html`, `rrhh-amonestaciones.html`, `rrhh-liquidaciones.html`, `rrhh-terminacion.html`, `rrhh-cambio-salario.html`, `rrhh-nuevo-ingreso.html`) ya apuntan a ese `/exec`. `rrhh-vacaciones.html` y `rrhh-amonestaciones.html` leen su historial del Sheet (antes solo vivía en localStorage).

Si se agregan columnas o módulos nuevos, actualizar los encabezados (`ENCABEZADOS_*`) en `Code-rrhh-backend.gs`, re-desplegar (Implementar → Gestionar implementaciones → Editar → Nueva versión — la URL `/exec` no cambia) y correr `configurarHojas()` de nuevo si se agregó una pestaña.

## Maestro de productos · historial de precios — despliegue pendiente

Arquitectura de 3 capas (Maestro de productos → Alias → Costo promedio) para
poder unificar productos comprados con nombres distintos entre proveedores
(ej. "Filete de Res" vs. "Lomo Res Premium") y calcular un costo promedio
ponderado (30 y 90 días) por producto real, en vez de por texto crudo de
factura. Vive toda en el Sheet "Registro compras LORITO_Brewhouse - IA"
(`1sxXDALDGotE1hoSMuTROZw33oAlE1ci7wXyVMnPe4xw`), junto a `Desglose_IA`.

`config-productos.html` fusiona en un solo archivo (con 3 pestañas) lo que
antes eran tres páginas separadas: "Pendientes de mapear" (resolver facturas
sin alias), "Catálogo (Maestro)" (editar/fusionar/eliminar productos del
Maestro — antes `maestro-productos.html`) y "Categorías y áreas" (administrar
las listas compartidas — antes `config-catalogos.html`); las tres quedaron
eliminadas como páginas propias. `Maestro_Productos` ya no tiene "Unidad
base" / "Unidad de compra default" — tiene "Categoría" y "Área de negocio".
El módulo entero (`config-productos.html` + `historial-precios.html`) se
movió del menú "Operaciones" a "Costos y recetas" en `index.html`, junto al
resto de `costos-*.html`.

Pasos para activarla (todos manuales, vía script.google.com):

1. Abrí el proyecto de Apps Script pegado en ese Sheet (el mismo de
   `Code-compras-backend.gs`), reemplazá el código por la versión actualizada
   de este repo, e Implementar → Gestionar implementaciones → Editar → Nueva
   versión (la URL `/exec` no cambia).
2. En ese mismo editor, corré **UNA VEZ**, en este orden:
   - `migrarNormalizacionAMaestro()` — migra el catálogo viejo
     `Normalizacion_Productos` hacia `Maestro_Productos` y `Alias_Productos`.
   - `poblarPendientesDesdeDesglose()` — carga a `Pendientes_Mapeo` el backlog
     de compras viejas que `config-productos.html` no puede ver solo (esa
     pantalla lee `Pendientes_Mapeo`, no escanea `Desglose_IA` directo).
   - `migrarEsquemaSinUnidades()` — quita "Unidad base"/"Unidad de compra
     default" de `Maestro_Productos` y `Costo_Promedio`, agrega "Área de
     negocio" a `Maestro_Productos`. **Importante:** mientras esta función no
     se corría, el código ya escribía por posición de columna asumiendo el
     esquema nuevo sobre hojas que todavía tenían el esquema viejo — eso hizo
     que "Área de negocio" quedara guardándose de verdad, pero bajo la
     columna todavía rotulada "Unidad base" (por eso no se veía reflejada en
     ninguna pantalla), y en `Costo_Promedio` llegó a correr números a
     celdas con formato de fecha y viceversa para los productos tocados
     recientemente. Esta versión de la función rescata esos datos corridos
     antes de reacomodar columnas, y al final llama a
     `recalcularTodosLosCostos()` para recalcular `Costo_Promedio` desde cero
     y dejarlo consistente — no hace falta correr nada más aparte.
   - `inicializarListasCompartidas()` — crea y siembra `Categorias_Productos`
     y `Areas_Negocio` con los valores por defecto (sin esto, esas hojas
     recién se crean solas con la primera edición desde la pestaña
     "Categorías y áreas" de `config-productos.html`, y hasta entonces todas
     las páginas que las leen por `gviz` las ven vacías — no es un error,
     solo falta este paso).
3. El script de OCR de facturas (vive en su propio Sheet,
   `11dfpbu92aGq-Moadys1BbltxA9iRJORYHPZDMKFw3P4`, código fuente en
   `facturas-extractor/Code.gs` de este repo) escribe cada línea de producto
   en su propia hoja "Facturas" — **no** directo en `Desglose_IA`; esa pestaña
   se sincroniza hacia el Sheet de compras por fuera de este script (fórmula
   o proceso aparte), así que puede tardar un poco en reflejar lo último.
   Por eso `facturas-extractor/Code.gs` ya incluye `notificarLineaCompra()`,
   que le avisa a `Code-compras-backend.gs` (vía `procesar_linea_compra`)
   mandándole cantidad/precio/fecha directamente, y `recalcularCostoPromedio()`
   los suma al toque sin esperar a que `Desglose_IA` se ponga al día (evita
   contarlos dos veces una vez que sí se sincronice). Solo falta pegar la
   versión actualizada de `facturas-extractor/Code.gs` en el editor de Apps
   Script de ese Sheet (Extensiones → Apps Script) y guardar — no hace falta
   redesplegar como Web App porque este script no lo es, corre desde el menú
   "Facturas" del propio Sheet.
4. `costos-productos.html` ahora también lee `Categorias_Productos` /
   `Areas_Negocio` (cruzando al Sheet de compras por `gviz`, de solo lectura)
   en vez de sus listas locales — no necesita ningún despliegue nuevo, solo
   que existan esas hojas (paso 2).
5. Una vez desplegado, cada factura nueva con un producto no reconocido cae en
   `Pendientes_Mapeo` — resolvelo una vez desde `config-productos.html`
   (asignándolo a un producto ya existente en el Maestro o creando uno nuevo)
   y queda automático para siempre.

Fuera de alcance por ahora: `costos-recetas.html` y
`costos-menu.html` siguen en `localStorage` sin backend propio, y
`factura-manual.html` sigue sin generar líneas de producto (solo cabecera
para cuentas por pagar).

## Base de productos (Code-costos-backend.gs) — fix de esquema pendiente

`Code-costos-backend.gs` (Sheet "COSTOS Y RECETAS - LORITO IA") lee
`Maestro_Productos` del Sheet de compras para armar `Faltantes_Costeo`. Antes
usaba columnas "Unidad base"/"Unidad de compra default" que ya no existen
ahí (ver migración de arriba) — actualicé `ENCABEZADOS_FALTANTES` y
`calcularFaltantes()` para usar "Área de negocio" en su lugar. Falta pegar
esta versión en el editor de Apps Script de ese Sheet (Implementar →
Gestionar implementaciones → Editar → Nueva versión) y correr
`actualizarControlFaltantes()` una vez para refrescar `Faltantes_Costeo` con
el esquema nuevo.

## Base de productos (costos-productos.html) — conectado

Sheet de datos: "COSTOS Y RECETAS - LORITO IA" — `1PtT9AHv2drY7oLygHKWMhHQgeOuT20_cD_igqu6ijyA`
(dueño: jorge.lopez@casaaguizotes.com). La pestaña "Productos" se puebla con
los productos que ya tienen costo real en `Costo_Promedio` del Sheet de
compras (`1sxXDALDGotE1hoSMuTROZw33oAlE1ci7wXyVMnPe4xw`; había 16 al momento de
escribir esto, todavía sin cargar en el Sheet nuevo); los demás productos de
`Maestro_Productos` todavía no tienen compras registradas y se agregan solos a
medida que se compran (vía `costos-productos.html` o carga masiva).

`Code-costos-backend.gs` implementa el módulo `producto` (alta/edición por ID,
borrado) y expone `?modulo=productos` de solo lectura — mismo patrón de
`Code-rrhh-backend.gs` (fetch GET simple con querystring, no JSONP). Los
módulos `receta` y `plato` (para `costos-recetas.html` / `costos-menu.html`)
todavía no están implementados en este backend.

Ya desplegado como Web App y `APPS_SCRIPT_COSTOS` en `costos-productos.html` ya
apunta a ese `/exec` (verificado con `?modulo=productos` → responde
`{"ok":true,"registros":[]}`, vacío porque la pestaña "Productos" del Sheet
todavía no tiene filas). Si se agregan columnas, actualizar
`ENCABEZADOS_PRODUCTOS` en `Code-costos-backend.gs`, re-desplegar (Implementar
→ Gestionar implementaciones → Editar → Nueva versión — la URL `/exec` no
cambia) y correr `configurarHojas()` de nuevo si hace falta.

`Code-costos-backend.gs` también expone `?modulo=nombres_normalizados`, que
abre el Sheet de compras por ID (`SHEET_COMPRAS_ID`) y lee el catálogo
completo de `Maestro_Productos` (ID, "Nombre normalizado", "Categoría", "Área
de negocio"), sumándole el "Costo promedio 30 días" de `Costo_Promedio` cuando
el producto ya tiene alguna compra registrada
(`{ ok:true, productos:[{id, nombre, categoria, area, costo}] }`). Es la
fuente del datalist de "Nuevo producto" en `costos-productos.html` (antes era
una lista fija en el código, y antes de eso leía solo de `Costo_Promedio` —
cambié la fuente a `Maestro_Productos` porque es el catálogo completo, 108
productos vs. los que ya tienen costo) y también autocompleta, al elegir un
nombre, categoría, área de negocio y precio de compra (costo promedio, si
existe; todo queda igual de editable que siempre) y el ID del producto (se
reutiliza en vez de generar uno nuevo, para quedar trazable al catálogo).

**Pendiente:** este módulo (con su nueva forma, que ahora incluye `categoria`
y `area`) se agregó/cambió después del último despliegue — hay que volver a
pegar `Code-costos-backend.gs` en el editor y hacer Implementar → Gestionar
implementaciones → Editar → Nueva versión (verificado con `curl`, hoy todavía
responde sin `categoria`/`area` porque el código desplegado es el viejo). La
primera vez que corra puede pedir reautorizar el script (accede a un Sheet
externo por primera vez).

`Code-costos-backend.gs` también expone `?modulo=proveedores`, que abre el
Sheet de compras por ID y lee su pestaña `proveedores` — es la fuente real de
`cargarProveedoresDesdeSheet()` en `costos-productos.html` (antes llamaba a un
endpoint JSONP que ningún backend implementaba; el dropdown solo funcionaba si
`proveedores.html` ya había poblado `localStorage` en el mismo navegador).
Elegí leer `proveedores` desde acá (con `SHEET_COMPRAS_ID`, mismo patrón que
`Costo_Promedio`/`Maestro_Productos`) en vez de agregarle un `doGet` a
`Code-compras-backend.gs`, para no tocar ese script ya desplegado y usado en
vivo por cuentas-por-pagar/factura-manual/maestro-productos/caja-chica/
config-productos.

**Control de faltantes:** la comparación vive en `calcularFaltantes()`
(`Code-costos-backend.gs`) — Maestro_Productos (Sheet de compras) contra la
pestaña "Productos" de este Sheet, por ID. Se usa en dos lugares:
- Menú "Costos" del Sheet (función `onOpen()`) → "Actualizar control de
  faltantes" corre `actualizarControlFaltantes()`, que deja el resultado en la
  pestaña `Faltantes_Costeo`. Manual porque Apps Script no detecta cambios en
  un Sheet externo solo.
- `?modulo=faltantes` (doGet) → devuelve el mismo resultado como JSON; es lo
  que lee `costos-productos.html` para mostrar el aviso "N producto(s) de
  compras sin registrar acá" arriba de la lista (colapsable, con botón
  "+ Agregar" por producto que precarga nombre/categoría/ID en "Nuevo
  producto" — el precio queda vacío porque todavía no tiene ninguna compra).

**Pendiente (de nuevo):** `?modulo=proveedores`, `?modulo=faltantes`,
`calcularFaltantes()`/`actualizarControlFaltantes()` y el menú "Costos" se
agregaron después del último despliegue — hay que volver a pegar
`Code-costos-backend.gs` y hacer Nueva versión, y correr `configurarHojas()`
una vez más para crear la pestaña `Faltantes_Costeo` (verificado con `curl`,
hoy `?modulo=faltantes` todavía responde "Módulo no reconocido").
