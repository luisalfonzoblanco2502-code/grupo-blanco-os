// Núcleo de Facturación Administrativa — módulo Administración.
//
// Reacciona a PEDIDO_FACTURADO creando el Documento de Venta — persistencia
// real en `documentos_venta` (reemplaza el simulador en memoria de RC2/fase
// anterior). "Facturar no equivale a cobrar": estado EMITIDO, saldoPendiente
// arranca en total, no se toca hasta que exista un Pago.
//
// Idempotencia: documentos_venta.pedidoId es UNIQUE — si este listener
// corriera dos veces para el mismo pedido (reproceso de evento), el segundo
// create() choca contra la unique constraint (P2002) y se trata como
// no-op: NO se relanza el error (un bug de reproceso jamás debe poder
// revertir la creación real de la Orden de Producción, que corre en el
// mismo emit()).
import { on } from "../events/eventBus.js";
import { PEDIDO_FACTURADO } from "../events/eventos.js";
import { prisma } from "../db.js";
import { siguienteNumero } from "./numeracion.service.js";
import { obtenerOCrearCliente } from "./clientes.service.js";

export function calcularMonto(lineas) {
  return lineas.reduce((total, linea) => {
    const precio = Number(linea.precioUnitario) || 0;
    const cantidad = Number(linea.cantidad) || 0;
    return total + precio * cantidad;
  }, 0);
}

async function registrarDocumentoDesdeFacturacion({ tx, pedido, empresaId, usuarioId, lineas }) {
  try {
    const monto = calcularMonto(lineas);
    const cliente = pedido.clienteNombre
      ? await obtenerOCrearCliente(tx, empresaId, pedido.clienteNombre)
      : null;

    const numerosExistentes = await tx.documentoVenta.findMany({
      where: { empresaId },
      select: { numero: true },
    });
    const numero = siguienteNumero(
      numerosExistentes.map((d) => d.numero),
      "FAC"
    );

    return await tx.documentoVenta.create({
      data: {
        empresaId,
        pedidoId: pedido.id,
        clienteId: cliente?.id ?? null,
        numero,
        clienteNombre: pedido.clienteNombre,
        subtotal: monto,
        total: monto,
        saldoPendiente: monto,
        estado: "EMITIDO",
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      // Ya existe un documento para este pedido — reproceso del evento,
      // no-op seguro. No relanzar: no puede tumbar la facturación real.
      console.warn(`[administracion] documento ya existía para pedido ${pedido.id}, se omite`);
      return tx.documentoVenta.findUnique({ where: { pedidoId: pedido.id } });
    }
    console.error("[administracion] error creando documento de venta (no bloquea la facturación):", err);
    return null;
  }
}

on(PEDIDO_FACTURADO, registrarDocumentoDesdeFacturacion);

export function listarDocumentosVenta(empresaId) {
  return prisma.documentoVenta.findMany({
    where: { empresaId },
    include: { pagos: true },
    orderBy: { fechaEmision: "desc" },
  });
}

export function obtenerDocumentoPorPedido(pedidoId, empresaId) {
  return prisma.documentoVenta.findFirst({
    where: { pedidoId, empresaId },
    include: { pagos: { orderBy: { fecha: "desc" } } },
  });
}
