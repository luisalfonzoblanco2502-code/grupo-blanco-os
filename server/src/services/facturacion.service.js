// El corazón de Grupo Blanco OS: convierte un Pedido en Orden(es) de
// Producción reales, todo en una sola transacción.
//
// Este servicio deliberadamente NO sabe cómo se crea una Orden de
// Producción — eso es dominio de Producción. Solo publica el hecho de
// negocio "PEDIDO_FACTURADO" vía el Event Bus interno (ver events/eventBus.js)
// y dentro de la MISMA transacción (`tx` viaja en el payload por convención
// de este evento) para que la reacción sea todo-o-nada junto con el resto
// del flujo. Cuando existan Inventario/CRM/Finanzas, se conectan agregando
// su propio `on(PEDIDO_FACTURADO, ...)` — este archivo no cambia.
import { prisma, TRANSACTION_OPTIONS } from "../db.js";
import { obtenerPedidoPropio } from "./pedidos.service.js";
import { cambiarEstadoPedido } from "./pedidoEstado.service.js";
import { ValidacionError } from "./errors.js";
import { emit } from "../events/eventBus.js";
import { PEDIDO_FACTURADO, PEDIDO_ESTADO_CAMBIADO } from "../events/eventos.js";

export async function facturarPedido(pedidoId, empresaId, usuarioId, { lineas }) {
  // Chequeo genérico ("hay algo que facturar"), no de forma de línea — el
  // contenido de cada línea es responsabilidad de quien reacciona al evento.
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new ValidacionError("Debe indicar al menos una línea de producción para facturar");
  }

  return prisma.$transaction(async (tx) => {
    const pedido = await obtenerPedidoPropio(tx, pedidoId, empresaId);

    // La máquina de estados es ahora el único guardián: solo PENDIENTE puede
    // pasar a FACTURADO. Esto reemplaza al viejo chequeo "¿ya tiene órdenes?"
    // y de paso cierra un caso que ese chequeo no cubría (un pedido
    // CANCELADO tampoco tiene órdenes, pero tampoco debería poder facturarse).
    await cambiarEstadoPedido(tx, { pedidoId, empresaId, usuarioId, estadoNuevo: "FACTURADO" });

    const resultados = await emit(PEDIDO_FACTURADO, { tx, pedido, empresaId, usuarioId, lineas });

    await emit(PEDIDO_ESTADO_CAMBIADO, { tx, pedido, empresaId, usuarioId, estadoNuevo: "FACTURADO" });

    return { pedido, ordenesCreadas: resultados.flat().filter(Boolean) };
  }, TRANSACTION_OPTIONS);
}
