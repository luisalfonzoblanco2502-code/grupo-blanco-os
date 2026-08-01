// Núcleo de Facturación Administrativa — módulo Inventario, mitad "reserva".
//
// Reacciona a PEDIDO_FACTURADO reservando materiales — NUNCA consume acá
// (regla de oro del flujo aprobado: reservar ≠ consumir; el consumo real
// ocurre en la etapa Corte, ver inventarioConsumo.service.js). Requiere que
// la línea traiga `productoInternoId` (Catálogo Interno) para saber qué BOM
// aplicar — líneas sin producto de catálogo simplemente no reservan nada
// (no es un error, solo una limitación conocida mientras se carga el BOM).
//
// Idempotencia: movimientos_inventario tiene UNIQUE(empresaId, pedidoId,
// itemInventarioId, tipo) para RESERVA — reprocesar el evento no puede
// reservar el mismo insumo dos veces para el mismo pedido.
import { on } from "../events/eventBus.js";
import { PEDIDO_FACTURADO } from "../events/eventos.js";

async function reservarInsumo(tx, { empresaId, pedidoId, itemInventarioId, cantidad }) {
  try {
    await tx.movimientoInventario.create({
      data: { empresaId, pedidoId, itemInventarioId, tipo: "RESERVA", cantidad },
    });
  } catch (err) {
    if (err.code === "P2002") return false; // ya reservado, no-op
    throw err;
  }
  await tx.itemInventario.update({
    where: { id: itemInventarioId },
    data: { existenciaReservada: { increment: cantidad } },
  });
  return true;
}

async function reservarMaterialesDesdeFacturacion({ tx, pedido, empresaId, lineas }) {
  try {
    // Bug confirmado (OP agrupada por lote, 2026-07-29): movimientos_inventario
    // tiene UNIQUE(empresaId, pedidoId, itemInventarioId, tipo) — si dos LÍNEAS
    // del mismo pedido usan el mismo insumo, reservar por línea (una llamada
    // por línea) hacía que la segunda reserva chocara contra esa UNIQUE y se
    // descartara en silencio (create+catch(P2002)=no-op), perdiendo cantidad
    // real reservada. Corrección mínima: sumar la cantidad necesaria por
    // itemInventarioId de TODAS las líneas del pedido primero, y reservar
    // una sola vez por insumo con el total — así la UNIQUE nunca se choca
    // dentro de una misma facturación, y el no-op de reprocesar sigue siendo
    // correcto (mismo pedido, mismas líneas, mismo total).
    const cantidadPorItem = new Map();
    for (const linea of lineas) {
      if (!linea.productoInternoId) continue; // sin catálogo, sin BOM que reservar
      const insumos = await tx.productoInsumo.findMany({
        where: { productoInternoId: linea.productoInternoId, empresaId },
      });
      for (const insumo of insumos) {
        const cantidadNecesaria = Number(insumo.cantidadPorUnidad) * Number(linea.cantidad || 0);
        if (cantidadNecesaria <= 0) continue;
        cantidadPorItem.set(
          insumo.itemInventarioId,
          (cantidadPorItem.get(insumo.itemInventarioId) || 0) + cantidadNecesaria
        );
      }
    }
    for (const [itemInventarioId, cantidad] of cantidadPorItem) {
      await reservarInsumo(tx, { empresaId, pedidoId: pedido.id, itemInventarioId, cantidad });
    }
  } catch (err) {
    // Nunca relanzar: un error acá no puede tumbar la creación real de la
    // Orden de Producción, que corre en el mismo emit().
    console.error("[inventario-reserva] error reservando materiales (no bloquea la facturación):", err);
  }
}

on(PEDIDO_FACTURADO, reservarMaterialesDesdeFacturacion);

// Liberar reservas — para cuando exista la capacidad de cancelar un pedido
// ya facturado (no wired todavía: hoy ESTADOS_CANCELABLES no incluye
// FACTURADO). Queda lista para conectar sin volver a diseñar el mecanismo.
export async function liberarReservaPedido(tx, { pedidoId, empresaId }) {
  const reservas = await tx.movimientoInventario.findMany({
    where: { empresaId, pedidoId, tipo: "RESERVA" },
  });
  for (const reserva of reservas) {
    try {
      await tx.movimientoInventario.create({
        data: {
          empresaId,
          pedidoId,
          itemInventarioId: reserva.itemInventarioId,
          tipo: "LIBERACION",
          cantidad: reserva.cantidad,
        },
      });
    } catch (err) {
      if (err.code === "P2002") continue; // ya liberada
      throw err;
    }
    await tx.itemInventario.update({
      where: { id: reserva.itemInventarioId },
      data: { existenciaReservada: { decrement: reserva.cantidad } },
    });
  }
}
