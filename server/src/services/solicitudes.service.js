// Solicitudes de pedido creadas desde el catálogo público (sin
// autenticación). El objetivo central de este servicio es evitar copiar a
// mano pedidos de WhatsApp al ERP: `crearSolicitudPublica` es la única
// puerta de entrada pública, y `convertirSolicitud` reutiliza el
// `crearPedido()` de pedidos.service.js — no reimplementa esa lógica.
import { prisma } from "../db.js";
import { registrarAuditoria } from "./auditoria.service.js";
import { siguienteNumero } from "./numeracion.service.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";
import { precioUnitarioParaCantidad } from "./productos.service.js";
import { crearPedido } from "./pedidos.service.js";
import { emit } from "../events/eventBus.js";
import { SOLICITUD_CREADA, SOLICITUD_ESTADO_CAMBIADO, SOLICITUD_CONVERTIDA } from "../events/eventos.js";

export const ESTADOS_SOLICITUD = [
  "RECIBIDA",
  "EN_REVISION",
  "APROBADA",
  "RECHAZADA",
  "CORRECCION_SOLICITADA",
  "CONVERTIDA",
];

// La conversión a Pedido NO pasa por acá: tiene su propio endpoint
// (`convertirSolicitud`) porque además de cambiar estado dispara la
// creación del Pedido — no es un cambio de estado "puro".
const TRANSICIONES_SOLICITUD = {
  RECIBIDA: ["EN_REVISION", "APROBADA", "RECHAZADA"],
  EN_REVISION: ["APROBADA", "RECHAZADA", "CORRECCION_SOLICITADA"],
  CORRECCION_SOLICITADA: ["EN_REVISION", "APROBADA", "RECHAZADA"],
  APROBADA: [],
  RECHAZADA: [],
  CONVERTIDA: [],
};

const INCLUDE_DETALLE = {
  items: { include: { producto: { select: { id: true, nombre: true, categoria: true } } } },
  pedido: { select: { id: true, pedId: true } },
};

// Estado de producción/entrega visible para el CLIENTE en "Rastrea tu
// pedido" — orden fijo, independiente del `estado` interno de revisión de
// staff. LISTO_RETIRO y ENVIADO/DISPONIBLE_RETIRO son ramas alternativas
// según tipoEntrega (ver obtenerRastreoPublico), no una secuencia única.
export const ETAPAS_PUBLICAS = [
  "RECIBIDO",
  "PRODUCCION_INICIO",
  "PRODUCCION_FIN",
  "PREPARANDO_ENVIO",
  "LISTO_RETIRO",
  "ENVIADO",
  "DISPONIBLE_RETIRO",
  "ENTREGADO",
];

const TIPOS_ENTREGA = ["RETIRO", "ENVIO"];

function validarDatosContacto({ clienteNombre, clienteTelefono }) {
  if (!clienteNombre || !String(clienteNombre).trim()) {
    throw new ValidacionError("El nombre del cliente es obligatorio");
  }
  if (!clienteTelefono || !String(clienteTelefono).trim()) {
    throw new ValidacionError("El teléfono de contacto es obligatorio");
  }
}

function validarTipoEntrega(tipoEntrega) {
  if (tipoEntrega == null || tipoEntrega === "") return null;
  if (!TIPOS_ENTREGA.includes(tipoEntrega)) {
    throw new ValidacionError(`tipoEntrega inválido: debe ser RETIRO o ENVIO`);
  }
  return tipoEntrega;
}

async function siguienteSolId(tx, empresaId) {
  const existentes = await tx.solicitudPedido.findMany({ where: { empresaId }, select: { solId: true } });
  return siguienteNumero(
    existentes.map((s) => s.solId),
    "SOL",
    4
  );
}

// Número de orden PÚBLICO (ej. "PP-2026-000154") — mismo patrón que
// siguienteSolId, pero con prefijo anual: reinicia el conteo cada año
// (PP-2027-000001, etc.), que es como el negocio piensa su numeración de
// cara al cliente.
async function siguienteNumeroOrdenPublico(tx, empresaId) {
  const prefijo = `PP-${new Date().getFullYear()}`;
  const existentes = await tx.solicitudPedido.findMany({
    where: { empresaId, numeroOrden: { startsWith: `${prefijo}-` } },
    select: { numeroOrden: true },
  });
  return siguienteNumero(
    existentes.map((s) => s.numeroOrden).filter(Boolean),
    prefijo,
    6
  );
}

// Público, sin req.usuario — se usa desde catalogo.panaprice.com. Valida
// cada producto contra la MISMA fuente de verdad que el catálogo público
// (activo + publicadoCatalogo + de la empresa correcta), así que no se puede
// solicitar un producto que el cliente nunca debió haber visto.
export async function crearSolicitudPublica(empresaId, { clienteNombre, clienteTelefono, clienteEmail, notasPersonalizacion, tipoEntrega, items }) {
  validarDatosContacto({ clienteNombre, clienteTelefono });
  const tipoEntregaValidado = validarTipoEntrega(tipoEntrega);

  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidacionError("La solicitud debe incluir al menos un producto");
  }
  for (const item of items) {
    if (!item.productoId || !Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      throw new ValidacionError("Cada línea debe indicar productoId y una cantidad entera mayor a 0");
    }
  }

  return prisma.$transaction(async (tx) => {
    const productoIds = [...new Set(items.map((i) => i.productoId))];
    const productos = await tx.producto.findMany({
      where: { id: { in: productoIds }, empresaId, activo: true, publicadoCatalogo: true, eliminadoEn: null },
      include: { preciosVolumen: true },
    });
    const productosPorId = new Map(productos.map((p) => [p.id, p]));

    const itemsData = items.map((item) => {
      const producto = productosPorId.get(item.productoId);
      if (!producto) {
        throw new ValidacionError(`Uno de los productos solicitados ya no está disponible en el catálogo`);
      }
      return {
        productoId: producto.id,
        cantidad: item.cantidad,
        disenoNotas: item.disenoNotas?.trim() || null,
        precioUnitarioEstimado: precioUnitarioParaCantidad(producto, item.cantidad),
      };
    });

    const solId = await siguienteSolId(tx, empresaId);
    const numeroOrden = await siguienteNumeroOrdenPublico(tx, empresaId);

    const solicitud = await tx.solicitudPedido.create({
      data: {
        empresaId,
        solId,
        numeroOrden,
        clienteNombre: clienteNombre.trim(),
        clienteTelefono: clienteTelefono.trim(),
        clienteEmail: clienteEmail?.trim() || null,
        notasPersonalizacion: notasPersonalizacion?.trim() || null,
        tipoEntrega: tipoEntregaValidado,
        estado: "RECIBIDA",
        estadoPublico: "RECIBIDO",
        items: { create: itemsData },
      },
      include: INCLUDE_DETALLE,
    });

    await registrarAuditoria(tx, {
      empresaId,
      usuarioId: null,
      accion: "solicitud_pedido.creada",
      detalle: { solicitudId: solicitud.id, solId: solicitud.solId },
    });

    // No hay listener registrado todavía: la "notificación interna" del MVP
    // es la bandeja de Solicitudes en el ERP (filtra por estado=RECIBIDA).
    // Cuando exista un canal real (email/Slack/WhatsApp Business API), se
    // agrega un `on(SOLICITUD_CREADA, ...)` en algún módulo de Notificaciones
    // — este archivo no cambia.
    await emit(SOLICITUD_CREADA, { tx, solicitud, empresaId });

    return solicitud;
  });
}

// Público, sin req.usuario — usado por "Rastrea tu pedido" del catálogo.
// Solo expone campos seguros para mostrar a un desconocido que solo sabe el
// número de orden (nada de teléfono/nombre/items de OTRAS solicitudes).
export async function obtenerRastreoPublico(empresaId, numeroOrden) {
  const solicitud = await prisma.solicitudPedido.findFirst({
    where: { empresaId, numeroOrden: numeroOrden?.trim() || "__ninguno__" },
    select: {
      numeroOrden: true,
      estadoPublico: true,
      tipoEntrega: true,
      agenciaEnvio: true,
      creadoEn: true,
      actualizadoEn: true,
    },
  });
  if (!solicitud) throw new NoEncontradoError("No encontramos un pedido con ese número de orden");
  return solicitud;
}

export async function listarSolicitudes(empresaId, estado) {
  return prisma.solicitudPedido.findMany({
    where: { empresaId, ...(estado ? { estado } : {}) },
    include: INCLUDE_DETALLE,
    orderBy: { creadoEn: "desc" },
  });
}

export async function obtenerSolicitud(solicitudId, empresaId) {
  const solicitud = await prisma.solicitudPedido.findFirst({
    where: { id: solicitudId, empresaId },
    include: INCLUDE_DETALLE,
  });
  if (!solicitud) throw new NoEncontradoError("Solicitud no encontrada");
  return solicitud;
}

// Cambios de estado "puros" (no incluye convertir, ver convertirSolicitud).
export async function cambiarEstadoSolicitud(solicitudId, empresaId, usuarioId, { estadoNuevo, motivoRechazo }) {
  return prisma.$transaction(async (tx) => {
    const actual = await tx.solicitudPedido.findFirst({ where: { id: solicitudId, empresaId } });
    if (!actual) throw new NoEncontradoError("Solicitud no encontrada");

    const permitidas = TRANSICIONES_SOLICITUD[actual.estado] ?? [];
    if (!permitidas.includes(estadoNuevo)) {
      throw new ValidacionError(
        `No se puede pasar de "${actual.estado}" a "${estadoNuevo}". Transiciones permitidas: ${
          permitidas.join(", ") || "ninguna (estado final)"
        }.`
      );
    }
    if (estadoNuevo === "RECHAZADA" && !motivoRechazo?.trim()) {
      throw new ValidacionError("Debe indicar un motivo de rechazo");
    }

    const solicitud = await tx.solicitudPedido.update({
      where: { id: solicitudId },
      data: {
        estado: estadoNuevo,
        motivoRechazo: estadoNuevo === "RECHAZADA" ? motivoRechazo.trim() : actual.motivoRechazo,
        actualizadoEn: new Date(),
      },
      include: INCLUDE_DETALLE,
    });

    await registrarAuditoria(tx, {
      empresaId,
      usuarioId,
      accion: "solicitud_pedido.estado_cambiado",
      detalle: { solicitudId, estadoAnterior: actual.estado, estadoNuevo },
    });

    await emit(SOLICITUD_ESTADO_CAMBIADO, { tx, solicitud, empresaId, usuarioId, estadoNuevo });

    return solicitud;
  });
}

// El paso que evita copiar el pedido a mano: crea un Pedido real
// reutilizando pedidos.service.js tal cual lo usa el resto del ERP, y solo
// después marca la solicitud como CONVERTIDA con el vínculo al pedido.
//
// Nota de diseño (MVP): esto son dos pasos secuenciales, no una única
// transacción — crearPedido() abre la suya propia. Si el segundo paso
// (marcar CONVERTIDA) fallara, el Pedido igual queda creado correctamente;
// solo habría que reintentar el marcado. Lo que este servicio SÍ evita es
// crear un Pedido duplicado por doble clic: exige estado === "APROBADA" y
// lo deja en "CONVERTIDA" inmediatamente, así un segundo intento choca con
// la validación de transición de arriba.
export async function convertirSolicitud(solicitudId, empresaId, usuarioId, { fechaIngreso, fechaCompromiso }) {
  const solicitud = await obtenerSolicitud(solicitudId, empresaId);
  if (solicitud.estado !== "APROBADA") {
    throw new ValidacionError('Solo se puede convertir una solicitud en estado "APROBADA"');
  }

  const cantidadTotal = solicitud.items.reduce((suma, item) => suma + item.cantidad, 0);
  const detalleItems = solicitud.items
    .map((item) => `${item.cantidad}x ${item.producto.nombre}${item.disenoNotas ? ` (${item.disenoNotas})` : ""}`)
    .join("; ");
  const observaciones = [
    `Origen: solicitud ${solicitud.solId} del catálogo público.`,
    solicitud.clienteEmail ? `Email: ${solicitud.clienteEmail}.` : null,
    `Tel: ${solicitud.clienteTelefono}.`,
    detalleItems ? `Ítems: ${detalleItems}.` : null,
    solicitud.notasPersonalizacion ? `Personalización: ${solicitud.notasPersonalizacion}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const pedido = await crearPedido({
    empresaId,
    usuarioId,
    clienteNombre: solicitud.clienteNombre,
    fechaIngreso: fechaIngreso ?? new Date(),
    fechaCompromiso,
    cantidadTotal,
    observaciones,
  });

  const solicitudActualizada = await prisma.$transaction(async (tx) => {
    const actual = await tx.solicitudPedido.findFirst({ where: { id: solicitudId, empresaId } });
    if (!actual || actual.estado !== "APROBADA") {
      throw new ValidacionError("La solicitud cambió de estado mientras se convertía; revise el Pedido creado");
    }

    const actualizada = await tx.solicitudPedido.update({
      where: { id: solicitudId },
      data: { estado: "CONVERTIDA", pedidoId: pedido.id, actualizadoEn: new Date() },
      include: INCLUDE_DETALLE,
    });

    await registrarAuditoria(tx, {
      empresaId,
      usuarioId,
      accion: "solicitud_pedido.convertida",
      detalle: { solicitudId, pedidoId: pedido.id, pedId: pedido.pedId },
    });

    await emit(SOLICITUD_CONVERTIDA, { tx, solicitud: actualizada, pedido, empresaId, usuarioId });

    return actualizada;
  });

  return { solicitud: solicitudActualizada, pedido };
}
