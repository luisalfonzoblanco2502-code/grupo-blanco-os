// Gobierno del estado del Pedido — Sprint 8.
//
// DECISIÓN DE DISEÑO IMPORTANTE: la tabla `pedidos` de Supabase no tiene
// (y por instrucción explícita no se le agrega) una columna "estado". Los 9
// estados oficiales se manejan como EVENTOS, guardados en `auditoria_sistema`
// (accion = "pedido.estado_cambiado", detalle = { pedidoId, estadoAnterior,
// estadoNuevo }) — una tabla que ya existe, ya está pensada para esto
// (detalle jsonb genérico) y no requiere ningún ALTER TABLE. El estado
// "actual" de un pedido es, por definición, el estadoNuevo del evento más
// reciente para ese pedido.
//
// Esto es coherente con la decisión ya aprobada en Sprint 6 (facturado =
// se infiere de las Órdenes de Producción) y con la filosofía de Sprint 7-8
// de trabajar por eventos: el estado del pedido ES un log de eventos, no un
// campo mutable.
import { ValidacionError } from "./errors.js";
import { registrarAuditoria } from "./auditoria.service.js";

export const ESTADOS_PEDIDO = [
  "BORRADOR",
  "PENDIENTE",
  "FACTURADO",
  "EN_PRODUCCION",
  "LISTO",
  "DESPACHADO",
  "ENTREGADO",
  "CERRADO",
  "CANCELADO",
];

const ACCION_ESTADO_CAMBIADO = "pedido.estado_cambiado";

// LISTO->ENTREGADO existe además de DESPACHADO->ENTREGADO porque DESPACHADO
// es un paso manual opcional (no hay señal automática de "despachado" en el
// catálogo de etapas de producción actual) — si nadie lo marca a mano, el
// pedido igual puede cerrarse como ENTREGADO cuando todas sus órdenes llegan
// a la etapa final.
export const TRANSICIONES_PEDIDO = {
  BORRADOR: ["PENDIENTE", "CANCELADO"],
  PENDIENTE: ["FACTURADO", "CANCELADO"],
  FACTURADO: ["EN_PRODUCCION"],
  EN_PRODUCCION: ["LISTO"],
  LISTO: ["DESPACHADO", "ENTREGADO"],
  DESPACHADO: ["ENTREGADO"],
  ENTREGADO: ["CERRADO"],
  CERRADO: [],
  CANCELADO: [],
};

// "No permitir cancelar un pedido con producción iniciada" queda garantizado
// por la propia tabla: CANCELADO solo aparece en la lista de BORRADOR y
// PENDIENTE — una vez FACTURADO (existen Órdenes de Producción) ya no es
// alcanzable.

export async function obtenerEstadoPedido(tx, pedidoId) {
  const ultimoCambio = await tx.auditoriaSistema.findFirst({
    where: { accion: ACCION_ESTADO_CAMBIADO, detalle: { path: ["pedidoId"], equals: pedidoId } },
    orderBy: { ocurridoEn: "desc" },
  });
  if (ultimoCambio) return ultimoCambio.detalle.estadoNuevo;

  // Pedidos creados antes de este sprint no tienen historial de estado:
  // se infiere igual que en Sprint 6 (¿tiene Órdenes de Producción activas?).
  const tieneOrdenes = await tx.ordenProduccion.count({ where: { pedidoId, eliminadoEn: null } });
  return tieneOrdenes > 0 ? "FACTURADO" : "PENDIENTE";
}

export async function cambiarEstadoPedido(tx, { pedidoId, empresaId, usuarioId, estadoNuevo, automatico = false }) {
  if (!ESTADOS_PEDIDO.includes(estadoNuevo)) {
    throw new ValidacionError(`Estado desconocido: "${estadoNuevo}"`);
  }

  const estadoActual = await obtenerEstadoPedido(tx, pedidoId);
  const permitidas = TRANSICIONES_PEDIDO[estadoActual] ?? [];
  if (!permitidas.includes(estadoNuevo)) {
    throw new ValidacionError(
      `No se puede pasar de "${estadoActual}" a "${estadoNuevo}". Transiciones permitidas desde "${estadoActual}": ${
        permitidas.join(", ") || "ninguna (estado final)"
      }.`
    );
  }

  await registrarAuditoria(tx, {
    empresaId,
    usuarioId,
    accion: ACCION_ESTADO_CAMBIADO,
    detalle: { pedidoId, estadoAnterior: estadoActual, estadoNuevo, automatico },
  });

  return estadoNuevo;
}

export async function requerirEstadoPedido(tx, pedidoId, estadosPermitidos, mensaje) {
  const estado = await obtenerEstadoPedido(tx, pedidoId);
  if (!estadosPermitidos.includes(estado)) {
    throw new ValidacionError(mensaje ?? `Esta acción no está permitida en el estado "${estado}"`);
  }
  return estado;
}

// Solo la parte de auditoría (sin el fallback de "¿tiene órdenes?") — separada
// para que el llamador pueda pedirla EN PARALELO con el findMany de pedidos
// (no depende de conocer los ids todavía, solo de la empresa).
export async function obtenerEventosEstadoDeEmpresa(tx, empresaId) {
  const eventos = await tx.auditoriaSistema.findMany({
    where: { empresaId, accion: ACCION_ESTADO_CAMBIADO },
    orderBy: { ocurridoEn: "asc" },
    select: { detalle: true },
  });

  const estadoPorPedido = new Map();
  for (const evento of eventos) {
    // orden ascendente: la última escritura para cada pedidoId gana,
    // igual que "ORDER BY ocurridoEn DESC LIMIT 1" pero para todos a la vez.
    estadoPorPedido.set(evento.detalle.pedidoId, evento.detalle.estadoNuevo);
  }
  return estadoPorPedido;
}

// Versión "en lote" de obtenerEstadoPedido — Release Candidate: arregla el
// N+1 medido en GET /api/pedidos (17 consultas para listar unos pocos
// pedidos, una por cada obtenerEstadoPedido individual). MISMA lógica de
// precedencia exacta (evento de auditoría más reciente; si no hay,
// inferir de si tiene Órdenes de Producción activas) — acá solo cambia
// CÓMO se calcula (en lote para toda la empresa en vez de uno por uno),
// no QUÉ se calcula. `auditoriaSistema.empresaId` es una columna real
// (no está dentro del jsonb `detalle`), así que este filtro es una
// comparación de columna normal, no un scan de JSON.
export async function obtenerEstadosPedidosDeEmpresa(tx, empresaId, pedidoIds, eventosYaObtenidos) {
  const estadoPorPedido = eventosYaObtenidos ?? (await obtenerEventosEstadoDeEmpresa(tx, empresaId));

  const idsSinHistorial = pedidoIds.filter((id) => !estadoPorPedido.has(id));
  if (idsSinHistorial.length > 0) {
    const ordenes = await tx.ordenProduccion.findMany({
      where: { pedidoId: { in: idsSinHistorial }, eliminadoEn: null },
      select: { pedidoId: true },
      distinct: ["pedidoId"],
    });
    const pedidosConOrdenes = new Set(ordenes.map((o) => o.pedidoId));
    for (const id of idsSinHistorial) {
      estadoPorPedido.set(id, pedidosConOrdenes.has(id) ? "FACTURADO" : "PENDIENTE");
    }
  }

  return estadoPorPedido;
}
