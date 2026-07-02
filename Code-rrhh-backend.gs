/**
 * Backend Apps Script para el Sheet "RRHH - LORITO IA".
 * Usado por las 8 páginas rrhh-*.html de ecosistema-lorito.
 *
 * Cómo desplegarlo:
 * 1. Abrí el Google Sheet "RRHH - LORITO IA" > Extensiones > Apps Script.
 * 2. Pegá este código (reemplazando el contenido del archivo por defecto).
 * 3. Corré UNA VEZ la función configurarHojas() desde el editor (▶ con
 *    configurarHojas seleccionado) para crear/renombrar las pestañas y
 *    escribir los encabezados.
 * 4. Implementar > Nueva implementación > Tipo: Aplicación web.
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquiera
 * 5. Copiá la URL del Web App resultante y reemplazá TODO_APPS_SCRIPT_RRHH_LORITO
 *    en los 8 archivos rrhh-*.html de ecosistema-lorito.
 */

const HOJA_PERSONAL        = 'Personal';
const HOJA_VACACIONES      = 'Vacaciones';
const HOJA_AMONESTACIONES  = 'Amonestaciones';
const HOJA_TERMINACIONES   = 'Terminaciones';
const HOJA_CAMBIOS_SALARIO = 'CambiosSalario';
const HOJA_LIQUIDACIONES   = 'Liquidaciones';

const ENCABEZADOS_PERSONAL = [
  'Nombre completo', 'Cédula', 'Puesto', 'Estado', 'Departamento', 'Salario',
  'Fecha ingreso', 'Fecha nacimiento', 'Edad', 'Nacionalidad', 'Teléfono', 'Email',
  'Antigüedad', 'Banco', 'Cuenta', 'Tipo cuenta', 'Contrato', 'CCSS', 'INS RT',
  'Carnet alimentos', 'Vence carnet', 'Saldo vacaciones'
];
const ENCABEZADOS_VACACIONES = [
  'ID', 'Colaborador', 'Fecha inicio', 'Fecha fin', 'Días', 'Observaciones', 'Estado', 'Registrado'
];
const ENCABEZADOS_AMONESTACIONES = [
  'Fecha', 'Colaborador', 'Tipo', 'Motivo', 'Observaciones', 'Suspensión desde', 'Suspensión hasta', 'Registrado'
];
const ENCABEZADOS_TERMINACIONES = [
  'Colaborador', 'Tipo terminación', 'Fecha salida', 'Observaciones', 'Registrado'
];
const ENCABEZADOS_CAMBIOS_SALARIO = [
  'Colaborador', 'Salario anterior', 'Salario nuevo', 'Diferencia', 'Fecha efectiva', 'Registrado por', 'Motivo', 'Registrado'
];
const ENCABEZADOS_LIQUIDACIONES = [
  'Colaborador', 'Fecha pago', 'Confirmado por', 'Total pagado', 'Preaviso', 'Cesantía', 'Vacaciones', 'Aguinaldo', 'Motivo', 'Registrado'
];

// Corré esta función UNA VEZ desde el editor de Apps Script para preparar el Sheet:
// reutiliza la pestaña "Staff" (creada vacía junto con el Sheet) como "Personal"
// y crea el resto de pestañas con sus encabezados.
function configurarHojas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const staff = ss.getSheetByName('Staff');
  if (staff && !ss.getSheetByName(HOJA_PERSONAL)) staff.setName(HOJA_PERSONAL);

  prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES);
  prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES);
  prepararHoja(HOJA_TERMINACIONES, ENCABEZADOS_TERMINACIONES);
  prepararHoja(HOJA_CAMBIOS_SALARIO, ENCABEZADOS_CAMBIOS_SALARIO);
  prepararHoja(HOJA_LIQUIDACIONES, ENCABEZADOS_LIQUIDACIONES);
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
    let hoja;
    switch (modulo) {
      case 'personal':       hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL); break;
      case 'vacaciones':     hoja = prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES); break;
      case 'amonestaciones': hoja = prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES); break;
      case 'acciones':       return jsonOut({ ok: true, registros: [] });
      default:
        return jsonOut({ ok: false, error: 'Módulo no reconocido: ' + modulo });
    }
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
// Soporta tanto body JSON crudo (fetch con headers Content-Type: application/json)
// como form-encoded con { data: JSON.stringify(payload) }, porque las 8 páginas
// RRHH usan ambos estilos indistintamente.
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
      case 'nuevo_ingreso':         result = nuevoIngreso(payload); break;
      case 'vacaciones':            result = crearSolicitudVacaciones(payload); break;
      case 'vacaciones_estado':     result = cambiarEstadoVacaciones(payload); break;
      case 'amonestacion':          result = registrarAmonestacion(payload); break;
      case 'terminacion':           result = registrarTerminacion(payload); break;
      case 'cambio_salario':        result = registrarCambioSalario(payload); break;
      case 'confirmar_liquidacion': result = confirmarLiquidacion(payload); break;
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

// Busca la fila (1-indexada) de un colaborador en Personal por "Nombre completo"
// (case-insensitive, sin espacios extra). Devuelve -1 si no existe.
function filaColaborador(hoja, nombre) {
  if (!nombre) return -1;
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const colNombre = ENCABEZADOS_PERSONAL.indexOf('Nombre completo') + 1;
  const nombres = hoja.getRange(2, colNombre, nFilas, 1).getValues();
  const buscado = String(nombre).trim().toLowerCase();
  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim().toLowerCase() === buscado) return i + 2;
  }
  return -1;
}

function nuevoIngreso(p) {
  if (!p.nombre) throw new Error('Falta el nombre del colaborador.');
  const hoja = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const nombreCompleto = (p.nombre + ' ' + (p.apellidos || '')).trim();
  if (filaColaborador(hoja, nombreCompleto) !== -1) {
    throw new Error('Ya existe un colaborador con ese nombre.');
  }
  const doc = p.documentos || {};
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_PERSONAL, {
    'Nombre completo': nombreCompleto,
    'Cédula': p.cedula || '',
    'Puesto': p.puesto || '',
    'Estado': p.estado || 'ACTIVO',
    'Departamento': p.departamento || '',
    'Salario': Number(p.salario) || 0,
    'Fecha ingreso': p.fecha_ingreso || '',
    'Fecha nacimiento': p.fecha_nacimiento || '',
    'Edad': p.edad || '',
    'Nacionalidad': p.nacionalidad || '',
    'Teléfono': p.telefono || '',
    'Email': p.email || '',
    'Antigüedad': p.antiguedad || '',
    'Banco': p.banco || '',
    'Cuenta': p.cuenta || '',
    'Tipo cuenta': p.tipo_cuenta || '',
    'Contrato': !!doc.contrato,
    'CCSS': !!doc.ccss,
    'INS RT': !!doc.ins_rt,
    'Carnet alimentos': !!doc.carnet,
    'Vence carnet': doc.carnet_vence || '',
    'Saldo vacaciones': 0
  });
  return { fila: fila, nombre: nombreCompleto };
}

function crearSolicitudVacaciones(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_VACACIONES, {
    'ID': p.id || Date.now(),
    'Colaborador': p.colaborador,
    'Fecha inicio': p.fecha_inicio || '',
    'Fecha fin': p.fecha_fin || '',
    'Días': Number(p.dias) || 0,
    'Observaciones': p.observaciones || '',
    'Estado': p.estado || 'Pendiente',
    'Registrado': p.registrado || p.registrado_en || new Date().toISOString()
  });
  return { fila: fila };
}

function cambiarEstadoVacaciones(p) {
  if (!p.id) throw new Error('Falta el ID de la solicitud.');
  const hoja = prepararHoja(HOJA_VACACIONES, ENCABEZADOS_VACACIONES);
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) throw new Error('No hay solicitudes registradas.');
  const colId = ENCABEZADOS_VACACIONES.indexOf('ID') + 1;
  const colEstado = ENCABEZADOS_VACACIONES.indexOf('Estado') + 1;
  const ids = hoja.getRange(2, colId, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(p.id)) {
      hoja.getRange(i + 2, colEstado).setValue(p.estado || 'Pendiente');
      return { fila: i + 2 };
    }
  }
  throw new Error('No se encontró la solicitud ' + p.id);
}

function registrarAmonestacion(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  if (!p.tipo) throw new Error('Falta el tipo de amonestación.');
  const hoja = prepararHoja(HOJA_AMONESTACIONES, ENCABEZADOS_AMONESTACIONES);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_AMONESTACIONES, {
    'Fecha': p.fecha || '',
    'Colaborador': p.colaborador,
    'Tipo': p.tipo,
    'Motivo': p.motivo || '',
    'Observaciones': p.observaciones || '',
    'Suspensión desde': p.susp_desde || '',
    'Suspensión hasta': p.susp_hasta || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });
  return { fila: fila };
}

function registrarTerminacion(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_TERMINACIONES, ENCABEZADOS_TERMINACIONES);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_TERMINACIONES, {
    'Colaborador': p.colaborador,
    'Tipo terminación': p.tipo_terminacion || '',
    'Fecha salida': p.fecha_salida || '',
    'Observaciones': p.observaciones || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });

  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const filaP = filaColaborador(hojaPersonal, p.colaborador);
  if (filaP !== -1) {
    const colEstado = ENCABEZADOS_PERSONAL.indexOf('Estado') + 1;
    hojaPersonal.getRange(filaP, colEstado).setValue(p.nuevo_estado || 'LIQUIDACIÓN');
  }
  return { fila: fila };
}

function registrarCambioSalario(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_CAMBIOS_SALARIO, ENCABEZADOS_CAMBIOS_SALARIO);
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_CAMBIOS_SALARIO, {
    'Colaborador': p.colaborador,
    'Salario anterior': Number(p.salario_actual) || 0,
    'Salario nuevo': Number(p.salario_nuevo) || 0,
    'Diferencia': Number(p.diferencia) || 0,
    'Fecha efectiva': p.fecha_efectiva || '',
    'Registrado por': p.registrado_por || '',
    'Motivo': p.motivo || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });

  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const filaP = filaColaborador(hojaPersonal, p.colaborador);
  if (filaP !== -1) {
    const colSalario = ENCABEZADOS_PERSONAL.indexOf('Salario') + 1;
    hojaPersonal.getRange(filaP, colSalario).setValue(Number(p.salario_nuevo) || 0);
  }
  return { fila: fila };
}

function confirmarLiquidacion(p) {
  if (!p.colaborador) throw new Error('Falta el colaborador.');
  const hoja = prepararHoja(HOJA_LIQUIDACIONES, ENCABEZADOS_LIQUIDACIONES);
  const desglose = p.desglose || {};
  const fila = hoja.getLastRow() + 1;
  escribirFilaPorEncabezado(hoja, fila, ENCABEZADOS_LIQUIDACIONES, {
    'Colaborador': p.colaborador,
    'Fecha pago': p.fecha_pago || '',
    'Confirmado por': p.confirmado_por || '',
    'Total pagado': Number(p.total_pagado) || 0,
    'Preaviso': Number(desglose.preaviso) || 0,
    'Cesantía': Number(desglose.cesantia) || 0,
    'Vacaciones': Number(desglose.vacaciones) || 0,
    'Aguinaldo': Number(desglose.aguinaldo) || 0,
    'Motivo': p.motivo || '',
    'Registrado': p.registrado_en || new Date().toISOString()
  });

  const hojaPersonal = prepararHoja(HOJA_PERSONAL, ENCABEZADOS_PERSONAL);
  const filaP = filaColaborador(hojaPersonal, p.colaborador);
  if (filaP !== -1) {
    const colEstado = ENCABEZADOS_PERSONAL.indexOf('Estado') + 1;
    hojaPersonal.getRange(filaP, colEstado).setValue(p.nuevo_estado || 'INACTIVO');
  }
  return { fila: fila };
}
