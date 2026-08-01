import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { NoEncontradoError, ValidacionError, PermisoDenegadoError } from "./errors.js";
import { siguienteNumero } from "./numeracion.service.js";
import { on, emit } from "../events/eventBus.js";
import { PEDIDO_FACTURADO, ORDEN_CREADA, ORDEN_ETAPA_CAMBIADA, ORDEN_CERRADA } from "../events/eventos.js";
import { obtenerEstadoPedido, cambiarEstadoPedido } from "./pedidoEstado.service.js";
import { normalizarParaComparar } from "./pedidoLineas.service.js";

const INCLUDE_LISTA = {
  pedido: { select: { id: true, pedId: true, clienteNombre: true, fechaCompromiso: true } },
  empresa: { select: { id: true, nombre: true } },
  etapa: true,
  prioridad: true,
  responsableUsuario: { select: { id: true, nombre: true } },
  // Cantidad de variantes agrupadas en esta OP (Corrección de presentación,
  // "OP agrupada por lote") — la lista solo necesita el conteo, no el detalle.
  _count: { select: { variantes: true } },
};

// Indicador de situación de entrega. Mismo criterio de "Atrasado"/"A tiempo"
// que ya usa v_ordenes_produccion_estado (no se toca esa vista — es un
// objeto de base de datos y este sprint no modifica nada de schema), pero
// con un escalón intermedio ("Próximo a vencer") que el CEO pidió y la
// vista no tiene. Se calcula en la app, no en SQL.
export function calcularSituacionEntrega({ fechaEntregaReal, fechaCompromiso }) {
  if (fechaEntregaReal) return "Entregado";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const compromiso = new Date(fechaCompromiso);
  compromiso.setHours(0, 0, 0, 0);
  const diasRestantes = Math.round((compromiso - hoy) / 86400000);

  if (diasRestantes < 0) return "Atrasado";
  if (diasRestantes <= 2) return "Urgente";
  if (diasRestantes <= 5) return "Próximo a vencer";
  return "A tiempo";
}

function conSituacion(orden) {
  return {
    ...orden,
    situacion: calcularSituacionEntrega({
      fechaEntregaReal: orden.fechaEntregaReal,
      fechaCompromiso: orden.pedido.fechaCompromiso,
    }),
  };
}

export async function listarOrdenesProduccion(
  empresaId,
  { etapaId, prioridadId, responsableUsuarioId, pedidoCreadoPorId, busqueda } = {}
) {
  const where = { empresaId, eliminadoEn: null };
  if (etapaId) where.etapaId = Number(etapaId);
  if (prioridadId) where.prioridadId = Number(prioridadId);
  if (responsableUsuarioId) where.responsableUsuarioId = responsableUsuarioId;
  // Vendedora (ver_estado_produccion_de_sus_pedidos, sin ver_todas_las_ordenes):
  // ve las órdenes de los pedidos que ELLA creó, no las que tiene asignadas
  // como responsable — es una dimensión de alcance distinta a la de OPERADOR.
  if (pedidoCreadoPorId) where.pedido = { creadoPorId: pedidoCreadoPorId };
  if (busqueda) {
    const texto = busqueda.trim();
    if (texto) {
      where.OR = [
        { opId: { contains: texto, mode: "insensitive" } },
        { producto: { contains: texto, mode: "insensitive" } },
        { pedido: { is: { pedId: { contains: texto, mode: "insensitive" } } } },
        { pedido: { is: { clienteNombre: { contains: texto, mode: "insensitive" } } } },
        { responsableUsuario: { is: { nombre: { contains: texto, mode: "insensitive" } } } },
        { responsableExterno: { contains: texto, mode: "insensitive" } },
      ];
    }
  }

  const ordenes = await prisma.ordenProduccion.findMany({
    where,
    include: INCLUDE_LISTA,
    // Orden por defecto operativo (hallazgo del shadowing: sin esto, cada
    // operador tenía que escanear la columna Prioridad a ojo o aplicar el
    // chip "Solo urgentes" cada vez). Más urgente primero (peso 1 = Urgente),
    // y entre igual prioridad, la que vence antes. No es un "ORDER BY"
    // decorativo — es la diferencia entre trabajar lo correcto primero o no.
    orderBy: [{ prioridad: { peso: "asc" } }, { pedido: { fechaCompromiso: "asc" } }],
  });
  return ordenes.map(conSituacion);
}

// A partir de la bitácora (creacion + cambio_etapa) reconstruye cuánto
// tiempo pasó la orden en cada etapa. No requiere ninguna columna nueva:
// la fecha de entrada a la primera etapa es `creadoEn`, y cada evento
// cambio_etapa marca la entrada a la siguiente.
function calcularTiemposPorEtapa(orden) {
  const creacion = orden.bitacoraEventos.find((e) => e.tipoEvento === "creacion");
  const cambios = orden.bitacoraEventos
    .filter((e) => e.tipoEvento === "cambio_etapa")
    .slice()
    .sort((a, b) => new Date(a.ocurridoEn) - new Date(b.ocurridoEn));

  const puntos =
    cambios.length > 0
      ? [
          { etapa: cambios[0].valorAnterior, desde: orden.creadoEn, responsable: creacion?.usuario?.nombre },
          ...cambios.map((c) => ({ etapa: c.valorNuevo, desde: c.ocurridoEn, responsable: c.usuario?.nombre })),
        ]
      : [{ etapa: orden.etapa.nombre, desde: orden.creadoEn, responsable: creacion?.usuario?.nombre }];

  return puntos.map((punto, i) => {
    const siguiente = puntos[i + 1];
    const desde = new Date(punto.desde);
    const hasta = siguiente ? new Date(siguiente.desde) : new Date();
    return {
      etapa: punto.etapa,
      responsable: punto.responsable ?? null,
      desde: punto.desde,
      hasta: siguiente ? siguiente.desde : null,
      duracionMinutos: Math.round((hasta - desde) / 60000),
    };
  });
}

// Un usuario sin ver_todas_las_ordenes (ej. OPERADOR) solo puede ver/actuar
// sobre órdenes donde es el responsable asignado. Centralizado acá para que
// obtenerOrdenProduccion y cambiarEtapaOrden apliquen exactamente la misma regla.
function verificarAccesoOrden(orden, usuario) {
  const permisos = usuario.rol?.permisos;
  if (permisos?.ver_todas_las_ordenes) return;
  // Vendedora: puede ver el detalle (solo lectura) de las órdenes que nacen
  // de un pedido que ELLA creó — dimensión de alcance distinta a "soy el
  // responsable asignado".
  if (permisos?.ver_estado_produccion_de_sus_pedidos && orden.pedido?.creadoPorId === usuario.id) {
    return;
  }
  if (orden.responsableUsuarioId !== usuario.id) {
    throw new PermisoDenegadoError("Esta orden no está asignada a tu usuario");
  }
}

// Roles como OPERADOR_CORTE_PLANCHADO tienen cambiar_etapa: true pero
// restringido a un subconjunto del pipeline (rol.permisos.etapasPermitidas,
// un array de nombres de Etapa). Sin esa clave, cualquier etapa vale — mismo
// comportamiento de siempre para ADMINISTRADOR/SUPERVISOR/OPERADOR genérico.
function verificarEtapaPermitida(usuario, nuevaEtapa) {
  const etapasPermitidas = usuario.rol?.permisos?.etapasPermitidas;
  if (!Array.isArray(etapasPermitidas)) return;
  if (!etapasPermitidas.includes(nuevaEtapa.nombre)) {
    throw new PermisoDenegadoError(
      `Tu rol solo puede avanzar las etapas: ${etapasPermitidas.join(", ")}`
    );
  }
}

export async function obtenerOrdenProduccion(id, empresaId, usuario) {
  const orden = await prisma.ordenProduccion.findFirst({
    where: { id, empresaId, eliminadoEn: null },
    include: {
      pedido: {
        include: {
          creadoPor: { select: { id: true, nombre: true } },
          cliente: { select: { id: true, telefono: true, email: true } },
        },
      },
      empresa: { select: { id: true, nombre: true } },
      etapa: true,
      prioridad: true,
      responsableUsuario: { select: { id: true, nombre: true } },
      bitacoraEventos: {
        orderBy: { ocurridoEn: "desc" },
        include: { usuario: { select: { id: true, nombre: true } } },
      },
      // Snapshot legacy (imagen/adjuntos copiados 1:1 en el viejo modelo).
      // Se mantiene para OP creadas antes de la agrupación por lote; si la
      // OP ya tiene variantes, la vista usa esas y no esto (ver abajo).
      archivosAdjuntos: true,
      // Camino de lectura real ("OP agrupada por lote", 2026-07-29): cada
      // variante es la PedidoLinea comercial tal cual, con su propia imagen/
      // archivos — nunca una copia. Talla/color/medida/descripción viven acá,
      // no en columnas escalares de la OP.
      variantes: {
        orderBy: { ordenVisualizacion: "asc" },
        include: { archivosAdjuntos: true },
      },
    },
  });
  if (!orden) throw new NoEncontradoError("Orden de producción no encontrada");
  verificarAccesoOrden(orden, usuario);
  return conSituacion({ ...orden, tiemposPorEtapa: calcularTiemposPorEtapa(orden) });
}

function validarLineas(lineas) {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new ValidacionError("Debe indicar al menos una línea de producción");
  }
  for (const linea of lineas) {
    if (!linea.producto || !String(linea.producto).trim()) {
      throw new ValidacionError("Cada línea requiere un producto");
    }
    if (!Number.isInteger(linea.cantidad) || linea.cantidad <= 0) {
      throw new ValidacionError("Cada línea requiere una cantidad entera mayor a 0");
    }
    if (!linea.prioridadId) {
      throw new ValidacionError("Cada línea requiere una prioridad");
    }
    const interno = !!linea.responsableUsuarioId;
    const externo = !!linea.responsableExterno;
    if (interno === externo) {
      throw new ValidacionError(
        "Cada línea requiere exactamente un responsable: interno (usuario) o externo (texto), no ambos ni ninguno"
      );
    }
  }
}

const ETAPA_INICIAL_NOMBRE = "Pedido recibido";

// Clave de agrupación (OP agrupada por lote, 2026-07-29, propuesta aprobada
// "Orden de Producción agrupada por lote"): dos líneas del MISMO pedido
// entran a la MISMA OP si coinciden en producto/tela/tipo de impresión/
// prioridad/responsable. Imagen, talla, color, medida, nombre/número
// personalizado, descripción y observaciones NUNCA entran acá — pueden
// variar libremente dentro del mismo lote. Una línea con separarEnOtraOp
// nunca se agrupa con nadie, sin importar qué tan bien coincida.
function claveDeGrupo(linea) {
  if (linea.separarEnOtraOp) return `solo:${linea.pedidoLineaId}`;
  const producto = linea.productoInternoId || normalizarParaComparar(linea.producto);
  const responsable = linea.responsableUsuarioId
    ? `usuario:${linea.responsableUsuarioId}`
    : `externo:${normalizarParaComparar(linea.responsableExterno)}`;
  return [
    producto,
    normalizarParaComparar(linea.tela),
    normalizarParaComparar(linea.tipoImpresion),
    linea.prioridadId,
    responsable,
  ].join("||");
}

// Suma la cantidad de todas las variantes vinculadas — se recalcula (no se
// asume) cada vez que se agrega una línea a una OP ya existente, para que
// ordenProduccion.cantidad nunca pueda desalinearse de sus variantes reales.
async function recalcularCantidadOrden(tx, ordenProduccionId) {
  const agregado = await tx.pedidoLinea.aggregate({
    where: { ordenProduccionId },
    _sum: { cantidad: true },
  });
  await tx.ordenProduccion.update({
    where: { id: ordenProduccionId },
    data: { cantidad: agregado._sum.cantidad ?? 0, actualizadoEn: new Date() },
  });
}

// Reacciona a PEDIDO_FACTURADO agrupando las líneas del pedido en lotes
// productivos reales (una OP por grupo, no por línea), dentro de la misma
// transacción que abrió FacturacionService. Producción sigue siendo dueño
// de esta lógica; Facturación no sabe nada de agrupación.
async function crearOrdenesDesdeLineas({ tx, pedido, empresaId, usuarioId, lineas }) {
  validarLineas(lineas);

  const etapaInicial = await tx.etapa.findFirst({ where: { nombre: ETAPA_INICIAL_NOMBRE } });
  if (!etapaInicial) {
    throw new Error(`Falta configurar la etapa inicial "${ETAPA_INICIAL_NOMBRE}" en el catálogo de etapas`);
  }

  // Idempotencia (OP agrupada, 2026-07-28→2026-07-29): el ancla ya NO es "la
  // línea tiene pedidoLineaId único en ordenes_produccion" — es "¿a qué OP
  // apunta ya pedido_lineas.orden_produccion_id?". Se consultan las OP ya
  // existentes del pedido (con sus variantes vinculadas) para no repetir
  // numeración de opId en un reproceso parcial y para saber, por línea, si
  // ya pertenece a una OP.
  const ordenesExistentes = await tx.ordenProduccion.findMany({
    where: { pedidoId: pedido.id },
    include: { variantes: { select: { id: true } } },
  });
  const opIdsUsados = ordenesExistentes.map((o) => o.opId);
  const opDeLinea = new Map();
  for (const orden of ordenesExistentes) {
    for (const variante of orden.variantes) opDeLinea.set(variante.id, orden.id);
  }

  // Agrupar las líneas de ESTA facturación por clave operativa.
  const grupos = new Map();
  for (const linea of lineas) {
    const clave = claveDeGrupo(linea);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(linea);
  }

  const ordenesCreadas = [];

  for (const lineasDelGrupo of grupos.values()) {
    const opsDelGrupo = new Set(
      lineasDelGrupo.map((l) => opDeLinea.get(l.pedidoLineaId)).filter(Boolean)
    );

    // CORRECCIÓN 3 (idempotencia segura): si el reproceso encuentra líneas
    // del mismo grupo apuntando a DOS o más OP distintas, nunca se fusiona
    // automáticamente — se preserva todo tal cual y se deja constancia
    // explícita en la bitácora de cada OP involucrada.
    if (opsDelGrupo.size > 1) {
      const idsInvolucrados = [...opsDelGrupo];
      console.error(
        `[produccion] conflicto de agrupación en pedido ${pedido.pedId}: las líneas de un mismo grupo ya ` +
          `apuntan a ${idsInvolucrados.length} OP distintas (${idsInvolucrados.join(", ")}). No se fusiona — se preservan todas.`
      );
      for (const ordenId of idsInvolucrados) {
        await tx.bitacoraEvento.create({
          data: {
            ordenProduccionId: ordenId,
            empresaId,
            tipoEvento: "conflicto_agrupacion",
            campoAfectado: "Agrupación de variantes",
            valorAnterior: null,
            valorNuevo: `Reproceso encontró líneas del mismo grupo repartidas en ${idsInvolucrados.length} OP — revisar manualmente`,
            usuarioId,
          },
        });
      }
      continue;
    }

    if (opsDelGrupo.size === 1) {
      // Reutilizar la OP existente — vincular las líneas del grupo que aún
      // no lo estén (reproceso parcial), sin crear nada nuevo ni re-emitir
      // ORDEN_CREADA otra vez.
      const [ordenId] = opsDelGrupo;
      const lineasSinVincular = lineasDelGrupo.filter((l) => l.pedidoLineaId && !opDeLinea.has(l.pedidoLineaId));
      if (lineasSinVincular.length > 0) {
        for (const l of lineasSinVincular) {
          await tx.pedidoLinea.update({ where: { id: l.pedidoLineaId }, data: { ordenProduccionId: ordenId } });
        }
        await recalcularCantidadOrden(tx, ordenId);
      }
      continue;
    }

    // Ninguna línea del grupo tiene OP todavía — crear una nueva para todo
    // el grupo (1 línea = mismo comportamiento visible de antes; N líneas =
    // el lote agrupado real).
    const primeraLinea = lineasDelGrupo[0];
    const cantidadTotal = lineasDelGrupo.reduce((s, l) => s + Number(l.cantidad || 0), 0);
    const opId = siguienteNumero(opIdsUsados, pedido.pedId, 2);
    opIdsUsados.push(opId);

    const orden = await tx.ordenProduccion.create({
      data: {
        pedidoId: pedido.id,
        empresaId,
        opId,
        producto: primeraLinea.producto.trim(),
        cantidad: cantidadTotal,
        tipoTrabajo: primeraLinea.tipoTrabajo?.trim() || null,
        medida: primeraLinea.medida?.trim() || null,
        observaciones: primeraLinea.observaciones?.trim() || null,
        etapaId: etapaInicial.id,
        prioridadId: primeraLinea.prioridadId,
        responsableUsuarioId: primeraLinea.responsableUsuarioId || null,
        responsableExterno: primeraLinea.responsableExterno || null,
        // Enlace al Catálogo Interno (Facturador Administrativo): de esto
        // depende inventarioConsumo.service.js para saber qué BOM consumir
        // al llegar a Corte. NULL si la línea no eligió un producto del
        // catálogo — esa orden simplemente no consumirá inventario.
        productoInternoId: primeraLinea.productoInternoId || null,
        // Snapshot de COMPATIBILIDAD TEMPORAL (de la primera variante) — el
        // camino de lectura real es `variantes` (ver corrección 1 de la
        // propuesta aprobada); estas columnas ya no son la fuente de verdad.
        descripcion: primeraLinea.descripcion?.trim() || null,
        talla: primeraLinea.talla?.trim() || null,
        tela: primeraLinea.tela?.trim() || null,
        color: primeraLinea.color?.trim() || null,
        tipoImpresion: primeraLinea.tipoImpresion?.trim() || null,
        forro: primeraLinea.forro?.trim() || null,
        tiras: primeraLinea.tiras?.trim() || null,
        insumos: primeraLinea.insumos?.trim() || null,
        // Ancla legacy: solo se completa cuando el grupo es de 1 sola línea,
        // por compatibilidad de lectura antigua — no se usa para idempotencia.
        pedidoLineaId: lineasDelGrupo.length === 1 ? primeraLinea.pedidoLineaId || null : null,
      },
      include: { etapa: true, prioridad: true },
    });

    // Vincular TODAS las líneas del grupo a esta OP — el camino de lectura
    // real (variantes), no una copia. Ya no se duplican archivos_adjuntos
    // hacia la OP: la imagen/adjuntos de cada variante se leen directo de
    // su PedidoLinea (ver obtenerOrdenProduccion).
    for (const l of lineasDelGrupo) {
      if (l.pedidoLineaId) {
        await tx.pedidoLinea.update({ where: { id: l.pedidoLineaId }, data: { ordenProduccionId: orden.id } });
      }
    }

    await tx.bitacoraEvento.create({
      data: {
        ordenProduccionId: orden.id,
        empresaId,
        tipoEvento: "creacion",
        campoAfectado: "Orden de Producción",
        valorNuevo: `${orden.opId} (${lineasDelGrupo.length} variante${lineasDelGrupo.length === 1 ? "" : "s"})`,
        usuarioId,
      },
    });

    await emit(ORDEN_CREADA, { tx, orden, empresaId, usuarioId });

    ordenesCreadas.push(orden);
  }

  return ordenesCreadas;
}

on(PEDIDO_FACTURADO, crearOrdenesDesdeLineas);

// Nombre de la etapa que consideramos "todo lo que falta es despachar".
// Se busca por nombre (no por id/orden hardcodeado) para no depender de que
// nadie reordene el catálogo de etapas.
const ETAPA_LISTO_NOMBRE = "Listo para enviar o retirar";

// Reacciona a ORDEN_ETAPA_CAMBIADA para hacer avanzar automáticamente el
// estado del Pedido cuando corresponde (FACTURADO -> EN_PRODUCCION -> LISTO
// -> ENTREGADO). Es la contraparte de crearOrdenesDesdeLineas: así como
// Producción no conoce el interior de Facturación, el "gobierno del pedido"
// (pedidoEstado.service.js) no conoce el interior de Producción — es este
// listener, viviendo en Producción, el que cruza ambos mundos.
async function avanzarEstadoPedidoSegunEtapa({ tx, orden, empresaId, usuarioId }) {
  const estadoPedido = await obtenerEstadoPedido(tx, orden.pedidoId);

  const intentarTransicion = async (estadoNuevo) => {
    try {
      await cambiarEstadoPedido(tx, {
        pedidoId: orden.pedidoId,
        empresaId,
        usuarioId,
        estadoNuevo,
        automatico: true,
      });
    } catch (err) {
      // No es un error real: la condición se cumplió pero la transición ya
      // no aplica (ej. dos órdenes cambian de etapa casi al mismo tiempo).
      if (!(err instanceof ValidacionError)) throw err;
    }
  };

  if (estadoPedido === "FACTURADO" && orden.etapa.orden > 1) {
    await intentarTransicion("EN_PRODUCCION");
    return;
  }

  if (estadoPedido === "EN_PRODUCCION" || estadoPedido === "LISTO" || estadoPedido === "DESPACHADO") {
    const ordenesDelPedido = await tx.ordenProduccion.findMany({
      where: { pedidoId: orden.pedidoId, eliminadoEn: null },
      include: { etapa: true },
    });

    if (estadoPedido === "EN_PRODUCCION") {
      const etapaListo = await tx.etapa.findFirst({ where: { nombre: ETAPA_LISTO_NOMBRE } });
      if (etapaListo && ordenesDelPedido.every((o) => o.etapa.orden >= etapaListo.orden)) {
        await intentarTransicion("LISTO");
      }
      return;
    }

    const etapaFinal = await tx.etapa.aggregate({ _max: { orden: true } });
    if (ordenesDelPedido.every((o) => o.etapa.orden >= etapaFinal._max.orden)) {
      await intentarTransicion("ENTREGADO");
    }
  }
}

on(ORDEN_ETAPA_CAMBIADA, avanzarEstadoPedidoSegunEtapa);

// ---------------------------------------------------------------------------
// Sprint 7: ciclo de vida de la Orden de Producción
// ---------------------------------------------------------------------------

export async function cambiarEtapaOrden(ordenId, empresaId, usuario, nuevaEtapaId) {
  const usuarioId = usuario.id;
  return prisma.$transaction(async (tx) => {
    const orden = await tx.ordenProduccion.findFirst({
      where: { id: ordenId, empresaId, eliminadoEn: null },
      include: { etapa: true },
    });
    if (!orden) throw new NoEncontradoError("Orden de producción no encontrada");
    verificarAccesoOrden(orden, usuario);

    const nuevaEtapa = await tx.etapa.findUnique({ where: { id: Number(nuevaEtapaId) } });
    if (!nuevaEtapa) throw new ValidacionError("La etapa indicada no existe");
    verificarEtapaPermitida(usuario, nuevaEtapa);

    if (nuevaEtapa.id === orden.etapaId) {
      throw new ValidacionError(`La orden ya está en la etapa "${nuevaEtapa.nombre}"`);
    }
    // Solo se permite avanzar una etapa a la vez, en el orden configurado en
    // el catálogo. Esto impide saltos y retrocesos arbitrarios, y de paso
    // garantiza que no se pueda "cerrar" (llegar a la etapa final) una orden
    // que no pasó por todas las etapas intermedias.
    if (nuevaEtapa.orden !== orden.etapa.orden + 1) {
      throw new ValidacionError(
        `No se puede pasar de "${orden.etapa.nombre}" a "${nuevaEtapa.nombre}". Solo se puede avanzar a la siguiente etapa del pipeline, en orden.`
      );
    }

    const etapaMaxima = await tx.etapa.aggregate({ _max: { orden: true } });
    const esEtapaFinal = nuevaEtapa.orden === etapaMaxima._max.orden;

    const ordenActualizada = await tx.ordenProduccion.update({
      where: { id: ordenId },
      data: {
        etapaId: nuevaEtapa.id,
        actualizadoEn: new Date(),
        // Al llegar a la etapa final se marca la entrega real — de esto
        // depende v_ordenes_produccion_estado para calcular "situacion".
        ...(esEtapaFinal ? { fechaEntregaReal: new Date() } : {}),
      },
      include: INCLUDE_LISTA,
    });

    await tx.bitacoraEvento.create({
      data: {
        ordenProduccionId: ordenId,
        empresaId,
        tipoEvento: "cambio_etapa",
        campoAfectado: "Etapa Actual",
        valorAnterior: orden.etapa.nombre,
        valorNuevo: nuevaEtapa.nombre,
        usuarioId,
      },
    });

    await emit(ORDEN_ETAPA_CAMBIADA, { tx, orden: ordenActualizada, empresaId, usuarioId });
    if (esEtapaFinal) {
      await emit(ORDEN_CERRADA, { tx, orden: ordenActualizada, empresaId, usuarioId });
    }

    return ordenActualizada;
  }, TRANSACTION_OPTIONS);
}

// Reasignar responsable de una orden ya creada — capacidad de
// Supervisor/Admin (permiso asignar_responsable, chequeado en la ruta).
// Mismo XOR que exige la BD al crear: exactamente uno de los dos.
export async function reasignarResponsableOrden(
  ordenId,
  empresaId,
  usuario,
  { responsableUsuarioId, responsableExterno }
) {
  const interno = !!responsableUsuarioId;
  const externo = !!responsableExterno;
  if (interno === externo) {
    throw new ValidacionError(
      "Debes indicar exactamente un responsable: interno (usuario) o externo (texto), no ambos ni ninguno"
    );
  }

  return prisma.$transaction(async (tx) => {
    const orden = await tx.ordenProduccion.findFirst({
      where: { id: ordenId, empresaId, eliminadoEn: null },
      include: { responsableUsuario: { select: { id: true, nombre: true } } },
    });
    if (!orden) throw new NoEncontradoError("Orden de producción no encontrada");

    const valorAnterior = orden.responsableUsuario?.nombre ?? orden.responsableExterno ?? "—";

    const ordenActualizada = await tx.ordenProduccion.update({
      where: { id: ordenId },
      data: {
        responsableUsuarioId: responsableUsuarioId || null,
        responsableExterno: responsableExterno || null,
        actualizadoEn: new Date(),
      },
      include: INCLUDE_LISTA,
    });

    const valorNuevo = ordenActualizada.responsableUsuario?.nombre ?? ordenActualizada.responsableExterno ?? "—";

    await tx.bitacoraEvento.create({
      data: {
        ordenProduccionId: ordenId,
        empresaId,
        tipoEvento: "cambio_responsable",
        campoAfectado: "Responsable",
        valorAnterior,
        valorNuevo,
        usuarioId: usuario.id,
      },
    });

    return ordenActualizada;
  }, TRANSACTION_OPTIONS);
}
