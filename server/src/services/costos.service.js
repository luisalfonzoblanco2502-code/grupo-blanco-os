// Núcleo de Facturación Administrativa — módulo Costos.
//
// Reacciona a PEDIDO_FACTURADO calculando el costo estimado — persistencia
// real en `costos_pedido` (reemplaza el simulador en memoria). Sigue sin
// existir un costeo real (Producto/ProductoInterno no tienen un costo de
// producción verificado todavía), así que se mantiene el mismo factor
// estimado ya usado antes, marcado explícitamente `fuente:
// "estimado_temporal"` para que nadie lo confunda con un dato contable real.
//
// costoReal/utilidadReal/margenReal quedan NULL — fase futura, cuando el
// consumo real de producción (inventarioConsumo.service.js) esté completo
// para todas las órdenes del pedido.
//
// Idempotencia: costos_pedido.pedidoId es UNIQUE — mismo patrón que
// Administración (create + catch P2002 = no-op).
import { on } from "../events/eventBus.js";
import { PEDIDO_FACTURADO } from "../events/eventos.js";
import { prisma } from "../db.js";
import { calcularMonto } from "./administracion.service.js";

const FACTOR_COSTO_ESTIMADO = 0.6;

async function calcularCostosDesdeFacturacion({ tx, pedido, empresaId, lineas }) {
  try {
    const monto = calcularMonto(lineas);
    const costoEstimado = monto * FACTOR_COSTO_ESTIMADO;
    const utilidadEstimada = monto - costoEstimado;
    const margenEstimado = monto > 0 ? utilidadEstimada / monto : null;

    await tx.costoPedido.create({
      data: {
        empresaId,
        pedidoId: pedido.id,
        costoEstimado,
        utilidadEstimada,
        margenEstimado,
        desglose: { material: costoEstimado, produccion: 0, otros: 0 },
        fuente: "estimado_temporal",
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      console.warn(`[costos] ya existía costo para pedido ${pedido.id}, se omite`);
      return;
    }
    console.error("[costos] error calculando costos (no bloquea la facturación):", err);
  }
}

on(PEDIDO_FACTURADO, calcularCostosDesdeFacturacion);

export function listarCostos(empresaId) {
  return prisma.costoPedido.findMany({
    where: { empresaId },
    include: { pedido: { select: { pedId: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export function obtenerCostosPedido(pedidoId, empresaId) {
  return prisma.costoPedido.findFirst({ where: { pedidoId, empresaId } });
}
