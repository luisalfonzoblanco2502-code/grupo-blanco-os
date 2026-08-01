// Núcleo de Facturación Administrativa — módulo Dashboard (indicadores).
//
// A diferencia de la fase anterior (simulador en memoria con contadores que
// se incrementaban por evento), esto ya NO necesita un listener: todo se
// deriva agregando documentos_venta/costos_pedido en tiempo de lectura. Sin
// contador que mutar, no hay riesgo de duplicar por reproceso de evento —
// mismo criterio que crm.service.js.
import { prisma } from "../db.js";
import { listarFichasClientes } from "./clientes.service.js";

function inicioDelDia() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

export async function obtenerIndicadores(empresaId) {
  const desde = inicioDelDia();

  const [documentosHoy, documentosTotales, costosHoy, clientes] = await Promise.all([
    prisma.documentoVenta.findMany({
      where: { empresaId, estado: "EMITIDO", fechaEmision: { gte: desde } },
    }),
    prisma.documentoVenta.aggregate({
      where: { empresaId, estado: "EMITIDO" },
      _sum: { total: true },
    }),
    prisma.costoPedido.findMany({
      where: { empresaId, creadoEn: { gte: desde } },
    }),
    listarFichasClientes(empresaId),
  ]);

  const ventasHoy = documentosHoy.reduce((s, d) => s + Number(d.total), 0);
  const utilidadEstimadaHoy = costosHoy.reduce((s, c) => s + Number(c.utilidadEstimada), 0);

  return {
    ventasHoy,
    ingresosTotales: Number(documentosTotales._sum.total ?? 0),
    pedidosFacturadosHoy: documentosHoy.length,
    utilidadEstimadaHoy,
    clientesActivos: clientes.length,
  };
}
