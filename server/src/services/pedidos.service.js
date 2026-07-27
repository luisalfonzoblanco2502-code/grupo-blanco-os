import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { registrarAuditoria } from "./auditoria.service.js";
import { siguienteNumero } from "./numeracion.service.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";
import {
  obtenerEstadoPedido,
  cambiarEstadoPedido,
  requerirEstadoPedido,
} from "./pedidoEstado.service.js";
import { emit } from "../events/eventBus.js";
import { PEDIDO_CREADO, PEDIDO_EDITADO, PEDIDO_CANCELADO, PEDIDO_ESTADO_CAMBIADO } from "../events/eventos.js";

const INCLUDE_DETALLE = {
  empresa: { select: { id: true, nombre: true } },
  creadoPor: { select: { id: true, nombre: true } },
};

// Estados en los que el pedido todavía se puede tocar "libremente" (editar,
// cancelar). A partir de FACTURADO, el ciclo de vida lo gobierna
// exclusivamente la máquina de estados (pedidoEstado.service.js).
const ESTADOS_EDITABLES = ["BORRADOR", "PENDIENTE"];
const ESTADOS_CANCELABLES = ["BORRADOR", "PENDIENTE"];

function validarDatosPedido({ clienteNombre, fechaIngreso, fechaCompromiso, cantidadTotal }) {
  if (!clienteNombre || !String(clienteNombre).trim()) {
    throw new ValidacionError("El nombre del cliente es obligatorio");
  }
  if (!fechaIngreso || !fechaCompromiso) {
    throw new ValidacionError("La fecha de ingreso y la fecha de compromiso son obligatorias");
  }
  if (new Date(fechaCompromiso) < new Date(fechaIngreso)) {
    throw new ValidacionError("La fecha de compromiso no puede ser anterior a la fecha de ingreso");
  }
  if (!Number.isInteger(cantidadTotal) || cantidadTotal <= 0) {
    throw new ValidacionError("La cantidad total debe ser un número entero mayor a 0");
  }
}

// Reutilizado por facturacion.service.js: mismo criterio de "es mío y sigue
// activo" que usan editar/cancelar, para no duplicar esa condición.
export async function obtenerPedidoPropio(tx, pedidoId, empresaId) {
  const pedido = await tx.pedido.findFirst({
    where: { id: pedidoId, empresaId, eliminadoEn: null },
  });
  if (!pedido) throw new NoEncontradoError("Pedido no encontrado");
  return pedido;
}

async function conEstado(pedido) {
  const estado = await obtenerEstadoPedido(prisma, pedido.id);
  return { ...pedido, estado };
}

async function siguientePedId(tx, empresaId) {
  const existentes = await tx.pedido.findMany({ where: { empresaId }, select: { pedId: true } });
  return siguienteNumero(
    existentes.map((p) => p.pedId),
    "PED",
    4
  );
}

export async function listarPedidos(empresaId) {
  const pedidos = await prisma.pedido.findMany({
    where: { empresaId, eliminadoEn: null },
    include: {
      ...INCLUDE_DETALLE,
      _count: { select: { ordenesProduccion: { where: { eliminadoEn: null } } } },
    },
    orderBy: { fechaIngreso: "desc" },
  });
  return Promise.all(pedidos.map(conEstado));
}

export async function obtenerPedido(pedidoId, empresaId) {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId, eliminadoEn: null },
    include: {
      ...INCLUDE_DETALLE,
      ordenesProduccion: { where: { eliminadoEn: null }, include: { etapa: true, prioridad: true } },
    },
  });
  if (!pedido) throw new NoEncontradoError("Pedido no encontrado");
  return conEstado(pedido);
}

export async function crearPedido({
  empresaId,
  usuarioId,
  clienteNombre,
  fechaIngreso,
  fechaCompromiso,
  cantidadTotal,
  observaciones,
}) {
  validarDatosPedido({ clienteNombre, fechaIngreso, fechaCompromiso, cantidadTotal });

  const intentosMax = 3;
  for (let intento = 1; intento <= intentosMax; intento++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const pedId = await siguientePedId(tx, empresaId);

        const pedido = await tx.pedido.create({
          data: {
            empresaId,
            pedId,
            clienteNombre: clienteNombre.trim(),
            fechaIngreso: new Date(fechaIngreso),
            fechaCompromiso: new Date(fechaCompromiso),
            cantidadTotal,
            observaciones: observaciones?.trim() || null,
            creadoPorId: usuarioId,
          },
          include: INCLUDE_DETALLE,
        });

        // El pedido nace directamente en PENDIENTE: hoy no existe un flujo de
        // "guardar borrador" en la UI. BORRADOR queda disponible en la
        // máquina de estados para cuando se construya esa funcionalidad.
        await registrarAuditoria(tx, {
          empresaId,
          usuarioId,
          accion: "pedido.creado",
          detalle: { pedidoId: pedido.id, pedId: pedido.pedId },
        });

        await emit(PEDIDO_CREADO, { tx, pedido, empresaId, usuarioId });

        return { ...pedido, estado: "PENDIENTE" };
      }, TRANSACTION_OPTIONS);
    } catch (err) {
      // Colisión de numeración por creación concurrente: reintenta con el
      // siguiente número. Cualquier otro error se propaga tal cual.
      if (err.code === "P2002" && intento < intentosMax) continue;
      throw err;
    }
  }
}

export async function editarPedido(pedidoId, empresaId, usuarioId, cambios) {
  return prisma.$transaction(async (tx) => {
    const actual = await obtenerPedidoPropio(tx, pedidoId, empresaId);

    await requerirEstadoPedido(
      tx,
      pedidoId,
      ESTADOS_EDITABLES,
      "No se puede editar un pedido que ya fue facturado"
    );

    const datos = {
      clienteNombre: cambios.clienteNombre?.trim() ?? actual.clienteNombre,
      fechaIngreso: cambios.fechaIngreso ? new Date(cambios.fechaIngreso) : actual.fechaIngreso,
      fechaCompromiso: cambios.fechaCompromiso
        ? new Date(cambios.fechaCompromiso)
        : actual.fechaCompromiso,
      cantidadTotal: cambios.cantidadTotal ?? actual.cantidadTotal,
      observaciones:
        cambios.observaciones !== undefined ? cambios.observaciones?.trim() || null : actual.observaciones,
    };
    validarDatosPedido(datos);

    const pedido = await tx.pedido.update({
      where: { id: pedidoId },
      data: { ...datos, actualizadoEn: new Date() },
      include: INCLUDE_DETALLE,
    });

    await registrarAuditoria(tx, {
      empresaId,
      usuarioId,
      accion: "pedido.editado",
      detalle: { pedidoId, cambios: datos },
    });

    await emit(PEDIDO_EDITADO, { tx, pedido, empresaId, usuarioId });

    return { ...pedido, estado: "PENDIENTE" };
  }, TRANSACTION_OPTIONS);
}

export async function cancelarPedido(pedidoId, empresaId, usuarioId) {
  return prisma.$transaction(async (tx) => {
    const actual = await obtenerPedidoPropio(tx, pedidoId, empresaId);

    // "No permitir cancelar un pedido con producción iniciada" lo garantiza
    // la propia tabla de transiciones (CANCELADO no es alcanzable desde
    // FACTURADO en adelante) — este chequeo explícito solo da un mensaje
    // más claro que el genérico de cambiarEstadoPedido.
    await requerirEstadoPedido(
      tx,
      pedidoId,
      ESTADOS_CANCELABLES,
      "No se puede cancelar un pedido con producción iniciada"
    );

    await cambiarEstadoPedido(tx, { pedidoId, empresaId, usuarioId, estadoNuevo: "CANCELADO" });

    const pedido = await tx.pedido.update({
      where: { id: pedidoId },
      data: { eliminadoEn: new Date() },
      include: INCLUDE_DETALLE,
    });

    await emit(PEDIDO_CANCELADO, { tx, pedido, empresaId, usuarioId });
    await emit(PEDIDO_ESTADO_CAMBIADO, { tx, pedido, empresaId, usuarioId, estadoNuevo: "CANCELADO" });

    return { ...pedido, estado: "CANCELADO", pedId: actual.pedId };
  }, TRANSACTION_OPTIONS);
}

// Transición manual — cubre los pasos que no tienen señal automática
// (ej. DESPACHADO, o cerrar administrativamente un pedido ya ENTREGADO).
export async function cambiarEstadoPedidoManual(pedidoId, empresaId, usuarioId, estadoNuevo) {
  return prisma.$transaction(async (tx) => {
    await obtenerPedidoPropio(tx, pedidoId, empresaId);
    await cambiarEstadoPedido(tx, { pedidoId, empresaId, usuarioId, estadoNuevo });
    await emit(PEDIDO_ESTADO_CAMBIADO, { tx, pedidoId, empresaId, usuarioId, estadoNuevo });

    // Se arma el resultado con el estadoNuevo ya conocido en vez de
    // releer con obtenerEstadoPedido: esa función usa `prisma` (fuera de
    // esta transacción) y todavía no vería el cambio recién escrito.
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, include: INCLUDE_DETALLE });
    return { ...pedido, estado: estadoNuevo };
  }, TRANSACTION_OPTIONS);
}
