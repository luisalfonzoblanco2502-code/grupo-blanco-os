import { prisma } from "../db.js";

export async function obtenerResumenDashboard(empresaId) {
  const [pedidosActivos, ordenesActivas, ordenesPorEtapaRaw, etapas, vistaOrdenes] =
    await Promise.all([
      prisma.pedido.count({ where: { empresaId, eliminadoEn: null } }),
      prisma.ordenProduccion.count({ where: { empresaId, eliminadoEn: null } }),
      prisma.ordenProduccion.groupBy({
        by: ["etapaId"],
        where: { empresaId, eliminadoEn: null },
        _count: { _all: true },
      }),
      prisma.etapa.findMany({ orderBy: { orden: "asc" } }),
      prisma.vOrdenesProduccionEstado.findMany({ where: { empresaId }, select: { situacion: true } }),
    ]);

  const ordenesPorEtapa = etapas.map((etapa) => ({
    etapaId: etapa.id,
    etapa: etapa.nombre,
    orden: etapa.orden,
    cantidad: ordenesPorEtapaRaw.find((o) => o.etapaId === etapa.id)?._count._all ?? 0,
  }));

  const ordenesPorSituacion = vistaOrdenes.reduce((acc, row) => {
    const key = row.situacion ?? "Sin datos";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return { pedidosActivos, ordenesActivas, ordenesPorEtapa, ordenesPorSituacion };
}
