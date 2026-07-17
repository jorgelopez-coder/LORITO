// === Code.gs del backend de cierres (SHEETS_URL) ===
// Versión con guardado de fotos en Drive integrado. Reemplazá tu Code.gs actual
// por este completo y volvé a implementar (Implementar > Gestionar implementaciones >
// Editar > Nueva versión). La URL /exec no cambia.
//
// Cambios vs. tu versión:
// 1. HEADERS: se agregaron 2 columnas al final ('Foto Cierre Sistema (URL)',
//    'Foto Cierre Datáfono (URL)') — no se movió nada existente.
// 2. doPost: antes de escribir la fila, si vienen data.fotoSistema/data.fotoDatafono
//    (base64, del front-end de cierres.html), se guardan en Drive y se agregan
//    las URLs al final de la fila.
// 3. Después de pegar esto, corré UNA VEZ la función agregarEncabezados() desde el
//    editor (▶ con agregarEncabezados seleccionado) para que la fila de encabezados
//    existente incluya las 2 columnas nuevas.
//
// Actualización posterior:
// 4. Se agregaron 7 columnas más al final (propina por forma de pago, total
//    datáfono, diferencia y si tarjeta cuadra) — volvé a correr agregarEncabezados().
// 5. Las fotos ya NO se guardan en una carpeta derivada del Sheet: se guardan
//    directo en la carpeta fija "Cierres de caja" (FOLDER_ID_CIERRES más abajo),
//    con una subcarpeta por fecha (YYYY-MM-DD) dentro de ella.
//
// Actualización — módulo de Depósitos (depositos.html):
// 6. Se agregó doPost({type:'deposito'}) que escribe en una hoja nueva "Depositos"
//    (se crea sola si no existe) y doGet(?action=depositos) que la lee. Las fotos
//    de comprobante se guardan en una carpeta "Depósitos - Comprobantes" (se crea
//    sola, hermana de "Cierres de caja"). Después de pegar esto, corré UNA VEZ
//    agregarEncabezadosDepositos() desde el editor.
//
// Actualización — Propina en Dólares:
// 7. Se agregó 1 columna más al final ('Propina Dólares $'), ya que "Ventas en
//    Dólares" y "Propina en Dólares" ahora son un solo campo cada uno (antes
//    "Ventas en Dólares" separaba Efectivo($)/Tarjeta($); ese monto ahora se
//    guarda completo en 'USD Efectivo $', dejando 'USD Tarjeta $' en 0). Volvé
//    a correr agregarEncabezados().
//
// Actualización — Balance Final:
// 8. Se agregaron 2 columnas más al final ('Balance Final ₡', 'Balance Cuadra'):
//    la suma de la Diferencia Tarjeta más la Diferencia Caja, con su indicador
//    de si cuadra (±₡500). Volvé a correr agregarEncabezados().
//
// Actualización — DOLARES pasa a Efectivo:
// 9. La línea "DOLARES" del recibo (ventas y propina) ahora se suma directo dentro
//    de "Ventas Efectivo ₡" / "10% Servicio ₡" (ya viene en colones). No hay columnas
//    nuevas ni movidas, pero estas quedan en desuso a partir de ahora (siempre 0 en
//    cierres nuevos, sin afectar filas viejas): 'USD Efectivo $', 'USD Tarjeta $',
//    'USD Reportado Ventas $', 'Diferencia USD $', 'Propina Dólares $'. La columna
//    'USD Total en ₡' cambia de significado: ahora es el equivalente en ₡ de los
//    billetes en dólares CONTADOS físicamente (Total USD Contado $ × Tipo de Cambio),
//    y 'Total Caja Contada ₡' / 'Caja Total Contada ₡' / 'Diferencia Caja ₡' ya
//    incluyen ese monto sumado al conteo en colones.

const HEADERS_DEPOSITOS = [
  'ID', 'Fecha registro', 'Fecha depósito', 'Número de referencia',
  'Monto CRC comprobante', 'Monto USD comprobante', 'Fechas cubiertas',
  'Monto CRC calculado', 'Monto USD calculado', 'Diferencia CRC', 'Diferencia USD',
  'Foto comprobante (URL)', 'Notas'
];

const HEADERS = [
  'ID', 'Fecha', 'Hora', 'Punto de Venta', 'Encargado', 'Turno',
  'Ventas Efectivo ₡', 'Ventas Tarjeta ₡', 'Ventas SINPE ₡', 'Otras Ventas ₡',
  'Ventas Crédito ₡', 'Ventas Plataformas ₡', 'Detalle Plataformas', '10% Servicio ₡',
  'Total Ventas ₡', 'Fondo Caja ₡', 'Total Caja Contada ₡', 'Diferencia ₡', 'Observaciones',
  'Billetes ₡50.000', 'Billetes ₡20.000', 'Billetes ₡10.000', 'Billetes ₡5.000',
  'Billetes ₡2.000', 'Billetes ₡1.000', 'Monedas ₡500', 'Monedas ₡100',
  'Monedas ₡50', 'Monedas ₡25', 'Monedas ₡10', 'Monedas ₡5',
  'USD Efectivo $', 'USD Tarjeta $', 'Tipo de Cambio', 'USD Total en ₡',
  'Billetes $100', 'Billetes $50', 'Billetes $20', 'Billetes $10', 'Billetes $5', 'Billetes $1',
  'Total USD Contado $',
  'Caja Total Contada ₡', 'Fondo Caja Inicial ₡', 'Efectivo Esperado ₡', 'Diferencia Caja ₡',
  'USD Total Contado $', 'USD Reportado Ventas $', 'Diferencia USD $',
  'Foto Cierre Sistema (URL)', 'Foto Cierre Datáfono (URL)',
  '10% Servicio Efectivo ₡', '10% Servicio Tarjeta ₡', '10% Servicio Crédito ₡', '10% Servicio Otro ₡',
  'Total Datáfono ₡', 'Diferencia Tarjeta ₡', 'Tarjeta Cuadra',
  '10% Servicio Dólares $',
  'Balance Final ₡', 'Balance Cuadra'
];

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Support both JSON body and form parameter
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
      configSheet.getRange(1,1).setValue(JSON.stringify(data.config));
      return ContentService.createTextOutput(JSON.stringify({result:'ok'}))
        .setMimeType(ContentService.MimeType.JSON);
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
      data.id,              // A - ID
      data.fecha,           // B - Fecha
      data.hora,            // C - Hora
      data.punto,           // D - Punto de Venta
      data.encargado,       // E - Encargado
      data.turno,           // F - Turno
      data.efectivo,        // G - Ventas Efectivo ₡
      data.tarjeta,         // H - Ventas Tarjeta ₡
      data.sinpe,           // I - Ventas SINPE ₡
      data.otras,           // J - Otras Ventas ₡
      data.credito,         // K - Ventas Crédito ₡
      data.plataformas,     // L - Ventas Plataformas ₡
      data.plataformasDesc, // M - Detalle Plataformas
      data.servicio,        // N - 10% Servicio ₡
      data.totalVentas,     // O - Total Ventas ₡
      data.fondo,           // P - Fondo Caja ₡
      data.caja,            // Q - Total Caja Contada ₡
      data.diferencia,      // R - Diferencia ₡
      data.obs,             // S - Observaciones
      data.d50000,          // T - Billetes ₡50.000
      data.d20000,          // U - Billetes ₡20.000
      data.d10000,          // V - Billetes ₡10.000
      data.d5000,           // W - Billetes ₡5.000
      data.d2000,           // X - Billetes ₡2.000
      data.d1000,           // Y - Billetes ₡1.000
      data.d500,            // Z - Monedas ₡500
      data.d100,            // AA - Monedas ₡100
      data.d50,             // AB - Monedas ₡50
      data.d25,             // AC - Monedas ₡25
      data.d10,             // AD - Monedas ₡10
      data.d5,              // AE - Monedas ₡5
      data.usdEfectivo,     // AF - USD Efectivo $
      data.usdTarjeta,      // AG - USD Tarjeta $
      data.tc,              // AH - Tipo de Cambio
      data.usdTotalCrc,     // AI - USD Total en ₡
      data.usdD100,         // AJ - Billetes $100
      data.usdD50,          // AK - Billetes $50
      data.usdD20,          // AL - Billetes $20
      data.usdD10,          // AM - Billetes $10
      data.usdD5,           // AN - Billetes $5
      data.usdD1,           // AO - Billetes $1
      data.usdCajaTotalContado, // AP - Total USD Contado $
      data.cajaTotalContada,    // AQ - Caja Total Contada ₡
      data.fondoCajaInicial,    // AR - Fondo Caja Inicial ₡
      data.efectivoEsperado,    // AS - Efectivo Esperado ₡
      data.diferenciaColones,   // AT - Diferencia Caja ₡
      data.usdTotalContado,     // AU - USD Total Contado $
      data.usdReportadoVentas,  // AV - USD Reportado Ventas $
      data.diferenciaUsd,       // AW - Diferencia USD $
      fotoUrls.fotoSistemaUrl  || '',  // AX - Foto Cierre Sistema (URL)
      fotoUrls.fotoDatafonoUrl || '',  // AY - Foto Cierre Datáfono (URL)
      data.propinaEfectivo || 0,       // AZ - Propina Efectivo ₡
      data.propinaTarjeta  || 0,       // BA - Propina Tarjeta ₡
      data.propinaCredito  || 0,       // BB - Propina Crédito ₡
      data.propinaOtro     || 0,       // BC - Propina Otro ₡
      data.datafonoTotal    || 0,      // BD - Total Datáfono ₡
      data.diferenciaTarjeta || 0,     // BE - Diferencia Tarjeta ₡
      data.tarjetaCuadra ? 'SI' : 'NO',// BF - Tarjeta Cuadra
      data.propinaDolares || 0,        // BG - Propina Dólares $
      data.balanceFinal || 0,          // BH - Balance Final ₡
      data.balanceCuadra ? 'SI' : 'NO' // BI - Balance Cuadra
    ]);

    return ContentService.createTextOutput(JSON.stringify({result:'ok'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({result:'error', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (e && e.parameter && e.parameter.action === 'getConfig') {
    const configSheet = ss.getSheetByName('Config');
    if (!configSheet || configSheet.getLastRow() === 0) {
      return ContentService.createTextOutput(JSON.stringify({config: null}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const config = configSheet.getRange(1,1).getValue();
    return ContentService.createTextOutput(JSON.stringify({config: JSON.parse(config)}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (e && e.parameter && e.parameter.action === 'depositos') {
    const depSheet = ss.getSheetByName('Depositos');
    if (!depSheet || depSheet.getLastRow() === 0) {
      return ContentService.createTextOutput(JSON.stringify({records: []}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const rows = depSheet.getDataRange().getValues();
    const records = rows.slice(1);
    return ContentService.createTextOutput(JSON.stringify({records}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  let sheet = ss.getSheetByName('Cierres');
  if (!sheet) sheet = ss.getActiveSheet();
  const rows = sheet.getDataRange().getValues();
  const records = rows.slice(1);
  return ContentService.createTextOutput(JSON.stringify({records}))
    .setMimeType(ContentService.MimeType.JSON);
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
    const nombre = `${data.fechaDeposito || hoyCR()}_${data.referencia || 'sin-ref'}_${data.id || Date.now()}.jpg`
      .replace(/[^\w\-\.]+/g, '_');
    fotoUrl = guardarImagenBase64(carpeta, data.fotoComprobante, data.fotoComprobanteMime || 'image/jpeg', nombre);
  }

  sheet.appendRow([
    data.id || Date.now(),                    // ID
    hoyCR(),                                  // Fecha registro
    data.fechaDeposito || '',                 // Fecha depósito
    data.referencia || '',                    // Número de referencia
    data.montoCrcComprobante || 0,             // Monto CRC comprobante
    data.montoUsdComprobante || 0,             // Monto USD comprobante
    JSON.stringify(data.fechasCubiertas || []),// Fechas cubiertas
    data.montoCrcCalculado || 0,               // Monto CRC calculado
    data.montoUsdCalculado || 0,               // Monto USD calculado
    data.diferenciaCrc || 0,                   // Diferencia CRC
    data.diferenciaUsd || 0,                   // Diferencia USD
    fotoUrl,                                   // Foto comprobante (URL)
    data.notas || ''                           // Notas
  ]);

  return ContentService.createTextOutput(JSON.stringify({result:'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateCarpetaComprobantes() {
  const padre = getRootFolderFotos().getParents().hasNext()
    ? getRootFolderFotos().getParents().next()
    : getRootFolderFotos();
  const nombre = 'Depósitos - Comprobantes';
  const existing = padre.getFoldersByName(nombre);
  return existing.hasNext() ? existing.next() : padre.createFolder(nombre);
}

// ── FOTOS DE CIERRE → GOOGLE DRIVE ───────────────────────────────
// Carpeta raíz "Cierres - Fotos" en el mismo Drive donde vive este Sheet,
// con una subcarpeta por fecha (YYYY-MM-DD) y un archivo por foto.

function guardarFotosEnDrive(payload) {
  if (!payload.fotoSistema && !payload.fotoDatafono) return {};

  const carpetaDia = getOrCreateCarpetaDia(payload.fecha);
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

function getOrCreateCarpetaDia(fecha) {
  const root = getRootFolderFotos();
  const nombreCarpeta = fecha || hoyCR();
  const existing = root.getFoldersByName(nombreCarpeta);
  return existing.hasNext() ? existing.next() : root.createFolder(nombreCarpeta);
}

// Carpeta fija "Cierres de caja" en Drive:
// https://drive.google.com/drive/u/0/folders/1s0hjm5NmtgSgkZhmThpogZRhFZcr527j
const FOLDER_ID_CIERRES = '1s0hjm5NmtgSgkZhmThpogZRhFZcr527j';

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
