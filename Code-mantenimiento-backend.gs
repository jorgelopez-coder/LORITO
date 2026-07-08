/**
 * Backend Apps Script para el módulo de Mantenimiento (mantenimiento.html).
 *
 * Sheet de datos: https://docs.google.com/spreadsheets/d/1Hd1CuITuquWIhSmT5CHIDliymUN0GwKhI8hvRc5ZAIQ/edit
 * Carpeta de fotos: https://drive.google.com/drive/u/0/folders/1S6jva3a7ghN3rXmtrNzDHZHHs3O3JybL
 *
 * Cómo desplegarlo:
 * 1. Abrí el Google Sheet de arriba > Extensiones > Apps Script.
 * 2. Pegá este código (reemplazando el contenido del archivo por defecto).
 * 3. Corré UNA VEZ la función configurarHoja() desde el editor (▶ con
 *    configurarHoja seleccionado) para crear la pestaña "Reportes" con sus
 *    encabezados. La primera vez va a pedir autorizar el script (accede a
 *    Drive para guardar fotos).
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL del Web App resultante y reemplazá
 *    TODO_APPS_SCRIPT_MANTENIMIENTO_LORITO en mantenimiento.html (constante
 *    MANT_URL).
 */

const HOJA_REPORTES = 'Reportes';

const ENCABEZADOS_REPORTES = [
  'ID', 'Fecha', 'Hora', 'Encargado', 'Tipo', 'Detalle', 'Estado',
  'Foto URL', 'Fecha Resolución', 'Notas', 'Registrado'
];

// Carpeta fija de Drive donde se guardan las fotos de evidencia:
// https://drive.google.com/drive/u/0/folders/1S6jva3a7ghN3rXmtrNzDHZHHs3O3JybL
const FOLDER_ID_MANTENIMIENTO = '1S6jva3a7ghN3rXmtrNzDHZHHs3O3JybL';

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el Sheet.
function configurarHoja() {
  prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
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

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Mapea las filas de una hoja a objetos usando la fila 1 como claves de encabezado.
function filasComoObjetos(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return [];
  const nCols = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, nCols).getValues()[0];
  const datos = hoja.getRange(2, 1, nFilas, nCols).getValues();
  return datos.map(function(fila) {
    const obj = {};
    encabezados.forEach(function(h, i) {
      if (!h) return;
      let v = fila[i];
      if (v instanceof Date) v = Utilities.formatDate(v, 'America/Costa_Rica', 'yyyy-MM-dd');
      obj[h] = v;
    });
    return obj;
  });
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

    switch (payload.accion) {
      case 'cambiar_estado':   return jsonOut(cambiarEstado(payload));
      case 'fijar_resolucion': return jsonOut(fijarResolucion(payload));
      case 'agregar_nota':     return jsonOut(agregarNota(payload));
      default:                 return jsonOut(crearReporte(payload));
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, respetando el orden real de columnas.
function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca la fila (1-indexada) de un reporte por ID. Devuelve -1 si no existe.
function filaReporte(hoja, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colId = ENCABEZADOS_REPORTES.indexOf('ID') + 1;
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  const buscado = String(id);
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === buscado) return i + 2;
  }
  return -1;
}

function crearReporte(p) {
  if (!p.encargado) throw new Error('Falta quién reporta.');
  if (!p.tipo) throw new Error('Falta el tipo de incidencia.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const id = p.id || Date.now();
  const fotoUrl = guardarFotoEnDrive(p, id);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_REPORTES, {
    'ID': id,
    'Fecha': p.fecha || hoyCR(),
    'Hora': p.hora || '',
    'Encargado': p.encargado,
    'Tipo': p.tipo,
    'Detalle': p.detalle || '',
    'Estado': p.estado || 'Pendiente',
    'Foto URL': fotoUrl,
    'Fecha Resolución': '',
    'Notas': '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });
  return { ok: true, fila: fila, fotoUrl: fotoUrl };
}

function cambiarEstado(p) {
  if (!p.id) throw new Error('Falta el ID del reporte.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const fila = filaReporte(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el reporte ' + p.id);
  const colEstado = ENCABEZADOS_REPORTES.indexOf('Estado') + 1;
  hoja.getRange(fila, colEstado).setValue(p.estado || 'Pendiente');
  return { ok: true, fila: fila };
}

function fijarResolucion(p) {
  if (!p.id) throw new Error('Falta el ID del reporte.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const fila = filaReporte(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el reporte ' + p.id);
  const colFecha = ENCABEZADOS_REPORTES.indexOf('Fecha Resolución') + 1;
  hoja.getRange(fila, colFecha).setValue(p.fecha_resolucion || '');
  return { ok: true, fila: fila };
}

function agregarNota(p) {
  if (!p.id) throw new Error('Falta el ID del reporte.');
  if (!p.nota) throw new Error('Falta el texto de la nota.');
  const hoja = prepararHoja(HOJA_REPORTES, ENCABEZADOS_REPORTES);
  const fila = filaReporte(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el reporte ' + p.id);
  const colNotas = ENCABEZADOS_REPORTES.indexOf('Notas') + 1;
  const actual = String(hoja.getRange(fila, colNotas).getValue() || '');
  const autor = p.autor ? ' - ' + p.autor : '';
  const linea = `[${hoyCR()}${autor}] ${p.nota}`;
  const nuevo = actual ? actual + '\n' + linea : linea;
  hoja.getRange(fila, colNotas).setValue(nuevo);
  return { ok: true, fila: fila };
}

// ── FOTO DE EVIDENCIA → GOOGLE DRIVE ─────────────────────────────
function guardarFotoEnDrive(p, id) {
  if (!p.foto) return '';
  const datos = extraerBase64(p.foto);
  if (!datos) return '';
  const carpeta = DriveApp.getFolderById(FOLDER_ID_MANTENIMIENTO);
  const tipo = (p.tipo || 'reporte').toString().replace(/[^\w\-]+/g, '_');
  const nombre = `${p.fecha || hoyCR()}_${tipo}_${id}.jpg`;
  const bytes = Utilities.base64Decode(datos.base64);
  const blob = Utilities.newBlob(bytes, datos.mime, nombre);
  const file = carpeta.createFile(blob);
  return file.getUrl();
}

// Separa una data URL ("data:image/jpeg;base64,/9j/4AAQ...") en mime + base64.
function extraerBase64(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}
