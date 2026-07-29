/**
 * Backend Apps Script para el Sheet "Registro compras LORITO_Brewhouse - IA".
 * Usado por factura-manual.html, cuentas-por-pagar.html, config-productos.html
 * y por el script de OCR de facturas (hoja aparte) para el mapeo de productos
 * y el costo promedio ponderado.
 *
 * Cómo desplegarlo:
 * 1. Abrí el Google Sheet > Extensiones > Apps Script.
 * 2. Pegá este código (reemplazando el contenido del archivo por defecto).
 * 3. Implementar > Gestionar implementaciones > Editar > Nueva versión
 *    (la URL /exec no cambia).
 * 4. Corré UNA VEZ, a mano desde este editor, la función
 *    migrarNormalizacionAMaestro() para migrar el catálogo viejo
 *    Normalizacion_Productos hacia Maestro_Productos + Alias_Productos.
 * 5. En el script de OCR de facturas (hoja aparte), agregá un POST a este
 *    mismo /exec con { modulo: 'procesar_linea_compra', ... } justo después
 *    de escribir cada línea de producto en Desglose_IA (ver sección
 *    "MAESTRO DE PRODUCTOS" más abajo para el detalle de los campos).
 */

const HOJA_FACTURAS = 'Registro Facturas';
const HOJA_PROVEEDORES = 'proveedores';
const HOJA_ABONOS = 'Abonos';
const ABONOS_ENCABEZADOS = ['Factura', 'Fecha de abono', 'Monto abonado', 'Medio de pago', 'Referencia', 'Reembolsado a', 'Nota de crédito asociada', 'Fecha de registro'];

// Catálogo viejo Producto (tal cual aparece en Desglose_IA) → Nombre normalizado.
// Reemplazado por Maestro_Productos + Alias_Productos (ver más abajo). Se deja
// esta constante solo porque migrarNormalizacionAMaestro() todavía lee de acá
// una única vez; ya no hay ninguna acción que escriba en esta hoja.
const HOJA_NORMALIZACION = 'Normalizacion_Productos';
const NORM_COL = { PRODUCTO: 1, NOMBRE_NORMALIZADO: 2, CATEGORIA: 3, FECHA_REGISTRO: 4 };
const NORM_ENCABEZADOS = ['Producto', 'Nombre normalizado', 'Categoría', 'Fecha de registro'];

// ── MAESTRO DE PRODUCTOS · ALIAS · COSTO PROMEDIO ────────────────────
// Arquitectura de 3 capas conectadas por id_producto:
//   1. Maestro_Productos  — catálogo único de productos reales.
//   2. Alias_Productos    — resuelve "nombre en factura" + proveedor → id_producto.
//   3. Costo_Promedio     — costo promedio ponderado (30/90 días) por id_producto,
//                           recalculado desde Desglose_IA cada vez que se resuelve una compra.
// Lo que no se reconoce en Alias_Productos cae en Pendientes_Mapeo para
// resolverlo una sola vez desde config-productos.html.
const HOJA_DESGLOSE = 'Desglose_IA';
const DESGLOSE_COL = {
  TIPO_DOCUMENTO: 1, MONEDA: 2, NUMERO_FACTURA: 3, FECHA_FACTURA: 4, CLIENTE: 5,
  PROVEEDOR: 6, CATEGORIA: 7, PRODUCTO: 8, NOMBRE_NORMALIZADO: 9, UNIDAD_MEDIDA: 10,
  CANTIDAD: 11, PRECIO_UNITARIO: 12, DESCUENTO: 13, IMPUESTO: 14, TOTAL_LINEA: 15,
  TOTAL_FACTURA: 16, ARCHIVO: 17, FECHA_CARGA: 18
};

const HOJA_MAESTRO = 'Maestro_Productos';
const MAESTRO_COL = {
  ID_PRODUCTO: 1, NOMBRE_NORMALIZADO: 2, CATEGORIA: 3,
  AREA_NEGOCIO: 4, FECHA_CREACION: 5
};
const MAESTRO_ENCABEZADOS = [
  'ID producto', 'Nombre normalizado', 'Categoría',
  'Área de negocio', 'Fecha de creación'
];

// Listas compartidas de categorías / área de negocio — usadas acá y también
// por costos-productos.html (que antes las tenía hardcodeadas/en localStorage).
// Se administran desde la pestaña "Categorías y áreas" de config-productos.html.
const HOJA_CATEGORIAS = 'Categorias_Productos';
const CATEGORIAS_DEFAULT = [
  'Carnes', 'Mariscos', 'Aves', 'Lácteos', 'Aceites y Grasas', 'Frutas y Verduras',
  'Granos y Cereales', 'Bebidas', 'Panadería y Repostería', 'Condimentos y Especias',
  'Limpieza e Higiene', 'Empaques y Desechables', 'Servicios', 'Otros'
];

const HOJA_AREAS = 'Areas_Negocio';
const AREAS_DEFAULT = ['Cocina', 'Bar', 'Consumible', 'Otro'];

const HOJA_ALIAS = 'Alias_Productos';
const ALIAS_COL = { NOMBRE_FACTURA: 1, PROVEEDOR: 2, ID_PRODUCTO: 3, FECHA_REGISTRO: 4 };
const ALIAS_ENCABEZADOS = ['Nombre en factura', 'Proveedor', 'ID producto', 'Fecha de registro'];
// Alias sin proveedor específico (usado por la migración desde Normalizacion_Productos,
// que no distinguía proveedor). Sirve de fallback si no hay match exacto por proveedor.
const PROVEEDOR_COMODIN = '*';

const HOJA_PENDIENTES = 'Pendientes_Mapeo';
const PEND_COL = {
  NOMBRE_FACTURA: 1, PROVEEDOR: 2, CATEGORIA_SUGERIDA: 3, NOMBRE_NORMALIZADO_SUGERIDO: 4,
  PRIMERA_FECHA: 5, ULTIMA_FECHA: 6, VECES_VISTO: 7
};
const PEND_ENCABEZADOS = [
  'Nombre en factura', 'Proveedor', 'Categoría sugerida', 'Nombre normalizado sugerido',
  'Primera vez visto', 'Última vez visto', 'Veces visto'
];

const HOJA_COSTO_PROMEDIO = 'Costo_Promedio';
const COSTO_COL = {
  ID_PRODUCTO: 1, NOMBRE_NORMALIZADO: 2, CATEGORIA: 3,
  COSTO_ULTIMO: 4, FECHA_ULTIMA_COMPRA: 5, COSTO_PROM_30D: 6, COSTO_PROM_90D: 7,
  FECHA_ACTUALIZACION: 8
};
const COSTO_ENCABEZADOS = [
  'ID producto', 'Nombre normalizado', 'Categoría',
  'Costo último', 'Fecha última compra', 'Costo promedio 30 días',
  'Costo promedio 90 días', 'Fecha de actualización'
];

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

// Hojas de Fondo de Caja: fondo bimoneda (CRC + USD) usado como "Medio de pago"
// propio en cuentas-por-pagar.html, separado de "Caja chica" (gastos menores).
const HOJA_FONDO_PERIODOS = 'FondoCaja_Periodos';
const HOJA_FONDO_ARQUEOS  = 'FondoCaja_Arqueos';
const CORREO_CIERRE_FONDO = 'jorge.lopez@casaaguizotes.com';

const FONDO_PER_COL = {
  ID: 1, FECHA_INICIO: 2, MONTO_INICIAL_CRC: 3, MONTO_INICIAL_USD: 4, FECHA_CIERRE: 5,
  MONTO_CONTADO_CRC: 6, MONTO_CONTADO_USD: 7, DIFERENCIA_CRC: 8, DIFERENCIA_USD: 9,
  ESTADO: 10, DENOMINACIONES: 11, FECHA_REGISTRO_CIERRE: 12
};
const FONDO_PER_ENCABEZADOS = [
  'ID', 'Fecha inicio', 'Monto inicial CRC', 'Monto inicial USD', 'Fecha cierre',
  'Monto contado cierre CRC', 'Monto contado cierre USD', 'Diferencia cierre CRC', 'Diferencia cierre USD',
  'Estado', 'Denominaciones cierre', 'Fecha registro cierre'
];

const FONDO_ARQ_COL = {
  ID: 1, PERIODO_ID: 2, FECHA: 3,
  BALANCE_TEORICO_CRC: 4, MONTO_CONTADO_CRC: 5, DIFERENCIA_CRC: 6,
  BALANCE_TEORICO_USD: 7, MONTO_CONTADO_USD: 8, DIFERENCIA_USD: 9,
  DENOMINACIONES: 10, NOTAS: 11
};
const FONDO_ARQ_ENCABEZADOS = [
  'ID', 'Periodo ID', 'Fecha', 'Balance teórico CRC', 'Monto contado CRC', 'Diferencia CRC',
  'Balance teórico USD', 'Monto contado USD', 'Diferencia USD', 'Denominaciones', 'Notas'
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
      case 'abrir_periodo_fondo':
        result = abrirPeriodoFondo(payload);
        break;
      case 'guardar_arqueo_fondo':
        result = guardarArqueoFondo(payload);
        break;
      case 'cerrar_periodo_fondo':
        result = cerrarPeriodoFondo(payload);
        break;
      case 'eliminar_periodo_fondo':
        result = eliminarPeriodoFondo(payload);
        break;
      case 'guardar_proyeccion':
        result = guardarProyeccion(payload);
        break;
      case 'guardar_tc':
        result = guardarTC(payload);
        break;
      case 'guardar_nota':
        result = guardarNota(payload);
        break;
      case 'registrar_pago':
        result = registrarPago(payload);
        break;
      case 'registrar_reembolso':
        result = registrarReembolso(payload);
        break;
      case 'registrar_abono':
        result = registrarAbono(payload);
        break;
      case 'eliminar_factura':
        result = eliminarFactura(payload);
        break;
      case 'aceptar_duplicado':
        result = aceptarDuplicado(payload);
        break;
      case 'eliminar_linea_duplicada':
        result = eliminarLineaDuplicada(payload);
        break;
      case 'aceptar_duplicado_linea':
        result = aceptarDuplicadoLinea(payload);
        break;
      case 'procesar_linea_compra':
        result = procesarLineaCompra(payload);
        break;
      case 'resolver_pendiente':
        result = resolverPendiente(payload);
        break;
      case 'guardar_producto_maestro':
        result = guardarProductoMaestro(payload);
        break;
      case 'eliminar_producto_maestro':
        result = eliminarProductoMaestro(payload);
        break;
      case 'fusionar_productos_maestro':
        result = fusionarProductosMaestro(payload);
        break;
      case 'guardar_categoria':
        result = guardarCategoria(payload);
        break;
      case 'eliminar_categoria':
        result = eliminarCategoria(payload);
        break;
      case 'guardar_area_negocio':
        result = guardarAreaNegocio(payload);
        break;
      case 'eliminar_area_negocio':
        result = eliminarAreaNegocio(payload);
        break;
      case 'asociar_pago_identificado':
        result = asociarPagoIdentificado(payload);
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

// ── FONDO DE CAJA (fondo bimoneda CRC + USD) ──────────────────────
function getHojaFondoPeriodos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_FONDO_PERIODOS);
  if (!hoja) hoja = ss.insertSheet(HOJA_FONDO_PERIODOS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, FONDO_PER_ENCABEZADOS.length).setValues([FONDO_PER_ENCABEZADOS]);
  }
  return hoja;
}

function getHojaFondoArqueos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_FONDO_ARQUEOS);
  if (!hoja) hoja = ss.insertSheet(HOJA_FONDO_ARQUEOS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, FONDO_ARQ_ENCABEZADOS.length).setValues([FONDO_ARQ_ENCABEZADOS]);
  }
  return hoja;
}

function obtenerPeriodoFondoAbierto(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, FONDO_PER_ENCABEZADOS.length).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (datos[i][FONDO_PER_COL.ESTADO - 1] === 'Abierto') {
      return { fila: i + 2, datos: datos[i] };
    }
  }
  return null;
}

function filaPeriodoFondoPorId(hoja, id) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const ids = hoja.getRange(2, FONDO_PER_COL.ID, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function ultimaFechaCierreFondo(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, FONDO_PER_ENCABEZADOS.length).getValues();
  let ultima = null;
  datos.forEach(function(fila) {
    const fc = fila[FONDO_PER_COL.FECHA_CIERRE - 1];
    if (fc && (!ultima || fc > ultima)) ultima = fc;
  });
  return ultima;
}

function abrirPeriodoFondo(p) {
  if (!p.fecha_inicio) throw new Error('Falta la fecha de inicio.');
  const montoCRC = Number(p.monto_inicial_crc) || 0;
  const montoUSD = Number(p.monto_inicial_usd) || 0;
  if (montoCRC <= 0 && montoUSD <= 0) throw new Error('Falta el monto inicial (en colones o dólares).');

  const hoja = getHojaFondoPeriodos();
  if (obtenerPeriodoFondoAbierto(hoja)) {
    throw new Error('Ya hay un período de fondo de caja abierto. Cerralo antes de abrir uno nuevo.');
  }

  const fechaInicio = new Date(p.fecha_inicio + 'T00:00:00');
  const ultimaCierre = ultimaFechaCierreFondo(hoja);
  if (ultimaCierre && fechaInicio <= ultimaCierre) {
    throw new Error('La fecha de inicio debe ser posterior al último cierre (' +
      Utilities.formatDate(ultimaCierre, 'America/Costa_Rica', 'dd/MM/yyyy') + ').');
  }

  const id = 'FONDO-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, FONDO_PER_COL.ID).setValue(id);
  hoja.getRange(fila, FONDO_PER_COL.FECHA_INICIO).setValue(fechaInicio);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_INICIAL_CRC).setValue(montoCRC);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_INICIAL_USD).setValue(montoUSD);
  hoja.getRange(fila, FONDO_PER_COL.ESTADO).setValue('Abierto');

  return { id: id, fila: fila };
}

function guardarArqueoFondo(p) {
  if (!p.periodo_id) throw new Error('Falta el período de fondo de caja.');
  const hojaPer = getHojaFondoPeriodos();
  if (filaPeriodoFondoPorId(hojaPer, p.periodo_id) === -1) throw new Error('No se encontró el período indicado.');

  const hoja = getHojaFondoArqueos();
  const id = 'ARQF-' + Date.now();
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, FONDO_ARQ_COL.ID).setValue(id);
  hoja.getRange(fila, FONDO_ARQ_COL.PERIODO_ID).setValue(p.periodo_id);
  hoja.getRange(fila, FONDO_ARQ_COL.FECHA).setValue(new Date());
  hoja.getRange(fila, FONDO_ARQ_COL.BALANCE_TEORICO_CRC).setValue(Number(p.balance_teorico_crc) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.MONTO_CONTADO_CRC).setValue(Number(p.monto_contado_crc) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.DIFERENCIA_CRC).setValue(Number(p.diferencia_crc) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.BALANCE_TEORICO_USD).setValue(Number(p.balance_teorico_usd) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.MONTO_CONTADO_USD).setValue(Number(p.monto_contado_usd) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.DIFERENCIA_USD).setValue(Number(p.diferencia_usd) || 0);
  hoja.getRange(fila, FONDO_ARQ_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, FONDO_ARQ_COL.NOTAS).setValue(p.notas || '');

  return { id: id, fila: fila };
}

function cerrarPeriodoFondo(p) {
  if (!p.periodo_id) throw new Error('Falta el período de fondo de caja.');
  if (!p.fecha_cierre) throw new Error('Falta la fecha de cierre.');

  const hoja = getHojaFondoPeriodos();
  const fila = filaPeriodoFondoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');

  const datosFila = hoja.getRange(fila, 1, 1, FONDO_PER_ENCABEZADOS.length).getValues()[0];
  if (datosFila[FONDO_PER_COL.ESTADO - 1] !== 'Abierto') {
    throw new Error('Este período ya está cerrado.');
  }
  const fechaInicio      = datosFila[FONDO_PER_COL.FECHA_INICIO - 1];
  const montoInicialCRC  = datosFila[FONDO_PER_COL.MONTO_INICIAL_CRC - 1];
  const montoInicialUSD  = datosFila[FONDO_PER_COL.MONTO_INICIAL_USD - 1];
  const fechaCierre      = new Date(p.fecha_cierre + 'T00:00:00');
  const montoContadoCRC  = Number(p.monto_contado_crc) || 0;
  const montoContadoUSD  = Number(p.monto_contado_usd) || 0;
  const diferenciaCRC    = Number(p.diferencia_crc) || 0;
  const diferenciaUSD    = Number(p.diferencia_usd) || 0;
  const balanceTeoricoCRC = Number(p.balance_teorico_crc) || 0;
  const balanceTeoricoUSD = Number(p.balance_teorico_usd) || 0;

  hoja.getRange(fila, FONDO_PER_COL.FECHA_CIERRE).setValue(fechaCierre);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_CONTADO_CRC).setValue(montoContadoCRC);
  hoja.getRange(fila, FONDO_PER_COL.MONTO_CONTADO_USD).setValue(montoContadoUSD);
  hoja.getRange(fila, FONDO_PER_COL.DIFERENCIA_CRC).setValue(diferenciaCRC);
  hoja.getRange(fila, FONDO_PER_COL.DIFERENCIA_USD).setValue(diferenciaUSD);
  hoja.getRange(fila, FONDO_PER_COL.ESTADO).setValue('Cerrado');
  hoja.getRange(fila, FONDO_PER_COL.DENOMINACIONES).setValue(JSON.stringify(p.denominaciones || {}));
  hoja.getRange(fila, FONDO_PER_COL.FECHA_REGISTRO_CIERRE).setValue(new Date());

  enviarCorreoCierreFondo({
    periodoId: p.periodo_id,
    fechaInicio: fechaInicio,
    fechaCierre: fechaCierre,
    montoInicialCRC: montoInicialCRC,
    montoInicialUSD: montoInicialUSD,
    balanceTeoricoCRC: balanceTeoricoCRC,
    balanceTeoricoUSD: balanceTeoricoUSD,
    montoContadoCRC: montoContadoCRC,
    montoContadoUSD: montoContadoUSD,
    diferenciaCRC: diferenciaCRC,
    diferenciaUSD: diferenciaUSD,
    denominaciones: p.denominaciones || {},
    pagos: p.pagos || []
  });

  return { id: p.periodo_id, fila: fila };
}

function eliminarPeriodoFondo(p) {
  if (!p.periodo_id) throw new Error('Falta el período a eliminar.');
  const hoja = getHojaFondoPeriodos();
  const fila = filaPeriodoFondoPorId(hoja, p.periodo_id);
  if (fila === -1) throw new Error('No se encontró el período indicado.');

  const estado = hoja.getRange(fila, FONDO_PER_COL.ESTADO).getValue();
  if (estado !== 'Abierto') throw new Error('Solo se puede eliminar un período que sigue abierto.');
  hoja.deleteRow(fila);

  const hojaArq = getHojaFondoArqueos();
  const nFilas = hojaArq.getLastRow() - 1;
  if (nFilas > 0) {
    const ids = hojaArq.getRange(2, FONDO_ARQ_COL.PERIODO_ID, nFilas, 1).getValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(p.periodo_id)) hojaArq.deleteRow(i + 2);
    }
  }

  return { eliminado: p.periodo_id };
}

function enviarCorreoCierreFondo(d) {
  const fmtFecha = function(f) { return Utilities.formatDate(f, 'America/Costa_Rica', 'dd/MM/yyyy'); };
  const fmtCRC = function(n) { return '₡' + Number(n||0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const fmtUSD = function(n) { return 'US$' + Number(n||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };

  const totalPagosCRC = d.pagos.filter(function(g){ return (g.moneda||'CRC') !== 'USD'; }).reduce(function(a, g) { return a + (Number(g.monto)||0); }, 0);
  const totalPagosUSD = d.pagos.filter(function(g){ return g.moneda === 'USD'; }).reduce(function(a, g) { return a + (Number(g.monto)||0); }, 0);

  const filasPagos = d.pagos.map(function(g) {
    const monto = g.moneda === 'USD' ? fmtUSD(g.monto) : fmtCRC(g.monto);
    return '<tr><td>' + (g.fecha||'') + '</td><td>' + (g.factura||'') + '</td><td>' + (g.proveedor||'') +
           '</td><td style="text-align:right;">' + monto + '</td></tr>';
  }).join('');

  const denomCRC = (d.denominaciones && d.denominaciones.crc) || {};
  const denomUSD = (d.denominaciones && d.denominaciones.usd) || {};
  function filasDenomHtml(denom, fmt) {
    return Object.keys(denom)
      .filter(function(k) { return Number(denom[k]) > 0; })
      .sort(function(a,b) { return Number(b) - Number(a); })
      .map(function(k) {
        const cant = Number(denom[k]);
        return '<tr><td>' + fmt(k) + '</td><td style="text-align:right;">' + cant +
               '</td><td style="text-align:right;">' + fmt(cant * Number(k)) + '</td></tr>';
      }).join('');
  }

  const colorDifCRC = Math.abs(d.diferenciaCRC) < 1 ? '#1a7a4a' : '#c84a20';
  const colorDifUSD = Math.abs(d.diferenciaUSD) < 1 ? '#1a7a4a' : '#c84a20';

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c3a28;">' +
    '<h2>Cierre de Fondo de Caja · Lorito</h2>' +
    '<p><strong>Período:</strong> ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre) + '</p>' +
    '<table cellpadding="6" style="border-collapse:collapse;margin-bottom:16px;">' +
    '<tr><td>Monto inicial</td><td style="text-align:right;">' + fmtCRC(d.montoInicialCRC) + ' + ' + fmtUSD(d.montoInicialUSD) + '</td></tr>' +
    '<tr><td>Total de pagos del período</td><td style="text-align:right;">' + fmtCRC(totalPagosCRC) + ' + ' + fmtUSD(totalPagosUSD) + '</td></tr>' +
    '<tr><td><strong>Balance teórico</strong></td><td style="text-align:right;"><strong>' + fmtCRC(d.balanceTeoricoCRC) + ' + ' + fmtUSD(d.balanceTeoricoUSD) + '</strong></td></tr>' +
    '<tr><td>Monto contado (arqueo de cierre)</td><td style="text-align:right;">' + fmtCRC(d.montoContadoCRC) + ' + ' + fmtUSD(d.montoContadoUSD) + '</td></tr>' +
    '<tr><td><strong>Diferencia</strong></td><td style="text-align:right;"><strong><span style="color:' + colorDifCRC + ';">' + fmtCRC(d.diferenciaCRC) + '</span> + <span style="color:' + colorDifUSD + ';">' + fmtUSD(d.diferenciaUSD) + '</span></strong></td></tr>' +
    '</table>' +
    '<h3>Denominaciones contadas · Colones</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;margin-bottom:16px;">' +
    '<tr style="background:#f2ede2;"><th>Denominación</th><th>Cantidad</th><th>Subtotal</th></tr>' +
    (filasDenomHtml(denomCRC, fmtCRC) || '<tr><td colspan="3">Sin denominaciones registradas.</td></tr>') +
    '</table>' +
    '<h3>Denominaciones contadas · Dólares</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;margin-bottom:16px;">' +
    '<tr style="background:#f2ede2;"><th>Denominación</th><th>Cantidad</th><th>Subtotal</th></tr>' +
    (filasDenomHtml(denomUSD, fmtUSD) || '<tr><td colspan="3">Sin denominaciones registradas.</td></tr>') +
    '</table>' +
    '<h3>Pagos del período (' + d.pagos.length + ')</h3>' +
    '<table cellpadding="5" style="border-collapse:collapse;border:1px solid #ccc;">' +
    '<tr style="background:#f2ede2;"><th>Fecha</th><th>Factura</th><th>Proveedor</th><th>Monto</th></tr>' +
    (filasPagos || '<tr><td colspan="4">Sin pagos registrados en el período.</td></tr>') +
    '</table>' +
    '</div>';

  MailApp.sendEmail({
    to: CORREO_CIERRE_FONDO,
    subject: 'Cierre de Fondo de Caja · ' + fmtFecha(d.fechaInicio) + ' – ' + fmtFecha(d.fechaCierre),
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

// Compara solo la parte de fecha (año-mes-día) de dos valores que pueden venir
// como objeto Date o como texto, ignorando hora/zona horaria.
function mismaFechaGS(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return String(a || '') === String(b || '');
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}

// Normaliza texto para comparar nombres de proveedor sin depender de
// mayúsculas, tildes o espacios extra.
function normalizarTextoGS(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function mismoMontoGS(a, b) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;
}

// Dentro de Desglose_IA, cada carga de OCR escribe de forma seguida todas las
// líneas de producto de una factura, así que las líneas de una misma copia
// forman un bloque contiguo de filas. Esta función agrupa esos bloques exigiendo
// que coincidan exactamente número de factura + fecha + proveedor + total —no
// solo el número— para no arrastrar las líneas de otra factura de otro
// proveedor que coincida en número por casualidad, y les asigna una posición
// (1ra, 2da... contada de arriba hacia abajo) para poder borrar las líneas de
// la copia correcta cuando se elimina un duplicado.
// Devuelve { filaInicio, cantidadFilas } del bloque pedido, o null si no existe
// (p.ej. una factura cargada a mano, sin líneas de OCR).
function bloqueDesglosePorFirma(hoja, firma, posicion) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return null;
  const datos = hoja.getRange(2, 1, nFilas, DESGLOSE_COL.FECHA_CARGA).getValues();

  const coincide = function(fila) {
    return String(fila[DESGLOSE_COL.NUMERO_FACTURA - 1]) === String(firma.numero) &&
      mismaFechaGS(fila[DESGLOSE_COL.FECHA_FACTURA - 1], firma.fecha) &&
      normalizarTextoGS(fila[DESGLOSE_COL.PROVEEDOR - 1]) === normalizarTextoGS(firma.proveedor) &&
      mismoMontoGS(fila[DESGLOSE_COL.TOTAL_FACTURA - 1], firma.total);
  };

  let posicionActual = 0;
  let i = 0;
  while (i < datos.length) {
    if (coincide(datos[i])) {
      const inicio = i;
      while (i < datos.length && coincide(datos[i])) i++;
      posicionActual++;
      if (posicionActual === posicion) {
        return { filaInicio: inicio + 2, cantidadFilas: i - inicio };
      }
    } else {
      i++;
    }
  }
  return null;
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

function guardarNota(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal) throw new Error('Falta indicar a cuál copia de la factura aplica.');
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  const col = columnaPorNombre(hoja, 'Notas');
  hoja.getRange(fila, col).setValue(p.nota || '');
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
  if (p.reembolso_a) {
    hoja.getRange(fila, columnaPorNombre(hoja, 'Reembolsado a')).setValue(p.reembolso_a);
  }
  if (p.nota_credito) {
    hoja.getRange(fila, columnaPorNombre(hoja, 'Nota de crédito asociada')).setValue(p.nota_credito);
  }
  // Cuando el medio de pago es "Fondo de caja", el dinero salió físicamente de la
  // caja de un día de venta puntual (no necesariamente el mismo día en que se
  // registra el pago). Esta fecha permite que cierres.html reste ese monto del
  // "Efectivo esperado" en la Revisión de Efectivo de ese día.
  if (p.fecha_venta_fondo) {
    hoja.getRange(fila, columnaPorNombre(hoja, 'Fecha venta fondo de caja')).setValue(p.fecha_venta_fondo);
  }
  return { fila: fila };
}

// Registra la fecha y referencia con la que la empresa le devolvió el
// dinero a la persona que pagó una factura de su bolsillo (Medio de pago
// = "Reembolso"). Son columnas separadas de "Fecha de pago"/"Referencia",
// que describen cuándo la persona pagó la factura, no cuándo se le reintegró.
function registrarReembolso(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!p.ordinal)        throw new Error('Falta indicar a cuál copia de la factura aplica.');
  if (!p.fecha_reembolso) throw new Error('Falta la fecha de reembolso.');
  const hoja = getHoja();
  const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa factura.');
  hoja.getRange(fila, columnaPorNombre(hoja, 'Fecha de reembolso')).setValue(p.fecha_reembolso);
  hoja.getRange(fila, columnaPorNombre(hoja, 'Referencia reembolso')).setValue(p.referencia_reembolso || '');
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

  const hojaAbonos = getHojaAbonos();
  hojaAbonos.appendRow([
    p.numero_factura, p.fecha_abono, Number(p.monto_abono), p.medio_pago || '', p.referencia || '',
    p.reembolso_a || '', p.nota_credito || '', new Date()
  ]);
  // Igual que en registrarPago(): si el abono se pagó con "Fondo de caja", se guarda
  // la fecha de la venta de la que se tomó el dinero (columna dinámica, mismo patrón
  // que columnaPorNombre en Registro Facturas) para reflejarlo en cierres.html.
  if (p.fecha_venta_fondo) {
    const filaAbono = hojaAbonos.getLastRow();
    hojaAbonos.getRange(filaAbono, columnaPorNombre(hojaAbonos, 'Fecha venta fondo de caja')).setValue(p.fecha_venta_fondo);
  }

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

  // Antes de borrar, tomamos la "firma" completa de esta copia (número + fecha +
  // proveedor + total) y calculamos su posición entre las filas de Registro
  // Facturas que comparten exactamente esa misma firma —no solo el número—.
  // Así, al buscar sus líneas en Desglose_IA, no nos desalineamos si hay una
  // factura manual sin líneas de OCR mezclada en el medio, ni arrastramos las
  // líneas de otra factura de otro proveedor que por casualidad tenga el mismo
  // número.
  const nFilasFacturas = hoja.getLastRow() - 1;
  const datosFacturas = hoja.getRange(2, 1, nFilasFacturas, COL.TOTAL).getValues();
  const filaObjetivo = datosFacturas[fila - 2];
  const firma = {
    numero: filaObjetivo[COL.FACTURA - 1],
    fecha: filaObjetivo[COL.FECHA - 1],
    proveedor: filaObjetivo[COL.PROVEEDOR - 1],
    total: filaObjetivo[COL.TOTAL - 1]
  };
  let posicion = 0;
  for (let i = 0; i <= fila - 2; i++) {
    const f = datosFacturas[i];
    if (String(f[COL.FACTURA - 1]) === String(firma.numero) &&
        mismaFechaGS(f[COL.FECHA - 1], firma.fecha) &&
        normalizarTextoGS(f[COL.PROVEEDOR - 1]) === normalizarTextoGS(firma.proveedor) &&
        mismoMontoGS(f[COL.TOTAL - 1], firma.total)) {
      posicion++;
    }
  }

  hoja.deleteRow(fila);

  // Borra también, si existen, las líneas de producto de Desglose_IA que
  // corresponden a esta misma copia (mismo bloque por firma, ver
  // bloqueDesglosePorFirma). No bloquea el borrado de la factura si Desglose_IA
  // no tiene un bloque en esa posición o algo falla acá.
  let lineasDesgloseEliminadas = 0;
  try {
    const hojaDesglose = getHojaDesglose();
    const bloque = bloqueDesglosePorFirma(hojaDesglose, firma, posicion);
    if (bloque) {
      hojaDesglose.deleteRows(bloque.filaInicio, bloque.cantidadFilas);
      lineasDesgloseEliminadas = bloque.cantidadFilas;
    }
  } catch (e) {
    // Sin Desglose_IA o con otro error acá, la factura ya se borró igual.
  }

  return { eliminado: true, fila: fila, lineas_desglose_eliminadas: lineasDesgloseEliminadas };
}

// Marca una o varias copias de una factura como "duplicado aceptado": queda
// registrado en la hoja para que el control de duplicados deje de marcarlas.
function aceptarDuplicado(p) {
  if (!p.numero_factura) throw new Error('Falta número de factura.');
  if (!Array.isArray(p.ordinales) || !p.ordinales.length) throw new Error('Falta indicar cuáles copias aceptar.');
  const hoja = getHoja();
  const col = columnaPorNombre(hoja, 'Duplicado aceptado');
  var marcadas = 0;
  p.ordinales.forEach(function(ordinal) {
    const fila = filaFacturaPorOrdinal(hoja, p.numero_factura, ordinal);
    if (fila !== -1) {
      hoja.getRange(fila, col).setValue('Sí');
      marcadas++;
    }
  });
  if (!marcadas) throw new Error('No se encontraron copias para marcar.');
  return { marcadas: marcadas };
}

// ── DUPLICADOS DE LÍNEAS DE COMPRA (Desglose_IA) ──────────────────
// Detecta líneas de producto repetidas por producto + fecha + proveedor +
// monto (p.ej. una factura escaneada dos veces por error). Cada línea se
// identifica por su "ordinal": la posición (1ra, 2da...) en que esa firma
// aparece recorriendo Desglose_IA de arriba hacia abajo —el mismo orden en
// que compras.html las lee por gviz— para poder borrar o marcar la copia
// correcta sin depender de un ID de fila.
function coincideLineaDesglose(fila, firma) {
  const nombre = fila[DESGLOSE_COL.NOMBRE_NORMALIZADO - 1] || fila[DESGLOSE_COL.PRODUCTO - 1];
  return normalizarTextoGS(nombre) === normalizarTextoGS(firma.producto) &&
    mismaFechaGS(fila[DESGLOSE_COL.FECHA_FACTURA - 1], firma.fecha) &&
    normalizarTextoGS(fila[DESGLOSE_COL.PROVEEDOR - 1]) === normalizarTextoGS(firma.proveedor) &&
    mismoMontoGS(fila[DESGLOSE_COL.TOTAL_LINEA - 1], firma.monto);
}

function filaLineaDesglosePorFirma(hoja, firma, ordinal) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, DESGLOSE_COL.FECHA_CARGA).getValues();
  let contador = 0;
  for (let i = 0; i < datos.length; i++) {
    if (coincideLineaDesglose(datos[i], firma)) {
      contador++;
      if (contador === Number(ordinal)) return i + 2;
    }
  }
  return -1;
}

function eliminarLineaDuplicada(p) {
  if (!p.producto)     throw new Error('Falta el producto.');
  if (!p.fecha)        throw new Error('Falta la fecha.');
  if (!p.proveedor)    throw new Error('Falta el proveedor.');
  if (p.monto == null) throw new Error('Falta el monto.');
  if (!p.ordinal)      throw new Error('Falta indicar cuál copia eliminar.');

  const hoja  = getHojaDesglose();
  const firma = { producto: p.producto, fecha: p.fecha, proveedor: p.proveedor, monto: p.monto };
  const fila  = filaLineaDesglosePorFirma(hoja, firma, p.ordinal);
  if (fila === -1) throw new Error('No se encontró esa línea (puede que ya se haya eliminado).');
  hoja.deleteRow(fila);
  return { eliminado: true, fila: fila };
}

// Marca una o varias copias de una línea repetida como "duplicado aceptado":
// quedan registradas como compras legítimas y dejan de aparecer en el control
// de duplicados de compras.html.
function aceptarDuplicadoLinea(p) {
  if (!p.producto)     throw new Error('Falta el producto.');
  if (!p.fecha)        throw new Error('Falta la fecha.');
  if (!p.proveedor)    throw new Error('Falta el proveedor.');
  if (p.monto == null) throw new Error('Falta el monto.');
  if (!Array.isArray(p.ordinales) || !p.ordinales.length) throw new Error('Falta indicar cuáles copias aceptar.');

  const hoja  = getHojaDesglose();
  const col   = columnaPorNombre(hoja, 'Duplicado aceptado');
  const firma = { producto: p.producto, fecha: p.fecha, proveedor: p.proveedor, monto: p.monto };
  let marcadas = 0;
  p.ordinales.forEach(function(ordinal) {
    const fila = filaLineaDesglosePorFirma(hoja, firma, ordinal);
    if (fila !== -1) {
      hoja.getRange(fila, col).setValue('Sí');
      marcadas++;
    }
  });
  if (!marcadas) throw new Error('No se encontraron líneas para marcar.');
  return { marcadas: marcadas };
}

// ── MAESTRO DE PRODUCTOS · ALIAS · PENDIENTES · COSTO PROMEDIO ───────
function getHojaDesglose() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_DESGLOSE);
  if (!hoja) throw new Error('No se encontró la hoja "' + HOJA_DESGLOSE + '"');
  return hoja;
}

function getHojaMaestro() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_MAESTRO);
  if (!hoja) hoja = ss.insertSheet(HOJA_MAESTRO);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, MAESTRO_ENCABEZADOS.length).setValues([MAESTRO_ENCABEZADOS]);
  }
  return hoja;
}

function getHojaAlias() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_ALIAS);
  if (!hoja) hoja = ss.insertSheet(HOJA_ALIAS);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, ALIAS_ENCABEZADOS.length).setValues([ALIAS_ENCABEZADOS]);
  }
  return hoja;
}

function getHojaPendientes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_PENDIENTES);
  if (!hoja) hoja = ss.insertSheet(HOJA_PENDIENTES);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, PEND_ENCABEZADOS.length).setValues([PEND_ENCABEZADOS]);
  }
  return hoja;
}

function getHojaCostoPromedio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_COSTO_PROMEDIO);
  if (!hoja) hoja = ss.insertSheet(HOJA_COSTO_PROMEDIO);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, COSTO_ENCABEZADOS.length).setValues([COSTO_ENCABEZADOS]);
  }
  return hoja;
}

function filaMaestroPorId(hoja, idProducto) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const ids = hoja.getRange(2, MAESTRO_COL.ID_PRODUCTO, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(idProducto)) return i + 2;
  }
  return -1;
}

function filaCostoPorId(hoja, idProducto) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const ids = hoja.getRange(2, COSTO_COL.ID_PRODUCTO, nFilas, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(idProducto)) return i + 2;
  }
  return -1;
}

// Match exacto (nombre en factura, proveedor) — para saber si ya existe la FILA de alias
// (se usa al crear/actualizar el alias, no al resolverlo con fallback a comodín).
function filaAliasPorClave(hoja, nombreFactura, proveedor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === nombreFactura && String(datos[i][1]).trim() === proveedor) return i + 2;
  }
  return -1;
}

// Resuelve id_producto a partir de (nombre en factura, proveedor). Si no hay alias
// específico de ese proveedor, cae de vuelta al alias comodín ('*') si existe
// (así no se pierden las 152 asociaciones migradas de Normalizacion_Productos,
// que nunca distinguieron proveedor). Devuelve '' si no hay ningún match.
function idProductoPorAlias(hoja, nombreFactura, proveedor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return '';
  const datos = hoja.getRange(2, 1, nFilas, ALIAS_ENCABEZADOS.length).getValues();
  let comodin = '';
  for (let i = 0; i < datos.length; i++) {
    const fNombre = String(datos[i][ALIAS_COL.NOMBRE_FACTURA - 1]).trim();
    const fProveedor = String(datos[i][ALIAS_COL.PROVEEDOR - 1]).trim();
    if (fNombre !== nombreFactura) continue;
    if (fProveedor === proveedor) return String(datos[i][ALIAS_COL.ID_PRODUCTO - 1]);
    if (fProveedor === PROVEEDOR_COMODIN && !comodin) comodin = String(datos[i][ALIAS_COL.ID_PRODUCTO - 1]);
  }
  return comodin;
}

function obtenerAliasesDeProducto(hoja, idProducto) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return [];
  const datos = hoja.getRange(2, 1, nFilas, ALIAS_ENCABEZADOS.length).getValues();
  const resultado = [];
  datos.forEach(function(fila) {
    if (String(fila[ALIAS_COL.ID_PRODUCTO - 1]) === String(idProducto)) {
      resultado.push({
        nombreFactura: String(fila[ALIAS_COL.NOMBRE_FACTURA - 1]).trim(),
        proveedor: String(fila[ALIAS_COL.PROVEEDOR - 1]).trim()
      });
    }
  });
  return resultado;
}

function filaPendientePorClave(hoja, nombreFactura, proveedor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, 2).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === nombreFactura && String(datos[i][1]).trim() === proveedor) return i + 2;
  }
  return -1;
}

// Crea la fila de pendiente si es la primera vez que aparece ese (nombre, proveedor);
// si ya existía, solo actualiza "última vez visto" y el contador — no duplica filas.
function upsertPendiente(nombreFactura, proveedor, categoriaSugerida, nombreNormalizadoSugerido) {
  const hoja = getHojaPendientes();
  const fila = filaPendientePorClave(hoja, nombreFactura, proveedor);
  const ahora = new Date();
  if (fila === -1) {
    hoja.appendRow([nombreFactura, proveedor, categoriaSugerida || '', nombreNormalizadoSugerido || '', ahora, ahora, 1]);
  } else {
    const veces = Number(hoja.getRange(fila, PEND_COL.VECES_VISTO).getValue()) || 0;
    hoja.getRange(fila, PEND_COL.ULTIMA_FECHA).setValue(ahora);
    hoja.getRange(fila, PEND_COL.VECES_VISTO).setValue(veces + 1);
  }
}

// PROD-0001, PROD-0002... el siguiente número es el máximo existente + 1.
function siguienteIdProducto(hoja) {
  const nFilas = hoja.getLastRow() - 1;
  let max = 0;
  if (nFilas > 0) {
    const ids = hoja.getRange(2, MAESTRO_COL.ID_PRODUCTO, nFilas, 1).getValues();
    ids.forEach(function(r) {
      const m = String(r[0]).match(/PROD-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return 'PROD-' + String(max + 1).padStart(4, '0');
}

function crearProductoMaestro(datos) {
  if (!datos.nombre_normalizado) throw new Error('Falta el nombre normalizado del producto.');
  const hoja = getHojaMaestro();
  const id = siguienteIdProducto(hoja);
  const fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, MAESTRO_COL.ID_PRODUCTO).setValue(id);
  hoja.getRange(fila, MAESTRO_COL.NOMBRE_NORMALIZADO).setValue(datos.nombre_normalizado);
  hoja.getRange(fila, MAESTRO_COL.CATEGORIA).setValue(datos.categoria || '');
  hoja.getRange(fila, MAESTRO_COL.AREA_NEGOCIO).setValue(datos.area_negocio || '');
  hoja.getRange(fila, MAESTRO_COL.FECHA_CREACION).setValue(new Date());
  return id;
}

// Resuelve (nombre en factura, proveedor) a un id_producto. Si no hay alias
// registrado, lo deja en Pendientes_Mapeo y devuelve null (la línea de compra
// queda "sin costo promedio" hasta que alguien lo resuelva una vez desde
// config-productos.html — después queda automático para siempre).
function resolverAlias(nombreFactura, proveedor, categoriaSugerida, nombreNormalizadoSugerido) {
  const hojaAlias = getHojaAlias();
  const idProducto = idProductoPorAlias(hojaAlias, nombreFactura, proveedor);
  if (idProducto) return idProducto;

  upsertPendiente(nombreFactura, proveedor, categoriaSugerida, nombreNormalizadoSugerido);
  return null;
}

// Recorre Desglose_IA y recalcula el costo promedio ponderado
// (Σ cantidad×precio / Σ cantidad) a 30 y 90 días para un id_producto,
// juntando todas las líneas de todos sus alias. Excluye precio ≤ 0
// (notas de crédito/devoluciones) para no distorsionar el promedio.
//
// `lineaActual` (opcional) son los datos de la línea que se acaba de procesar
// desde el script de OCR: { numeroFactura, producto, cantidad, precio, fecha }.
// Desglose_IA vive en otro Sheet y se sincroniza hacia acá por fuera de este
// script (fórmula / proceso aparte), así que puede no estar actualizado en
// el instante en que llega el aviso — por eso esa línea se suma "a mano" acá,
// y se excluye la copia que pueda aparecer en el escaneo de Desglose_IA para
// no contarla dos veces una vez que sí se sincronice.
function recalcularCostoPromedio(idProducto, lineaActual) {
  const aliases = obtenerAliasesDeProducto(getHojaAlias(), idProducto);
  if (!aliases.length) return null;

  const hojaDesglose = getHojaDesglose();
  const nFilas = hojaDesglose.getLastRow() - 1;
  const datos = nFilas > 0 ? hojaDesglose.getRange(2, 1, nFilas, DESGLOSE_COL.FECHA_CARGA).getValues() : [];

  const ahora = new Date();
  const MS_DIA = 24 * 60 * 60 * 1000;

  let sum30 = 0, cant30 = 0, sum90 = 0, cant90 = 0;
  let ultimoPrecio = 0, ultimaFecha = null;
  let nombreNorm = '', categoria = '';

  function acumular(precio, cantidad, fecha) {
    if (!precio || precio <= 0 || !cantidad) return; // excluye notas de crédito / líneas sin cantidad
    if (!(fecha instanceof Date) || isNaN(fecha.getTime())) return;
    const antiguedadDias = (ahora - fecha) / MS_DIA;
    if (antiguedadDias <= 30) { sum30 += cantidad * precio; cant30 += cantidad; }
    if (antiguedadDias <= 90) { sum90 += cantidad * precio; cant90 += cantidad; }
    if (!ultimaFecha || fecha > ultimaFecha) { ultimaFecha = fecha; ultimoPrecio = precio; }
  }

  datos.forEach(function(fila) {
    const producto = String(fila[DESGLOSE_COL.PRODUCTO - 1] || '').trim();
    const proveedor = String(fila[DESGLOSE_COL.PROVEEDOR - 1] || '').trim();
    const coincide = aliases.some(function(a) {
      return a.nombreFactura === producto && (a.proveedor === proveedor || a.proveedor === PROVEEDOR_COMODIN);
    });
    if (!coincide) return;

    // Ya la contamos explícitamente más abajo vía lineaActual — no duplicar
    // si esta misma factura+producto ya alcanzó a sincronizarse acá.
    if (lineaActual && lineaActual.numeroFactura &&
        String(fila[DESGLOSE_COL.NUMERO_FACTURA - 1]) === lineaActual.numeroFactura &&
        producto === lineaActual.producto) {
      return;
    }

    const precio = parseFloat(fila[DESGLOSE_COL.PRECIO_UNITARIO - 1]) || 0;
    const cantidad = parseFloat(fila[DESGLOSE_COL.CANTIDAD - 1]) || 0;
    const fechaRaw = fila[DESGLOSE_COL.FECHA_FACTURA - 1];
    const fecha = fechaRaw instanceof Date ? fechaRaw : new Date(fechaRaw);
    acumular(precio, cantidad, fecha);
    if (fila[DESGLOSE_COL.NOMBRE_NORMALIZADO - 1]) nombreNorm = fila[DESGLOSE_COL.NOMBRE_NORMALIZADO - 1];
    if (fila[DESGLOSE_COL.CATEGORIA - 1]) categoria = fila[DESGLOSE_COL.CATEGORIA - 1];
  });

  if (lineaActual) {
    acumular(lineaActual.precio, lineaActual.cantidad, lineaActual.fecha);
  }

  const hojaMaestro = getHojaMaestro();
  const filaMaestroIdx = filaMaestroPorId(hojaMaestro, idProducto);
  const datosMaestro = filaMaestroIdx !== -1
    ? hojaMaestro.getRange(filaMaestroIdx, 1, 1, MAESTRO_ENCABEZADOS.length).getValues()[0]
    : null;

  const hojaCosto = getHojaCostoPromedio();
  let filaCosto = filaCostoPorId(hojaCosto, idProducto);
  if (filaCosto === -1) filaCosto = hojaCosto.getLastRow() + 1;

  hojaCosto.getRange(filaCosto, COSTO_COL.ID_PRODUCTO).setValue(idProducto);
  hojaCosto.getRange(filaCosto, COSTO_COL.NOMBRE_NORMALIZADO).setValue(datosMaestro ? datosMaestro[MAESTRO_COL.NOMBRE_NORMALIZADO - 1] : nombreNorm);
  hojaCosto.getRange(filaCosto, COSTO_COL.CATEGORIA).setValue(datosMaestro ? datosMaestro[MAESTRO_COL.CATEGORIA - 1] : categoria);
  hojaCosto.getRange(filaCosto, COSTO_COL.COSTO_ULTIMO).setValue(ultimoPrecio);
  hojaCosto.getRange(filaCosto, COSTO_COL.FECHA_ULTIMA_COMPRA).setValue(ultimaFecha || '');
  hojaCosto.getRange(filaCosto, COSTO_COL.COSTO_PROM_30D).setValue(cant30 > 0 ? sum30 / cant30 : ultimoPrecio);
  hojaCosto.getRange(filaCosto, COSTO_COL.COSTO_PROM_90D).setValue(cant90 > 0 ? sum90 / cant90 : ultimoPrecio);
  hojaCosto.getRange(filaCosto, COSTO_COL.FECHA_ACTUALIZACION).setValue(new Date());

  return { fila: filaCosto };
}

// Llamar por cada línea de producto que se escriba en Desglose_IA (desde el
// script de OCR de facturas): { producto, proveedor, categoria,
// nombre_normalizado, cantidad, precio_unitario, fecha_factura, numero_factura }.
// Si el producto ya está mapeado, actualiza el costo promedio al toque —
// incluyendo esta misma línea aunque Desglose_IA (que vive en otro Sheet)
// todavía no la tenga sincronizada. Si no está mapeado, la línea queda
// "pendiente" — no hace falta reintentar, quien la resuelva una vez desde
// config-productos.html dispara el recálculo.
function procesarLineaCompra(p) {
  if (!p.producto) throw new Error('Falta el nombre del producto.');
  const nombreFactura = String(p.producto).trim();
  const proveedor = String(p.proveedor || '').trim();

  const idProducto = resolverAlias(nombreFactura, proveedor, p.categoria, p.nombre_normalizado);
  if (!idProducto) return { resultado: 'pendiente' };

  const fecha = p.fecha_factura ? new Date(p.fecha_factura + 'T00:00:00') : null;
  recalcularCostoPromedio(idProducto, {
    numeroFactura: String(p.numero_factura || ''),
    producto: nombreFactura,
    cantidad: parseFloat(p.cantidad) || 0,
    precio: parseFloat(p.precio_unitario) || 0,
    fecha: fecha
  });
  return { resultado: 'actualizado', id_producto: idProducto };
}

// Usada desde config-productos.html para resolver una fila de Pendientes_Mapeo:
// o se asigna a un id_producto ya existente en el Maestro, o se crea uno nuevo
// con solo el nombre normalizado (la pantalla ya no pide categoría/unidad acá
// — la categoría sugerida por la IA se usa como valor inicial en silencio, y
// la categoría/área de negocio definitivas se terminan de ajustar después
// desde la pestaña "Catálogo" del mismo config-productos.html).
function resolverPendiente(p) {
  if (!p.nombre_factura) throw new Error('Falta el nombre en factura.');
  const proveedor = String(p.proveedor || '').trim();

  let idProducto = p.id_producto;
  if (!idProducto) {
    if (!p.nombre_normalizado) throw new Error('Falta el nombre normalizado para crear el producto.');
    const hojaPend = getHojaPendientes();
    const filaPend = filaPendientePorClave(hojaPend, p.nombre_factura, proveedor);
    const categoriaSugerida = filaPend !== -1
      ? hojaPend.getRange(filaPend, PEND_COL.CATEGORIA_SUGERIDA).getValue()
      : '';
    idProducto = crearProductoMaestro({
      nombre_normalizado: p.nombre_normalizado,
      categoria: categoriaSugerida
    });
  } else if (filaMaestroPorId(getHojaMaestro(), idProducto) === -1) {
    throw new Error('No existe ese producto en el Maestro: ' + idProducto);
  }

  const hojaAlias = getHojaAlias();
  const filaExistente = filaAliasPorClave(hojaAlias, p.nombre_factura, proveedor);
  const fila = filaExistente === -1 ? hojaAlias.getLastRow() + 1 : filaExistente;
  hojaAlias.getRange(fila, ALIAS_COL.NOMBRE_FACTURA).setValue(p.nombre_factura);
  hojaAlias.getRange(fila, ALIAS_COL.PROVEEDOR).setValue(proveedor);
  hojaAlias.getRange(fila, ALIAS_COL.ID_PRODUCTO).setValue(idProducto);
  hojaAlias.getRange(fila, ALIAS_COL.FECHA_REGISTRO).setValue(new Date());

  const hojaPend = getHojaPendientes();
  const filaPend = filaPendientePorClave(hojaPend, p.nombre_factura, proveedor);
  if (filaPend !== -1) hojaPend.deleteRow(filaPend);

  recalcularCostoPromedio(idProducto);

  return { id_producto: idProducto, fila_alias: fila };
}

// Función de UN SOLO USO: correr manualmente desde este editor (seleccionar
// la función en el desplegable de arriba > Ejecutar) para migrar el catálogo
// viejo Normalizacion_Productos hacia Maestro_Productos + Alias_Productos.
// Agrupa por nombre_normalizado (dedup — así "Filete de Res" y "Lomo Res
// Premium" pueden terminar compartiendo un solo id_producto si ya tenían el
// mismo nombre normalizado asignado) y crea un alias con proveedor='*' por
// cada Producto crudo original, porque la hoja vieja nunca distinguió
// proveedor. Es seguro volver a correrla — no duplica filas ya migradas.
function migrarNormalizacionAMaestro() {
  const hojaNorm = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_NORMALIZACION);
  if (!hojaNorm || hojaNorm.getLastRow() <= 1) {
    Logger.log('No hay datos en "' + HOJA_NORMALIZACION + '" para migrar.');
    return;
  }
  const nFilas = hojaNorm.getLastRow() - 1;
  const datos = hojaNorm.getRange(2, 1, nFilas, NORM_ENCABEZADOS.length).getValues();
  const hojaAlias = getHojaAlias();

  const idPorNombreNormalizado = {};
  let productosCreados = 0, aliasCreados = 0, saltados = 0;

  datos.forEach(function(fila) {
    const producto = String(fila[NORM_COL.PRODUCTO - 1] || '').trim();
    const nombreNorm = String(fila[NORM_COL.NOMBRE_NORMALIZADO - 1] || '').trim() || producto;
    const categoria = String(fila[NORM_COL.CATEGORIA - 1] || '').trim();
    if (!producto) { saltados++; return; }

    let idProducto = idPorNombreNormalizado[nombreNorm];
    if (!idProducto) {
      idProducto = crearProductoMaestro({ nombre_normalizado: nombreNorm, categoria: categoria });
      idPorNombreNormalizado[nombreNorm] = idProducto;
      productosCreados++;
    }

    if (filaAliasPorClave(hojaAlias, producto, PROVEEDOR_COMODIN) === -1) {
      hojaAlias.appendRow([producto, PROVEEDOR_COMODIN, idProducto, new Date()]);
      aliasCreados++;
    }
  });

  Logger.log('Migración completa: ' + productosCreados + ' productos en Maestro_Productos, ' +
    aliasCreados + ' alias en Alias_Productos, ' + saltados + ' filas sin producto saltadas.');
}

// Función de UN SOLO USO: correr manualmente desde este editor para cargar a
// Pendientes_Mapeo el backlog de compras que ya existían en Desglose_IA antes
// de conectar el aviso automático desde el OCR (procesar_linea_compra). Sin
// esto, esas líneas viejas nunca aparecen en config-productos.html porque esa
// pantalla solo lee Pendientes_Mapeo, no Desglose_IA directamente. Correrla
// después de migrarNormalizacionAMaestro(). Es seguro volver a correrla — usa
// el mismo upsert que procesar_linea_compra, no duplica filas.
function poblarPendientesDesdeDesglose() {
  const hojaDesglose = getHojaDesglose();
  const nFilas = hojaDesglose.getLastRow() - 1;
  if (nFilas <= 0) { Logger.log('Desglose_IA está vacía.'); return; }
  const datos = hojaDesglose.getRange(2, 1, nFilas, DESGLOSE_COL.FECHA_CARGA).getValues();

  const hojaAlias = getHojaAlias();
  const pendientesDistintos = new Set();
  let lineasSinMapear = 0;

  datos.forEach(function(fila) {
    const producto = String(fila[DESGLOSE_COL.PRODUCTO - 1] || '').trim();
    const proveedor = String(fila[DESGLOSE_COL.PROVEEDOR - 1] || '').trim();
    if (!producto) return;
    if (idProductoPorAlias(hojaAlias, producto, proveedor)) return; // ya mapeado, no es pendiente

    upsertPendiente(
      producto, proveedor,
      fila[DESGLOSE_COL.CATEGORIA - 1] || '',
      fila[DESGLOSE_COL.NOMBRE_NORMALIZADO - 1] || ''
    );
    pendientesDistintos.add(producto + '||' + proveedor);
    lineasSinMapear++;
  });

  Logger.log('Backfill completo: ' + pendientesDistintos.size + ' productos distintos pendientes de mapear (' +
    lineasSinMapear + ' líneas de compra en total).');
}

// ── ADMINISTRACIÓN DEL MAESTRO DE PRODUCTOS (pestaña "Catálogo" de config-productos.html) ──
// Crea o edita un producto. Si viene p.id_producto, edita esa fila; si no,
// crea uno nuevo (mismo esquema de ID que resolverPendiente / migración).
function guardarProductoMaestro(p) {
  if (!p.nombre_normalizado) throw new Error('Falta el nombre normalizado.');

  if (p.id_producto) {
    const hoja = getHojaMaestro();
    const fila = filaMaestroPorId(hoja, p.id_producto);
    if (fila === -1) throw new Error('No existe ese producto en el Maestro: ' + p.id_producto);

    hoja.getRange(fila, MAESTRO_COL.NOMBRE_NORMALIZADO).setValue(p.nombre_normalizado);
    hoja.getRange(fila, MAESTRO_COL.CATEGORIA).setValue(p.categoria || '');
    hoja.getRange(fila, MAESTRO_COL.AREA_NEGOCIO).setValue(p.area_negocio || '');

    // Refresca Costo_Promedio por si cambió la categoría que se muestra ahí
    // (el costo en sí no cambia con esta edición).
    recalcularCostoPromedio(p.id_producto);

    return { id_producto: p.id_producto, nuevo: false };
  }

  const idProducto = crearProductoMaestro({
    nombre_normalizado: p.nombre_normalizado,
    categoria: p.categoria,
    area_negocio: p.area_negocio
  });
  return { id_producto: idProducto, nuevo: true };
}

// Bloquea el borrado si el producto tiene alias asociados — borrarlo dejaría
// esos alias apuntando a un id_producto inexistente y rompería el historial
// de precios. Si hay que deshacerse de él, primero fusionarlo con otro
// (fusionarProductosMaestro) o reasignar sus alias a mano.
function eliminarProductoMaestro(p) {
  if (!p.id_producto) throw new Error('Falta el id_producto a eliminar.');
  const hojaMaestro = getHojaMaestro();
  const fila = filaMaestroPorId(hojaMaestro, p.id_producto);
  if (fila === -1) throw new Error('No existe ese producto en el Maestro: ' + p.id_producto);

  const aliases = obtenerAliasesDeProducto(getHojaAlias(), p.id_producto);
  if (aliases.length) {
    throw new Error('No se puede eliminar: tiene ' + aliases.length +
      ' alias asociado(s). Fusionalo con otro producto primero.');
  }

  hojaMaestro.deleteRow(fila);

  const hojaCosto = getHojaCostoPromedio();
  const filaCosto = filaCostoPorId(hojaCosto, p.id_producto);
  if (filaCosto !== -1) hojaCosto.deleteRow(filaCosto);

  return { eliminado: p.id_producto };
}

// Fusiona dos productos duplicados del Maestro: mueve todos los alias de
// id_descartar hacia id_conservar, borra id_descartar de Maestro_Productos y
// de Costo_Promedio, y recalcula el costo promedio de id_conservar con el
// historial combinado de ambos.
function fusionarProductosMaestro(p) {
  if (!p.id_conservar || !p.id_descartar) throw new Error('Faltan los dos productos a fusionar.');
  if (p.id_conservar === p.id_descartar) throw new Error('Elegí dos productos distintos.');

  const hojaMaestro = getHojaMaestro();
  if (filaMaestroPorId(hojaMaestro, p.id_conservar) === -1) throw new Error('No existe ' + p.id_conservar);
  const filaDescartar = filaMaestroPorId(hojaMaestro, p.id_descartar);
  if (filaDescartar === -1) throw new Error('No existe ' + p.id_descartar);

  const hojaAlias = getHojaAlias();
  const nFilas = hojaAlias.getLastRow() - 1;
  let aliasMovidos = 0;
  if (nFilas > 0) {
    const ids = hojaAlias.getRange(2, ALIAS_COL.ID_PRODUCTO, nFilas, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(p.id_descartar)) {
        hojaAlias.getRange(i + 2, ALIAS_COL.ID_PRODUCTO).setValue(p.id_conservar);
        aliasMovidos++;
      }
    }
  }

  hojaMaestro.deleteRow(filaDescartar);

  const hojaCosto = getHojaCostoPromedio();
  const filaCostoDescartar = filaCostoPorId(hojaCosto, p.id_descartar);
  if (filaCostoDescartar !== -1) hojaCosto.deleteRow(filaCostoDescartar);

  recalcularCostoPromedio(p.id_conservar);

  return { id_conservar: p.id_conservar, alias_movidos: aliasMovidos };
}

// ── LISTAS COMPARTIDAS: CATEGORÍAS Y ÁREA DE NEGOCIO ─────────────────
// Ambas hojas son una sola columna de texto. Se administran desde la
// pestaña "Categorías y áreas" de config-productos.html y las lee también
// costos-productos.html (antes las tenía hardcodeadas / en localStorage).
function getHojaCategorias() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_CATEGORIAS);
  if (!hoja) {
    hoja = ss.insertSheet(HOJA_CATEGORIAS);
    hoja.appendRow(['Categoría']);
    CATEGORIAS_DEFAULT.forEach(c => hoja.appendRow([c]));
  }
  return hoja;
}

function getHojaAreas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_AREAS);
  if (!hoja) {
    hoja = ss.insertSheet(HOJA_AREAS);
    hoja.appendRow(['Área de negocio']);
    AREAS_DEFAULT.forEach(a => hoja.appendRow([a]));
  }
  return hoja;
}

// Busca la fila (1-indexada) de un valor exacto en una hoja de una sola
// columna (Categorias_Productos / Areas_Negocio). Devuelve -1 si no existe.
function filaValorEnLista(hoja, valor) {
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return -1;
  const datos = hoja.getRange(2, 1, nFilas, 1).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === String(valor).trim()) return i + 2;
  }
  return -1;
}

// Cuenta cuántas filas de Maestro_Productos usan un valor dado en una
// columna (CATEGORIA o AREA_NEGOCIO) — para bloquear el borrado si está en uso.
function contarUsosEnMaestro(colIndice, valor) {
  const hoja = getHojaMaestro();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return 0;
  const datos = hoja.getRange(2, colIndice, nFilas, 1).getValues();
  return datos.filter(r => String(r[0]).trim() === String(valor).trim()).length;
}

function guardarCategoria(p) {
  if (!p.valor) throw new Error('Falta el nombre de la categoría.');
  const hoja = getHojaCategorias();

  if (p.valor_anterior) {
    const fila = filaValorEnLista(hoja, p.valor_anterior);
    if (fila === -1) throw new Error('No existe la categoría: ' + p.valor_anterior);
    if (filaValorEnLista(hoja, p.valor) !== -1 && p.valor !== p.valor_anterior) {
      throw new Error('Ya existe una categoría con ese nombre.');
    }
    hoja.getRange(fila, 1).setValue(p.valor);
    return { renombrada: true };
  }

  if (filaValorEnLista(hoja, p.valor) !== -1) throw new Error('Ya existe esa categoría.');
  hoja.appendRow([p.valor]);
  return { creada: true };
}

function eliminarCategoria(p) {
  if (!p.valor) throw new Error('Falta el nombre de la categoría.');
  const usos = contarUsosEnMaestro(MAESTRO_COL.CATEGORIA, p.valor);
  if (usos > 0) throw new Error('No se puede eliminar: ' + usos + ' producto(s) del Maestro usan esta categoría.');

  const hoja = getHojaCategorias();
  const fila = filaValorEnLista(hoja, p.valor);
  if (fila === -1) throw new Error('No existe esa categoría.');
  hoja.deleteRow(fila);
  return { eliminada: p.valor };
}

function guardarAreaNegocio(p) {
  if (!p.valor) throw new Error('Falta el nombre del área de negocio.');
  const hoja = getHojaAreas();

  if (p.valor_anterior) {
    const fila = filaValorEnLista(hoja, p.valor_anterior);
    if (fila === -1) throw new Error('No existe el área: ' + p.valor_anterior);
    if (filaValorEnLista(hoja, p.valor) !== -1 && p.valor !== p.valor_anterior) {
      throw new Error('Ya existe un área con ese nombre.');
    }
    hoja.getRange(fila, 1).setValue(p.valor);
    return { renombrada: true };
  }

  if (filaValorEnLista(hoja, p.valor) !== -1) throw new Error('Ya existe esa área.');
  hoja.appendRow([p.valor]);
  return { creada: true };
}

function eliminarAreaNegocio(p) {
  if (!p.valor) throw new Error('Falta el nombre del área de negocio.');
  const usos = contarUsosEnMaestro(MAESTRO_COL.AREA_NEGOCIO, p.valor);
  if (usos > 0) throw new Error('No se puede eliminar: ' + usos + ' producto(s) del Maestro usan esta área.');

  const hoja = getHojaAreas();
  const fila = filaValorEnLista(hoja, p.valor);
  if (fila === -1) throw new Error('No existe esa área.');
  hoja.deleteRow(fila);
  return { eliminada: p.valor };
}

// Función de UN SOLO USO: correr manualmente desde este editor después de
// pegar esta versión del código. Ajusta Maestro_Productos y Costo_Promedio
// al esquema nuevo (sin "Unidad base"/"Unidad de compra default", con "Área
// de negocio" en Maestro_Productos).
//
// OJO: mientras esta migración no se corría, el código ya escribía por
// POSICIÓN de columna asumiendo el esquema nuevo, sobre hojas que todavía
// tenían el esquema viejo — eso corrió datos a la celda equivocada (y en
// Costo_Promedio, hasta mezcló números en celdas con formato de fecha y
// viceversa). Por eso esta versión rescata/limpia antes de reacomodar, y al
// final recalcula todo Costo_Promedio desde cero para dejarlo consistente.
// Segura de correr más de una vez.
function migrarEsquemaSinUnidades() {
  // ── Maestro_Productos ──
  const hojaMaestro = getHojaMaestro();
  const encabezadosMaestro = hojaMaestro.getRange(1, 1, 1, hojaMaestro.getLastColumn()).getValues()[0];

  if (encabezadosMaestro.indexOf('Unidad base') !== -1) {
    const nFilas = hojaMaestro.getLastRow() - 1;
    if (nFilas > 0) {
      const datos = hojaMaestro.getRange(2, 1, nFilas, 6).getValues();
      const hojaAreas = getHojaAreas();
      const nFilasAreas = hojaAreas.getLastRow() - 1;
      const areasValidas = new Set(
        (nFilasAreas > 0 ? hojaAreas.getRange(2, 1, nFilasAreas, 1).getValues() : [])
          .map(function(r) { return String(r[0]).trim(); }).filter(Boolean)
      );

      datos.forEach(function(fila, i) {
        const filaSheet = i + 2;
        const colArea         = fila[3]; // "Unidad base" vieja → candidata a "Área de negocio"
        const colUnidadCompra = fila[4]; // "Unidad de compra default" vieja
        const colFecha        = fila[5]; // "Fecha de creación" vieja

        // Rescata la fecha de creación si el código nuevo ya la escribió por
        // posición en "Unidad de compra default" (columna 5) en vez de en
        // "Fecha de creación" (columna 6, esquema viejo).
        const col5EsFecha = colUnidadCompra instanceof Date ||
          (typeof colUnidadCompra === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(colUnidadCompra));
        if (col5EsFecha && !colFecha) {
          hojaMaestro.getRange(filaSheet, 6).setValue(colUnidadCompra);
        }

        // Limpia texto de unidad vieja (ej. "Kilo", "Unidad", "Rollo") que
        // quedó en esta columna antes de que existiera el campo real de
        // área de negocio. Si ya es un área válida (alguien la cargó desde
        // el modal nuevo), se conserva tal cual.
        if (colArea && !areasValidas.has(String(colArea).trim())) {
          hojaMaestro.getRange(filaSheet, 4).setValue('');
        }
      });
    }

    hojaMaestro.deleteColumn(5); // "Unidad de compra default" (ya rescatada la fecha si hacía falta)
    hojaMaestro.getRange(1, 4).setValue('Área de negocio');
    if (nFilas > 0) hojaMaestro.getRange(2, 5, nFilas, 1).setNumberFormat('yyyy-mm-dd'); // Fecha de creación
    Logger.log('Maestro_Productos actualizado: "Unidad base" → "Área de negocio" (se limpiaron valores que no eran un área válida), "Unidad de compra default" eliminada (se rescataron fechas de creación corridas).');
  } else {
    Logger.log('Maestro_Productos ya estaba con el esquema nuevo.');
  }

  // ── Costo_Promedio ──
  const hojaCosto = getHojaCostoPromedio();
  const encabezadosCosto = hojaCosto.getRange(1, 1, 1, hojaCosto.getLastColumn()).getValues()[0];
  if (encabezadosCosto.indexOf('Unidad base') !== -1) {
    hojaCosto.deleteColumn(4); // Unidad base

    // Por si alguna celda quedó con formato de fecha (o de número) heredado
    // de cuando los datos se escribían corridos, forzamos el formato
    // correcto en cada columna antes de recalcular.
    const nFilasCosto = hojaCosto.getLastRow() - 1;
    if (nFilasCosto > 0) {
      hojaCosto.getRange(2, 4, nFilasCosto, 1).setNumberFormat('0.##');       // Costo último
      hojaCosto.getRange(2, 5, nFilasCosto, 1).setNumberFormat('yyyy-mm-dd'); // Fecha última compra
      hojaCosto.getRange(2, 6, nFilasCosto, 1).setNumberFormat('0.##');       // Costo prom. 30 días
      hojaCosto.getRange(2, 7, nFilasCosto, 1).setNumberFormat('0.##');       // Costo prom. 90 días
      hojaCosto.getRange(2, 8, nFilasCosto, 1).setNumberFormat('yyyy-mm-dd'); // Fecha de actualización
    }

    recalcularTodosLosCostos();
    Logger.log('Costo_Promedio actualizado: se quitó "Unidad base", se corrigió el formato de celdas, y se recalcularon todos los productos para arreglar datos corridos.');
  } else {
    Logger.log('Costo_Promedio ya estaba con el esquema nuevo.');
  }
}

// Recorre Maestro_Productos y recalcula Costo_Promedio para cada producto
// que tenga al menos un alias. Se usa al final de migrarEsquemaSinUnidades()
// para dejar todo consistente, pero también sirve como refresco manual si
// alguna vez hace falta recomputar todo desde cero.
function recalcularTodosLosCostos() {
  const hojaMaestro = getHojaMaestro();
  const nFilas = hojaMaestro.getLastRow() - 1;
  if (nFilas <= 0) return;
  const ids = hojaMaestro.getRange(2, MAESTRO_COL.ID_PRODUCTO, nFilas, 1).getValues();
  let recalculados = 0;
  ids.forEach(function(r) {
    const id = String(r[0]).trim();
    if (!id) return;
    if (recalcularCostoPromedio(id)) recalculados++;
  });
  Logger.log('Costo_Promedio recalculado para ' + recalculados + ' de ' + nFilas + ' productos del Maestro.');
}

// Función de UN SOLO USO: correr manualmente desde este editor para crear y
// sembrar (con los valores por defecto) las hojas Categorias_Productos y
// Areas_Negocio la primera vez — de otra forma solo se crean solas al
// recibir la primera escritura (guardar_categoria / guardar_area_negocio),
// y hasta entonces config-productos.html / costos-productos.html las ven
// vacías (leen con gviz, que no crea hojas).
// Segura de volver a correr: si ya existen, no hace nada.
function inicializarListasCompartidas() {
  const yaExistiaCat = !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CATEGORIAS);
  const yaExistiaArea = !!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_AREAS);
  getHojaCategorias();
  getHojaAreas();
  Logger.log(yaExistiaCat ? 'Categorias_Productos ya existía.' : 'Categorias_Productos creada y sembrada con ' + CATEGORIAS_DEFAULT.length + ' valores.');
  Logger.log(yaExistiaArea ? 'Areas_Negocio ya existía.' : 'Areas_Negocio creada y sembrada con ' + AREAS_DEFAULT.length + ' valores.');
}

// ═══════════════════════════════════════════════════════════════════════════
// === COMPROBANTES DE PAGO — concilia comprobantes ya extraídos (por
// Code-extractor.gs, en la cuenta de Gmail donde llegan las notificaciones
// bancarias) contra Registro Facturas. Reutiliza getHoja(), COL,
// columnaPorNombre() y getHojaProveedores() de arriba en vez de duplicar el
// acceso a esas hojas.
// ═══════════════════════════════════════════════════════════════════════════
//
// Este script YA NO lee Gmail directamente — eso lo hace Code-extractor.gs,
// que vive en un Sheet aparte dentro de la cuenta de Gmail que recibe los
// comprobantes (puede ser otra cuenta distinta de la dueña de este Sheet).
// Ese script deja cada comprobante identificado en su pestaña
// "Comprobantes_Extraidos"; este backend la lee vía Drive compartido, hace el
// match contra Registro Facturas, y marca cada fila leída como "Procesada"
// para no releerla. Ver Code-extractor.gs para el detalle de esa parte.
//
// CONFIGURACIÓN ADICIONAL (además de los pasos ya documentados arriba):
// 1. Pegá Code-extractor.gs + Code-extractor-appsscript.json en el Sheet
//    https://docs.google.com/spreadsheets/d/1Oog4jc9-qxkFBzomJQNOD6uE5rVpVVAag4eCnuKTYGk
//    (vive en facturaslorito@gmail.com) — seguí los pasos del encabezado de
//    ese archivo (incluye su propia ANTHROPIC_API_KEY, y autorizar Gmail en
//    ESA cuenta).
// 2. Compartí ese Sheet extractor con la cuenta que corre este backend, con
//    permiso de EDITOR (necesita poder marcar "Procesado").
// 3. STAGING_SPREADSHEET_ID ya apunta a ese Sheet, no hace falta tocarlo.
// 4. Guardá y recargá este Sheet: aparece el menú "Comprobantes de Pago".
// 5. "Comprobantes de Pago > Procesar ahora" para probarlo. Como este script
//    ya no usa GmailApp, no hace falta agregar ningún scope de Gmail acá —
//    solo necesita el acceso a Sheets que ya tenías.
// 6. "Comprobantes de Pago > Activar revisión automática" para que corra
//    sola cada 30 min (además de la revisión automática del extractor).
//
// ORDEN DE CADA COMPROBANTE LEÍDO DEL STAGING:
// 1. Se guarda tal cual llegó en Comprobantes_Recibidos (histórico crudo, se
//    crea solo, nunca se modifica después) — esto pasa ANTES de cualquier
//    intento de match, así que queda registrado incluso si el análisis
//    falla o el resultado es "sin match".
// 2. Recién ahí se intenta conciliar contra Registro Facturas:
//    a. Por número de factura: si el comprobante trae el número de factura
//       (Descripción/Concepto de la transferencia) que coincide con una
//       factura sin pagar de Registro Facturas, y el monto cuadra → match
//       directo.
//    b. Por cuenta destino: si no trae número de factura (pasa seguido), se
//       busca la cuenta destino (aunque venga enmascarada) en la columna
//       "Cuenta" de la hoja "proveedores" (PROV_COL.CUENTA) para saber a qué
//       proveedor corresponde, y entre sus facturas sin pagar se busca una
//       con el mismo monto → match.
// Cada transacción (matcheada o no) queda además en Pagos_Identificados (se
// crea sola). Cuando hay match, en Registro Facturas se agrega la columna
// dinámica "Conciliación" = "Automática" (vía columnaPorNombre, igual que
// "Detalle"/"Origen"/"Notas").
//
// ASOCIACIÓN MANUAL (pestaña Pagos_Identificados):
// Para las filas "Pendiente de asociar": columna con desplegable de facturas
// sin pagar (se refresca en cada corrida), o columna de texto libre para
// escribir el número de factura a mano si no aparece en el desplegable.
// Cualquiera de las dos dispara la asociación sola (onEdit) y deja
// "Conciliación" = "Manual". Si la factura ya tenía fecha de pago, pide
// confirmación antes de sobrescribir.

const SHEET_HISTORICO = 'Comprobantes_Recibidos';
const SHEET_LOG = 'Log_Comprobantes';
const SHEET_PAGOS = 'Pagos_Identificados';

// Columnas fijas de Comprobantes_Recibidos (histórico crudo, se escribe antes
// de intentar ningún match — nunca se edita después).
const HISTORICO_COL = {
  fechaRegistrado: 1, de: 2, asunto: 3, metodo: 4, fechaComprobante: 5, banco: 6,
  cuentaDestino: 7, nombreCuentaDestino: 8, monto: 9, moneda: 10, concepto: 11,
  referencia: 12, facturaDetectada: 13, link: 14
};

const MONTO_TOLERANCIA = 1; // diferencia máxima aceptada entre el monto del comprobante y el TOTAL de la factura
const TRIGGER_HANDLER = 'procesarComprobantesPago';

// ID del Sheet "extractor" (Code-extractor.gs, en facturaslorito@gmail.com —
// la cuenta donde llegan las notificaciones bancarias), que escribe la
// pestaña Comprobantes_Extraidos. Ese Sheet debe estar compartido con esta
// cuenta como Editor.
const STAGING_SPREADSHEET_ID = '1Oog4jc9-qxkFBzomJQNOD6uE5rVpVVAag4eCnuKTYGk';
const STAGING_SHEET_NAME = 'Comprobantes_Extraidos';
const STAGING_COL = {
  fechaExtraido: 1, de: 2, asunto: 3, metodo: 4, fechaComprobante: 5, banco: 6,
  cuentaDestino: 7, nombreCuentaDestino: 8, monto: 9, moneda: 10, concepto: 11,
  referencia: 12, facturaDetectada: 13, procesado: 14, link: 15
};

// Columnas fijas de Pagos_Identificados (la crea y ordena este script, así que
// no hace falta buscarlas por texto de encabezado como con COL/columnaPorNombre).
const PAGOS_COL = {
  fechaProcesado: 1, de: 2, asunto: 3, metodo: 4, fechaComprobante: 5, banco: 6,
  cuentaDestino: 7, nombreCuentaDestino: 8, monto: 9, moneda: 10, concepto: 11,
  referencia: 12, facturaDetectada: 13, estado: 14, facturaAsociada: 15,
  dropdown: 16, manual: 17, link: 18
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Comprobantes de Pago')
    .addItem('Procesar ahora', 'procesarComprobantesPago')
    .addItem('Actualizar lista de facturas pendientes (desplegable)', 'actualizarDropdownDesdeMenu_')
    .addSeparator()
    .addItem('Activar revisión automática (cada 30 min)', 'activarRevisionAutomatica')
    .addItem('Desactivar revisión automática', 'desactivarRevisionAutomatica')
    .addToUi();
}

function activarRevisionAutomatica() {
  desactivarRevisionAutomatica();
  ScriptApp.newTrigger(TRIGGER_HANDLER).timeBased().everyMinutes(30).create();
  SpreadsheetApp.getUi().alert('Listo. Se revisarán comprobantes nuevos cada 30 minutos.');
}

function desactivarRevisionAutomatica() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === TRIGGER_HANDLER) ScriptApp.deleteTrigger(t);
  });
}

function actualizarDropdownDesdeMenu_() {
  refrescarDropdownPagos_();
  SpreadsheetApp.getUi().alert('Desplegable de facturas pendientes actualizado.');
}

// === PROCESO PRINCIPAL ===
// Lee las filas nuevas (Procesado = false) de Comprobantes_Extraidos en el
// Sheet extractor, intenta conciliarlas contra Registro Facturas, y marca
// cada una como Procesada para no volver a leerla en la próxima corrida.
function procesarComprobantesPago() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log('Ya hay una ejecución en curso, se omite esta corrida.');
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const registro = getHoja();
    const cuentasProveedores = getCuentasProveedores_();

    const staging = SpreadsheetApp.openById(STAGING_SPREADSHEET_ID).getSheetByName(STAGING_SHEET_NAME);
    if (!staging) {
      throw new Error(`No se encontró la hoja "${STAGING_SHEET_NAME}" en el Sheet extractor — revisá STAGING_SPREADSHEET_ID.`);
    }

    // Barrera adicional al flag "Procesado": si dos corridas se superponen (ej. un
    // clic manual en "Procesar ahora" mientras el trigger automático también está
    // corriendo), el flag por sí solo no alcanza a evitar que la misma fila se
    // procese dos veces. Acá se arma un set con los links de mensaje ya registrados
    // en Comprobantes_Recibidos, así ninguna escritura se duplica aunque el mismo
    // comprobante se intente procesar más de una vez.
    const linksYaRegistrados = obtenerLinksRegistrados_(ss);

    let procesados = 0, matches = 0, revisar = 0, errores = 0, duplicados = 0;
    const lastRow = staging.getLastRow();

    if (lastRow >= 2) {
      const filas = staging.getRange(2, 1, lastRow - 1, STAGING_COL.link).getValues();

      filas.forEach((valores, idx) => {
        if (valores[STAGING_COL.procesado - 1]) return; // ya se procesó antes
        const filaStaging = idx + 2;

        const origen = {
          de: valores[STAGING_COL.de - 1],
          asunto: valores[STAGING_COL.asunto - 1],
          link: valores[STAGING_COL.link - 1]
        };

        if (origen.link && linksYaRegistrados.has(origen.link)) {
          // Ya está en Comprobantes_Recibidos de una corrida anterior/superpuesta —
          // solo marcamos procesado, no volvemos a escribir nada.
          staging.getRange(filaStaging, STAGING_COL.procesado).setValue(true);
          duplicados++;
          return;
        }

        const dato = {
          __metodo: valores[STAGING_COL.metodo - 1],
          fecha: valores[STAGING_COL.fechaComprobante - 1],
          banco: valores[STAGING_COL.banco - 1],
          cuentaDestino: valores[STAGING_COL.cuentaDestino - 1],
          nombreCuentaDestino: valores[STAGING_COL.nombreCuentaDestino - 1],
          monto: valores[STAGING_COL.monto - 1],
          moneda: valores[STAGING_COL.moneda - 1],
          descripcion: valores[STAGING_COL.concepto - 1],
          referencia: valores[STAGING_COL.referencia - 1],
          numeroFacturaDetectado: valores[STAGING_COL.facturaDetectada - 1] || null
        };

        try {
          registrarHistoricoComprobante_(ss, origen, dato); // guarda el crudo primero, antes de cualquier análisis
          if (origen.link) linksYaRegistrados.add(origen.link);
          procesados++;
          const resultado = buscarFacturaParaComprobante_(dato, registro, cuentasProveedores);

          if (resultado.match) {
            escribirMatchComprobante_(registro, resultado.match.fila, dato, 'Automática');
            const facturaAsociada = registro.getRange(resultado.match.fila, COL.FACTURA).getValue();
            registrarLogComprobante_(ss, origen, dato, 'Match automático', 'Fila ' + resultado.match.fila);
            registrarPagoIdentificado_(ss, origen, dato, { estado: 'Asociado automáticamente', factura: facturaAsociada });
            matches++;
          } else {
            registrarLogComprobante_(ss, origen, dato, 'Revisar manual', resultado.motivo);
            registrarPagoIdentificado_(ss, origen, dato, { estado: 'Pendiente de asociar' });
            revisar++;
          }
        } catch (e) {
          registrarLogComprobante_(ss, origen, dato, 'Error', e.message);
          errores++;
        } finally {
          staging.getRange(filaStaging, STAGING_COL.procesado).setValue(true);
        }
      });
    }

    refrescarDropdownPagos_();
    console.log(`Comprobantes leídos del extractor: ${procesados} | Match: ${matches} | Revisar: ${revisar} | Errores: ${errores} | Duplicados evitados: ${duplicados}`);
  } finally {
    lock.releaseLock();
  }
}

// === MATCHING AUTOMÁTICO ===

function normalizarTexto_(str) {
  return String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Reutiliza la hoja "proveedores" que ya existe (columna PROV_COL.CUENTA) en vez
// de mantener una tabla aparte — así ya arranca con los proveedores que estén
// cargados ahí, sin duplicar datos. Un proveedor puede tener nombre jurídico y
// comercial distintos: se guardan ambos, porque Registro Facturas puede usar
// cualquiera de los dos en su columna Proveedor.
function getCuentasProveedores_() {
  const hoja = getHojaProveedores();
  const nFilas = hoja.getLastRow() - 1;
  if (nFilas <= 0) return [];

  const datos = hoja.getRange(2, 1, nFilas, PROV_ENCABEZADOS.length).getValues();
  const lista = [];
  datos.forEach(fila => {
    const cuentaNorm = normalizarTexto_(fila[PROV_COL.CUENTA - 1]);
    if (!cuentaNorm) return;
    const juridico = String(fila[PROV_COL.NOMBRE_JURIDICO - 1] || '').trim();
    const comercial = String(fila[PROV_COL.NOMBRE_COMERCIAL - 1] || '').trim();
    const nombres = [...new Set([juridico, comercial].filter(Boolean))];
    if (nombres.length) lista.push({ nombres, cuentaNorm });
  });
  return lista;
}

// Muchas notificaciones (ej. SINPE a otro banco) enmascaran la cuenta destino y solo
// muestran los últimos dígitos (ej. "****************1789"). Si la cuenta extraída del
// comprobante viene enmascarada o es corta, se busca por sufijo contra las cuentas completas
// guardadas en la hoja proveedores en vez de exigir una coincidencia exacta.
function resolverProveedorPorCuenta_(cuentaOriginal, cuentaNorm, cuentasProveedores) {
  let candidatos = cuentasProveedores.filter(c => c.cuentaNorm === cuentaNorm);

  const pareceEnmascarada = /\*/.test(String(cuentaOriginal || '')) || cuentaNorm.length <= 6;
  if (!candidatos.length && pareceEnmascarada && cuentaNorm.length >= 3) {
    candidatos = cuentasProveedores.filter(c => c.cuentaNorm.endsWith(cuentaNorm));
  }

  if (candidatos.length === 1) return { nombres: candidatos[0].nombres };
  if (candidatos.length > 1) {
    const todos = candidatos.map(c => c.nombres.join('/')).join(', ');
    return { motivo: `La cuenta destino (${cuentaOriginal}) coincide por los últimos dígitos con más de un proveedor en la hoja "proveedores" (${todos}) — no se puede distinguir con esa información.` };
  }
  return { nombres: null };
}

function contiene_(a, b) {
  if (!a || !b) return false;
  const na = String(a).replace(/\s/g, '');
  const nb = String(b).replace(/\s/g, '');
  return na.includes(nb) || nb.includes(na);
}

function facturasPendientes_(registro) {
  const lastRow = registro.getLastRow();
  if (lastRow < 2) return [];
  const numFilas = lastRow - 1;
  const numCols = registro.getLastColumn();
  const datos = registro.getRange(2, 1, numFilas, numCols).getValues();
  return datos
    .map((fila, idx) => ({ fila: idx + 2, valores: fila }))
    .filter(r => !r.valores[COL.FECHA_PAGO - 1]);
}

// Devuelve { match: { fila } } o { motivo: "..." }
function buscarFacturaParaComprobante_(dato, registro, cuentasProveedores) {
  if (registro.getLastRow() < 2) return { motivo: 'Registro Facturas está vacío.' };

  const pendientes = facturasPendientes_(registro);

  const montoOk = valores => dato.monto != null && Math.abs(Number(valores[COL.TOTAL - 1]) - Number(dato.monto)) <= MONTO_TOLERANCIA;
  const monedaOk = valores => !dato.moneda || String(valores[COL.MONEDA - 1]).toUpperCase() === String(dato.moneda).toUpperCase();

  // Intento A: por número de factura (en numeroFacturaDetectado o descripcion)
  const posiblesFactura = [dato.numeroFacturaDetectado, dato.descripcion].filter(Boolean);
  if (posiblesFactura.length) {
    let candA = pendientes.filter(r => {
      const factura = r.valores[COL.FACTURA - 1];
      return factura && posiblesFactura.some(pf => contiene_(pf, factura));
    });
    if (candA.length > 1) candA = candA.filter(r => montoOk(r.valores) && monedaOk(r.valores));
    if (candA.length === 1) return { match: { fila: candA[0].fila } };
    if (candA.length > 1) return { motivo: `Varias facturas coinciden con el número detectado (${posiblesFactura.join(' / ')}): filas ${candA.map(c => c.fila).join(', ')}.` };
  }

  // Intento B: por cuenta destino -> proveedor + monto
  const cuentaNorm = normalizarTexto_(dato.cuentaDestino);
  if (!cuentaNorm) {
    return { motivo: 'El comprobante no trae número de factura reconocible ni cuenta destino — no se puede conciliar automáticamente.' };
  }

  const resuelto = resolverProveedorPorCuenta_(dato.cuentaDestino, cuentaNorm, cuentasProveedores);
  if (resuelto.motivo) return { motivo: resuelto.motivo };
  const nombresProveedor = resuelto.nombres;
  if (!nombresProveedor) {
    return { motivo: `Cuenta destino no registrada en la columna "Cuenta" de la hoja proveedores: ${dato.cuentaDestino} (${dato.nombreCuentaDestino || 'sin nombre'}). Agregala ahí para que el próximo pago a este proveedor se concilie solo.` };
  }

  const nombresNorm = nombresProveedor.map(n => n.toLowerCase());
  const candB = pendientes.filter(r =>
    nombresNorm.includes(String(r.valores[COL.PROVEEDOR - 1]).trim().toLowerCase()) &&
    montoOk(r.valores) && monedaOk(r.valores)
  );

  if (candB.length === 1) return { match: { fila: candB[0].fila } };
  if (candB.length > 1) return { motivo: `Varias facturas sin pagar de "${nombresProveedor.join('/')}" coinciden en monto (${dato.monto} ${dato.moneda}): filas ${candB.map(c => c.fila).join(', ')}.` };
  return { motivo: `No se encontró ninguna factura sin pagar de "${nombresProveedor.join('/')}" por ${dato.monto} ${dato.moneda}.` };
}

// Reutiliza columnaPorNombre() de arriba para crear/ubicar "Conciliación",
// igual que el resto del código lo hace con "Detalle"/"Origen"/"Notas".
function escribirMatchComprobante_(registro, fila, dato, metodoAsociacion) {
  const medioPago = 'Transferencia' + (dato.banco ? ' ' + dato.banco : '');
  registro.getRange(fila, COL.FECHA_PAGO).setValue(dato.fecha || '');
  registro.getRange(fila, COL.MEDIO_PAGO).setValue(medioPago);
  registro.getRange(fila, COL.REFERENCIA).setValue(dato.referencia || '');
  registro.getRange(fila, columnaPorNombre(registro, 'Conciliación')).setValue(metodoAsociacion || '');
}

// === COMPROBANTES_RECIBIDOS — histórico crudo, se escribe primero (antes de
// intentar el match) y nunca se modifica después. Sirve como registro
// permanente de todo lo que llegó, independiente de cómo haya terminado el
// análisis. ===

// Set con todos los "Link mensaje" ya presentes en Comprobantes_Recibidos —
// usado como barrera anti-duplicados en procesarComprobantesPago() (ver
// comentario ahí) para que dos corridas superpuestas nunca terminen
// escribiendo el mismo comprobante dos veces.
function obtenerLinksRegistrados_(ss) {
  const links = new Set();
  const sheet = ss.getSheetByName(SHEET_HISTORICO);
  if (!sheet || sheet.getLastRow() < 2) return links;
  sheet.getRange(2, HISTORICO_COL.link, sheet.getLastRow() - 1, 1).getValues()
    .forEach(r => { if (r[0]) links.add(r[0]); });
  return links;
}

function registrarHistoricoComprobante_(ss, origen, dato) {
  let sheet = ss.getSheetByName(SHEET_HISTORICO);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_HISTORICO);
    sheet.getRange(1, 1, 1, HISTORICO_COL.link).setValues([[
      'Fecha registrado', 'De', 'Asunto', 'Método', 'Fecha comprobante', 'Banco',
      'Cuenta destino', 'Nombre cuenta destino', 'Monto', 'Moneda', 'Concepto', 'Referencia',
      'Número factura detectado', 'Link mensaje'
    ]]);
    sheet.getRange(1, 1, 1, HISTORICO_COL.link).setFontWeight('bold').setBackground('#e8eaed');
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    new Date(), origen.de || '', origen.asunto || '', dato.__metodo || 'Claude (IA)',
    dato.fecha || '', dato.banco || '', dato.cuentaDestino || '', dato.nombreCuentaDestino || '',
    dato.monto || '', dato.moneda || '', dato.descripcion || '', dato.referencia || '',
    dato.numeroFacturaDetectado || '', origen.link || ''
  ]);
}

// === LOG TÉCNICO (todo intento, incluidos errores) ===

function registrarLogComprobante_(ss, origen, dato, resultado, detalle) {
  let sheet = ss.getSheetByName(SHEET_LOG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOG);
    sheet.appendRow([
      'Fecha procesado', 'De', 'Asunto', 'Método', 'Fecha comprobante', 'Banco',
      'Cuenta destino', 'Nombre cuenta destino', 'Monto', 'Moneda', 'Descripción', 'Referencia',
      'Número factura detectado', 'Resultado', 'Detalle', 'Link mensaje'
    ]);
  }
  sheet.appendRow([
    new Date(), origen.de || '', origen.asunto || '', dato.__metodo || 'Claude (IA)',
    dato.fecha || '', dato.banco || '', dato.cuentaDestino || '', dato.nombreCuentaDestino || '',
    dato.monto || '', dato.moneda || '', dato.descripcion || '', dato.referencia || '',
    dato.numeroFacturaDetectado || '', resultado, detalle || '',
    origen.link || ''
  ]);
}

// === PAGOS_IDENTIFICADOS — todas las transacciones leídas del extractor, con
// asociación manual para las que quedaron pendientes ===

function registrarPagoIdentificado_(ss, origen, dato, resultadoInfo) {
  let sheet = ss.getSheetByName(SHEET_PAGOS);
  if (!sheet) sheet = crearHojaPagos_(ss);

  const fila = sheet.getLastRow() + 1;
  sheet.getRange(fila, 1, 1, PAGOS_COL.link).setValues([[
    new Date(), origen.de || '', origen.asunto || '', dato.__metodo || 'Claude (IA)',
    dato.fecha || '', dato.banco || '', dato.cuentaDestino || '', dato.nombreCuentaDestino || '',
    dato.monto || '', dato.moneda || '', dato.descripcion || '', dato.referencia || '',
    dato.numeroFacturaDetectado || '', resultadoInfo.estado, resultadoInfo.factura || '',
    '', '', origen.link || ''
  ]]);

  colorearFilaPagos_(sheet, fila, resultadoInfo.estado);
}

function crearHojaPagos_(ss) {
  const sheet = ss.insertSheet(SHEET_PAGOS);
  sheet.getRange(1, 1, 1, PAGOS_COL.link).setValues([[
    'Fecha procesado', 'De', 'Asunto', 'Método', 'Fecha comprobante', 'Banco',
    'Cuenta destino', 'Nombre cuenta destino', 'Monto', 'Moneda', 'Concepto', 'Referencia',
    'Número factura detectado', 'Estado', 'Factura asociada',
    'Asociar con factura pendiente ▼', 'O escribir número de factura manualmente', 'Link mensaje'
  ]]);
  sheet.getRange(1, 1, 1, PAGOS_COL.link).setFontWeight('bold').setBackground('#e8eaed');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(PAGOS_COL.dropdown, 260);
  sheet.setColumnWidth(PAGOS_COL.manual, 260);
  return sheet;
}

function colorearFilaPagos_(sheet, fila, estado) {
  const colores = {
    'Asociado automáticamente': '#d9ead3',
    'Asociado manualmente': '#d9ead3',
    'Pendiente de asociar': '#fff2cc'
  };
  const color = colores[estado] || '#f4cccc'; // rojo suave para "Factura no encontrada: ..." u otros
  sheet.getRange(fila, 1, 1, PAGOS_COL.link).setBackground(color);
}

// Refresca el desplegable de "Asociar con factura pendiente" en toda la hoja Pagos_Identificados
// con las facturas sin pagar actuales de Registro Facturas.
function refrescarDropdownPagos_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PAGOS);
  if (!sheet || sheet.getLastRow() < 2) return;

  const registro = getHoja();
  const opciones = facturasPendientes_(registro).map(r =>
    `${r.valores[COL.FACTURA - 1]} | ${r.valores[COL.PROVEEDOR - 1]} | ${r.valores[COL.TOTAL - 1]} ${r.valores[COL.MONEDA - 1]}`
  );

  const rango = sheet.getRange(2, PAGOS_COL.dropdown, sheet.getLastRow() - 1, 1);
  if (!opciones.length) { rango.clearDataValidations(); return; }

  const regla = SpreadsheetApp.newDataValidation().requireValueInList(opciones, true).setAllowInvalid(true).build();
  rango.setDataValidation(regla);
}

// === ASOCIACIÓN MANUAL (dropdown o texto libre en Pagos_Identificados) ===
// Trigger simple — corre automáticamente al editar la hoja, sin necesidad de activarlo aparte,
// una vez que el script ya fue autorizado (ej. corriendo "Procesar ahora" una vez).
function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_PAGOS) return;
    if (e.range.getRow() === 1) return;
    const col = e.range.getColumn();
    if (col !== PAGOS_COL.dropdown && col !== PAGOS_COL.manual) return;

    const valor = String(e.value || '').trim();
    if (!valor) return;

    const facturaBuscada = col === PAGOS_COL.dropdown ? valor.split('|')[0].trim() : valor;
    asociarPagoManualmente_(sheet, e.range.getRow(), facturaBuscada);
  } catch (err) {
    console.error('onEdit error: ' + err.message);
    SpreadsheetApp.getUi().alert('No se pudo asociar el pago: ' + err.message);
  }
}

function asociarPagoManualmente_(sheetPagos, fila, facturaBuscada) {
  const registro = getHoja();
  const ui = SpreadsheetApp.getUi();

  const facturaNorm = normalizarTexto_(facturaBuscada);
  const lastRow = registro.getLastRow();
  const datos = registro.getRange(2, 1, lastRow - 1, registro.getLastColumn()).getValues();
  const idx = datos.findIndex(f => normalizarTexto_(f[COL.FACTURA - 1]) === facturaNorm);

  if (idx === -1) {
    sheetPagos.getRange(fila, PAGOS_COL.estado).setValue(`Factura no encontrada: ${facturaBuscada}`);
    colorearFilaPagos_(sheetPagos, fila, `Factura no encontrada: ${facturaBuscada}`);
    ui.alert(`No se encontró la factura "${facturaBuscada}" en ${HOJA_FACTURAS}.`);
    return;
  }

  const filaFactura = idx + 2;
  const yaPagada = datos[idx][COL.FECHA_PAGO - 1];
  if (yaPagada) {
    const resp = ui.alert(
      'Factura ya tiene fecha de pago',
      `La factura ${facturaBuscada} ya tiene fecha de pago (${yaPagada}). ¿Sobrescribir con los datos de este comprobante?`,
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  }

  const filaPagosValores = sheetPagos.getRange(fila, 1, 1, PAGOS_COL.link).getValues()[0];
  const dato = {
    fecha: filaPagosValores[PAGOS_COL.fechaComprobante - 1],
    banco: filaPagosValores[PAGOS_COL.banco - 1],
    referencia: filaPagosValores[PAGOS_COL.referencia - 1]
  };

  escribirMatchComprobante_(registro, filaFactura, dato, 'Manual');

  sheetPagos.getRange(fila, PAGOS_COL.estado).setValue('Asociado manualmente');
  sheetPagos.getRange(fila, PAGOS_COL.facturaAsociada).setValue(datos[idx][COL.FACTURA - 1]);
  colorearFilaPagos_(sheetPagos, fila, 'Asociado manualmente');
}

// === ASOCIACIÓN MANUAL DESDE LA WEB (cuentas-por-pagar.html, pestaña
// "Pagos identificados") — misma idea que asociarPagoManualmente_() de
// arriba (usada por el onEdit de la hoja), pero: (a) sin ui.alert porque acá
// no hay UI de Sheets, así que una factura que ya tenga fecha de pago se
// omite en vez de preguntar; (b) acepta varias facturas a la vez, para el
// caso de una transferencia que cubre más de una factura del mismo proveedor.
// Identifica la fila de Pagos_Identificados por "Link mensaje" (columna que
// ya se usa como llave anti-duplicados en procesarComprobantesPago()) en vez
// de por número de fila, porque gviz no expone el número de fila real.
function asociarPagoIdentificado(p) {
  if (!p.link) throw new Error('Falta identificar el pago (sin link de mensaje).');
  if (!p.facturas || !p.facturas.length) throw new Error('Seleccioná al menos una factura.');

  const sheetPagos = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PAGOS);
  if (!sheetPagos) throw new Error('No existe la hoja ' + SHEET_PAGOS + '.');

  const lastRowPagos = sheetPagos.getLastRow();
  if (lastRowPagos < 2) throw new Error('La hoja ' + SHEET_PAGOS + ' está vacía.');
  const links = sheetPagos.getRange(2, PAGOS_COL.link, lastRowPagos - 1, 1).getValues();
  const idxPago = links.findIndex(r => String(r[0]) === String(p.link));
  if (idxPago === -1) throw new Error('No se encontró el pago identificado — recargá la página, puede que ya se haya actualizado.');
  const filaPago = idxPago + 2;

  const filaPagosValores = sheetPagos.getRange(filaPago, 1, 1, PAGOS_COL.link).getValues()[0];
  if (String(filaPagosValores[PAGOS_COL.estado - 1]).indexOf('Asociado') === 0) {
    throw new Error('Este pago ya está asociado — recargá la página para ver el estado actual.');
  }
  const dato = {
    fecha: filaPagosValores[PAGOS_COL.fechaComprobante - 1],
    banco: filaPagosValores[PAGOS_COL.banco - 1],
    referencia: filaPagosValores[PAGOS_COL.referencia - 1]
  };

  const registro = getHoja();
  const asociadas = [];
  const omitidas = [];
  p.facturas.forEach(function(sel) {
    const fila = filaFacturaPorOrdinal(registro, sel.numero, sel.ordinal);
    if (fila === -1 || registro.getRange(fila, COL.FECHA_PAGO).getValue()) { omitidas.push(sel.numero); return; }
    escribirMatchComprobante_(registro, fila, dato, 'Manual');
    asociadas.push(sel.numero);
  });

  if (!asociadas.length) {
    throw new Error('Ninguna de las facturas seleccionadas se pudo asociar (puede que ya tengan fecha de pago o se hayan eliminado) — recargá la página.');
  }

  sheetPagos.getRange(filaPago, PAGOS_COL.estado).setValue('Asociado manualmente');
  sheetPagos.getRange(filaPago, PAGOS_COL.facturaAsociada).setValue(asociadas.join(', '));
  colorearFilaPagos_(sheetPagos, filaPago, 'Asociado manualmente');
  refrescarDropdownPagos_();

  return { facturas_asociadas: asociadas, facturas_omitidas: omitidas };
}
