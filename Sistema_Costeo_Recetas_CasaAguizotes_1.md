# Sistema de Costeo de Recetas — Casa Aguizotes

Basado en: últimas 5 compras (promedio ponderado) · auto-match con edición manual · recetas por local.

---

## 1. Estructura de hojas (Google Sheets)

### Hoja `Catalogo_Maestro`
| Columna | Tipo | Descripción |
|---|---|---|
| ID_Producto | texto (ej. P0001) | ID único, no cambia nunca |
| Nombre_Estandar | texto | Nombre "oficial" del producto |
| Categoria | texto | Carnes, Lácteos, Licores, etc. |
| Unidad_Medida | texto | kg, l, unidad |
| Costo_Actual | número | Se recalcula automáticamente (no editar a mano) |
| Fecha_Ultima_Actualizacion | fecha | Se llena automáticamente |

### Hoja `Alias_Proveedores`
| Columna | Tipo | Descripción |
|---|---|---|
| Nombre_Factura | texto | Nombre exacto tal como llega en la factura |
| ID_Producto_Maestro | texto | Producto al que se mapea |
| Proveedor | texto | |
| Confianza | número (0–1) | Score de similitud del auto-match |
| Estado | texto | `Auto-aprobado`, `Pendiente revisión`, `Aprobado manual` |

### Hoja `Historial_Precios`
| Columna | Tipo | Descripción |
|---|---|---|
| Fecha_Registro | fecha/hora | Cuándo se procesó |
| Fecha_Factura | fecha | Fecha real de la compra |
| ID_Producto | texto | |
| Proveedor | texto | |
| Moneda | texto | CRC / USD, para trazabilidad |
| Precio_Unitario | número | Tal cual viene en la factura (sin ajustar por descuento/impuesto) |
| Cantidad | número | |
| Ref_Factura | texto | Número de factura |

### Hoja `Compras_Pendientes` (cola de espera)
| Columna | Descripción |
|---|---|
| Mismas columnas que Historial_Precios + `ID_Producto_Sugerido` | Guarda compras cuyo alias no superó el umbral de confianza **o** que vienen en una moneda distinta a la de costeo (CRC). Se liberan hacia Historial_Precios cuando apruebas el alias/moneda manualmente. |

### Hojas `Recetas_BrewHouse`, `Recetas_Lorito`, `Recetas_Batanga` (una por local)
| Columna | Descripción |
|---|---|
| ID_Receta | |
| Nombre_Receta | |
| ID_Producto | Ingrediente |
| Cantidad_Por_Porcion | |
| Unidad | |
| Costo_Linea | Se recalcula automáticamente = Cantidad × Costo_Actual del producto |

### Hoja `Costos_Recetas` (resumen, por local)
Suma de `Costo_Linea` agrupado por `ID_Receta` — este es el número que usas para fijar precios de venta y calcular food cost %.

---

## 2. Flujo completo

```
Factura llega (Gmail) → IA extrae líneas (ya tenés esto, con Nombre normalizado incluido)
  → ¿Moneda ≠ CRC? → va directo a Compras_Pendientes (no se mezcla con el costeo)
  → procesarLineaFactura() busca match en Alias_Proveedores (por Nombre normalizado)
  → si no existe el alias: calcula similitud contra Catalogo_Maestro, acotado a la misma Categoría
     → confianza ≥ 0.82 → Auto-aprobado → entra directo a Historial_Precios
     → confianza < 0.82 → Pendiente revisión → va a Compras_Pendientes
  → cada compra nueva dispara recálculo de costo ponderado (últimas 5, Precio_Unitario tal cual)
  → el nuevo costo dispara recálculo de Costo_Linea en las recetas que usan ese producto
```

Cuando revisás un pendiente y corregís/confirmás el `ID_Producto_Maestro` en `Alias_Proveedores`, el sistema libera automáticamente las compras que quedaron en espera.

---

## 3. Apps Script completo

```javascript
// ============================================
// CONFIGURACIÓN
// ============================================
// IMPORTANTE: este script vive en un archivo NUEVO (donde están Catalogo_Maestro,
// Alias_Proveedores, etc.). Desglose_IA vive en el archivo ORIGINAL, así que hay
// que abrirlo explícitamente por ID — SpreadsheetApp.getActive() nunca lo va a ver.
const SOURCE_SPREADSHEET_ID = '1sxXDALDGotE1hoSMuTROZw33oAlE1ci7wXyVMnPe4xw'; // archivo con Desglose_IA

const SHEET_CATALOGO   = 'Catalogo_Maestro';
const SHEET_ALIAS       = 'Alias_Proveedores';
const SHEET_HISTORIAL   = 'Historial_Precios';
const SHEET_PENDIENTES  = 'Compras_Pendientes';
const SHEET_FACTURAS    = 'Desglose_IA'; // hoja real confirmada, en el archivo fuente
const UMBRAL_AUTOMATCH  = 0.82;
const VENTANA_COMPRAS   = 5;
const MONEDA_COSTEO     = 'CRC'; // facturas en otra moneda van a revisión manual
const HOJAS_RECETAS     = ['Recetas_BrewHouse', 'Recetas_Lorito', 'Recetas_Batanga'];

function abrirHojaDesglose() {
  return SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID).getSheetByName(SHEET_FACTURAS);
}

// ============================================
// 0. CREACIÓN DE HOJAS Y ENCABEZADOS (correr una sola vez)
// ============================================
function crearHojasIniciales() {
  const ss = SpreadsheetApp.getActive();

  crearHojaConEncabezados(ss, SHEET_CATALOGO,
    ['ID_Producto', 'Nombre_Estandar', 'Categoria', 'Unidad_Medida', 'Costo_Actual', 'Fecha_Ultima_Actualizacion']);

  crearHojaConEncabezados(ss, SHEET_ALIAS,
    ['Nombre_Factura', 'ID_Producto_Maestro', 'Proveedor', 'Confianza', 'Estado']);

  crearHojaConEncabezados(ss, SHEET_HISTORIAL,
    ['Fecha_Registro', 'Fecha_Factura', 'ID_Producto', 'Proveedor', 'Moneda', 'Precio_Unitario', 'Cantidad', 'Ref_Factura']);

  crearHojaConEncabezados(ss, SHEET_PENDIENTES,
    ['Fecha_Registro', 'Fecha_Factura', 'Nombre_Producto', 'Proveedor', 'Moneda', 'Precio_Unitario', 'Cantidad', 'Ref_Factura', 'ID_Producto_Sugerido']);

  HOJAS_RECETAS.forEach(nombre => {
    crearHojaConEncabezados(ss, nombre,
      ['ID_Receta', 'Nombre_Receta', 'ID_Producto', 'Cantidad_Por_Porcion', 'Unidad', 'Costo_Linea']);
  });

  Logger.log('Hojas creadas/verificadas.');
}

function crearHojaConEncabezados(ss, nombreHoja, encabezados) {
  let sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) sheet = ss.insertSheet(nombreHoja);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
    sheet.setFrozenRows(1);
  }
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
    filasNuevas.push([id, nombreNormalizado, categoria, unidad, '', '']);
  }

  if (filasNuevas.length > 0) {
    shCatalogo.getRange(shCatalogo.getLastRow() + 1, 1, filasNuevas.length, 6).setValues(filasNuevas);
  }
  Logger.log(filasNuevas.length + ' productos nuevos agregados al catálogo.');
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
// linea = { nombreProducto, nombreNormalizado, categoria, proveedor,
//           moneda, precioUnitario, cantidad, fecha, refFactura }
function procesarLineaFactura(linea) {
  const ss = SpreadsheetApp.getActive();
  const shAlias = ss.getSheetByName(SHEET_ALIAS);
  const shCatalogo = ss.getSheetByName(SHEET_CATALOGO);
  const aliasData = shAlias.getDataRange().getValues();

  // Llave de comparación: Nombre normalizado (si viene vacío, cae al Producto crudo)
  const llave = linea.nombreNormalizado || linea.nombreProducto;

  // Moneda distinta a la de costeo → siempre a revisión manual, no se mezcla
  if (linea.moneda && linea.moneda !== MONEDA_COSTEO) {
    guardarPendiente(linea, null);
    return;
  }

  // ¿Alias ya conocido para este proveedor?
  for (let i = 1; i < aliasData.length; i++) {
    if (normalizarTexto(aliasData[i][0]) === normalizarTexto(llave) && aliasData[i][2] === linea.proveedor) {
      const estado = aliasData[i][4];
      if (estado === 'Pendiente revisión') {
        guardarPendiente(linea, aliasData[i][1]);
      } else {
        registrarCompra(aliasData[i][1], linea);
      }
      return;
    }
  }

  // Alias nuevo: buscar mejor match en catálogo, acotado a la misma categoría si existe
  const catData = shCatalogo.getDataRange().getValues();
  let mejorMatch = null, mejorScore = 0;
  for (let i = 1; i < catData.length; i++) {
    if (linea.categoria && catData[i][2] && catData[i][2] !== linea.categoria) continue; // misma categoría
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
  shAlias.appendRow([llave, mejorMatch, linea.proveedor, mejorScore.toFixed(2), estado]);

  if (estado === 'Auto-aprobado') {
    registrarCompra(mejorMatch, linea);
  } else {
    guardarPendiente(linea, mejorMatch);
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

  const compras = data.filter(r => r[2] === idProducto)
    .sort((a, b) => new Date(b[1]) - new Date(a[1]))
    .slice(0, VENTANA_COMPRAS);
  if (compras.length === 0) return;

  const sumaValor = compras.reduce((acc, r) => acc + r[5] * r[6], 0);
  const sumaCantidad = compras.reduce((acc, r) => acc + r[6], 0);
  if (sumaCantidad === 0) {
    Logger.log('Cantidad total 0 en las compras recientes de ' + idProducto + '; se omite el recálculo de costo.');
    return; // evita costo Infinity/NaN si las cantidades registradas son 0
  }
  const costoPonderado = sumaValor / sumaCantidad;

  const cat = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO);
  const catData = cat.getDataRange().getValues();
  for (let i = 1; i < catData.length; i++) {
    if (catData[i][0] === idProducto) {
      cat.getRange(i + 1, 5).setValue(costoPonderado);
      cat.getRange(i + 1, 6).setValue(new Date());
      break;
    }
  }
  actualizarCostosRecetasPorProducto(idProducto);
}

// ============================================
// 5. RECALCULAR COSTOS DE RECETAS (por local)
// ============================================
function actualizarCostosRecetasPorProducto(idProducto) {
  const costo = obtenerCostoActual(idProducto);
  HOJAS_RECETAS.forEach(nombreHoja => {
    const sh = SpreadsheetApp.getActive().getSheetByName(nombreHoja);
    if (!sh) return;
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][2] === idProducto) {
        sh.getRange(i + 1, 6).setValue(costo * data[i][3]); // Costo_Linea
      }
    }
  });
}

function obtenerCostoActual(idProducto) {
  const data = SpreadsheetApp.getActive().getSheetByName(SHEET_CATALOGO).getDataRange().getValues();
  for (let i = 1; i < data.length; i++) if (data[i][0] === idProducto) return data[i][4];
  return 0;
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
  ScriptApp.getProjectTriggers().forEach(t => {
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
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditAlias') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditAlias')
    .forSpreadsheet(SpreadsheetApp.getActive().getId())
    .onEdit()
    .create();
  Logger.log('Trigger instalado sobre este archivo (Alias_Proveedores).');
}
```

---

## 4. Puesta en marcha (orden exacto)

Este script vive en un archivo **nuevo** (donde van a estar `Catalogo_Maestro`, `Alias_Proveedores`, etc.), separado del archivo original que tiene `Desglose_IA`. El código ya está preparado para esa separación: `SOURCE_SPREADSHEET_ID` apunta al archivo original.

1. Pegá todo el script en el editor de Apps Script del archivo **nuevo**.
2. Corré manualmente **`crearHojasIniciales`** una vez. Crea las 7 hojas con sus encabezados en este archivo.
3. Corré manualmente **`poblarCatalogoDesdeDesglose`** una vez. Abre `Desglose_IA` en el archivo original por ID, saca los productos únicos y llena `Catalogo_Maestro`.
4. Revisá `Catalogo_Maestro` — es tu lista real de productos, lista para que empieces a construir las recetas por local.
5. Corré manualmente **`instalarTriggerDesglose`** una vez — instala el trigger sobre el archivo original (no se puede hacer desde el menú Triggers de la UI porque ese menú solo ofrece este archivo).
6. Corré manualmente **`instalarTriggerAlias`** una vez — instala el trigger sobre este archivo.
7. La primera vez que corras `instalarTriggerDesglose` y `poblarCatalogoDesdeDesglose`, Google te va a pedir autorizar permisos sobre el archivo original — es normal, aceptalo (sos dueño de ambos archivos).

## 5. Decisiones ya tomadas

- **Base de costo**: precio unitario tal cual aparece en factura (sin ajustar por descuento ni impuesto).
- **Moneda**: solo CRC entra al costeo automático. Facturas en otra moneda caen en `Compras_Pendientes` para que decidas cómo tratarlas (tipo de cambio, exclusión, etc.) — evita que se mezclen precios en distinta moneda en el promedio ponderado.
- **Matching**: se compara sobre `Nombre normalizado` (fallback a `Producto` si viene vacío), acotado primero a la misma `Categoría`.
- **Fuente de datos**: hoja `Desglose_IA`, 18 columnas confirmadas.

## 6. Lo único pendiente de afinar

**Umbral 0.82** de auto-match: es un punto de partida razonable para nombres con abreviaturas de proveedores ticos. Lo ajustamos con datos reales una vez que corras las primeras facturas — si ves demasiados falsos positivos, lo subo; si hay demasiados pendientes, lo bajo.
