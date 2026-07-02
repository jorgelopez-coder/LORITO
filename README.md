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
