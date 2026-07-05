/**
 * Backend Apps Script para el Sheet "Registro compras LORITO_Brewhouse - IA"
 * (hoja "Registro Facturas"). Usado por factura-manual.html y, a futuro,
 * por las acciones de escritura de cuentas-por-pagar.html.
 *
 * Cómo desplegarlo:
 * 1. Abrí el Google Sheet > Extensiones > Apps Script.
 * 2. Pegá este código (reemplazando el contenido del archivo por defecto).
 * 3. Implementar > Nueva implementación > Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 4. Copiá la URL del Web App resultante y pegala en:
 *    - factura-manual.html → const APPS_SCRIPT_AP
 *    - cuentas-por-pagar.html → const APPS_SCRIPT_AP
 */

const HOJA_FACTURAS = 'Registro Facturas';
const HOJA_PROVEEDORES = 'proveedores';
const HOJA_ABONOS = 'Abonos';
const ABONOS_ENCABEZADOS = ['Factura', 'Fecha de abono', 'Monto abonado', 'Medio de pago', 'Referencia', 'Fecha de registro'];

// Hoja de mapeo Producto (tal cual aparece en Desglose_IA) → Nombre normalizado.
// No modifica las líneas históricas de Desglose_IA; sirve como catálogo de
// productos "registrados" y como corrección manual sobre lo que asignó la IA.
const HOJA_NORMALIZACION = 'Normalizacion_Productos';
const NORM_COL = { PRODUCTO: 1, NOMBRE_NORMALIZADO: 2, CATEGORIA: 3, FECHA_REGISTRO: 4 };
const NORM_ENCABEZADOS = ['Producto', 'Nombre normalizado', 'Categoría', 'Fecha de registro'];

// Columnas por posición (1-indexado), según el orden real de la hoja de facturas:
// Fecha, Factura, Proveedor, Moneda, TOTAL, Condicion, Fecha de pago, Medio de pago, Referencia.
// No existen columnas "Fecha de pago proyectada" ni "Estado factura" — si se necesitan
// (p.ej. para guardar_proyeccion), hay que crearlas dinámicamente con columnaPorNombre(),
// igual que se hace con "Detalle" y "Origen".
const COL = {
  FECHA: 1, FACTURA: 2, PROVEEDOR: 3, MONEDA: 4, TOTAL: 5,
  CONDICION: 6, FECHA_PAGO: 7, MEDIO_PAGO: 8, REFERENCIA: 9
};

// Columnas de la hoja "proveedores" (mismo modelo que el formulario de proveedores.html).
const PROV_COL = {
  ID: 1, NOMBRE_JURIDICO: 2, NOMBRE_COMERCIAL: 3, CATEGORIA: 4, CONTACTO: 5,
  TELEFONO: 6, CORREO: 7, DIAS_PEDIDO: 8, NOTAS_CONTACTO: 9, CUENTA: 10,
  CONDICION_PAGO: 11, NOTAS_PAGO: 12, ACTUALIZADO: 13
};
const PROV_ENCABEZADOS = [
  'ID', 'Nombre jurídico', 'Nombre comercial', 'Categoría', 'Contacto',
  'Teléfono', 'Correo', 'Días de pedido', 'Notas de contacto', 'Cuenta',
  'Condición de pago', 'Notas de pago', 'Actualizado'
];

// Hojas de caja chica.
const HOJA_CAJA_PERIODOS = 'CajaChica_Periodos';
const HOJA_CAJA_ARQUEOS  = 'CajaChica_Arqueos';
const CORREO_CIERRE_CAJA = 'jorge.lopez@casaaguizotes.com';

const CAJA_PER_COL = {
  ID: 1, FECHA_INICIO: 2, MONTO_INICIAL: 3, FECHA_CIERRE: 4,
  MONTO_CONTADO: 5, DIFERENCIA: 6, ESTADO: 7, DENOMINACIONES: 8, FECHA_REGISTRO_CIERRE: 9
};
const CAJA_PER_ENCABEZADOS = [
  'ID', 'Fecha inicio', 'Monto inicial', 'Fecha cierre', 'Monto contado cierre',
  'Diferencia cierre', 'Estado', 'Denominaciones cierre', 'Fecha registro cierre'
];

const CAJA_ARQ_COL = {
  ID: 1, PERIODO_ID: 2, FECHA: 3, BALANCE_TEORICO: 4, MONTO_CONTADO: 5,
  DIFERENCIA: 6, DENOMINACIONES: 7, NOTAS: 8
};
const CAJA_ARQ_ENCABEZADOS = [
  'ID', 'Periodo ID', 'Fecha', 'Balance teórico', 'Monto contado',
  'Diferencia', 'Denominaciones', 'Notas'
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.data);
    let result;
    switch (payload.modulo) {
      case 'registrar_factura_manual':
        result = registrarFacturaManual(payload);
        break;
      case 'guardar_proveedor':
        result = guardarProveedor(payload);
        break;
      case 'eliminar_proveedor':
        result = eliminarProveedor(payload);
        break;
      case 'abrir_periodo_caja':
        result = abrirPeriodoCaja(payload);
        break;
      case 'guardar_arqueo_caja':
        result = guardarArqueoCaja(payload);
        break;
      case 'cerrar_periodo_caja':
        result = cerrarPeriodoCaja(payload);
        break;
      case 'eliminar_periodo_caja':
        result = eliminarPeriodoCaja(payload);
        break;
      case 'guardar_proyeccion':
        result = guardarProyeccion(payload);
        break;
      case 'guardar_tc':
        result = guardarTC(payload);
        break;
      case 'registrar_pago':
        result = registrarPago(payload);
        break;
      case 'registrar_abono':
        result = registrarAbono(payload);
        break;
      case 'eliminar_factura':
        result = eliminarFactura(payload);
        break;
      case 'guardar_normalizacion':
        result = guardarNormalizacion(payload);
        break;
      default:
        throw new Error('Módulo no reconocido: ' + payload.modulo);
    }
    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getHoja() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FACTURAS);
  if (!hoja) throw new Error('No se encontró la hoja "' + HOJA_FACTURAS + '"');
  return hoja;
}

function getHojaProveedores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_PROVEEDORES);
  if (!hoja) hoja = ss.insertSheet(HOJA_PROVEEDORES);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, PROV_ENCABEZADOS.length).setValues([PROV_ENCABEZADOS]);
  }
  return hoja;
}

// Busca una columna por nombre de encabezado; si no existe, la crea al final.
function columnaPorNombre(hoja, nombre) {
  const ultimaCol = Math.max(hoja.getLastColumn(), Object.keys(COL).length);
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0];
  let idx = encabezados.indexOf(nombre) + 1;
  if (idx === 0) {
    idx = ultimaCol + 1;
    hoja.getRange(1, idx).setValue(nombre);
  }
  return idx;
}

function registrarFacturaManual(p) {
  if (!p.numero_factura) throw new Error('Falta el número de factura.');
  if (!p.proveedor) throw new Error('Falta el proveedor.');
  if (!p.total) throw new Error('Falta el total.');

  const hoja = getHoja();
  const colDetalle = columnaPorNombre(hoja, 'Detalle');
  const colOrigen  = columnaPorNombre(hoja, 'Origen');

  const fila = hoja.getLastRow() + 1;
  const fechaFactura = p.fecha_factura ? new Date(p.fecha_factura + 'T00:00:00') : new Date();
  hoja.getRange(fila, COL.FECHA).setValue(fechaFactura);
  hoja.getRange(fila, COL.FACTURA).setValue(String(p.numero_factura));
  hoja.getRange(fila, COL.PROVEEDOR).setValue(p.proveedor);
  hoja.getRange(fila, COL.MONEDA).setValue(p.moneda || 'CRC');
  hoja.getRange(fila, COL.TOTAL).setValue(Number(p.total));
  hoja.getRange(fila, colDetalle).setValue(p.detalle || '');
  hoja.getRange(fila, colOrigen).setValue(
    'Ingresado manualmente el ' + Utilities.formatDate(new Date(), 'America/Costa_Rica', 'dd/MM/yyyy HH:mm')
  );

  return { fila: fila };
}

// Busca la fila (1-indexada) de un proveedor por ID. Devuelve -1 si no existe.
function filaProveedorPorId(hoja, id) {
  if (!id) return -1;
  const ids = hoja.getRange(2, PROV_COL.ID, Math.max(hoja.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function guardarProveedor(p) {
  if (!p.nombre_juridico) throw new Error('Falta el nombre jurídico del proveedor.');

  const hoja = getHojaProveedores();
  let fila = filaProveedorPorId(hoja, p.id);
  const esNuevo = fila === -1;
  const id = esNuevo ? ('PROV-' + Date.now()) : p.id;
  if (esNuevo) fila = hoja.getLastRow() + 1;

  const dias = Array.isArray(p.dias_pedido) ? p.dias_pedido.join(', ') : (p.dias_pedido || '');

  hoja.getRange(fila, PROV_COL.ID).setValue(id);
  hoja.getRange(fila, PROV_COL.NOMBRE_JURIDICO).setValue(p.nombre_juridico || '');
  hoja.getRange(fila, PROV_COL.NOMBRE_COMERCIAL).setValue(p.nombre_comercial || '');
  hoja.getRange(fila, PROV_COL.CATEGORIA).setValue(p.categoria || '');
  hoja.getRange(fila, PROV_COL.CONTACTO).setValue(p.contacto || '');
  hoja.getRange(fila, PROV_COL.TELEFONO).setValue(p.telefono || '');
  hoja.getRange(fila, PROV_COL.CORREO).setValue(p.correo || '');
  hoja.getRange(fila, PROV_COL.DIAS_PEDIDO).setValue(dias);
  hoja.getRange(fila, PROV_COL.NOTAS_CONTACTO).setValue(p.notas_contacto || '');
  hoja.getRange(fila, PROV_COL.CUENTA).setValue(p.cuenta || '');
  hoja.getRange(fila, PROV_COL.CONDICION_PAGO).setValue(p.condicion_pago || '0');
  hoja.getRange(fila, PROV_COL.NOTAS_PAGO).setValue(p.notas_pago || '');
  hoja.getRange(fila, PROV_COL.ACTUALIZADO).setValue(new Date());

  return { id: id, fila: fila, nuevo: esNuevo };
}

function eliminarProveedor(p) {
  if (!p.id) throw new Error('Falta el ID del proveedor a eliminar.');
  const hoja = getHojaProveedores();
  const fila = filaProveedorPorId(hoja, p.id);
  if (fila === -1) throw new Error('No se encontró el proveedor con ID ' + p.id);
  hoja.deleteRow(fila);
  return { eliminado: p.id };
}

// ── CAJA CHICA ─────────────────────────────────────────────────────
function getHojaCajaPeriodos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_CAJA_PERIODOS);
  if (!hoja) hoja = ss.insertSheet(HOJA_CAJA_PERIODOS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, CAJA_PER_ENCABEZADOS.length).setValues([CAJA_PER_ENCABEZADOS]);
  }
  return hoja;
}

function getHojaCajaArqueos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_CAJA_ARQUEOS);
  if (!hoja) hoja = ss.insertSheet(HOJA_CAJA_ARQUEOS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, CAJA_ARQ_ENCABEZADOS.length).setValues([CAJA_ARQ_ENCABEZADOS]);
  }
  return hoja;
}

// Devuelve { fila, datos } del período con Estado "Abierto", o null si no hay ninguno.
function obtenerPeriodoAbierto(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, CAJA_PER_ENCABEZADOS.length).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][CAJA_PER_COL.ESTADO - 1] === 'Abierto') {
      return { fila: i + 2, datos: datos[i] };
    }
  }
  return null;
}

function filaPeriodoPorId(hoja, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const ids = hoja.getRange(2, CAJA_PER_COL.ID, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// Última fecha de cierre registrada entre todos los períodos cerrados.
function ultimaFechaCierre(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, CAJA_PER_ENCABEZADOS.length).getValues();
  let ultima = null;
  datos.forEach(function(fila) {
    const fc = fila[CAJA_PER_COL.FECHA_CIERRE - 1];
    if (fc instanceof Date && (!ultima || fc > ultima)) ultima = fc;
  });
  return ultima;
}

function abrirPeriodoCaja(p) {
  if (!p.fecha_inicio) throw new Error('Falta la fecha de inicio.');
  if (p.monto_inicial == null || p.monto_inicial === '') throw new Error('Falta el monto inicial.');

  const hoja = getHojaCajaPeriodos();
  if (obtenerPeriodoAbierto(hoja)) {
    throw new Error('Ya hay un período de caja chica abierto. Cerralo antes de abrir uno nuevo.');
  }

  const fechaInicio = new Date(p.fecha_inicio + 'T00:00:00');
  const ultimaCierre = ultimaFechaCierre(hoja);
  if (ultimaCierre && fechaInicio <= ultimaCierre) {
    throw new Error('La fecha de inicio debe ser posterior al último cierre (' +
      Utilities.formatDate(ultimaCierre, 'America/Costa_Rica', 'dd/MM/yyyy') + ').');
  }

  const id = 'CAJA-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, CAJA_PER_COL.ID).setValue(id);
  hoja.getRange(fila, CAJA_PER_COL.FECHA_INICIO).setValue(fechaInicio);
  hoja.getRange(fila, CAJA_PER_COL.MONTO_INICIAL).setValue(Number(p.monto_inicial));
  hoja.getRange(fila, CAJA_PER_COL.ESTADO).setValue('Abierto');

  return { id: id, fila: fila };
}

function guardarArqueoCaja(p) {
  if (!p.periodo_id) throw new Error('Falta el período de caja chica.');
  const hojaPer = getHojaCajaPeriodos();
  if (filaPeriodoPorId(hojaPer, p.periodo_id) === -1) throw new Error('No se encontró el período indicado.');

  const hoja = getHojaCajaArqueos();
  const id = 'ARQ-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, CAJA_ARQ_COL.ID).setValue(id);
  hoja.getRange(fila, CAJA_ARQ_COL.PERIODO_ID).setValue(p.periodo_id);
  hoja.getRange(fila, CAJA_ARQ_COL.FECHA).setValue(new Date());
  hoja.getRange(fila, CAJA_ARQ_COL.BALANCE_TEORICO).setValue(Number(p.balance_teorico) || 0);
  hoja.getRange(fila, CAJA_ARQ_COL.MONTO_CONTADO).setValue(Number(p.monto_contado) || 0);
  hoja.getRange(fila, CAJA_ARQ_COL.DIFERENCIA).setValue(Number(p.diferencia) || 0);
  hoja.getRange(fila, CAJA_ARQ_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, CAJA_ARQ_COL.NOTAS).setValue(p.notas || '');

  return { id: id, fila: fila };
}

function cerrarPeriodoCaja(p) {
  if (!p.periodo_id) throw new Error('Falta el período de caja chica.');
  if (!p.fecha_cierre) throw new Error('Falta la fecha de cierre.');

  const hoja = getHojaCajaPeriodos();
  const fila = filaPeriodoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');

  const datosFila = hoja.getRange(fila, 1, 1, CAJA_PER_ENCABEZADOS.length).getValues()[0];
  if (datosFila[CAJA_PER_COL.ESTADO - 1] !== 'Abierto') {
    throw new Error('Este período ya está cerrado.');
  }
  const fechaInicio    = datosFila[CAJA_PER_COL.FECHA_INICIO - 1];
  const montoInicial   = datosFila[CAJA_PER_COL.MONTO_INICIAL - 1];
  const fechaCierre    = new Date(p.fecha_cierre + 'T00:00:00');
  const montoContado   = Number(p.monto_contado) || 0;
  const diferencia     = Number(p.diferencia) || 0;
  const balanceTeorico = Number(p.balance_teorico) || 0;

  hoja.getRange(fila, CAJA_PER_COL.FECHA_CIERRE).setValue(fechaCierre);
  hoja.getRange(fila, CAJA_PER_COL.MONTO_CONTADO).setValue(montoContado);
  hoja.getRange(fila, CAJA_PER_COL.DIFERENCIA).setValue(diferencia);
  hoja.getRange(fila, CAJA_PER_COL.ESTADO).setValue('Cerrado');
  hoja.getRange(fila, CAJA_PER_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, CAJA_PER_COL.FECHA_REGISTRO_CIERRE).setValue(new Date());

  enviarCorreoCierreCaja({
    periodoId: p.periodo_id,
    fechaInicio: fechaInicio,
    fechaCierre: fechaCierre,
    montoInicial: montoInicial,
    balanceTeorico: balanceTeorico,
    montoContado: montoContado,
    diferencia: diferencia,
    denominaciones: p.denominaciones || {},
    gastos: p.gastos || []
  });

  return { id: p.periodo_id, fila: fila };
}

// Solo permite borrar un período mientras sigue "Abierto" (p.ej. si se abrió con datos
// equivocados). Los períodos cerrados quedan como registro histórico permanente.
function eliminarPeriodoCaja(p) {
  if (!p.periodo_id) throw new Error('Falta el período a eliminar.');
  const hoja = getHojaCajaPeriodos();
  const fila = filaPeriodoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');

  const estado = hoja.getRange(fila, CAJA_PER_COL.ESTADO).getValue();
  if (estado !== 'Abierto') throw new Error('Solo se puede eliminar un período que sigue abierto.');
  hoja.deleteRow(fila);

  // Borrar también los arqueos asociados a ese período.
  const hojaArq = getHojaCajaArqueos();
  const nFilas = hojaArq.getLastRow() - 1;
  if (nFilas > 0) {
    const ids = hojaArq.getRange(2, CAJA_ARQ_COL.PERIODO_ID, nFilas, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(p.periodo_id)) hojaArq.deleteRow(i + 2);
    }
  }

  return { eliminado: p.periodo_id };
}

function enviarCorreoCierreCaja(d) {
  const fmtFecha = function(f) { return Utilities.formatDate(f, 'America/Costa_Rica', 'dd/MM/yyyy'); };
  const fmtMonto = function(n) { return '₡' + Number(n||0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const totalGastos = d.gastos.reduce(function(a, g) { return a + (Number(g.monto)||0); }, 0);

  const filasGastos = d.gastos.map(function(g) {
    return '<tr><td>' + (g.fecha||'') + '</td><td>' + (g.factura||'') + '</td><td>' + (g.proveedor||'') +
           '</td><td style="text-align:right;">' + fmtMonto(g.monto) + '</td></tr>';
  }).join('');

  const filasDenom = Object.keys(d.denominaciones)
    .filter(function(k) { return Number(d.denominaciones[k]) > 0; })
    .sort(function(a,b) { return Number(b) - Number(a); })
    .map(function(k) {
      const cant = Number(d.denominaciones[k]);
      return '<tr><td>' + fmtMonto(k) + '</td><td style="text-align:right;">' + cant +
             '</td><td style="text-align:right;">' + fmtMonto(cant * Number(k)) + '</td></tr>';
    }).join('');

  const colorDif = Math.abs(d.diferencia) < 1 ? '#1a7a4a' : '#c84a20';

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c3a28;">' +
    '<h2>Cierre de Caja Chica · Lorito</h2>' +
    '<p><strong>Período:</strong> ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre) + '</p>' +
    '<table cellpadding="6" style="border-collapse:collapse;margin-bottom:16px;">' +
    '<tr><td>Monto inicial</td><td style="text-align:right;">' + fmtMonto(d.montoInicial) + '</td></tr>' +
    '<tr><td>Total de gastos del período</td><td style="text-align:right;">' + fmtMonto(totalGastos) + '</td></tr>' +
    '<tr><td><strong>Balance teórico</strong></td><td style="text-align:right;"><strong>' + fmtMonto(d.balanceTeorico) + '</strong></td></tr>' +
    '<tr><td>Monto contado (arqueo de cierre)</td><td style="text-align:right;">' + fmtMonto(d.montoContado) + '</td></tr>' +
    '<tr><td><strong>Diferencia</strong></td><td style="text-align:right;color:' + colorDif + ';"><strong>' + fmtMonto(d.diferencia) + '</strong></td></tr>' +
    '</table>' +
    '<h3>Denominaciones contadas</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;margin-bottom:16px;">' +
    '<tr style="background:#f2ede2;"><th>Denominación</th><th>Cantidad</th><th>Subtotal</th></tr>' +
    filasDenom +
    '</table>' +
    '<h3>Gastos del período (' + d.gastos.length + ')</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;">' +
    '<tr style="background:#f2ede2;"><th>Fecha</th><th>Factura</th><th>Proveedor</th><th>Monto</th></tr>' +
    (filasGastos || '<tr><td colspan="4">Sin gastos registrados en el período.</td></tr>') +
    '</table>' +
    '</div>';

  MailApp.sendEmail({
    to: CORREO_CIERRE_CAJA,
    subject: 'Cierre de Caja Chica · ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre),
    htmlBody: html
  });
}

// ── ACCIONES DE CUENTAS POR PAGAR (Registro Facturas) ─────────────
// Como puede haber números de factura repetidos (duplicados), cada acción
// recibe un "ordinal": la posición (1ra, 2da...) en que esa factura aparece
// recorriendo la hoja de arriba hacia abajo. El cliente (cuentas-por-pagar.html)
// calcula ese ordinal en el mismo orden en que lee los datos por gviz, que
// respeta el orden de la hoja — así el backend edita/borra la copia correcta.
function filaFacturaPorOrdinal(hoja, numeroFactura, ordinal) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, COL.FACTURA, nFilas, 1).getValues();
  let contador = 0;
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]) === String(numeroFactura)) {
      contador++;
      if (contador === Number(ordinal)) return i + 2;
    }
  }
  return -1;
}

function guardarProyeccion(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar a cuál copia de la factura aplica.');
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  const col = columnaPorNombre(hoja, 'Fecha proyectada de pago');
  hoja.getRange(fila, col).setValue(p.fecha_proyectada || '');
  return { fila: fila };
}

function guardarTC(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.tipo_cambio) throw new Error('Falta el tipo de cambio.');
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  const col = columnaPorNombre(hoja, 'Tipo de cambio');
  hoja.getRange(fila, col).setValue(Number(p.tipo_cambio));
  return { fila: fila };
}

function registrarPago(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal)        throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.fecha_pago)     throw new Error('Falta la fecha de pago.');
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  hoja.getRange(fila, COL.FECHA_PAGO).setValue(p.fecha_pago);
  hoja.getRange(fila, COL.MEDIO_PAGO).setValue(p.medio_pago || '');
  hoja.getRange(fila, COL.REFERENCIA).setValue(p.referencia || '');
  return { fila: fila };
}

// ── ABONOS PARCIALES ──────────────────────────────────────────────
// La hoja Registro Facturas solo tiene una "Fecha de pago" única por fila,
// así que los abonos parciales se llevan en una hoja aparte y se refleja
// el acumulado en una columna dinámica "Total abonado" sobre la factura.
function getHojaAbonos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_ABONOS);
  if (!hoja) hoja = ss.insertSheet(HOJA_ABONOS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, ABONOS_ENCABEZADOS.length).setValues([ABONOS_ENCABEZADOS]);
  }
  return hoja;
}

function sumAbonosFactura(numeroFactura) {
  const hoja = getHojaAbonos();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return 0;
  const datos = hoja.getRange(2, 1, nFilas, 3).getValues();
  let total = 0;
  datos.forEach(function(r) {
    if (String(r[0]) === String(numeroFactura)) total += Number(r[2]) || 0;
  });
  return Math.round(total * 100) / 100;
}

function registrarAbono(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal)        throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.fecha_abono)    throw new Error('Falta la fecha del abono.');
  if (!p.monto_abono)    throw new Error('Falta el monto del abono.');

  getHojaAbonos().appendRow([
    p.numero_factura, p.fecha_abono, Number(p.monto_abono), p.medio_pago || '', p.referencia || '', new Date()
  ]);

  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa factura.');

  const totalAbonado = sumAbonosFactura(p.numero_factura);
  const col = columnaPorNombre(hoja, 'Total abonado');
  hoja.getRange(fila, col).setValue(totalAbonado);

  return { fila: fila, total_abonado: totalAbonado };
}

function eliminarFactura(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar cuál copia eliminar.');
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa copia (puede que ya se haya eliminado).');
  hoja.deleteRow(fila);
  return { eliminado: true, fila: fila };
}

// ── NORMALIZACIÓN DE PRODUCTOS (catálogo Producto → Nombre normalizado) ──
function getHojaNormalizacion() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_NORMALIZACION);
  if (!hoja) hoja = ss.insertSheet(HOJA_NORMALIZACION);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, NORM_ENCABEZADOS.length).setValues([NORM_ENCABEZADOS]);
  }
  return hoja;
}

function filaProductoPorNombre(hoja, producto) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, NORM_COL.PRODUCTO, nFilas, 1).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === String(producto).trim()) return i + 2;
  }
  return -1;
}

function guardarNormalizacion(p) {
  if (!p.producto) throw new Error('Falta el nombre del producto.');
  const hoja = getHojaNormalizacion();
  let fila = filaProductoPorNombre(hoja, p.producto);
  const esNuevo = fila === -1;
  if (esNuevo) fila = hoja.getLastRow() + 1;

  hoja.getRange(fila, NORM_COL.PRODUCTO).setValue(p.producto);
  hoja.getRange(fila, NORM_COL.NOMBRE_NORMALIZADO).setValue(p.nombre_normalizado || p.producto);
  hoja.getRange(fila, NORM_COL.CATEGORIA).setValue(p.categoria || '');
  if (esNuevo) hoja.getRange(fila, NORM_COL.FECHA_REGISTRO).setValue(new Date());

  return { fila: fila, nuevo: esNuevo };
}
