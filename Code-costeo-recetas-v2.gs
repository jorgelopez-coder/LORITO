// ============================================
// CONFIGURACIÓN
// ============================================
// IMPORTANTE: este script vive en un archivo NUEVO (donde están Catalogo_Maestro,
// Alias_Proveedores, etc.). Desglose_IA y proveedores viven en el archivo ORIGINAL
// (Sheet de compras), así que hay que abrirlo explícitamente por ID —
// SpreadsheetApp.getActive() nunca lo va a ver. Nunca se escribe ahí.
const SOURCE_SPREADSHEET_ID = '1sxXDALDGotE1hoSMuTROZw33oAlE1ci7wXyVMnPe4xw'; // archivo con Desglose_IA y proveedores

const SHEET_CATALOGO    = 'Catalogo_Maestro';
const SHEET_ALIAS       = 'Alias_Proveedores';
const SHEET_HISTORIAL   = 'Historial_Precios';
const SHEET_PENDIENTES  = 'Compras_Pendientes';
const SHEET_FACTURAS    = 'Desglose_IA'; // hoja real confirmada, en el archivo fuente
const SHEET_PROVEEDORES = 'proveedores'; // también en el archivo fuente
const SHEET_CATEGORIAS  = 'Categorias_Productos';
const SHEET_AREAS       = 'Areas_Negocio';
const SHEET_RECETAS     = 'Recetas';
const SHEET_RECETA_ING  = 'Receta_Ingredientes';
const SHEET_MENU        = 'Menu';

const UMBRAL_AUTOMATCH = 0.82;
const VENTANA_COMPRAS  = 5;
const MONEDA_COSTEO    = 'CRC'; // facturas en otra moneda van a revisión manual

const CATALOGO_ENCABEZADOS = [
  'ID_Producto', 'Nombre_Estandar', 'Categoria', 'Area_Negocio', 'Unidad_Medida',
  'Presentacion', 'Tamano', 'Cantidad_Presentacion', 'Precio_Sin_IVA', 'IVA',
  'Costo_Actual', 'Rendimiento', 'Proveedor_Habitual', 'Stock_Minimo', 'En_Uso',
  'Fecha_Ultima_Actualizacion', 'Aplica_Receta'
];

// Mismos valores por defecto que ya usa Code-compras-backend.gs, para que
// Categorías/Áreas se vean familiares aunque ahora vivan en este spreadsheet.
const CATEGORIAS_DEFAULT = [
  'Carnes', 'Mariscos', 'Aves', 'Lácteos', 'Aceites y Grasas', 'Frutas y Verduras',
  'Granos y Cereales', 'Bebidas', 'Panadería y Repostería', 'Condimentos y Especias',
  'Limpieza e Higiene', 'Empaques y Desechables', 'Servicios', 'Otros'
];
const AREAS_DEFAULT = ['Cocina', 'Bar', 'Consumible', 'Otro'];

function abrirSpreadsheetCompras() {
  return SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
}
function abrirHojaDesglose() {
  return abrirSpreadsheetCompras().getSheetByName(SHEET_FACTURAS);
}
function abrirHojaProveedoresCompras() {
  return abrirSpreadsheetCompras().getSheetByName(SHEET_PROVEEDORES);
}

// ============================================
// UTILIDADES GENERALES
// ============================================
function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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

function encabezadosDe(hoja) {
  return hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
}

// Busca la fila (1-indexada) donde una columna (por nombre de encabezado) vale `id`. -1 si no existe.
function filaPorId(hoja, nombreColumnaId, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const encabezados = encabezadosDe(hoja);
  const colId = encabezados.indexOf(nombreColumnaId) + 1;
  if (colId === 0) return -1;
  const valores = hoja.getRange(2, colId, nFilas, 1).getValues();
  for (let i = 0; i < valores.length; i++) {
    if (String(valores[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Escribe un objeto {NombreDeEncabezado: valor} en una fila, respetando el orden real de columnas.
function escribirFilaPorEncabezado(hoja, fila, encabezados, valores) {
  const datos = encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
  hoja.getRange(fila, 1, 1, encabezados.length).setValues([datos]);
}

function filaDesdeObjeto(encabezados, valores) {
  return encabezados.map(function(h) { return (h in valores) ? valores[h] : ''; });
}

function leerHojaConEncabezados(hoja) {
  const nCols = hoja.getLastColumn();
  const nFilas = hoja.getLastRow();
  if (nFilas < 1) return { encabezados: [], datos: [] };
  const valores = hoja.getRange(1, 1, nFilas, nCols).getValues();
  return { encabezados: valores[0], datos: valores.slice(1) };
}

function escribirDatos(hoja, encabezados, datos) {
  if (datos.length === 0) return;
  hoja.getRange(2, 1, datos.length, encabezados.length).setValues(datos);
}

// ============================================
// 0. CREACIÓN DE HOJAS Y ENCABEZADOS (correr una sola vez)
// ============================================
function crearHojasIniciales() {
  const ss = SpreadsheetApp.getActive();

  crearHojaConEncabezados(ss, SHEET_CATALOGO, CATALOGO_ENCABEZADOS);

  crearHojaConEncabezados(ss, SHEET_ALIAS,
    ['Nombre_Factura', 'ID_Producto_Maestro', 'Proveedor', 'Confianza', 'Estado']);

  crearHojaConEncabezados(ss, SHEET_HISTORIAL,
    ['Fecha_Registro', 'Fecha_Factura', 'ID_Producto', 'Proveedor', 'Moneda', 'Precio_Unitario', 'Cantidad', 'Ref_Factura']);

  crearHojaConEncabezados(ss, SHEET_PENDIENTES,
    ['Fecha_Registro', 'Fecha_Factura', 'Nombre_Producto', 'Proveedor', 'Moneda', 'Precio_Unitario', 'Cantidad', 'Ref_Factura', 'ID_Producto_Sugerido']);

  crearHojaConEncabezados(ss, SHEET_CATEGORIAS, ['Categoria']);
  crearHojaConEncabezados(ss, SHEET_AREAS, ['Area_Negocio']);

  crearHojaConEncabezados(ss, SHEET_RECETAS,
    ['ID_Receta', 'Nombre', 'Tipo', 'Porciones', 'Unidad', 'ID_Plato', 'Costo_Total', 'Costo_Porcion', 'Fecha_Actualizacion']);

  crearHojaConEncabezados(ss, SHEET_RECETA_ING,
    ['ID_Receta', 'Fuente_Tipo', 'Fuente_ID', 'Cantidad', 'Unidad', 'Costo_Linea']);

  crearHojaConEncabezados(ss, SHEET_MENU,
    ['ID_Plato', 'Nombre', 'Categoria', 'Precio_Venta', 'Disponibilidad', 'Descripcion', 'ID_Receta', 'Costo_Receta', 'FC', 'Fecha_Actualizacion']);

  sembrarListaCompartida(ss, SHEET_CATEGORIAS, CATEGORIAS_DEFAULT);
  sembrarListaCompartida(ss, SHEET_AREAS, AREAS_DEFAULT);

  Logger.log('Hojas creadas/verificadas.');
}

function crearHojaConEncabezados(ss, nombreHoja, encabezados) {
  let sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) sheet = ss.insertSheet(nombreHoja);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sembrarListaCompartida(ss, nombreHoja, valoresDefault) {
  const sh = ss.getSheetByName(nombreHoja);
  if (sh.getLastRow() > 1) return; // ya tiene valores, no pisar
  const filas = valoresDefault.map(function(v) { return [v]; });
  sh.getRange(2, 1, filas.length, 1).setValues(filas);
}

// Migración: agrega la columna Aplica_Receta a un Catalogo_Maestro que ya
// tiene datos (crearHojaConEncabezados solo escribe encabezados en hojas
// vacías, así que un despliegue ya en uso no la recibe sola). Corré esto UNA
// VEZ si el Sheet ya tenía productos antes de este cambio. Todos los
// productos existentes quedan en `true` — revisá a mano los que no
// correspondan (limpieza, empaques, servicios, etc.) y pasalos a "No" desde
// costos-productos.html.
function migrarAgregarAplicaReceta() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO);
  const encabezados = encabezadosDe(sh);
  if (encabezados.indexOf('Aplica_Receta') !== -1) {
    Logger.log('La columna Aplica_Receta ya existe, no hace falta migrar.');
    return;
  }
  const nuevaCol = encabezados.length + 1;
  sh.getRange(1, nuevaCol).setValue('Aplica_Receta');
  const nFilas = sh.getLastRow() - 1;
  if (nFilas > 0) {
    sh.getRange(2, nuevaCol, nFilas, 1).setValues(Array(nFilas).fill([true]));
  }
  Logger.log('Columna Aplica_Receta agregada; ' + nFilas + ' producto(s) existentes quedaron en true.');
}

// ============================================
// 0.1 POBLAR Catalogo_Maestro CON PRODUCTOS ÚNICOS DE Desglose_IA
// Correr UNA VEZ, después de crearHojasIniciales(). Es seguro re-correrla:
// no duplica productos que ya estén en el catálogo.
// ============================================
function poblarCatalogoDesdeDesglose() {
  const ss = SpreadsheetApp.getActive();
  const shDesglose = abrirHojaDesglose();
  const shCatalogo = ss.getSheetByName(SHEET_CATALOGO);

  if (!shDesglose) {
    throw new Error('No encontré la hoja "' + SHEET_FACTURAS + '" en el archivo con ID ' + SOURCE_SPREADSHEET_ID + '. Verificá el ID y que el nombre de la pestaña sea exacto.');
  }
  if (!shCatalogo) {
    throw new Error('No encontré la hoja "' + SHEET_CATALOGO + '". Corré primero crearHojasIniciales().');
  }

  const data = shDesglose.getDataRange().getValues();
  const catData = shCatalogo.getDataRange().getValues();

  // Nombres ya presentes en el catálogo, para no duplicar
  const vistos = new Set();
  let siguienteId = 0;
  for (let i = 1; i < catData.length; i++) {
    vistos.add(normalizarTexto(catData[i][1]));
    const match = /^P(\d+)$/.exec(catData[i][0]);
    if (match) siguienteId = Math.max(siguienteId, parseInt(match[1], 10));
  } // siguienteId = mayor ID_Producto existente, no la cantidad de filas
  // (si se borra una fila del catálogo a mano, el conteo de filas queda corto
  // y el próximo ID generado podría chocar con uno ya usado)

  const filasNuevas = [];
  for (let i = 1; i < data.length; i++) {
    const categoria = data[i][6];          // columna G
    const nombreNormalizado = data[i][8];  // columna I
    const unidad = data[i][9];             // columna J
    if (!nombreNormalizado) continue;

    const clave = normalizarTexto(nombreNormalizado);
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    siguienteId++;
    const id = 'P' + String(siguienteId).padStart(4, '0');
    filasNuevas.push(filaDesdeObjeto(CATALOGO_ENCABEZADOS, {
      'ID_Producto': id,
      'Nombre_Estandar': nombreNormalizado,
      'Categoria': categoria,
      'Unidad_Medida': unidad,
      'Cantidad_Presentacion': 1,
      'Rendimiento': 100,
      'En_Uso': true,
      'Aplica_Receta': true
    }));
  }

  if (filasNuevas.length > 0) {
    shCatalogo.getRange(shCatalogo.getLastRow() + 1, 1, filasNuevas.length, CATALOGO_ENCABEZADOS.length).setValues(filasNuevas);
  }
  Logger.log(filasNuevas.length + ' productos nuevos agregados al catálogo.');
}

// Claves de deduplicación para el backfill — permiten re-correrlo sin
// duplicar filas ya cargadas.
function claveHistorial(refFactura, idProducto, fecha) {
  const fechaStr = fecha instanceof Date ? Utilities.formatDate(fecha, 'America/Costa_Rica', 'yyyy-MM-dd') : String(fecha || '');
  return [String(refFactura || ''), String(idProducto || ''), fechaStr].join('|');
}
function clavePendiente(refFactura, nombre, proveedor) {
  return [String(refFactura || ''), normalizarTexto(nombre), String(proveedor || '')].join('|');
}

// ============================================
// 0.2 BACKFILL: procesar TODO el historial existente de Desglose_IA
// Corre UNA VEZ, después de poblarCatalogoDesdeDesglose(). Esa función solo
// arma el catálogo (nombres/ID) a partir de Desglose_IA — nunca registra las
// compras viejas como compras reales, así que los productos que ya existían
// ahí quedan con Costo_Actual vacío hasta que llega una compra NUEVA (vía
// el trigger onNuevaLineaFactura). Este backfill corre el mismo matching
// (procesarLineaFactura) sobre TODO el histórico para que el costo ya
// arranque poblado. Es segura de re-correr: no duplica ni Historial_Precios
// ni Compras_Pendientes (dedup por referencia de factura + producto/nombre).
// Carga Alias_Proveedores/Catalogo_Maestro una sola vez en memoria (en vez
// de releerlos por cada línea) para no quedarse sin tiempo de ejecución en
// facturas con muchas líneas.
// ============================================
function backfillHistorialDesdeDesglose() {
  const shDesglose = abrirHojaDesglose();
  if (!shDesglose) {
    throw new Error('No encontré la hoja "' + SHEET_FACTURAS + '" en el archivo con ID ' + SOURCE_SPREADSHEET_ID + '.');
  }

  const ss = SpreadsheetApp.getActive();
  const shAlias = ss.getSheetByName(SHEET_ALIAS);
  const shCatalogo = ss.getSheetByName(SHEET_CATALOGO);
  const shHistorial = ss.getSheetByName(SHEET_HISTORIAL);
  const shPendientes = ss.getSheetByName(SHEET_PENDIENTES);

  const aliasData = shAlias.getDataRange().getValues();
  const catData = shCatalogo.getDataRange().getValues();

  const yaCargadas = new Set(filasComoObjetos(shHistorial).map(function(r) {
    return claveHistorial(r['Ref_Factura'], r['ID_Producto'], r['Fecha_Factura']);
  }));
  const yaPendientes = new Set(filasComoObjetos(shPendientes).map(function(r) {
    return clavePendiente(r['Ref_Factura'], r['Nombre_Producto'], r['Proveedor']);
  }));

  const data = shDesglose.getDataRange().getValues();
  const productosAfectados = new Set();
  const filasHistorial = [];
  const filasPendientes = [];
  let omitidas = 0;

  for (let i = 1; i < data.length; i++) {
    const v = data[i];
    const moneda = v[1], refFactura = v[2], fecha = v[3], proveedor = v[5],
          categoria = v[6], nombreProducto = v[7], nombreNormalizado = v[8],
          cantidad = v[10], precioUnitario = v[11];

    if (!nombreProducto && !nombreNormalizado) continue;
    const llave = nombreNormalizado || nombreProducto;

    if (moneda && moneda !== MONEDA_COSTEO) {
      const cp = clavePendiente(refFactura, llave, proveedor);
      if (yaPendientes.has(cp)) { omitidas++; continue; }
      yaPendientes.add(cp);
      filasPendientes.push([new Date(), fecha, llave, proveedor, moneda, precioUnitario, cantidad, refFactura, '']);
      continue;
    }

    const resuelto = resolverIdProductoConDatos(llave, proveedor, categoria, aliasData, catData, shAlias);
    if (!resuelto.aprobado) {
      const cp = clavePendiente(refFactura, llave, proveedor);
      if (yaPendientes.has(cp)) { omitidas++; continue; }
      yaPendientes.add(cp);
      filasPendientes.push([new Date(), fecha, llave, proveedor, moneda, precioUnitario, cantidad, refFactura, resuelto.id || '']);
      continue;
    }

    const ch = claveHistorial(refFactura, resuelto.id, fecha);
    if (yaCargadas.has(ch)) { omitidas++; continue; }
    yaCargadas.add(ch);
    filasHistorial.push([new Date(), fecha, resuelto.id, proveedor, moneda, precioUnitario, cantidad, refFactura]);
    productosAfectados.add(resuelto.id);
  }

  if (filasHistorial.length > 0) {
    shHistorial.getRange(shHistorial.getLastRow() + 1, 1, filasHistorial.length, 8).setValues(filasHistorial);
  }
  if (filasPendientes.length > 0) {
    shPendientes.getRange(shPendientes.getLastRow() + 1, 1, filasPendientes.length, 9).setValues(filasPendientes);
  }
  // Recién ahora, con Historial_Precios ya escrito: recalcula Costo_Actual
  // por producto (una vez por producto, no por línea) y dispara la cascada
  // hacia recetas/menú.
  productosAfectados.forEach(function(id) { actualizarCostoProducto(id); });

  Logger.log(filasHistorial.length + ' líneas cargadas a Historial_Precios, ' +
             filasPendientes.length + ' a Compras_Pendientes, ' + omitidas + ' ya existían, ' +
             productosAfectados.size + ' productos recosteados.');
}

// ============================================
// 1. NORMALIZACIÓN Y SIMILITUD DE TEXTO
// ============================================
function normalizarTexto(texto) {
  return texto.toString().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(KG|GR|UND|UNIDAD|LTS?|ML|CJA|CAJA|PAQ|PAQUETE)\b/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function distanciaLevenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? m[i - 1][j - 1]
        : Math.min(m[i-1][j-1] + 1, m[i][j-1] + 1, m[i-1][j] + 1);
    }
  }
  return m[b.length][a.length];
}

function similitud(a, b) {
  const na = normalizarTexto(a), nb = normalizarTexto(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - distanciaLevenshtein(na, nb) / maxLen;
}

// ============================================
// 2. MATCHING AUTOMÁTICO
// ============================================
// Resuelve el ID_Producto para (llave, proveedor): alias ya conocido, o
// mejor match por similitud contra el catálogo (crea el alias si hace
// falta). Devuelve { id, aprobado } — aprobado=false significa "quedó como
// Pendiente revisión", el llamador decide qué hacer con eso (guardarPendiente).
// Recibe aliasData/catData ya cargados (arrays crudos) para que el backfill
// masivo no tenga que releer las hojas en cada línea; si crea un alias
// nuevo, lo agrega también a aliasData en memoria para que la siguiente
// línea con el mismo nombre lo vea sin releer.
function resolverIdProductoConDatos(llave, proveedor, categoria, aliasData, catData, shAlias) {
  for (let i = 1; i < aliasData.length; i++) {
    if (normalizarTexto(aliasData[i][0]) === normalizarTexto(llave) && aliasData[i][2] === proveedor) {
      return { id: aliasData[i][1], aprobado: aliasData[i][4] !== 'Pendiente revisión' };
    }
  }

  // Alias nuevo: buscar mejor match en catálogo, acotado a la misma categoría si existe
  let mejorMatch = null, mejorScore = 0;
  for (let i = 1; i < catData.length; i++) {
    if (categoria && catData[i][2] && catData[i][2] !== categoria) continue; // misma categoría
    const score = similitud(llave, catData[i][1]);
    if (score > mejorScore) { mejorScore = score; mejorMatch = catData[i][0]; }
  }
  // si no hubo nada en la misma categoría, reintenta sin filtro
  if (!mejorMatch) {
    for (let i = 1; i < catData.length; i++) {
      const score = similitud(llave, catData[i][1]);
      if (score > mejorScore) { mejorScore = score; mejorMatch = catData[i][0]; }
    }
  }

  const estado = mejorScore >= UMBRAL_AUTOMATCH ? 'Auto-aprobado' : 'Pendiente revisión';
  const filaAlias = [llave, mejorMatch, proveedor, mejorScore.toFixed(2), estado];
  shAlias.appendRow(filaAlias);
  aliasData.push(filaAlias);
  return { id: mejorMatch, aprobado: estado === 'Auto-aprobado' };
}

function resolverIdProducto(llave, proveedor, categoria) {
  const ss = SpreadsheetApp.getActive();
  const shAlias = ss.getSheetByName(SHEET_ALIAS);
  const shCatalogo = ss.getSheetByName(SHEET_CATALOGO);
  return resolverIdProductoConDatos(llave, proveedor, categoria,
    shAlias.getDataRange().getValues(), shCatalogo.getDataRange().getValues(), shAlias);
}

// linea = { nombreProducto, nombreNormalizado, categoria, proveedor,
//           moneda, precioUnitario, cantidad, fecha, refFactura }
function procesarLineaFactura(linea) {
  // Llave de comparación: Nombre normalizado (si viene vacío, cae al Producto crudo)
  const llave = linea.nombreNormalizado || linea.nombreProducto;

  // Moneda distinta a la de costeo → siempre a revisión manual, no se mezcla
  if (linea.moneda && linea.moneda !== MONEDA_COSTEO) {
    guardarPendiente(linea, null);
    return;
  }

  const resuelto = resolverIdProducto(llave, linea.proveedor, linea.categoria);
  if (resuelto.aprobado) {
    registrarCompra(resuelto.id, linea);
  } else {
    guardarPendiente(linea, resuelto.id);
  }
}

function guardarPendiente(linea, idSugerido) {
  SpreadsheetApp.getActive().getSheetByName(SHEET_PENDIENTES)
    .appendRow([new Date(), linea.fecha, linea.nombreNormalizado || linea.nombreProducto,
                linea.proveedor, linea.moneda, linea.precioUnitario, linea.cantidad,
                linea.refFactura, idSugerido]);
}

// ============================================
// 3. LIBERAR PENDIENTES AL APROBAR UN ALIAS
// ============================================
function onEditAlias(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_ALIAS) return;

  const fila = e.range.getRow();
  const col = e.range.getColumn(); // 2 = ID_Producto_Maestro
  if (col !== 2) return;

  const [nombreFactura, idProducto, proveedor] = sheet.getRange(fila, 1, 1, 3).getValues()[0];
  sheet.getRange(fila, 5).setValue('Aprobado manual');
  liberarPendientes(nombreFactura, proveedor, idProducto);
}

function liberarPendientes(nombreFactura, proveedor, idProducto) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PENDIENTES);
  const data = sh.getDataRange().getValues();
  // [FechaRegistro, Fecha, Nombre, Proveedor, Moneda, Precio, Cantidad, Ref, IDSugerido]
  for (let i = data.length - 1; i >= 1; i--) {
    if (normalizarTexto(data[i][2]) === normalizarTexto(nombreFactura) && data[i][3] === proveedor
        && data[i][4] === MONEDA_COSTEO) {
      registrarCompra(idProducto, {
        fecha: data[i][1], proveedor: data[i][3], moneda: data[i][4],
        precioUnitario: data[i][5], cantidad: data[i][6], refFactura: data[i][7]
      });
      sh.deleteRow(i + 1);
    }
  }
}

// ============================================
// 4. HISTORIAL Y COSTO PROMEDIO PONDERADO (últimas 5)
// ============================================
function registrarCompra(idProducto, linea) {
  SpreadsheetApp.getActive().getSheetByName(SHEET_HISTORIAL)
    .appendRow([new Date(), linea.fecha, idProducto, linea.proveedor, linea.moneda,
                linea.precioUnitario, linea.cantidad, linea.refFactura]);
  actualizarCostoProducto(idProducto);
}

function actualizarCostoProducto(idProducto) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_HISTORIAL);
  const data = sh.getDataRange().getValues();
  // [FechaRegistro, FechaFactura, IDProducto, Proveedor, Moneda, PrecioUnitario, Cantidad, RefFactura]

  const compras = data.filter(function(r) { return r[2] === idProducto; })
    .sort(function(a, b) { return new Date(b[1]) - new Date(a[1]); })
    .slice(0, VENTANA_COMPRAS);
  if (compras.length === 0) return;

  const sumaValor = compras.reduce(function(acc, r) { return acc + r[5] * r[6]; }, 0);
  const sumaCantidad = compras.reduce(function(acc, r) { return acc + r[6]; }, 0);
  if (sumaCantidad === 0) {
    Logger.log('Cantidad total 0 en las compras recientes de ' + idProducto + '; se omite el recálculo de costo.');
    return; // evita costo Infinity/NaN si las cantidades registradas son 0
  }
  const costoPonderado = sumaValor / sumaCantidad;

  const cat = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO);
  const fila = filaPorId(cat, 'ID_Producto', idProducto);
  if (fila === -1) return;
  const encabezados = encabezadosDe(cat);
  cat.getRange(fila, encabezados.indexOf('Costo_Actual') + 1).setValue(costoPonderado);
  cat.getRange(fila, encabezados.indexOf('Fecha_Ultima_Actualizacion') + 1).setValue(new Date());

  recostearProducto(idProducto);
}

// ============================================
// 5. CASCADA DE RECOSTEO (producto → receta → subreceta → menú)
// ============================================
// Costo real de un producto (ajustado por rendimiento), listo para multiplicar
// por la cantidad de una línea de receta. Si el producto todavía no tiene
// compras registradas (Costo_Actual vacío), usa Precio_Sin_IVA/Cantidad_Presentacion
// como valor de referencia — nunca escribe ese fallback de vuelta al catálogo.
function costoRealProducto(idProducto) {
  const productos = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO));
  const p = productos.find(function(r) { return r['ID_Producto'] === idProducto; });
  if (!p) return 0;
  const costoAuto = Number(p['Costo_Actual']) || 0;
  const cantidadPresentacion = Number(p['Cantidad_Presentacion']) || 1;
  const costoBase = costoAuto > 0 ? costoAuto : (Number(p['Precio_Sin_IVA']) || 0) / cantidadPresentacion;
  const rendimiento = Number(p['Rendimiento']) || 100;
  return costoBase / (rendimiento / 100);
}

function obtenerCostoPorcionReceta(idReceta) {
  const recetas = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_RECETAS));
  const r = recetas.find(function(x) { return x['ID_Receta'] === idReceta; });
  return r ? (Number(r['Costo_Porcion']) || 0) : 0;
}

function costoFuente(fuenteTipo, fuenteId) {
  return fuenteTipo === 'subreceta' ? obtenerCostoPorcionReceta(fuenteId) : costoRealProducto(fuenteId);
}

// Recalcula Costo_Linea de cada ingrediente de una receta y su Costo_Total/Costo_Porcion.
// Devuelve el costo por porción, o null si la receta no existe.
function recalcularReceta(idReceta) {
  const shIng = SpreadsheetApp.getActive().getSheetByName(SHEET_RECETA_ING);
  const ing = leerHojaConEncabezados(shIng);
  const cId = ing.encabezados.indexOf('ID_Receta');
  const cTipo = ing.encabezados.indexOf('Fuente_Tipo');
  const cFuenteId = ing.encabezados.indexOf('Fuente_ID');
  const cCant = ing.encabezados.indexOf('Cantidad');
  const cCostoLinea = ing.encabezados.indexOf('Costo_Linea');

  let costoTotal = 0;
  ing.datos.forEach(function(fila) {
    if (String(fila[cId]) !== String(idReceta)) return;
    const costoUnit = costoFuente(fila[cTipo], fila[cFuenteId]);
    const cantidad = Number(fila[cCant]) || 0;
    fila[cCostoLinea] = costoUnit * cantidad;
    costoTotal += fila[cCostoLinea];
  });
  escribirDatos(shIng, ing.encabezados, ing.datos);

  const shRec = SpreadsheetApp.getActive().getSheetByName(SHEET_RECETAS);
  const fila = filaPorId(shRec, 'ID_Receta', idReceta);
  if (fila === -1) return null;
  const encabezados = encabezadosDe(shRec);
  const porciones = Number(shRec.getRange(fila, encabezados.indexOf('Porciones') + 1).getValue()) || 1;
  const costoPorcion = costoTotal / porciones;
  shRec.getRange(fila, encabezados.indexOf('Costo_Total') + 1).setValue(costoTotal);
  shRec.getRange(fila, encabezados.indexOf('Costo_Porcion') + 1).setValue(costoPorcion);
  shRec.getRange(fila, encabezados.indexOf('Fecha_Actualizacion') + 1).setValue(new Date());
  return costoPorcion;
}

// Recalcula una receta y cascada hacia arriba: recetas que la usan como
// subreceta (recursivo, corta ciclos con `visitados`) y platos de menú que
// la usan directamente.
function propagarCostoReceta(idReceta, visitados) {
  visitados = visitados || {};
  if (visitados[idReceta]) return;
  visitados[idReceta] = true;

  const resultado = recalcularReceta(idReceta);
  if (resultado === null) return;

  const ingredientes = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_RECETA_ING));
  const padres = new Set();
  ingredientes.forEach(function(r) {
    if (r['Fuente_Tipo'] === 'subreceta' && r['Fuente_ID'] === idReceta) padres.add(r['ID_Receta']);
  });
  padres.forEach(function(idPadre) { propagarCostoReceta(idPadre, visitados); });

  recalcularMenuPorReceta(idReceta);
}

function recalcularMenuPorReceta(idReceta) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MENU);
  const menu = leerHojaConEncabezados(sh);
  const cIdReceta = menu.encabezados.indexOf('ID_Receta');
  const cPrecio = menu.encabezados.indexOf('Precio_Venta');
  const cCostoReceta = menu.encabezados.indexOf('Costo_Receta');
  const cFC = menu.encabezados.indexOf('FC');
  const cFecha = menu.encabezados.indexOf('Fecha_Actualizacion');

  const costoPorcion = obtenerCostoPorcionReceta(idReceta);
  let huboCambios = false;
  menu.datos.forEach(function(fila) {
    if (String(fila[cIdReceta]) !== String(idReceta)) return;
    const precio = Number(fila[cPrecio]) || 0;
    fila[cCostoReceta] = costoPorcion;
    fila[cFC] = precio > 0 ? Number(((costoPorcion / precio) * 100).toFixed(1)) : '';
    fila[cFecha] = new Date();
    huboCambios = true;
  });
  if (huboCambios) escribirDatos(sh, menu.encabezados, menu.datos);
}

// Punto de entrada: se llama cuando cambia Costo_Actual de un producto.
function recostearProducto(idProducto) {
  const ingredientes = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_RECETA_ING));
  const recetasAfectadas = new Set();
  ingredientes.forEach(function(r) {
    if (r['Fuente_Tipo'] === 'producto' && r['Fuente_ID'] === idProducto) recetasAfectadas.add(r['ID_Receta']);
  });
  const visitados = {};
  recetasAfectadas.forEach(function(idReceta) { propagarCostoReceta(idReceta, visitados); });
}

// ============================================
// 6. TRIGGER: nueva línea en Desglose_IA
// ============================================
// Orden real de Desglose_IA (18 columnas):
// A Tipo doc | B Moneda | C N° factura | D Fecha | E Cliente | F Proveedor |
// G Categoría | H Producto | I Nombre normalizado | J Unidad medida |
// K Cantidad | L Precio unitario | M Descuento | N Impuesto |
// O Total línea | P Total factura | Q Archivo | R Fecha de carga
function onNuevaLineaFactura(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_FACTURAS) return;

  // e.range puede cubrir varias filas a la vez (la IA suele escribir todas
  // las líneas de una factura en un solo setValues()). Si solo se lee
  // e.range.getRow() se procesa nada más la primera línea y el resto se
  // pierde en silencio. Por eso se recorren todas las filas del rango.
  const filaInicio = e.range.getRow();
  const numFilas = e.range.getNumRows();

  for (let offset = 0; offset < numFilas; offset++) {
    const fila = filaInicio + offset;
    if (fila === 1) continue; // encabezado

    const v = sheet.getRange(fila, 1, 1, 18).getValues()[0];

    const linea = {
      moneda: v[1],
      refFactura: v[2],
      fecha: v[3],
      proveedor: v[5],
      categoria: v[6],
      nombreProducto: v[7],
      nombreNormalizado: v[8],
      cantidad: v[10],
      precioUnitario: v[11], // tal cual en factura, sin ajustar descuento/impuesto
      archivo: v[16]
    };

    if (!linea.nombreProducto && !linea.nombreNormalizado) continue;
    procesarLineaFactura(linea);
  }
}

// ============================================
// 7. INSTALACIÓN DE TRIGGERS (correr cada una UNA VEZ)
// ============================================
// onNuevaLineaFactura debe dispararse con ediciones en el archivo ORIGINAL
// (donde vive Desglose_IA), no en este archivo. Por eso se instala por ID
// y no desde el menú Triggers de la UI (que solo ofrece este archivo).
function instalarTriggerDesglose() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onNuevaLineaFactura') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onNuevaLineaFactura')
    .forSpreadsheet(SOURCE_SPREADSHEET_ID)
    .onEdit()
    .create();
  Logger.log('Trigger instalado sobre el archivo de Desglose_IA.');
}

// onEditAlias vive en este mismo archivo (Alias_Proveedores), así que
// se instala sobre el spreadsheet activo.
function instalarTriggerAlias() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onEditAlias') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditAlias')
    .forSpreadsheet(SpreadsheetApp.getActive().getId())
    .onEdit()
    .create();
  Logger.log('Trigger instalado sobre este archivo (Alias_Proveedores).');
}

// ============================================
// 8. WEB APP — doGet / doPost
// ============================================
function doGet(e) {
  try {
    const modulo = e.parameter.modulo;
    switch (modulo) {
      case 'productos':   return jsonOut({ ok: true, registros: moduloProductos() });
      case 'pendientes':  return jsonOut({ ok: true, registros: moduloPendientes() });
      case 'categorias':  return jsonOut({ ok: true, valores: moduloCategorias() });
      case 'areas':       return jsonOut({ ok: true, valores: moduloAreas() });
      case 'proveedores': return jsonOut({ ok: true, registros: moduloProveedores() });
      case 'recetas':     return jsonOut({ ok: true, registros: moduloRecetas() });
      case 'menu':        return jsonOut({ ok: true, registros: moduloMenu() });
      default:
        return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

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
      case 'producto':  result = guardarProducto(payload); break;
      case 'categoria': result = guardarCategoria(payload); break;
      case 'area':      result = guardarArea(payload); break;
      case 'receta':    result = guardarReceta(payload); break;
      case 'plato':     result = guardarPlato(payload); break;
      case 'eliminar':  result = eliminarRegistro(payload); break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ── Módulos GET ──────────────────────────────────────────────────────
function moduloProductos() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO);
  return filasComoObjetos(sh).map(function(r) {
    const cantidadPresentacion = Number(r['Cantidad_Presentacion']) || 1;
    const costoAuto = Number(r['Costo_Actual']) || 0;
    const costoReferencia = (Number(r['Precio_Sin_IVA']) || 0) / cantidadPresentacion;
    return {
      id: r['ID_Producto'],
      nombre: r['Nombre_Estandar'],
      categoria: r['Categoria'] || '',
      area: r['Area_Negocio'] || '',
      unidad: r['Unidad_Medida'] || '',
      presentacion: r['Presentacion'] || '',
      tamano: r['Tamano'] || '',
      cantidad_presentacion: cantidadPresentacion,
      precio_sin_iva: Number(r['Precio_Sin_IVA']) || 0,
      iva: Number(r['IVA']) || 0,
      costo: costoAuto > 0 ? costoAuto : costoReferencia,
      costo_auto: costoAuto > 0,
      rendimiento: Number(r['Rendimiento']) || 100,
      proveedor: r['Proveedor_Habitual'] || '',
      stock_minimo: Number(r['Stock_Minimo']) || 0,
      en_uso: r['En_Uso'] !== false && r['En_Uso'] !== 'FALSE',
      aplica_receta: r['Aplica_Receta'] !== false && r['Aplica_Receta'] !== 'FALSE',
      actualizado: r['Fecha_Ultima_Actualizacion'] || ''
    };
  });
}

function moduloPendientes() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PENDIENTES);
  return filasComoObjetos(sh).map(function(r) {
    return {
      fecha_registro: r['Fecha_Registro'] || '',
      fecha_factura: r['Fecha_Factura'] || '',
      nombre_producto: r['Nombre_Producto'] || '',
      proveedor: r['Proveedor'] || '',
      moneda: r['Moneda'] || '',
      precio_unitario: Number(r['Precio_Unitario']) || 0,
      cantidad: Number(r['Cantidad']) || 0,
      ref_factura: r['Ref_Factura'] || '',
      id_producto_sugerido: r['ID_Producto_Sugerido'] || ''
    };
  });
}

function moduloCategorias() {
  return filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_CATEGORIAS))
    .map(function(r) { return r['Categoria']; }).filter(Boolean);
}

function moduloAreas() {
  return filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_AREAS))
    .map(function(r) { return r['Area_Negocio']; }).filter(Boolean);
}

function moduloProveedores() {
  const sh = abrirHojaProveedoresCompras();
  return sh ? filasComoObjetos(sh) : [];
}

function moduloRecetas() {
  const recetas = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_RECETAS));
  const ingredientes = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_RECETA_ING));
  const productos = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO));

  const nombrePorProducto = {};
  productos.forEach(function(p) { nombrePorProducto[p['ID_Producto']] = p['Nombre_Estandar']; });
  const nombrePorReceta = {};
  recetas.forEach(function(r) { nombrePorReceta[r['ID_Receta']] = r['Nombre']; });

  return recetas.map(function(r) {
    const lineas = ingredientes.filter(function(i) { return i['ID_Receta'] === r['ID_Receta']; });
    return {
      id: r['ID_Receta'],
      nombre: r['Nombre'],
      tipo: r['Tipo'] || 'receta',
      porciones: Number(r['Porciones']) || 1,
      unidad: r['Unidad'] || 'porciones',
      plato_id: r['ID_Plato'] || '',
      costo_total: Number(r['Costo_Total']) || 0,
      costo_porcion: Number(r['Costo_Porcion']) || 0,
      actualizado: r['Fecha_Actualizacion'] || '',
      ingredientes: lineas.map(function(i) {
        const esSub = i['Fuente_Tipo'] === 'subreceta';
        return {
          fuenteId: esSub ? 'SUB-' + i['Fuente_ID'] : i['Fuente_ID'],
          nombre: esSub ? (nombrePorReceta[i['Fuente_ID']] || i['Fuente_ID']) : (nombrePorProducto[i['Fuente_ID']] || i['Fuente_ID']),
          unidad: i['Unidad'] || '',
          cantidad: Number(i['Cantidad']) || 0,
          costo_linea: Number(i['Costo_Linea']) || 0,
          esSub: esSub
        };
      })
    };
  });
}

function moduloMenu() {
  return filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_MENU)).map(function(r) {
    return {
      id: r['ID_Plato'],
      nombre: r['Nombre'],
      categoria: r['Categoria'] || '',
      precio: Number(r['Precio_Venta']) || 0,
      disponible: r['Disponibilidad'] || 'Disponible',
      descripcion: r['Descripcion'] || '',
      receta_id: r['ID_Receta'] || '',
      costo_receta: Number(r['Costo_Receta']) || 0,
      fc: r['FC'] !== '' && r['FC'] != null ? Number(r['FC']).toFixed(1) : null
    };
  });
}

// ── Módulos POST: productos ──────────────────────────────────────────
function guardarProducto(p) {
  if (!p.nombre) throw new Error('Falta el nombre del producto.');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO);
  const encabezados = encabezadosDe(sh);
  const id = p.id || ('P' + Date.now());
  let fila = filaPorId(sh, 'ID_Producto', id);
  const esNuevo = fila === -1;
  if (esNuevo) fila = sh.getLastRow() + 1;

  // Costo_Actual nunca se pisa a mano desde este módulo: es exclusivamente
  // automático (actualizarCostoProducto, a partir de compras reales). Se
  // preserva el valor existente al reescribir la fila completa.
  const costoActualExistente = esNuevo ? '' : sh.getRange(fila, encabezados.indexOf('Costo_Actual') + 1).getValue();

  escribirFilaPorEncabezado(sh, fila, encabezados, {
    'ID_Producto': id,
    'Nombre_Estandar': p.nombre,
    'Categoria': p.categoria || '',
    'Area_Negocio': p.area || '',
    'Unidad_Medida': p.unidad || '',
    'Presentacion': p.presentacion || '',
    'Tamano': p.tamano || '',
    'Cantidad_Presentacion': Number(p.cantidad_presentacion) || 1,
    'Precio_Sin_IVA': Number(p.precio_sin_iva) || 0,
    'IVA': Number(p.iva) || 0,
    'Costo_Actual': costoActualExistente,
    'Rendimiento': Number(p.rendimiento) || 100,
    'Proveedor_Habitual': p.proveedor || '',
    'Stock_Minimo': Number(p.stock_minimo) || 0,
    'En_Uso': p.en_uso === false || p.en_uso === 'false' ? false : true,
    'Aplica_Receta': p.aplica_receta === false || p.aplica_receta === 'false' ? false : true,
    'Fecha_Ultima_Actualizacion': new Date()
  });

  return { id: id, fila: fila, nuevo: esNuevo };
}

function eliminarProducto(id) {
  if (!id) throw new Error('Falta el ID del producto.');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO);
  const fila = filaPorId(sh, 'ID_Producto', id);
  if (fila === -1) throw new Error('No se encontró el producto.');
  sh.deleteRow(fila);
  return { eliminado: id };
}

// ── Módulos POST: categorías / áreas ─────────────────────────────────
function guardarValorCompartido(nombreHoja, nombreColumna, valor, valorAnterior) {
  if (!valor) throw new Error('Falta el valor.');
  const sh = SpreadsheetApp.getActive().getSheetByName(nombreHoja);
  if (valorAnterior && valorAnterior !== valor) {
    const fila = filaPorId(sh, nombreColumna, valorAnterior);
    if (fila === -1) throw new Error('No se encontró "' + valorAnterior + '".');
    sh.getRange(fila, 1).setValue(valor);
    renombrarValorEnCatalogo(nombreColumna === 'Categoria' ? 'Categoria' : 'Area_Negocio', valorAnterior, valor);
    return { renombrado: valor };
  }
  if (filaPorId(sh, nombreColumna, valor) !== -1) return { ya_existia: valor };
  sh.getRange(sh.getLastRow() + 1, 1).setValue(valor);
  return { creado: valor };
}

function renombrarValorEnCatalogo(columna, valorAnterior, valorNuevo) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO);
  const encabezados = encabezadosDe(sh);
  const col = encabezados.indexOf(columna) + 1;
  if (col === 0) return;
  const nFilas = sh.getLastRow() - 1;
  if (nFilas <= 0) return;
  const valores = sh.getRange(2, col, nFilas, 1).getValues();
  for (let i = 0; i < valores.length; i++) {
    if (valores[i][0] === valorAnterior) sh.getRange(i + 2, col).setValue(valorNuevo);
  }
}

function guardarCategoria(p) { return guardarValorCompartido(SHEET_CATEGORIAS, 'Categoria', p.valor, p.valor_anterior); }
function guardarArea(p) { return guardarValorCompartido(SHEET_AREAS, 'Area_Negocio', p.valor, p.valor_anterior); }

function eliminarValorCompartido(nombreHoja, nombreColumna, valor) {
  if (!valor) throw new Error('Falta el valor a eliminar.');
  const catalogo = filasComoObjetos(SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO));
  const enUso = catalogo.some(function(prod) { return prod[nombreColumna] === valor; });
  if (enUso) throw new Error('No se puede eliminar: hay productos del catálogo usando "' + valor + '".');

  const sh = SpreadsheetApp.getActive().getSheetByName(nombreHoja);
  const fila = filaPorId(sh, nombreColumna, valor);
  if (fila === -1) throw new Error('No se encontró "' + valor + '".');
  sh.deleteRow(fila);
  return { eliminado: valor };
}

// ── Módulos POST: recetas ─────────────────────────────────────────────
function guardarReceta(p) {
  if (!p.nombre) throw new Error('Falta el nombre de la receta.');
  if (!p.porciones || Number(p.porciones) <= 0) throw new Error('Falta indicar las porciones.');

  const shRec = SpreadsheetApp.getActive().getSheetByName(SHEET_RECETAS);
  const encabezados = encabezadosDe(shRec);
  const id = p.id || ('REC-' + Date.now());
  let fila = filaPorId(shRec, 'ID_Receta', id);
  if (fila === -1) fila = shRec.getLastRow() + 1;

  escribirFilaPorEncabezado(shRec, fila, encabezados, {
    'ID_Receta': id,
    'Nombre': p.nombre,
    'Tipo': p.tipo || 'receta',
    'Porciones': Number(p.porciones),
    'Unidad': p.unidad || 'porciones',
    'ID_Plato': p.plato_id || '',
    'Costo_Total': 0,
    'Costo_Porcion': 0,
    'Fecha_Actualizacion': new Date()
  });

  // Reemplaza todas las líneas de ingredientes de esta receta.
  const shIng = SpreadsheetApp.getActive().getSheetByName(SHEET_RECETA_ING);
  const ing = leerHojaConEncabezados(shIng);
  const cId = ing.encabezados.indexOf('ID_Receta');
  const filasSinEstaReceta = ing.datos.filter(function(f) { return String(f[cId]) !== String(id); });

  const nuevasLineas = (p.ingredientes || []).map(function(i) {
    const esSub = !!i.esSub;
    const fuenteId = esSub ? String(i.fuenteId || '').replace(/^SUB-/, '') : i.fuenteId;
    return filaDesdeObjeto(ing.encabezados, {
      'ID_Receta': id,
      'Fuente_Tipo': esSub ? 'subreceta' : 'producto',
      'Fuente_ID': fuenteId,
      'Cantidad': Number(i.cantidad) || 0,
      'Unidad': i.unidad || '',
      'Costo_Linea': 0
    });
  });

  const todasLasLineas = filasSinEstaReceta.concat(nuevasLineas);
  if (shIng.getLastRow() > 1) {
    shIng.getRange(2, 1, shIng.getLastRow() - 1, ing.encabezados.length).clearContent();
  }
  if (todasLasLineas.length > 0) {
    shIng.getRange(2, 1, todasLasLineas.length, ing.encabezados.length).setValues(todasLasLineas);
  }

  propagarCostoReceta(id, {});
  return { id: id, fila: fila };
}

function eliminarReceta(id) {
  if (!id) throw new Error('Falta el ID de la receta.');
  const shRec = SpreadsheetApp.getActive().getSheetByName(SHEET_RECETAS);
  const fila = filaPorId(shRec, 'ID_Receta', id);
  if (fila === -1) throw new Error('No se encontró la receta.');
  shRec.deleteRow(fila);

  const shIng = SpreadsheetApp.getActive().getSheetByName(SHEET_RECETA_ING);
  const ing = leerHojaConEncabezados(shIng);
  const cId = ing.encabezados.indexOf('ID_Receta');
  for (let i = ing.datos.length - 1; i >= 0; i--) {
    if (String(ing.datos[i][cId]) === String(id)) shIng.deleteRow(i + 2);
  }
  return { eliminado: id };
}

// ── Módulos POST: menú ─────────────────────────────────────────────────
function guardarPlato(p) {
  if (!p.nombre) throw new Error('Falta el nombre del plato.');
  if (p.precio == null || p.precio === '') throw new Error('Falta el precio de venta.');

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MENU);
  const encabezados = encabezadosDe(sh);
  const id = p.id || ('PLT-' + Date.now());
  let fila = filaPorId(sh, 'ID_Plato', id);
  if (fila === -1) fila = sh.getLastRow() + 1;

  // El front manda value="Temporada" por un bug de origen en el <option> —
  // se normaliza acá para que siempre quede "De temporada" en la hoja.
  const disponibilidad = p.disponible === 'Temporada' ? 'De temporada' : (p.disponible || 'Disponible');

  escribirFilaPorEncabezado(sh, fila, encabezados, {
    'ID_Plato': id,
    'Nombre': p.nombre,
    'Categoria': p.categoria || '',
    'Precio_Venta': Number(p.precio) || 0,
    'Disponibilidad': disponibilidad,
    'Descripcion': p.descripcion || '',
    'ID_Receta': p.receta_id || '',
    'Costo_Receta': 0,
    'FC': '',
    'Fecha_Actualizacion': new Date()
  });

  if (p.receta_id) recalcularMenuPorReceta(p.receta_id);
  return { id: id, fila: fila };
}

function eliminarPlato(id) {
  if (!id) throw new Error('Falta el ID del plato.');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MENU);
  const fila = filaPorId(sh, 'ID_Plato', id);
  if (fila === -1) throw new Error('No se encontró el plato.');
  sh.deleteRow(fila);
  return { eliminado: id };
}

// ── Eliminar (dispatcher común) ────────────────────────────────────────
function eliminarRegistro(p) {
  switch (p.tipo) {
    case 'productos': return eliminarProducto(p.id);
    case 'recetas':   return eliminarReceta(p.id);
    case 'menu':      return eliminarPlato(p.id);
    case 'categoria': return eliminarValorCompartido(SHEET_CATEGORIAS, 'Categoria', p.valor);
    case 'area':      return eliminarValorCompartido(SHEET_AREAS, 'Area_Negocio', p.valor);
    default:
      throw new Error('Tipo no reconocido: ' + p.tipo);
  }
}
