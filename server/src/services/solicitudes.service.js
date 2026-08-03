// Solicitudes de pedido creadas desde el catálogo público (sin
// autenticación). El objetivo central de este servicio es evitar copiar a
// mano pedidos de WhatsApp al ERP: `crearSolicitudPublica` es la única
// puerta de entrada pública, y `convertirSolicitud` reutiliza el
// `crearPedido()` de pedidos.service.js — no reimplementa esa lógica.
import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { registrarAuditoria } from "./auditoria.service.js";
import { siguienteNumero } from "./numeracion.service.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";
import { precioUnitarioParaCantidad } from "./productos.service.js";
import { crearPedido } from "./pedidos.service.js";
import { buscarClientePorTelefonoOCedula, crearClienteManual } from "./clientes.service.js";
import { on, emit } from "../events/eventBus.js";
import {
  SOLICITUD_CREADA,
  SOLICITUD_ESTADO_CAMBIADO,
  SOLICITUD_CONVERTIDA,
  PEDIDO_ESTADO_CAMBIADO,
} from "../events/eventos.js";

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
  items: { include: { producto: { select: { id: true, nombre: true, categoria: true, imagenUrl: true } } } },
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
// cada producto de catálogo contra la MISMA fuente de verdad que el
// catálogo público (activo + publicadoCatalogo + de la empresa correcta),
// así que no se puede solicitar un producto que el cliente nunca debió
// haber visto. Los items de diseño 100% personalizado (sin productoId) se
// aceptan igual — antes se descartaban del todo y el pedido nunca
// sincronizaba con el ERP si SOLO tenía personalizados (bug corregido
// 2026-08-02, ver nota en productoNombrePersonalizado/disenoFotoUrl del
// schema).
export async function crearSolicitudPublica(empresaId, { clienteNombre, clienteTelefono, clienteEmail, notasPersonalizacion, tipoEntrega, items }) {
  validarDatosContacto({ clienteNombre, clienteTelefono });
  const tipoEntregaValidado = validarTipoEntrega(tipoEntrega);

  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidacionError("La solicitud debe incluir al menos un producto");
  }
  for (const item of items) {
    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      throw new ValidacionError("Cada línea debe indicar una cantidad entera mayor a 0");
    }
    if (!item.productoId && !item.productoNombrePersonalizado?.trim()) {
      throw new ValidacionError("Cada línea debe indicar un productoId de catálogo o un nombre de diseño personalizado");
    }
  }

  return prisma.$transaction(async (tx) => {
    const productoIds = [...new Set(items.filter((i) => i.productoId).map((i) => i.productoId))];
    const productos = productoIds.length
      ? await tx.producto.findMany({
          where: { id: { in: productoIds }, empresaId, activo: true, publicadoCatalogo: true, eliminadoEn: null },
          include: { preciosVolumen: true },
        })
      : [];
    const productosPorId = new Map(productos.map((p) => [p.id, p]));

    const itemsData = items.map((item) => {
      if (!item.productoId) {
        // Diseño 100% personalizado: sin producto de catálogo detrás.
        return {
          productoId: null,
          cantidad: item.cantidad,
          disenoNotas: item.disenoNotas?.trim() || null,
          precioUnitarioEstimado: null,
          productoNombrePersonalizado: item.productoNombrePersonalizado.trim(),
          disenoFotoUrl: item.disenoFotoUrl?.trim() || null,
        };
      }
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
  }, TRANSACTION_OPTIONS);
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
  }, TRANSACTION_OPTIONS);
}

// Cliente por teléfono (Paso 2.1): reutiliza EXACTAMENTE la búsqueda que ya
// usa "Nuevo Pedido" — si dos solicitudes distintas traen el mismo teléfono,
// las dos terminan en la misma ficha en vez de crear una por cada una. Si
// crearClienteManual choca con el nombre (ya existe un cliente con ese
// nombre pero otro teléfono — dato real de catálogo, no siempre limpio) no
// se aborta la conversión entera: se sigue sin clienteId, igual que un
// Nuevo Pedido manual cuando la vendedora no vincula ficha.
async function obtenerOCrearClienteParaSolicitud(empresaId, solicitud) {
  const existente = await buscarClientePorTelefonoOCedula(empresaId, { telefono: solicitud.clienteTelefono });
  if (existente) return existente.id;

  try {
    const nuevo = await crearClienteManual(empresaId, {
      nombre: solicitud.clienteNombre,
      telefono: solicitud.clienteTelefono,
      email: solicitud.clienteEmail,
    });
    return nuevo.id;
  } catch (err) {
    if (err instanceof ValidacionError) return null;
    throw err;
  }
}

// RETIRO/ENVIO (catálogo) -> RETIRO/ENCOMIENDA/DELIVERY (Pedido, ver
// PedidoNew.jsx). ENVIO siempre trae posiblemente una agenciaEnvio (MRW,
// Zoom, etc.) — el mismo concepto que direccionAgencia en Pedido — así que
// mapea a ENCOMIENDA, no a DELIVERY.
function mapearTipoEntrega(tipoEntregaSolicitud) {
  if (tipoEntregaSolicitud === "RETIRO") return "RETIRO";
  if (tipoEntregaSolicitud === "ENVIO") return "ENCOMIENDA";
  return undefined;
}

// Cada SolicitudPedidoItem -> una línea de Pedido. Con productoId: se
// vincula al Producto Maestro real (mismo camino que "Ingresar ITEM
// Catálogo regular" en Nuevo Pedido — precio/tela/imagen los arma el
// backend desde el snapshot). Sin productoId (diseño 100% personalizado):
// línea manual con la foto que subió el cliente como archivo adjunto
// principal, igual que "Ingresar ITEM PRODUCTO PERSONALIZADO".
function lineaDesdeSolicitudItem(item) {
  if (item.productoId) {
    return {
      productoId: item.productoId,
      cantidad: item.cantidad,
      observacionesProduccion: item.disenoNotas || undefined,
    };
  }
  return {
    producto: item.productoNombrePersonalizado || "Diseño personalizado",
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitarioEstimado != null ? Number(item.precioUnitarioEstimado) : undefined,
    observacionesProduccion: item.disenoNotas || undefined,
    archivos: item.disenoFotoUrl
      ? [
          {
            esPrincipal: true,
            nombre: "diseno-cliente.jpg",
            tipo: "image/jpeg",
            tamano: 0,
            ubicacion: item.disenoFotoUrl,
          },
        ]
      : undefined,
  };
}

// El paso que evita copiar el pedido a mano: aprueba la solicitud y crea el
// Pedido real en un solo clic (decisión del usuario, 2026-08-02 — antes
// exigía Aprobar como paso separado). Reutiliza pedidos.service.js tal cual
// lo usa el resto del ERP; no reimplementa esa lógica.
//
// Nota de diseño (MVP): aprobar+crearPedido+marcar CONVERTIDA no es una
// única transacción — crearPedido() abre la suya propia. Si marcar
// CONVERTIDA fallara después, el Pedido igual queda creado correctamente;
// solo habría que reintentar el marcado. Lo que este servicio SÍ evita es
// un Pedido duplicado por doble clic: aprueba y queda en "CONVERTIDA"
// inmediatamente, así un segundo intento choca con la validación de
// transición de TRANSICIONES_SOLICITUD.
export async function aprobarYConvertirSolicitud(solicitudId, empresaId, usuarioId, { fechaIngreso, fechaCompromiso }) {
  const solicitud = await obtenerSolicitud(solicitudId, empresaId);
  const permitidas = TRANSICIONES_SOLICITUD[solicitud.estado] ?? [];
  if (!permitidas.includes("APROBADA") && solicitud.estado !== "APROBADA") {
    throw new ValidacionError(
      `No se puede aprobar y convertir una solicitud en estado "${solicitud.estado}".`
    );
  }

  if (solicitud.estado !== "APROBADA") {
    await prisma.$transaction(async (tx) => {
      await tx.solicitudPedido.update({ where: { id: solicitudId }, data: { estado: "APROBADA", actualizadoEn: new Date() } });
      await registrarAuditoria(tx, {
        empresaId,
        usuarioId,
        accion: "solicitud_pedido.estado_cambiado",
        detalle: { solicitudId, estadoAnterior: solicitud.estado, estadoNuevo: "APROBADA" },
      });
      await emit(SOLICITUD_ESTADO_CAMBIADO, {
        tx,
        solicitud: { ...solicitud, estado: "APROBADA" },
        empresaId,
        usuarioId,
        estadoNuevo: "APROBADA",
      });
    }, TRANSACTION_OPTIONS);
  }

  const clienteId = await obtenerOCrearClienteParaSolicitud(empresaId, solicitud);
  const lineas = solicitud.items.map(lineaDesdeSolicitudItem);
  const observaciones = [
    `Origen: solicitud ${solicitud.solId} del catálogo público${solicitud.numeroOrden ? ` (orden ${solicitud.numeroOrden})` : ""}.`,
    solicitud.clienteEmail ? `Email: ${solicitud.clienteEmail}.` : null,
    `Tel: ${solicitud.clienteTelefono}.`,
    solicitud.notasPersonalizacion ? `Notas: ${solicitud.notasPersonalizacion}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  // No manda claveIdempotencia: la protección contra doble conversión ya la
  // da la transición de estado de la solicitud misma (deja en CONVERTIDA de
  // inmediato), no la idempotencia de pedidos.service.js (esa es para el
  // POST directo de /pedidos).
  const { pedido } = await crearPedido({
    empresaId,
    usuarioId,
    clienteNombre: solicitud.clienteNombre,
    clienteId,
    fechaIngreso: fechaIngreso ?? new Date(),
    fechaCompromiso,
    tipoEntrega: mapearTipoEntrega(solicitud.tipoEntrega),
    direccionAgencia: solicitud.agenciaEnvio || undefined,
    observaciones,
    lineas,
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
  }, TRANSACTION_OPTIONS);

  return { solicitud: solicitudActualizada, pedido };
}

// Paso 3 (Bandeja de Solicitudes, 2026-08-02): cuando el Pedido vinculado a
// una solicitud avanza de estado en el ERP, el cliente lo tiene que ver
// reflejado en "Rastrea tu pedido" sin que nadie lo actualice a mano.
// LISTO_RETIRO/PREPARANDO_ENVIO y DISPONIBLE_RETIRO/ENVIADO son ramas
// alternativas según tipoEntrega (mismo criterio que ETAPAS_PUBLICAS
// arriba) — nunca inventa un valor fuera de esa lista, porque el catálogo
// (ETAPAS_INFO en catalogo/src/App.jsx) solo sabe dibujar esos 8 exactos.
function estadoPublicoDesdeEstadoPedido(estadoPedido, tipoEntregaSolicitud) {
  const esRetiro = tipoEntregaSolicitud !== "ENVIO";
  switch (estadoPedido) {
    case "EN_PRODUCCION":
      return "PRODUCCION_INICIO";
    case "LISTO":
      return esRetiro ? "LISTO_RETIRO" : "PREPARANDO_ENVIO";
    case "DESPACHADO":
      return esRetiro ? "DISPONIBLE_RETIRO" : "ENVIADO";
    case "ENTREGADO":
    case "CERRADO":
      return "ENTREGADO";
    default:
      // PENDIENTE/FACTURADO/CANCELADO: sin equivalente público más
      // avanzado que RECIBIDO — no se toca (evita retroceder la barra si
      // algún día existe una transición hacia atrás).
      return null;
  }
}

async function sincronizarEstadoPublicoSolicitud({ tx, pedido, estadoNuevo }) {
  const solicitud = await tx.solicitudPedido.findFirst({ where: { pedidoId: pedido.id } });
  if (!solicitud) return; // este Pedido no nació de una solicitud del catálogo

  const estadoPublicoNuevo = estadoPublicoDesdeEstadoPedido(estadoNuevo, solicitud.tipoEntrega);
  if (!estadoPublicoNuevo || estadoPublicoNuevo === solicitud.estadoPublico) return;

  await tx.solicitudPedido.update({
    where: { id: solicitud.id },
    data: { estadoPublico: estadoPublicoNuevo, actualizadoEn: new Date() },
  });
}

on(PEDIDO_ESTADO_CAMBIADO, sincronizarEstadoPublicoSolicitud);
