/**
 * Backend Apps Script para el Sheet "COSTOS Y RECETAS - LORITO IA" (Base de productos).
 * Usado por costos-productos.html. costos-recetas.html y costos-menu.html
 * comparten el mismo placeholder APPS_SCRIPT_COSTOS pero sus módulos
 * ('receta', 'plato') todavía no están implementados acá — quedan para
 * cuando se conecten esas dos páginas.
 *
 * Cómo desplegarlo:
 * 1. Abrí el Google Sheet "COSTOS Y RECETAS - LORITO IA" > Extensiones > Apps Script.
 * 2. Pegá este código (reemplazando el contenido del archivo por defecto).
 * 3. Corré UNA VEZ la función configurarHojas() desde el editor (▶ con
 *    configurarHojas seleccionado) para crear la pestaña "Productos" con sus encabezados.
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL del Web App resultante y reemplazá TODO_APPS_SCRIPT_COSTOS_LORITO
 *    en costos-productos.html.
 */

const HOJA_PRODUCTOS = 'Productos';

const ENCABEZADOS_PRODUCTOS = [
  'ID', 'Nombre', 'Categoría', 'Área de negocio', 'Unidad', 'Presentación', 'Tamaño',
  'Precio sin IVA', 'IVA (%)', 'Cantidad presentación', 'Costo por unidad', 'Rendimiento (%)',
  'Proveedor', 'Stock mínimo', 'En uso', 'Actualizado'
];

// Sheet de compras ("Registro compras LORITO_Brewhouse - IA"), donde vive Costo_Promedio.
// Es un Sheet distinto al que tiene pegado este script — se abre por ID.
const SHEET_COMPRAS_ID = '1sxXDALDGotE1hoSMuTROZw33oAlE1ci7wXyVMnPe4xw';
const HOJA_COSTO_PROMEDIO = 'Costo_Promedio';

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el Sheet.
function configurarHojas() {
  prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
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

// ── doGet ──────────────────────────────────────────────────────────
function doGet(e) {
  try {
    const modulo = e.parameter.modulo;
    if (modulo === 'nombres_normalizados') {
      return jsonOut({ ok: true, productos: nombresNormalizados() });
    }
    let hoja;
    switch (modulo) {
      case 'productos': hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS); break;
      default:
        return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    }
    return jsonOut({ ok: true, registros: filasComoObjetos(hoja) });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Lee Costo_Promedio (Sheet de compras) y devuelve, por producto, el ID, el
// "Nombre normalizado" y el costo promedio de 30 días — usado en
// costos-productos.html para el datalist de "Nuevo producto" y para
// autocompletar precio de compra + ID al elegir un nombre.
function nombresNormalizados() {
  const ss = SpreadsheetApp.openById(SHEET_COMPRAS_ID);
  const hoja = ss.getSheetByName(HOJA_COSTO_PROMEDIO);
  if (!hoja) return [];
  const registros = filasComoObjetos(hoja);
  return registros
    .filter(r => r['Nombre normalizado'])
    .map(r => ({
      id: r['ID producto'] || '',
      nombre: r['Nombre normalizado'],
      costo: Number(r['Costo promedio 30 días']) || 0
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
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

    let result;
    switch (payload.modulo) {
      case 'producto': result = guardarProducto(payload); break;
      case 'eliminar': result = eliminarRegistro(payload); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, respetando el orden real de columnas.
function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

// Busca la fila (1-indexada) de un producto por su ID. Devuelve -1 si no existe.
function filaProducto(hoja, id) {
  if (!id) return -1;
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colId = ENCABEZADOS_PRODUCTOS.indexOf('ID') + 1;
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Crea o actualiza (upsert por ID) un producto. costos-productos.html siempre manda
// un ID (generado en el navegador), así que esto simplemente respeta ese ID.
function guardarProducto(p) {
  if (!p.nombre) throw new Error('Falta el nombre del producto.');
  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  const id = p.id || ('PRD-' + Date.now());
  let fila = filaProducto(hoja, id);
  if (fila === -1) fila = hoja.getLastRow() + 1;

  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PRODUCTOS, {
    'ID': id,
    'Nombre': p.nombre,
    'Categoría': p.categoria || '',
    'Área de negocio': p.area || '',
    'Unidad': p.unidad || '',
    'Presentación': p.presentacion || '',
    'Tamaño': p.tamano || '',
    'Precio sin IVA': Number(p.precio_sin_iva) || 0,
    'IVA (%)': Number(p.iva) || 0,
    'Cantidad presentación': Number(p.cantidad_presentacion) || 1,
    'Costo por unidad': Number(p.costo) || 0,
    'Rendimiento (%)': Number(p.rendimiento) || 100,
    'Proveedor': p.proveedor || '',
    'Stock mínimo': Number(p.stock_minimo) || 0,
    'En uso': p.en_uso === false || p.en_uso === 'false' ? false : true,
    'Actualizado': new Date().toISOString()
  });
  return { fila: fila, id: id };
}

function eliminarRegistro(p) {
  if (p.tipo !== 'productos') throw new Error('Tipo no reconocido: ' + p.tipo);
  if (!p.id) throw new Error('Falta el ID a eliminar.');
  const hoja = prepararHoja(HOJA_PRODUCTOS, ENCABEZADOS_PRODUCTOS);
  const fila = filaProducto(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el producto.');
  hoja.deleteRow(fila);
  return { eliminado: p.id };
}
