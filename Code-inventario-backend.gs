/**
 * Backend Apps Script para el Sheet "Inventarios - Lorito IA".
 * Usado por inventario.html de ecosistema-lorito.
 *
 * Cómo desplegarlo:
 * 1. Abrí el Google Sheet "Inventarios - Lorito IA"
 *    (https://docs.google.com/spreadsheets/d/14kRIMIe0BKX6ElMnx4NuLdO5mM3TeNpQaYuTFf13el0)
 *    > Extensiones > Apps Script.
 * 2. Pegá este código (reemplazando el contenido del archivo por defecto).
 * 3. Corré UNA VEZ la función configurarHojas() desde el editor (▶ con
 *    configurarHojas seleccionado) para crear la pestaña HISTORIAL_inventario
 *    con sus encabezados.
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL del Web App resultante y reemplazá TODO_APPS_SCRIPT_INVENTARIO_LORITO
 *    en inventario.html.
 * 6. Compartí el Sheet como "Cualquiera con el enlace puede ver" (Lector), para
 *    que inventario.html pueda leer el historial vía la API pública de gviz
 *    sin necesitar autenticación.
 */

const HOJA_HISTORIAL = 'HISTORIAL_inventario';

const ENCABEZADOS_HISTORIAL = [
  'Toma ID', 'Fecha toma', 'Fecha inicio', 'Fecha fin',
  'Producto', 'Categoría', 'Área', 'Presentación', 'Unidad',
  'Precio sin IVA', 'Cant. completos', 'Cant. en uso',
  'Valor cerrado', 'Valor abierto', 'Valor total línea',
  'Registrado'
];

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el Sheet.
function configurarHojas() {
  prepararHoja(HOJA_HISTORIAL, ENCABEZADOS_HISTORIAL);
}

function prepararHoja(nombre, encabezados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    hoja.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── doPost ─────────────────────────────────────────────────────────
function doPost(e) {
  try {
    let payload = null;
    if (e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents); } catch (err) { payload = null; }
    }
    if (!payload && e.parameter && e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    }
    if (!payload) throw new Error('No se recibieron datos.');

    let result;
    switch (payload.modulo) {
      case 'inventario': result = guardarInventario(payload); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function guardarInventario(p) {
  const lineas = p.lineas || [];
  if (!lineas.length) throw new Error('La toma no tiene líneas contadas.');

  const hoja = prepararHoja(HOJA_HISTORIAL, ENCABEZADOS_HISTORIAL);
  const registrado = new Date().toISOString();

  const filas = lineas.map(function(l) {
    return [
      p.id || '',
      p.fecha_toma || '',
      p.fecha_inicio || '',
      p.fecha_fin || '',
      l.nombre || '',
      l.categoria || '',
      l.area || '',
      l.presentacion || '',
      l.unidad || '',
      Number(l.precio_sin_iva) || 0,
      Number(l.cerrado) || 0,
      Number(l.abierto) || 0,
      Number(l.val_cerrado) || 0,
      Number(l.val_abierto) || 0,
      Number(l.valor) || 0,
      registrado
    ];
  });

  const filaInicio = hoja.getLastRow() + 1;
  hoja.getRange(filaInicio, 1, filas.length, ENCABEZADOS_HISTORIAL.length).setValues(filas);

  return { filas_escritas: filas.length, fila_inicio: filaInicio };
}
