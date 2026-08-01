// Núcleo de Facturación Administrativa — Pagos e Ingresos.
//
// "Facturar no equivale a cobrar": esto es una acción explícita del usuario
// ("Registrar pago"), no una reacción automática a PEDIDO_FACTURADO. Soporta
// pagos parciales desde el modelo (N filas de PagoIngreso por un mismo
// DocumentoVenta, cada una baja saldoPendiente) — no hace falta ninguna
// lógica especial para "parcial": simplemente no se exige monto == saldo.
//
// No necesita la misma idempotencia que PEDIDO_FACTURADO: cada pago es un
// hecho nuevo y real (no un evento reintentable), la única protección real
// es evitar doble-submit desde el cliente (deshabilitar el botón), igual
// que el resto de la app.
import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { emit } from "../events/eventBus.js";
import { PAGO_REGISTRADO } from "../events/eventos.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";

export async function registrarPago(
  documentoVentaId,
  empresaId,
  usuarioId,
  { monto, metodoPago, cajaCuentaId, moneda, tasaCambio, referencia }
) {
  if (!(Number(monto) > 0)) throw new ValidacionError("El monto del pago debe ser mayor a 0");
  if (!metodoPago) throw new ValidacionError("Debe indicar un método de pago");
  if (!cajaCuentaId) throw new ValidacionError("Debe indicar una caja o cuenta");

  return prisma.$transaction(async (tx) => {
    const documento = await tx.documentoVenta.findFirst({
      where: { id: documentoVentaId, empresaId },
    });
    if (!documento) throw new NoEncontradoError("Documento de venta no encontrado");
    if (documento.estado !== "EMITIDO") {
      throw new ValidacionError("Este documento no está EMITIDO — no admite pagos");
    }
    if (Number(monto) > Number(documento.saldoPendiente)) {
      throw new ValidacionError(
        `El monto (${monto}) supera el saldo pendiente (${documento.saldoPendiente})`
      );
    }

    const pago = await tx.pagoIngreso.create({
      data: {
        empresaId,
        documentoVentaId,
        monto: Number(monto),
        moneda: moneda || documento.moneda,
        tasaCambio: tasaCambio != null ? Number(tasaCambio) : 1,
        metodoPago,
        cajaCuentaId,
        referencia: referencia || null,
        registradoPorUsuarioId: usuarioId,
      },
    });

    const documentoActualizado = await tx.documentoVenta.update({
      where: { id: documentoVentaId },
      data: { saldoPendiente: { decrement: Number(monto) }, actualizadoEn: new Date() },
    });

    await emit(PAGO_REGISTRADO, { tx, pago, documento: documentoActualizado, empresaId, usuarioId });

    return { pago, documento: documentoActualizado };
  }, TRANSACTION_OPTIONS);
}

// Conveniencia para la ruta: el usuario registra el pago desde el Pedido,
// no conoce (ni le importa) el id interno del DocumentoVenta.
export async function registrarPagoPorPedido(pedidoId, empresaId, usuarioId, datosPago) {
  const documento = await prisma.documentoVenta.findFirst({ where: { pedidoId, empresaId } });
  if (!documento) throw new NoEncontradoError("Este pedido todavía no tiene un documento de venta");
  return registrarPago(documento.id, empresaId, usuarioId, datosPago);
}

export function listarPagos(empresaId, documentoVentaId) {
  return prisma.pagoIngreso.findMany({
    where: { empresaId, ...(documentoVentaId ? { documentoVentaId } : {}) },
    orderBy: { fecha: "desc" },
  });
}
