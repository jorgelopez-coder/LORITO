// === Backend de Cierres de Caja — Ecosistema Kioskos ===
// Adaptado de Code-cierres-backend.gs (Ecosistema Lorito), simplificado para
// kioskos de cerveza y cocteles (sin crédito, sin plataformas de delivery,
// sin 10% de servicio — esas categorías no aplican a un kiosko de playa).
//
// Cómo desplegarlo:
// 1. Creá un Google Sheet nuevo, ej. "Registro Ventas - Kioskos".
// 2. Extensiones → Apps Script, pegá este código completo.
// 3. Corré UNA VEZ agregarEncabezados() desde el editor (▶ con esa función
//    seleccionada) para crear la pestaña "Cierres" con sus encabezados.
// 4. Implementar → Nueva implementación → Tipo: Aplicación web.
//    - Ejecutar como: Yo
//    - Quién tiene acceso: Cualquiera
// 5. Copiá la URL /exec resultante en SHEETS_URL dentro de cierres.html.
// 6. Creá una carpeta en Drive para las fotos de respaldo (ej. "Cierres de
//    caja - Kioskos"), copiá su ID y pegalo en FOLDER_ID_CIERRES más abajo.
//
// Si se agregan columnas nuevas: actualizar HEADERS al FINAL del array (nunca
// insertar en el medio), volver a pegar el código, Implementar → Gestionar
// implementaciones → Editar → Nueva versión (la URL /exec no cambia), y
// correr agregarEncabezados() de nuevo para que la fila de encabezados se
// actualice sin tocar los datos ya guardados.

const HEADERS = [
  'ID', 'Fecha', 'Hora', 'Kiosko', 'Encargado', 'Turno',
  'Ventas Efectivo ₡', 'Ventas Tarjeta ₡', 'Ventas SINPE ₡', 'Otras Ventas ₡',
  'Total Ventas ₡',
  'Fondo Caja Inicial ₡',
  'Billetes ₡50.000', 'Billetes ₡20.000', 'Billetes ₡10.000', 'Billetes ₡5.000',
  'Billetes ₡2.000', 'Billetes ₡1.000', 'Monedas ₡500', 'Monedas ₡100',
  'Monedas ₡50', 'Monedas ₡25', 'Monedas ₡10', 'Monedas ₡5',
  'Tipo de Cambio', 'USD Total en ₡',
  'Billetes $100', 'Billetes $50', 'Billetes $20', 'Billetes $10', 'Billetes $5', 'Billetes $1',
  'Total USD Contado $',
  'Caja Total Contada ₡', 'Efectivo Esperado ₡', 'Diferencia Caja ₡', 'Caja Cuadra',
  'Total Datáfono ₡', 'Diferencia Tarjeta ₡', 'Tarjeta Cuadra',
  'Foto Cierre Sistema (URL)', 'Foto Cierre Datáfono (URL)',
  'Observaciones',
  'Tips ₡'
];

const HEADERS_DEPOSITOS = [
  'ID', 'Fecha registro', 'Fecha depósito', 'Kiosko', 'Número de referencia',
  'Monto CRC comprobante', 'Monto USD comprobante', 'Fechas cubiertas',
  'Monto CRC calculado', 'Monto USD calculado', 'Diferencia CRC', 'Diferencia USD',
  'Foto comprobante (URL)', 'Notas'
];

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.payload) {
      data = JSON.parse(e.parameter.payload);
    } else {
      throw new Error('No data received');
    }

    if (data.type === 'saveConfig') {
      let configSheet = ss.getSheetByName('Config');
      if (!configSheet) configSheet = ss.insertSheet('Config');
      configSheet.clearContents();
      configSheet.getRange(1, 1).setValue(JSON.stringify(data.config));
      return jsonOut({ result: 'ok' });
    }

    if (data.type === 'deposito') {
      return guardarDeposito(ss, data);
    }

    let sheet = ss.getSheetByName('Cierres');
    if (!sheet) sheet = ss.insertSheet('Cierres');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const fotoUrls = guardarFotosEnDrive(data);

    sheet.appendRow([
      data.id,                       // ID
      data.fecha,                    // Fecha
      data.hora,                     // Hora
      data.kiosko,                   // Kiosko
      data.encargado,                // Encargado
      data.turno,                    // Turno
      data.efectivo || 0,            // Ventas Efectivo ₡
      data.tarjeta || 0,             // Ventas Tarjeta ₡
      data.sinpe || 0,               // Ventas SINPE ₡
      data.otras || 0,               // Otras Ventas ₡
      data.totalVentas || 0,         // Total Ventas ₡
      data.fondoCajaInicial || 0,    // Fondo Caja Inicial ₡
      data.d50000 || 0, data.d20000 || 0, data.d10000 || 0, data.d5000 || 0,
      data.d2000 || 0, data.d1000 || 0, data.d500 || 0, data.d100 || 0,
      data.d50 || 0, data.d25 || 0, data.d10 || 0, data.d5 || 0,
      data.tc || 0,                  // Tipo de Cambio
      data.usdTotalCrc || 0,         // USD Total en ₡
      data.usdD100 || 0, data.usdD50 || 0, data.usdD20 || 0,
      data.usdD10 || 0, data.usdD5 || 0, data.usdD1 || 0,
      data.usdCajaTotalContado || 0, // Total USD Contado $
      data.cajaTotalContada || 0,    // Caja Total Contada ₡
      data.efectivoEsperado || 0,    // Efectivo Esperado ₡
      data.diferenciaCaja || 0,      // Diferencia Caja ₡
      data.cajaCuadra ? 'SI' : 'NO', // Caja Cuadra
      data.datafonoTotal || 0,       // Total Datáfono ₡
      data.diferenciaTarjeta || 0,   // Diferencia Tarjeta ₡
      data.tarjetaCuadra ? 'SI' : 'NO', // Tarjeta Cuadra
      fotoUrls.fotoSistemaUrl || '', // Foto Cierre Sistema (URL)
      fotoUrls.fotoDatafonoUrl || '',// Foto Cierre Datáfono (URL)
      data.obs || '',                // Observaciones
      data.tips || 0                 // Tips ₡
    ]);

    return jsonOut({ result: 'ok' });

  } catch (err) {
    return jsonOut({ result: 'error', message: err.toString() });
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (e && e.parameter && e.parameter.action === 'getConfig') {
    const configSheet = ss.getSheetByName('Config');
    if (!configSheet || configSheet.getLastRow() === 0) {
      return jsonOut({ config: null });
    }
    return jsonOut({ config: JSON.parse(configSheet.getRange(1, 1).getValue()) });
  }

  if (e && e.parameter && e.parameter.action === 'depositos') {
    const depSheet = ss.getSheetByName('Depositos');
    if (!depSheet || depSheet.getLastRow() === 0) return jsonOut({ records: [] });
    const rows = depSheet.getDataRange().getValues();
    return jsonOut({ records: rows.slice(1) });
  }

  let sheet = ss.getSheetByName('Cierres');
  if (!sheet) sheet = ss.getActiveSheet();
  const rows = sheet.getDataRange().getValues();
  return jsonOut({ records: rows.slice(1) });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function agregarEncabezados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Cierres');
  if (!sheet) sheet = ss.insertSheet('Cierres');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  } else {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function agregarEncabezadosDepositos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Depositos');
  if (!sheet) sheet = ss.insertSheet('Depositos');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_DEPOSITOS);
  } else {
    sheet.getRange(1, 1, 1, HEADERS_DEPOSITOS.length).setValues([HEADERS_DEPOSITOS]);
  }
  sheet.getRange(1, 1, 1, HEADERS_DEPOSITOS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

// ── DEPÓSITOS BANCARIOS ───────────────────────────────────────────
function guardarDeposito(ss, data) {
  let sheet = ss.getSheetByName('Depositos');
  if (!sheet) sheet = ss.insertSheet('Depositos');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS_DEPOSITOS);
    sheet.getRange(1, 1, 1, HEADERS_DEPOSITOS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  let fotoUrl = '';
  if (data.fotoComprobante) {
    const carpeta = getOrCreateCarpetaComprobantes();
    const nombre = `${data.fechaDeposito || hoyCR()}_${data.kiosko || 'kiosko'}_${data.referencia || 'sin-ref'}_${data.id || Date.now()}.jpg`
      .replace(/[^\w\-.]+/g, '_');
    fotoUrl = guardarImagenBase64(carpeta, data.fotoComprobante, data.fotoComprobanteMime || 'image/jpeg', nombre);
  }

  sheet.appendRow([
    data.id || Date.now(),
    hoyCR(),
    data.fechaDeposito || '',
    data.kiosko || '',
    data.referencia || '',
    data.montoCrcComprobante || 0,
    data.montoUsdComprobante || 0,
    JSON.stringify(data.fechasCubiertas || []),
    data.montoCrcCalculado || 0,
    data.montoUsdCalculado || 0,
    data.diferenciaCrc || 0,
    data.diferenciaUsd || 0,
    fotoUrl,
    data.notas || ''
  ]);

  return jsonOut({ result: 'ok' });
}

function getOrCreateCarpetaComprobantes() {
  const root = getRootFolderFotos();
  const padre = root.getParents().hasNext() ? root.getParents().next() : root;
  const nombre = 'Depósitos - Comprobantes';
  const existing = padre.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : padre.createFolder(nombre);
}

// ── FOTOS DE CIERRE → GOOGLE DRIVE ───────────────────────────────
// Carpeta raíz fija (FOLDER_ID_CIERRES más abajo), con una subcarpeta por
// kiosko y, dentro, una subcarpeta por fecha (YYYY-MM-DD).

function guardarFotosEnDrive(payload) {
  if (!payload.fotoSistema && !payload.fotoDatafono) return {};

  const carpetaDia = getOrCreateCarpetaDia(payload.kiosko, payload.fecha);
  const encargado = (payload.encargado || 'sin-encargado').toString().replace(/[^\w\-]+/g, '_');
  const turno = (payload.turno || '').toString().replace(/[^\w\-]+/g, '_');
  const prefijo = `${payload.fecha || hoyCR()}_${turno}_${encargado}_${payload.id || Date.now()}`;

  const urls = {};
  if (payload.fotoSistema) {
    urls.fotoSistemaUrl = guardarImagenBase64(
      carpetaDia, payload.fotoSistema, payload.fotoSistemaMime || 'image/jpeg', `${prefijo}_sistema.jpg`
    );
  }
  if (payload.fotoDatafono) {
    urls.fotoDatafonoUrl = guardarImagenBase64(
      carpetaDia, payload.fotoDatafono, payload.fotoDatafonoMime || 'image/jpeg', `${prefijo}_datafono.jpg`
    );
  }
  return urls;
}

function getOrCreateCarpetaDia(kiosko, fecha) {
  const carpetaKiosko = getOrCreateCarpetaKiosko(kiosko);
  const nombreCarpeta = fecha || hoyCR();
  const existing = carpetaKiosko.getFoldersByName(nombreCarpeta);
  return existing.hasNext() ? existing.next() : carpetaKiosko.createFolder(nombreCarpeta);
}

function getOrCreateCarpetaKiosko(kiosko) {
  const root = getRootFolderFotos();
  const nombre = (kiosko || 'Sin kiosko').toString();
  const existing = root.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : root.createFolder(nombre);
}

// Reemplazá este ID por el de tu carpeta "Cierres de caja - Kioskos" en Drive
// (ver paso 6 en el comentario de arriba).
const FOLDER_ID_CIERRES = 'TODO_FOLDER_ID_CIERRES_KIOSKOS';

function getRootFolderFotos() {
  return DriveApp.getFolderById(FOLDER_ID_CIERRES);
}

function guardarImagenBase64(folder, base64, mimeType, fileName) {
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  return file.getUrl();
}

function hoyCR() {
  return Utilities.formatDate(new Date(), 'America/Costa_Rica', 'yyyy-MM-dd');
}
