// Líneas de un Pedido — captura estructurada de la vendedora ANTES de
// facturar (Producción Operativa, 2026-07-28). "Capturar una sola vez": al
// facturar, cada línea se convierte en exactamente una OrdenProduccion
// (snapshot, ver facturacion — no se modifica facturacion.service.js, la
// construcción de `lineas` vive en pedidos.routes.js / este archivo).
import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";
import { requerirEstadoPedido } from "./pedidoEstado.service.js";
import { precioUnitarioParaCantidad, escalonAplicableProducto } from "./productos.service.js";

const ESTADOS_CON_LINEAS_EDITABLES = ["BORRADOR", "PENDIENTE"];

// Producto Maestro (2026-07-31): whitelist EXACTA y única de campos técnicos
// editables vía "Caso excepcional / modificación avanzada"
// (actualizarEspecificacionAvanzada). Nunca se valida contra un número
// contado — cualquier campo fuera de esta lista se rechaza.
export const CAMPOS_TECNICOS_EDITABLES = [
  "talla",
  "medidas",
  "tela",
  "tipoImpresion",
  "forro",
  "tiras",
  "insumos",
  "productoInternoId",
  "imagenReferenciaProduccionUrl",
  "moldeUrlSnapshot",
  "tiempoProduccionMinutosSnapshot",
  "instruccionesProduccionSnapshot",
];

// Normalización silenciosa (nunca cambia lo que el usuario quiso decir,
// solo colapsa espacios dobles/tabs y recorta las puntas) — "poliéster " y
// "poliéster  " dejan de ser dos valores distintos en el historial sin que
// nadie tenga que darse cuenta de que pasó algo. No toca mayúsculas/tildes:
// esa es información real que el usuario decide, no ruido de tipeo.
function limpiar(texto) {
  if (texto == null) return texto;
  const limpio = String(texto).replace(/\s+/g, " ").trim();
  return limpio || null;
}

// Normalización de COMPARACIÓN (OP agrupada por lote, 2026-07-29) — distinta
// de `limpiar()` de arriba: esta NUNCA se guarda ni se muestra, solo se usa
// para decidir si dos líneas "son el mismo valor operacional" al armar la
// clave de agrupación (ver ordenesProduccion.service.js). Colapsa espacios,
// ignora mayúsculas/minúsculas y acentos — "Poliéster sublimable",
// "POLIESTER SUBLIMABLE" y "poliéster  sublimable" comparan igual, pero el
// valor real guardado en la línea nunca se toca.
export function normalizarParaComparar(texto) {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function calcularSubtotal({ cantidad, precioUnitario }) {
  if (precioUnitario == null) return null;
  return Number(cantidad) * Number(precioUnitario);
}

// El pedido YA NO acepta cantidadTotal como input manual — se recalcula acá
// cada vez que una línea nace, cambia o desaparece.
async function recalcularCantidadTotal(tx, pedidoId) {
  const agregado = await tx.pedidoLinea.aggregate({
    where: { pedidoId },
    _sum: { cantidad: true },
  });
  await tx.pedido.update({
    where: { id: pedidoId },
    data: { cantidadTotal: agregado._sum.cantidad ?? 0, actualizadoEn: new Date() },
  });
}

async function obtenerPedidoDeLaEmpresa(tx, pedidoId, empresaId) {
  const pedido = await tx.pedido.findFirst({ where: { id: pedidoId, empresaId, eliminadoEn: null } });
  if (!pedido) throw new NoEncontradoError("Pedido no encontrado");
  return pedido;
}

function validarLinea({ producto, cantidad }) {
  if (!producto || !String(producto).trim()) {
    throw new ValidacionError("Cada línea requiere un producto o referencia");
  }
  if (!Number.isInteger(Number(cantidad)) || Number(cantidad) <= 0) {
    throw new ValidacionError("La cantidad de la línea debe ser un número entero mayor a 0");
  }
}

// "Primero sugerir, nunca obligar" (principio de diseño permanente, ver
// CLAUDE.md): NO es un catálogo cerrado — tela/color/etc. siguen siendo
// texto libre. Esto solo le devuelve a la vendedora los valores que la
// empresa YA escribió antes, para que reutilice en vez de retipear (y de
// paso, sin querer, reduce la variación de "poliéster"/"Poliester"/etc.).
// Sin tabla nueva: son valores distintos ya guardados en pedido_lineas.
const CAMPOS_SUGERIBLES = ["tela", "color", "tipoImpresion", "forro", "tiras", "insumos", "medidas"];

export async function listarSugerenciasTecnicas(empresaId) {
  const resultados = await Promise.all(
    CAMPOS_SUGERIBLES.map((campo) =>
      prisma.pedidoLinea.findMany({
        where: { empresaId, [campo]: { not: null } },
        select: { [campo]: true },
        distinct: [campo],
        orderBy: { [campo]: "asc" },
        take: 200,
      })
    )
  );
  const sugerencias = {};
  CAMPOS_SUGERIBLES.forEach((campo, i) => {
    sugerencias[campo] = resultados[i].map((fila) => fila[campo]).filter(Boolean);
  });
  return sugerencias;
}

// Reporte de calidad de datos (solo lectura, para el Administrador): mismos
// campos, pero con la CANTIDAD de veces que se usó cada valor — un valor con
// 1-2 ocurrencias frente a variantes con decenas es casi siempre un typo, no
// una decisión real. No borra ni corrige nada solo; es una lupa.
export async function obtenerCalidadDatosTecnicos(empresaId) {
  const resultados = await Promise.all(
    CAMPOS_SUGERIBLES.map((campo) =>
      prisma.pedidoLinea.groupBy({
        by: [campo],
        where: { empresaId, [campo]: { not: null } },
        _count: { [campo]: true },
      })
    )
  );
  const calidad = {};
  CAMPOS_SUGERIBLES.forEach((campo, i) => {
    calidad[campo] = resultados[i]
      .map((fila) => ({ valor: fila[campo], cantidad: fila._count[campo] }))
      .filter((f) => f.valor)
      .sort((a, b) => a.cantidad - b.cantidad || a.valor.localeCompare(b.valor));
  });
  return calidad;
}

export function listarLineas(pedidoId, empresaId) {
  return prisma.pedidoLinea.findMany({
    where: { pedidoId, empresaId },
    include: { archivosAdjuntos: true, prioridad: true, productoInterno: true },
    orderBy: { ordenVisualizacion: "asc" },
  });
}

// Lee el Producto Maestro CON BLOQUEO DE FILA (SELECT ... FOR UPDATE) dentro
// de la transacción de la línea — evita que una edición concurrente del
// producto (ej. un administrador cambiando la tela desde ProductoEdit en el
// mismo instante) produzca un snapshot a medio camino entre el valor viejo y
// el nuevo. Prisma no expone bloqueo de fila en su API normal, por eso es
// raw SQL — de ahí el mapeo manual snake_case -> camelCase debajo. Nunca se
// usa `prisma` (el cliente global) para esto: siempre `tx`, siempre dentro
// de la misma transacción que crea la línea (nunca una lectura suelta).
async function obtenerProductoMaestroBloqueado(tx, { empresaId, productoId }) {
  const filas = await tx.$queryRaw`
    SELECT * FROM productos WHERE id = ${productoId}::uuid AND empresa_id = ${empresaId}::uuid FOR UPDATE
  `;
  const fila = filas[0];
  if (!fila) return null;
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    eliminadoEn: fila.eliminado_en,
    productoInternoId: fila.producto_interno_id,
    talla: fila.talla,
    medidas: fila.medidas,
    tela: fila.tela,
    tipoImpresion: fila.tipo_impresion,
    forro: fila.forro,
    tiras: fila.tiras,
    insumosDescripcion: fila.insumos_descripcion,
    imagenReferenciaProduccionUrl: fila.imagen_referencia_produccion_url,
    moldeUrl: fila.molde_url,
    tiempoProduccionMinutos: fila.tiempo_produccion_minutos,
    instruccionesProduccion: fila.instrucciones_produccion,
    precioBase: fila.precio_base,
  };
}

// Validación ESTRUCTURAL del Producto Maestro, separada del armado del
// snapshot (Corrección 4, Paso 4): "existe/pertenece a la empresa/no está
// eliminado/su tiempo de producción es válido". Deliberadamente NO exige
// activo/publicadoCatalogo/disponible — verificado que ningún otro camino
// interno (obtenerProducto, listarProductos) exige eso hoy; inventar esa
// regla acá sería una regla comercial nueva, no una vigente.
function validarProductoMaestro(producto, empresaId) {
  if (!producto || producto.empresaId !== empresaId) {
    throw new NoEncontradoError("Producto no encontrado");
  }
  if (producto.eliminadoEn) {
    throw new ValidacionError("Este producto fue eliminado y ya no puede usarse en una línea nueva");
  }
  if (producto.tiempoProduccionMinutos != null && Number(producto.tiempoProduccionMinutos) <= 0) {
    throw new ValidacionError("El producto tiene un tiempo de producción inválido — corregilo antes de usarlo");
  }
}

// Punto ÚNICO de mapeo Producto -> snapshot de PedidoLinea (Paso 4). Lo usan
// insertarLineaEnTx hoy, y deberán reutilizarlo sin duplicar el mapeo: la
// futura conversión Solicitud->Pedido y la futura captura compacta.
// Lectura+validación+armado del snapshot son una sola unidad atómica: nunca
// se separan en llamadas independientes fuera de la transacción del llamador.
export async function construirSnapshotDesdeProducto(tx, { empresaId, productoId, cantidad }) {
  const producto = await obtenerProductoMaestroBloqueado(tx, { empresaId, productoId });
  validarProductoMaestro(producto, empresaId);

  const preciosVolumen = await tx.productoPrecioVolumen.findMany({
    where: { productoId: producto.id },
    orderBy: { cantidadMinima: "asc" },
  });
  const productoConPrecios = { ...producto, preciosVolumen };
  const escalonAplicado = escalonAplicableProducto(productoConPrecios, cantidad);
  const precioSugerido = precioUnitarioParaCantidad(productoConPrecios, cantidad);

  const snapshot = {
    productoId: producto.id,
    producto: producto.nombre,
    productoCodigo: producto.codigo,
    talla: producto.talla,
    medidas: producto.medidas,
    tela: producto.tela,
    tipoImpresion: producto.tipoImpresion,
    forro: producto.forro,
    tiras: producto.tiras,
    insumos: producto.insumosDescripcion,
    productoInternoId: producto.productoInternoId,
    imagenReferenciaProduccionUrl: producto.imagenReferenciaProduccionUrl,
    moldeUrlSnapshot: producto.moldeUrl,
    tiempoProduccionMinutosSnapshot: producto.tiempoProduccionMinutos,
    instruccionesProduccionSnapshot: producto.instruccionesProduccion,
    especificacionModificadaManualmente: false,
  };

  return { snapshot, precioSugerido, escalonAplicado };
}

// Inserción cruda, sin transacción propia ni chequeo de estado — la usa
// crearLinea() (con sus propios checks) y pedidos.service.js.crearPedido()
// (que crea el pedido y su primera línea juntos, en la misma transacción:
// pedidos.cantidad_total tiene un CHECK > 0 en la BD real, así que un pedido
// nunca puede nacer sin al menos una línea).
//
// Contrato preparado para la futura captura compacta (Paso 4, ajuste 5):
// cuando datos.productoId llega, el backend arma la línea completa y
// SIEMPRE ignora cualquier dato técnico que el payload haya mandado para
// esos campos — el servidor es la única fuente de verdad. La UI futura solo
// necesitará mandar productoId + cantidad + observaciones + precio (cuando
// corresponda) para obtener el mismo resultado que hoy arma esta función.
export async function insertarLineaEnTx(tx, { empresaId, pedidoId, ordenVisualizacion, usuarioId, datos }) {
  let datosFinales = datos;

  if (datos.productoId) {
    const cantidad = Number(datos.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new ValidacionError("La cantidad de la línea debe ser un número entero mayor a 0");
    }

    const { snapshot, precioSugerido, escalonAplicado } = await construirSnapshotDesdeProducto(tx, {
      empresaId,
      productoId: datos.productoId,
      cantidad,
    });

    // Override de precio: solo se honra si quien llama ya verificó el
    // permiso (ver pedidos.routes.js -> permiteOverridePrecio, calculado con
    // tienePermiso(req, "editar_pedido")) — nunca porque el payload lo pidió.
    const huboOverride = !!datos.permiteOverridePrecio && datos.precioUnitario != null;
    const precioFinal = huboOverride ? Number(datos.precioUnitario) : precioSugerido;

    // El snapshot se aplica DESPUÉS de `datos` a propósito: `datos` sigue
    // aportando lo variable normal (cantidad, descripcion, color,
    // observacionesProduccion, prioridadId, separarEnOtraOp) pero cualquier
    // campo técnico que el payload haya intentado mandar queda pisado acá,
    // sin excepción.
    datosFinales = { ...datos, ...snapshot, cantidad, precioUnitario: precioFinal };

    if (huboOverride && precioFinal !== precioSugerido) {
      await tx.auditoriaSistema.create({
        data: {
          empresaId,
          usuarioId,
          accion: "pedido_linea.precio_override",
          detalle: {
            productoId: datos.productoId,
            cantidad,
            escalaUtilizada: escalonAplicado
              ? { cantidadMinima: escalonAplicado.cantidadMinima, precioUnitario: Number(escalonAplicado.precioUnitario) }
              : "precioBase",
            precioSugerido,
            precioFinal,
          },
        },
      });
    }
  }

  validarLinea(datosFinales);
  const linea = await tx.pedidoLinea.create({
    data: {
      empresaId,
      pedidoId,
      ordenVisualizacion,
      productoId: datosFinales.productoId || null,
      productoInternoId: datosFinales.productoInternoId || null,
      producto: limpiar(datosFinales.producto),
      productoCodigo: datosFinales.productoCodigo ? limpiar(datosFinales.productoCodigo) : null,
      descripcion: limpiar(datosFinales.descripcion),
      talla: limpiar(datosFinales.talla),
      cantidad: Number(datosFinales.cantidad),
      precioUnitario: datosFinales.precioUnitario != null ? Number(datosFinales.precioUnitario) : null,
      subtotal: calcularSubtotal(datosFinales),
      tela: limpiar(datosFinales.tela),
      color: limpiar(datosFinales.color),
      tipoImpresion: limpiar(datosFinales.tipoImpresion),
      forro: limpiar(datosFinales.forro),
      tiras: limpiar(datosFinales.tiras),
      insumos: limpiar(datosFinales.insumos),
      medidas: limpiar(datosFinales.medidas),
      observacionesProduccion: limpiar(datosFinales.observacionesProduccion),
      prioridadId: datosFinales.prioridadId ? Number(datosFinales.prioridadId) : null,
      separarEnOtraOp: !!datosFinales.separarEnOtraOp,
      imagenReferenciaProduccionUrl: datosFinales.imagenReferenciaProduccionUrl || null,
      moldeUrlSnapshot: datosFinales.moldeUrlSnapshot || null,
      tiempoProduccionMinutosSnapshot: datosFinales.tiempoProduccionMinutosSnapshot ?? null,
      instruccionesProduccionSnapshot: datosFinales.instruccionesProduccionSnapshot
        ? limpiar(datosFinales.instruccionesProduccionSnapshot)
        : null,
      especificacionModificadaManualmente: false,
    },
  });

  if (Array.isArray(datos.archivos)) {
    for (const archivo of datos.archivos) {
      await tx.archivoAdjunto.create({
        data: {
          empresaId,
          pedidoLineaId: linea.id,
          esPrincipal: !!archivo.esPrincipal,
          nombre: archivo.nombre,
          tipo: archivo.tipo,
          tamano: archivo.tamano,
          ubicacion: archivo.ubicacion,
          usuarioId,
        },
      });
    }
  }

  return linea;
}

export async function crearLinea(pedidoId, empresaId, usuarioId, datos) {
  return prisma.$transaction(async (tx) => {
    await obtenerPedidoDeLaEmpresa(tx, pedidoId, empresaId);
    await requerirEstadoPedido(
      tx,
      pedidoId,
      ESTADOS_CON_LINEAS_EDITABLES,
      "No se pueden agregar líneas a un pedido que ya fue facturado"
    );

    const maxOrden = await tx.pedidoLinea.aggregate({ where: { pedidoId }, _max: { ordenVisualizacion: true } });
    const linea = await insertarLineaEnTx(tx, {
      empresaId,
      pedidoId,
      ordenVisualizacion: (maxOrden._max.ordenVisualizacion ?? -1) + 1,
      usuarioId,
      datos,
    });

    await recalcularCantidadTotal(tx, pedidoId);
    return tx.pedidoLinea.findUnique({ where: { id: linea.id }, include: { archivosAdjuntos: true } });
  }, TRANSACTION_OPTIONS);
}

export async function actualizarLinea(lineaId, empresaId, datos) {
  return prisma.$transaction(async (tx) => {
    const actual = await tx.pedidoLinea.findFirst({ where: { id: lineaId, empresaId } });
    if (!actual) throw new NoEncontradoError("Línea no encontrada");
    await requerirEstadoPedido(
      tx,
      actual.pedidoId,
      ESTADOS_CON_LINEAS_EDITABLES,
      "No se pueden editar líneas de un pedido que ya fue facturado"
    );

    const fusionado = { producto: actual.producto, cantidad: actual.cantidad, ...datos };
    validarLinea(fusionado);

    const linea = await tx.pedidoLinea.update({
      where: { id: lineaId },
      data: {
        productoInternoId: datos.productoInternoId !== undefined ? datos.productoInternoId || null : undefined,
        producto: datos.producto !== undefined ? limpiar(datos.producto) : undefined,
        descripcion: datos.descripcion !== undefined ? limpiar(datos.descripcion) : undefined,
        talla: datos.talla !== undefined ? limpiar(datos.talla) : undefined,
        cantidad: datos.cantidad !== undefined ? Number(datos.cantidad) : undefined,
        precioUnitario: datos.precioUnitario !== undefined ? (datos.precioUnitario != null ? Number(datos.precioUnitario) : null) : undefined,
        subtotal: calcularSubtotal(fusionado),
        tela: datos.tela !== undefined ? limpiar(datos.tela) : undefined,
        color: datos.color !== undefined ? limpiar(datos.color) : undefined,
        tipoImpresion: datos.tipoImpresion !== undefined ? limpiar(datos.tipoImpresion) : undefined,
        forro: datos.forro !== undefined ? limpiar(datos.forro) : undefined,
        tiras: datos.tiras !== undefined ? limpiar(datos.tiras) : undefined,
        insumos: datos.insumos !== undefined ? limpiar(datos.insumos) : undefined,
        medidas: datos.medidas !== undefined ? limpiar(datos.medidas) : undefined,
        observacionesProduccion:
          datos.observacionesProduccion !== undefined ? limpiar(datos.observacionesProduccion) : undefined,
        prioridadId: datos.prioridadId !== undefined ? (datos.prioridadId ? Number(datos.prioridadId) : null) : undefined,
        separarEnOtraOp: datos.separarEnOtraOp !== undefined ? !!datos.separarEnOtraOp : undefined,
        actualizadoEn: new Date(),
      },
    });

    await recalcularCantidadTotal(tx, actual.pedidoId);
    return tx.pedidoLinea.findUnique({ where: { id: linea.id }, include: { archivosAdjuntos: true } });
  });
}

// "Caso excepcional / modificación avanzada" (Paso 4) — la ÚNICA vía
// autorizada para tocar los 12 campos técnicos del snapshot después de
// creada la línea. Deliberadamente separada de actualizarLinea: esa sigue
// gobernando cantidad/precio/observaciones/prioridad/separarEnOtraOp sin
// tocar nunca especificacionModificadaManualmente ni escribir auditoría
// técnica. Ruta protegida por permiso editar_especificacion_avanzada (ver
// pedidos.routes.js) — acá solo se asume que quien llama ya lo verificó.
export async function actualizarEspecificacionAvanzada(lineaId, empresaId, usuarioId, cambios) {
  const camposInvalidos = Object.keys(cambios).filter((campo) => !CAMPOS_TECNICOS_EDITABLES.includes(campo));
  if (camposInvalidos.length > 0) {
    throw new ValidacionError(`Campo(s) no editables por esta vía: ${camposInvalidos.join(", ")}`);
  }
  if (
    cambios.tiempoProduccionMinutosSnapshot !== undefined &&
    cambios.tiempoProduccionMinutosSnapshot !== null &&
    (!Number.isInteger(Number(cambios.tiempoProduccionMinutosSnapshot)) || Number(cambios.tiempoProduccionMinutosSnapshot) <= 0)
  ) {
    throw new ValidacionError("El tiempo de producción debe ser un número entero mayor a 0");
  }

  return prisma.$transaction(async (tx) => {
    const actual = await tx.pedidoLinea.findFirst({ where: { id: lineaId, empresaId } });
    if (!actual) throw new NoEncontradoError("Línea no encontrada");

    const datosActualizar = {};
    let huboCambioReal = false;

    for (const campo of CAMPOS_TECNICOS_EDITABLES) {
      if (!(campo in cambios)) continue;
      const valorNuevo = typeof cambios[campo] === "string" ? limpiar(cambios[campo]) : cambios[campo] ?? null;
      const valorAnterior = actual[campo];
      // Caso 10: mismo valor enviado -> ni auditoría ni escritura.
      if (valorNuevo === valorAnterior || (valorNuevo == null && valorAnterior == null)) continue;

      huboCambioReal = true;
      datosActualizar[campo] = valorNuevo;
      await tx.auditoriaSistema.create({
        data: {
          empresaId,
          usuarioId,
          accion: "pedido_linea.especificacion_modificada",
          detalle: { pedidoLineaId: lineaId, campo, valorAnterior, valorNuevo },
        },
      });
    }

    if (!huboCambioReal) return actual;

    return tx.pedidoLinea.update({
      where: { id: lineaId },
      data: { ...datosActualizar, especificacionModificadaManualmente: true, actualizadoEn: new Date() },
    });
  }, TRANSACTION_OPTIONS);
}

export async function duplicarLinea(lineaId, empresaId) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.pedidoLinea.findFirst({ where: { id: lineaId, empresaId } });
    if (!original) throw new NoEncontradoError("Línea no encontrada");
    await requerirEstadoPedido(
      tx,
      original.pedidoId,
      ESTADOS_CON_LINEAS_EDITABLES,
      "No se pueden duplicar líneas de un pedido que ya fue facturado"
    );

    const maxOrden = await tx.pedidoLinea.aggregate({
      where: { pedidoId: original.pedidoId },
      _max: { ordenVisualizacion: true },
    });

    const copia = await tx.pedidoLinea.create({
      data: {
        empresaId,
        pedidoId: original.pedidoId,
        ordenVisualizacion: (maxOrden._max.ordenVisualizacion ?? -1) + 1,
        productoInternoId: original.productoInternoId,
        producto: original.producto,
        descripcion: original.descripcion,
        talla: original.talla,
        cantidad: original.cantidad,
        precioUnitario: original.precioUnitario,
        subtotal: original.subtotal,
        tela: original.tela,
        color: original.color,
        tipoImpresion: original.tipoImpresion,
        forro: original.forro,
        tiras: original.tiras,
        insumos: original.insumos,
        medidas: original.medidas,
        observacionesProduccion: original.observacionesProduccion,
        prioridadId: original.prioridadId,
        separarEnOtraOp: original.separarEnOtraOp,
      },
    });

    // Duplicar también los archivos (misma ubicación en Storage, no se
    // vuelve a subir el archivo — solo la fila de metadata).
    const archivosOriginales = await tx.archivoAdjunto.findMany({ where: { pedidoLineaId: original.id } });
    for (const archivo of archivosOriginales) {
      await tx.archivoAdjunto.create({
        data: {
          empresaId,
          pedidoLineaId: copia.id,
          esPrincipal: archivo.esPrincipal,
          nombre: archivo.nombre,
          tipo: archivo.tipo,
          tamano: archivo.tamano,
          ubicacion: archivo.ubicacion,
          usuarioId: archivo.usuarioId,
        },
      });
    }

    await recalcularCantidadTotal(tx, original.pedidoId);
    return tx.pedidoLinea.findUnique({ where: { id: copia.id }, include: { archivosAdjuntos: true } });
  });
}

export async function eliminarLinea(lineaId, empresaId) {
  return prisma.$transaction(async (tx) => {
    const linea = await tx.pedidoLinea.findFirst({ where: { id: lineaId, empresaId } });
    if (!linea) throw new NoEncontradoError("Línea no encontrada");
    await requerirEstadoPedido(
      tx,
      linea.pedidoId,
      ESTADOS_CON_LINEAS_EDITABLES,
      "No se pueden quitar líneas de un pedido que ya fue facturado"
    );

    await tx.archivoAdjunto.deleteMany({ where: { pedidoLineaId: lineaId } });
    await tx.pedidoLinea.delete({ where: { id: lineaId } });
    await recalcularCantidadTotal(tx, linea.pedidoId);
  });
}

// Usado por el flujo de Facturar: arma el arreglo `lineas` que espera
// facturacion.service.js (SIN modificar ese archivo) a partir de lo que la
// vendedora ya capturó + la asignación de responsable que decide el
// Administrador en el momento de facturar.
// Hallazgo de fricción real (auditoría "pulido Enterprise → eliminar
// fricción"): la vendedora ya elige una Prioridad a nivel de CABECERA del
// pedido en Nuevo Pedido, pero eso no bajaba nunca a la línea — si ella no
// repetía la misma elección línea por línea, el Administrador quedaba
// obligado a volver a seleccionar Prioridad por cada línea al facturar, un
// dato que en la mayoría de los casos ya existía. Ahora la cabecera es el
// último fallback: línea > asignación del Administrador > cabecera del
// pedido. Sigue permitiendo prioridades distintas por línea cuando de verdad
// se necesitan, solo deja de forzar una repetición cuando no hace falta.
export async function construirLineasParaFacturar(pedidoId, empresaId, asignaciones) {
  const [lineas, pedido] = await Promise.all([
    listarLineas(pedidoId, empresaId),
    prisma.pedido.findFirst({ where: { id: pedidoId, empresaId }, select: { prioridadId: true } }),
  ]);
  if (lineas.length === 0) {
    throw new ValidacionError("El pedido no tiene líneas — agrega al menos una antes de facturar");
  }
  const porId = new Map((asignaciones || []).map((a) => [a.lineaId, a]));
  return lineas.map((linea) => {
    const asignacion = porId.get(linea.id) || {};
    if (!asignacion.responsableUsuarioId && !asignacion.responsableExterno) {
      throw new ValidacionError(`Falta asignar un responsable a la línea "${linea.producto}"`);
    }
    const prioridadId = linea.prioridadId || asignacion.prioridadId || pedido?.prioridadId || undefined;
    if (!prioridadId) {
      throw new ValidacionError(`Falta asignar una prioridad a la línea "${linea.producto}"`);
    }
    return {
      pedidoLineaId: linea.id,
      producto: linea.producto,
      cantidad: linea.cantidad,
      precioUnitario: linea.precioUnitario != null ? Number(linea.precioUnitario) : undefined,
      productoInternoId: linea.productoInternoId || undefined,
      prioridadId,
      tipoTrabajo: linea.tipoImpresion || undefined,
      medida: linea.medidas || undefined,
      observaciones: linea.observacionesProduccion || undefined,
      // Snapshot técnico — ver comentario en OrdenProduccion.descripcion.
      descripcion: linea.descripcion,
      talla: linea.talla,
      tela: linea.tela,
      color: linea.color,
      tipoImpresion: linea.tipoImpresion,
      forro: linea.forro,
      tiras: linea.tiras,
      insumos: linea.insumos,
      responsableUsuarioId: asignacion.responsableUsuarioId || undefined,
      responsableExterno: asignacion.responsableExterno || undefined,
      // OP agrupada por lote (2026-07-29): clave de agrupación y override manual.
      separarEnOtraOp: !!linea.separarEnOtraOp,
    };
  });
}
