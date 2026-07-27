import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { NoEncontradoError, ValidacionError, PermisoDenegadoError } from "./errors.js";
import { siguienteNumero } from "./numeracion.service.js";
import { on, emit } from "../events/eventBus.js";
import { PEDIDO_FACTURADO, ORDEN_CREADA, ORDEN_ETAPA_CAMBIADA, ORDEN_CERRADA } from "../events/eventos.js";
import { obtenerEstadoPedido, cambiarEstadoPedido } from "./pedidoEstado.service.js";

const INCLUDE_LISTA = {
  pedido: { select: { id: true, pedId: true, clienteNombre: true } },
  empresa: { select: { id: true, nombre: true } },
  etapa: true,
  prioridad: true,
  responsableUsuario: { select: { id: true, nombre: true } },
};

export async function listarOrdenesProduccion(
  empresaId,
  { etapaId, prioridadId, responsableUsuarioId } = {}
) {
  const where = { empresaId, eliminadoEn: null };
  if (etapaId) where.etapaId = Number(etapaId);
  if (prioridadId) where.prioridadId = Number(prioridadId);
  if (responsableUsuarioId) where.responsableUsuarioId = responsableUsuarioId;

  return prisma.ordenProduccion.findMany({
    where,
    include: INCLUDE_LISTA,
    orderBy: { creadoEn: "desc" },
  });
}

// A partir de la bitácora (creacion + cambio_etapa) reconstruye cuánto
// tiempo pasó la orden en cada etapa. No requiere ninguna columna nueva:
// la fecha de entrada a la primera etapa es `creadoEn`, y cada evento
// cambio_etapa marca la entrada a la siguiente.
function calcularTiemposPorEtapa(orden) {
  const cambios = orden.bitacoraEventos
    .filter((e) => e.tipoEvento === "cambio_etapa")
    .slice()
    .sort((a, b) => new Date(a.ocurridoEn) - new Date(b.ocurridoEn));

  const puntos =
    cambios.length > 0
      ? [
          { etapa: cambios[0].valorAnterior, desde: orden.creadoEn },
          ...cambios.map((c) => ({ etapa: c.valorNuevo, desde: c.ocurridoEn })),
        ]
      : [{ etapa: orden.etapa.nombre, desde: orden.creadoEn }];

  return puntos.map((punto, i) => {
    const siguiente = puntos[i + 1];
    const desde = new Date(punto.desde);
    const hasta = siguiente ? new Date(siguiente.desde) : new Date();
    return {
      etapa: punto.etapa,
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
  const vetodas = !!usuario.rol?.permisos?.ver_todas_las_ordenes;
  if (!vetodas && orden.responsableUsuarioId !== usuario.id) {
    throw new PermisoDenegadoError("Esta orden no está asignada a tu usuario");
  }
}

export async function obtenerOrdenProduccion(id, empresaId, usuario) {
  const orden = await prisma.ordenProduccion.findFirst({
    where: { id, empresaId, eliminadoEn: null },
    include: {
      pedido: true,
      empresa: { select: { id: true, nombre: true } },
      etapa: true,
      prioridad: true,
      responsableUsuario: { select: { id: true, nombre: true } },
      bitacoraEventos: {
        orderBy: { ocurridoEn: "desc" },
        include: { usuario: { select: { id: true, nombre: true } } },
      },
    },
  });
  if (!orden) throw new NoEncontradoError("Orden de producción no encontrada");
  verificarAccesoOrden(orden, usuario);
  return { ...orden, tiemposPorEtapa: calcularTiemposPorEtapa(orden) };
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

// Reacciona a PEDIDO_FACTURADO creando una OrdenProduccion por línea, dentro
// de la misma transacción que abrió FacturacionService. Producción es dueño
// de esta lógica; Facturación solo sabe que "algo" reacciona al evento.
async function crearOrdenesDesdeLineas({ tx, pedido, empresaId, usuarioId, lineas }) {
  validarLineas(lineas);

  const etapaInicial = await tx.etapa.findFirst({ where: { nombre: ETAPA_INICIAL_NOMBRE } });
  if (!etapaInicial) {
    throw new Error(`Falta configurar la etapa inicial "${ETAPA_INICIAL_NOMBRE}" en el catálogo de etapas`);
  }

  const opIdsUsados = [];
  const ordenesCreadas = [];

  for (const linea of lineas) {
    const opId = siguienteNumero(opIdsUsados, pedido.pedId, 2);
    opIdsUsados.push(opId);

    const orden = await tx.ordenProduccion.create({
      data: {
        pedidoId: pedido.id,
        empresaId,
        opId,
        producto: linea.producto.trim(),
        cantidad: linea.cantidad,
        tipoTrabajo: linea.tipoTrabajo?.trim() || null,
        medida: linea.medida?.trim() || null,
        etapaId: etapaInicial.id,
        prioridadId: linea.prioridadId,
        responsableUsuarioId: linea.responsableUsuarioId || null,
        responsableExterno: linea.responsableExterno || null,
      },
      include: { etapa: true, prioridad: true },
    });

    await tx.bitacoraEvento.create({
      data: {
        ordenProduccionId: orden.id,
        empresaId,
        tipoEvento: "creacion",
        campoAfectado: "Orden de Producción",
        valorNuevo: orden.opId,
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
