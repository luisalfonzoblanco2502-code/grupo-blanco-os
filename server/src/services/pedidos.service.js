import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { registrarAuditoria } from "./auditoria.service.js";
import { siguienteNumero } from "./numeracion.service.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";
import {
  obtenerEstadoPedido,
  obtenerEstadosPedidosDeEmpresa,
  obtenerEventosEstadoDeEmpresa,
  cambiarEstadoPedido,
  requerirEstadoPedido,
} from "./pedidoEstado.service.js";
import { emit } from "../events/eventBus.js";
import { PEDIDO_CREADO, PEDIDO_EDITADO, PEDIDO_CANCELADO, PEDIDO_ESTADO_CAMBIADO } from "../events/eventos.js";
import { insertarLineaEnTx } from "./pedidoLineas.service.js";

const INCLUDE_DETALLE = {
  empresa: { select: { id: true, nombre: true } },
  creadoPor: { select: { id: true, nombre: true } },
};

// Estados en los que el pedido todavía se puede tocar "libremente" (editar,
// cancelar). A partir de FACTURADO, el ciclo de vida lo gobierna
// exclusivamente la máquina de estados (pedidoEstado.service.js).
const ESTADOS_EDITABLES = ["BORRADOR", "PENDIENTE"];
const ESTADOS_CANCELABLES = ["BORRADOR", "PENDIENTE"];

// Idempotencia mínima de POST /api/pedidos (Paso 6.1): formato validado ANTES
// de tocar Prisma — nunca dejamos que un valor no-UUID llegue a la consulta.
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Release Candidate: antes hacía 1-2 consultas POR pedido para su estado
// (17 consultas medidas en el piloto para listar unos pocos pedidos). Ahora
// son como máximo 3 consultas fijas para TODA la lista, sin importar
// cuántos pedidos haya — misma lógica de pedidoEstado.service.js, solo
// calculada en lote. Las primeras dos (pedidos y eventos de estado) no
// dependen una de la otra, así que van en paralelo — con la latencia de
// red que tenemos, cada round-trip evitado importa.
export async function listarPedidos(empresaId) {
  const [pedidos, eventosEstado] = await Promise.all([
    prisma.pedido.findMany({
      where: { empresaId, eliminadoEn: null },
      include: {
        ...INCLUDE_DETALLE,
        _count: { select: { ordenesProduccion: { where: { eliminadoEn: null } } } },
      },
      orderBy: { fechaIngreso: "desc" },
    }),
    obtenerEventosEstadoDeEmpresa(prisma, empresaId),
  ]);

  const estados = await obtenerEstadosPedidosDeEmpresa(
    prisma,
    empresaId,
    pedidos.map((p) => p.id),
    eventosEstado
  );

  return pedidos.map((pedido) => ({ ...pedido, estado: estados.get(pedido.id) }));
}

export async function obtenerPedido(pedidoId, empresaId) {
  const pedido = await prisma.pedido.findFirst({
    where: { id: pedidoId, empresaId, eliminadoEn: null },
    include: {
      ...INCLUDE_DETALLE,
      ordenesProduccion: {
        where: { eliminadoEn: null },
        include: { etapa: true, prioridad: true, responsableUsuario: { select: { id: true, nombre: true } } },
      },
      // Facturador Administrativo: para que el detalle de Pedido pueda
      // mostrar/gatear "Registrar pago" sin una segunda consulta.
      documentoVenta: { include: { pagos: { orderBy: { fecha: "desc" } } } },
      cliente: true,
      prioridad: true,
      lineas: {
        include: { archivosAdjuntos: true, prioridad: true, productoInterno: true },
        orderBy: { ordenVisualizacion: "asc" },
      },
    },
  });
  if (!pedido) throw new NoEncontradoError("Pedido no encontrado");
  return conEstado(pedido);
}

// Producción Operativa (2026-07-28): cantidadTotal ya NO es input manual —
// se deriva de `lineas` (obligatorio, mínimo 1) dentro de esta misma
// transacción. Es requisito real de la base (CHECK cantidad_total > 0): un
// pedido no puede nacer sin al menos una línea. "Guardar borrador" significa
// que desde este único submit el pedido y sus líneas ya quedan persistidos
// de verdad — agregar/editar/duplicar/quitar líneas después es posible
// mientras el pedido siga PENDIENTE (endpoints propios, pedidoLineas.service.js).
// Devuelve siempre { pedido, idempotentReplay } — nunca el pedido "pelado" —
// para que el llamador (ruta HTTP, scripts de certificación) tenga un único
// contrato sin importar si esto creó un pedido nuevo o devolvió uno existente.
export async function crearPedido({
  empresaId,
  usuarioId,
  clienteNombre,
  clienteId,
  fechaIngreso,
  fechaCompromiso,
  tipoEntrega,
  direccionAgencia,
  prioridadId,
  observaciones,
  lineas,
  claveIdempotencia,
}) {
  if (claveIdempotencia != null && !UUID_V4_REGEX.test(claveIdempotencia)) {
    throw new ValidacionError("claveIdempotencia debe ser un UUID válido");
  }

  // Chequeo previo: si esta clave ya produjo un pedido para ESTA empresa, es
  // un reenvío (timeout, doble clic, reconexión) — no se vuelve a intentar
  // crear nada, se devuelve el pedido ya existente. No se filtra por
  // eliminadoEn: el UNIQUE de la base tampoco distingue eso, así que el
  // chequeo debe reflejar la misma realidad que el constraint.
  if (claveIdempotencia) {
    const existente = await prisma.pedido.findFirst({
      where: { empresaId, claveIdempotencia },
      include: INCLUDE_DETALLE,
    });
    if (existente) {
      return { pedido: await conEstado(existente), idempotentReplay: true };
    }
  }

  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new ValidacionError("El pedido necesita al menos una línea de producto");
  }
  const cantidadTotal = lineas.reduce((s, l) => s + Number(l.cantidad || 0), 0);
  validarDatosPedido({ clienteNombre, fechaIngreso, fechaCompromiso, cantidadTotal });

  const intentosMax = 3;
  for (let intento = 1; intento <= intentosMax; intento++) {
    try {
      const pedido = await prisma.$transaction(async (tx) => {
        const pedId = await siguientePedId(tx, empresaId);

        const pedidoCreado = await tx.pedido.create({
          data: {
            empresaId,
            pedId,
            clienteNombre: clienteNombre.trim(),
            // Enlace opcional a la ficha real del cliente (Facturador
            // Administrativo) — clienteNombre sigue siendo la fuente de
            // verdad si no se eligió/creó una ficha.
            clienteId: clienteId || null,
            fechaIngreso: new Date(fechaIngreso),
            fechaCompromiso: new Date(fechaCompromiso),
            tipoEntrega: tipoEntrega?.trim() || null,
            direccionAgencia: direccionAgencia?.trim() || null,
            prioridadId: prioridadId ? Number(prioridadId) : null,
            cantidadTotal,
            observaciones: observaciones?.trim() || null,
            creadoPorId: usuarioId,
            claveIdempotencia: claveIdempotencia || null,
          },
          include: INCLUDE_DETALLE,
        });

        for (const [i, linea] of lineas.entries()) {
          await insertarLineaEnTx(tx, {
            empresaId,
            pedidoId: pedidoCreado.id,
            ordenVisualizacion: i,
            usuarioId,
            datos: linea,
          });
        }

        await registrarAuditoria(tx, {
          empresaId,
          usuarioId,
          accion: "pedido.creado",
          detalle: { pedidoId: pedidoCreado.id, pedId: pedidoCreado.pedId },
        });

        await emit(PEDIDO_CREADO, { tx, pedido: pedidoCreado, empresaId, usuarioId });

        return { ...pedidoCreado, estado: "PENDIENTE" };
      }, TRANSACTION_OPTIONS);

      return { pedido, idempotentReplay: false };
    } catch (err) {
      if (err.code === "P2002") {
        // Formato empíricamente verificado (Prisma 5.22.0, ver
        // server/backups/verificar-formato-p2002.mjs): err.meta.target es un
        // arreglo con los nombres de columna reales (snake_case) del
        // constraint que colisionó — nunca comparamos por texto libre.
        const target = err.meta?.target;
        const esColisionClaveIdempotencia = Array.isArray(target) && target.includes("clave_idempotencia");
        const esColisionNumeracion = Array.isArray(target) && target.includes("ped_id");

        if (esColisionClaveIdempotencia) {
          // La propia excepción prueba que la transacción perdedora ya
          // revirtió (Prisma revierte antes de rechazar esta promesa), así
          // que este SELECT con el cliente de nivel superior ya ve al
          // ganador. Dos requests concurrentes con la misma clave terminan
          // ambas devolviendo el mismo pedido.
          const ganador = await prisma.pedido.findFirst({
            where: { empresaId, claveIdempotencia },
            include: INCLUDE_DETALLE,
          });
          if (ganador) {
            return { pedido: await conEstado(ganador), idempotentReplay: true };
          }
          throw err;
        }

        // Colisión de numeración por creación concurrente: reintenta con el
        // siguiente número. Cualquier otro P2002 (no clave, no numeración) se
        // propaga tal cual — nunca se trata como idempotencia.
        if (esColisionNumeracion && intento < intentosMax) continue;
      }
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
      // clienteId sí puede desvincularse a propósito (volver a texto libre) —
      // por eso se distingue undefined (sin cambio) de null (desvincular).
      clienteId: cambios.clienteId !== undefined ? cambios.clienteId || null : actual.clienteId,
      fechaIngreso: cambios.fechaIngreso ? new Date(cambios.fechaIngreso) : actual.fechaIngreso,
      fechaCompromiso: cambios.fechaCompromiso
        ? new Date(cambios.fechaCompromiso)
        : actual.fechaCompromiso,
      // cantidadTotal NO es editable acá a propósito (Producción Operativa):
      // solo pedidoLineas.service.js la recalcula, desde las líneas reales.
      cantidadTotal: actual.cantidadTotal,
      tipoEntrega: cambios.tipoEntrega !== undefined ? cambios.tipoEntrega?.trim() || null : actual.tipoEntrega,
      direccionAgencia:
        cambios.direccionAgencia !== undefined ? cambios.direccionAgencia?.trim() || null : actual.direccionAgencia,
      prioridadId:
        cambios.prioridadId !== undefined ? (cambios.prioridadId ? Number(cambios.prioridadId) : null) : actual.prioridadId,
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

// "Eliminar pedido" (solo Administrador, permiso eliminar_pedido_definitivo)
// — a diferencia de cancelarPedido, funciona en CUALQUIER estado (decisión
// explícita del usuario: incluso un pedido ya facturado con producción
// real en curso). Corrección 2026-08-01: en cascada SOLO a
// OrdenProduccion (soft-delete, mismo campo eliminadoEn) — antes quedaban
// huérfanas, visibles en Kanban/listados de Producción con un pedido que
// ya no existe. Sigue sin tocar NUNCA DocumentoVenta/PagoIngreso/
// CostoPedido/PedidoLinea — esos registros pueden incluir pagos reales ya
// cobrados y jamás se hard-deletean ni se re-encadenan en este sistema.
// Tampoco fuerza ninguna transición de estado (CANCELADO no es alcanzable
// desde FACTURADO en adelante, y forzarlo mentiría sobre la historia real).
export async function eliminarPedidoDefinitivo(pedidoId, empresaId, usuarioId) {
  return prisma.$transaction(async (tx) => {
    const actual = await tx.pedido.findFirst({ where: { id: pedidoId, empresaId, eliminadoEn: null } });
    if (!actual) throw new NoEncontradoError("Pedido no encontrado");

    const estadoAlEliminar = await obtenerEstadoPedido(tx, pedidoId);

    const ordenesActivas = await tx.ordenProduccion.findMany({
      where: { pedidoId, empresaId, eliminadoEn: null },
      select: { id: true, opId: true },
    });
    const ahora = new Date();
    if (ordenesActivas.length > 0) {
      await tx.ordenProduccion.updateMany({
        where: { id: { in: ordenesActivas.map((o) => o.id) } },
        data: { eliminadoEn: ahora },
      });
      // Una fila por OP en su propia bitácora (append-only, mismo criterio
      // que cambio_etapa/cambio_responsable) — además de la auditoría a
      // nivel de pedido de más abajo.
      await tx.bitacoraEvento.createMany({
        data: ordenesActivas.map((o) => ({
          ordenProduccionId: o.id,
          empresaId,
          tipoEvento: "orden_eliminada_por_admin",
          campoAfectado: "Eliminado",
          valorAnterior: "activa",
          valorNuevo: "eliminada (pedido eliminado)",
          usuarioId,
        })),
      });
    }

    const pedido = await tx.pedido.update({
      where: { id: pedidoId },
      data: { eliminadoEn: ahora },
      include: INCLUDE_DETALLE,
    });

    await registrarAuditoria(tx, {
      empresaId,
      usuarioId,
      accion: "pedido.eliminado_por_admin",
      detalle: {
        pedidoId,
        pedId: actual.pedId,
        clienteNombre: actual.clienteNombre,
        estadoAlEliminar,
        ordenesEliminadas: ordenesActivas.length,
        opIds: ordenesActivas.map((o) => o.opId),
      },
    });

    return { ...pedido, estado: estadoAlEliminar, ordenesEliminadas: ordenesActivas.length };
  }, TRANSACTION_OPTIONS);
}
