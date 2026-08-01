// Núcleo de Facturación Administrativa — módulo Inventario, mitad "consumo".
//
// Reacciona a ORDEN_ETAPA_CAMBIADA (evento ya existente de Producción) y
// consume definitivamente los materiales SOLO cuando la orden entra a la
// etapa "Corte" (decisión aprobada). Antes de Corte, esos materiales están
// reservados pero no consumidos — es la contraparte de
// inventarioReserva.service.js.
//
// Requiere orden.productoInternoId (seteado por Producción al crear la
// orden, ver crearOrdenesDesdeLineas en ordenesProduccion.service.js).
// Órdenes sin producto de catálogo no consumen nada (misma limitación
// conocida que en la reserva).
//
// Idempotencia: movimientos_inventario tiene UNIQUE(empresaId,
// ordenProduccionId, etapaId, itemInventarioId, tipo) para CONSUMO —
// reprocesar el evento no puede consumir el mismo insumo dos veces para la
// misma orden+etapa.
import { on } from "../events/eventBus.js";
import { ORDEN_ETAPA_CAMBIADA } from "../events/eventos.js";

const ETAPA_DE_CONSUMO = "Corte";

async function consumirInsumo(tx, { empresaId, ordenProduccionId, etapaId, itemInventarioId, cantidad }) {
  try {
    await tx.movimientoInventario.create({
      data: { empresaId, ordenProduccionId, etapaId, itemInventarioId, tipo: "CONSUMO", cantidad },
    });
  } catch (err) {
    if (err.code === "P2002") return; // ya consumido, no-op
    throw err;
  }
  // Mueve de "reservado" a "consumido": baja existencia real y libera la
  // porción reservada correspondiente (nunca negativo por debajo de 0 en
  // existenciaReservada — el CHECK de la BD ya lo exige).
  await tx.itemInventario.update({
    where: { id: itemInventarioId },
    data: {
      existencia: { decrement: cantidad },
      existenciaReservada: { decrement: cantidad },
    },
  });
}

async function consumirEnCorte({ tx, orden, empresaId }) {
  try {
    if (orden.etapa.nombre !== ETAPA_DE_CONSUMO) return;
    if (!orden.productoInternoId) return; // sin catálogo, sin BOM que consumir

    const insumos = await tx.productoInsumo.findMany({
      where: { productoInternoId: orden.productoInternoId, empresaId },
    });
    for (const insumo of insumos) {
      const cantidadNecesaria = Number(insumo.cantidadPorUnidad) * Number(orden.cantidad || 0);
      if (cantidadNecesaria <= 0) continue;
      await consumirInsumo(tx, {
        empresaId,
        ordenProduccionId: orden.id,
        etapaId: orden.etapaId,
        itemInventarioId: insumo.itemInventarioId,
        cantidad: cantidadNecesaria,
      });
    }
  } catch (err) {
    console.error("[inventario-consumo] error consumiendo en Corte (no bloquea el cambio de etapa):", err);
  }
}

on(ORDEN_ETAPA_CAMBIADA, consumirEnCorte);
