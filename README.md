# Ecosistema Lorito
Sistema de operaciones para Restaurante Lorito (Grupo del Sol), adaptado del ecosistema de Casa Aguizotes/Batanga.

## Pendientes de conexión
Los siguientes backends de Apps Script aún no existen (sheets nuevas y vacías) y deben desplegarse y pegarse en el código donde aparece cada placeholder:
- `TODO_APPS_SCRIPT_COSTOS_LORITO` → hoja "COSTOS Y RECETAS - LORITO IA"
- `TODO_APPS_SCRIPT_COMPRAS_LORITO`, `TODO_APPS_SCRIPT_MANTENIMIENTO_LORITO` → hoja "Operaciones - Lorito IA"
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

Pasos para activarla (todos manuales, vía script.google.com):

1. Abrí el proyecto de Apps Script pegado en ese Sheet (el mismo de
   `Code-compras-backend.gs`), reemplazá el código por la versión actualizada
   de este repo, e Implementar → Gestionar implementaciones → Editar → Nueva
   versión (la URL `/exec` no cambia).
2. En ese mismo editor, corré **UNA VEZ** la función `migrarNormalizacionAMaestro()`
   para migrar el catálogo viejo `Normalizacion_Productos` hacia las hojas
   nuevas `Maestro_Productos` y `Alias_Productos` (crea las hojas
   `Pendientes_Mapeo` y `Costo_Promedio` automáticamente cuando hagan falta).
   Después corré también, **UNA VEZ**, `poblarPendientesDesdeDesglose()`: sin
   esto, `config-productos.html` va a mostrar "Todo mapeado" aunque haya
   compras viejas sin registrar, porque esa pantalla solo lee
   `Pendientes_Mapeo` (no escanea `Desglose_IA` directo) y esa hoja recién
   empieza a llenarse sola con las facturas que se procesen *después* de
   conectar el paso 3 — las líneas de compra que ya existían antes no caen
   ahí solas.
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
4. Hasta que se hagan los pasos 1-3, `historial-precios.html` va a mostrar
   "Ningún producto mapeado todavía" (porque `Alias_Productos` no existe) y
   `config-productos.html` va a mostrar "Todo mapeado" (porque
   `Pendientes_Mapeo` tampoco existe) — ambos estados son correctos para
   "todavía no desplegado", no errores.
5. Una vez desplegado, cada factura nueva con un producto no reconocido cae en
   `Pendientes_Mapeo` — resolvelo una vez desde `config-productos.html`
   (asignándolo a un producto ya existente en el Maestro o creando uno nuevo)
   y queda automático para siempre.

Fuera de alcance por ahora: `costos-recetas.html` y
`costos-menu.html` siguen en `localStorage` sin backend propio, y
`factura-manual.html` sigue sin generar líneas de producto (solo cabecera
para cuentas por pagar).

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
abre el Sheet de compras por ID (`SHEET_COMPRAS_ID`) y lee la columna "Nombre
normalizado" de `Costo_Promedio` — es la fuente del datalist de "Nuevo
producto" en `costos-productos.html` (antes era una lista fija en el código).
**Pendiente:** este módulo se agregó después del primer despliegue, así que
hay que volver a pegar `Code-costos-backend.gs` en el editor y hacer
Implementar → Gestionar implementaciones → Editar → Nueva versión (verificado
con `curl`, hoy responde `"Módulo no reconocido: nombres_normalizados"`
porque el código desplegado es el viejo). La primera vez que corra puede pedir
reautorizar el script (accede a un Sheet externo por primera vez).

Nota: `cargarProveedoresDesdeSheet()` en `costos-productos.html` todavía apunta
a `APPS_SCRIPT_COSTOS` con un formato JSONP que ningún backend de este repo
implementa (los proveedores en realidad viven en `Code-compras-backend.gs`,
que hoy solo tiene `doPost`, sin `doGet`) — el dropdown de proveedor sigue
funcionando igual porque lee de `localStorage` compartido con
`proveedores.html`, pero esa sincronización directa contra el Sheet queda
pendiente y fuera de alcance de este cambio.
