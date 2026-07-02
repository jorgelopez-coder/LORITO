# Ecosistema Lorito
Sistema de operaciones para Restaurante Lorito (Grupo del Sol), adaptado del ecosistema de Casa Aguizotes/Batanga.

## Pendientes de conexión
Los siguientes backends de Apps Script aún no existen (sheets nuevas y vacías) y deben desplegarse y pegarse en el código donde aparece cada placeholder:
- `TODO_APPS_SCRIPT_RRHH_LORITO` → hoja "RRHH - LORITO IA"
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
