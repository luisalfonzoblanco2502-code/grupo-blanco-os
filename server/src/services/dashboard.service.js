import { prisma } from "../db.js";
import { calcularSituacionEntrega } from "./ordenesProduccion.service.js";

// Las 4 categorías que pidió el CEO para el Centro de Control Diario.
// "Entregado" existe (calcularSituacionEntrega la calcula) pero no es
// accionable — ya está resuelta — así que no aparece en centroControl,
// solo en el conteo general de ordenesPorSituacion.
const SITUACIONES_ACCIONABLES = ["Atrasado", "Urgente", "Próximo a vencer", "A tiempo"];

// Release Candidate: antes esto hacía 5 consultas, dos de ellas redundantes
// entre sí (un groupBy por etapa Y una consulta aparte a la vista
// v_ordenes_produccion_estado para las situaciones — con una lógica de
// situación distinta a la que ahora usa el resto de la app, ver Sprint 11).
// Ahora son 3 consultas: se trae la lista de órdenes activas UNA sola vez
// y de ahí se derivan tanto "por etapa" como "por situación", con la MISMA
// función calcularSituacionEntrega que ya usa el listado de órdenes — así
// el conteo del dashboard y el badge de cada orden nunca pueden desalinearse.
function inicioDelDia() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}
function finDelDia() {
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  return hoy;
}

export async function obtenerResumenDashboard(empresaId) {
  const [pedidosActivos, ordenes, etapas, actividadReciente] = await Promise.all([
    prisma.pedido.count({ where: { empresaId, eliminadoEn: null } }),
    prisma.ordenProduccion.findMany({
      where: { empresaId, eliminadoEn: null },
      select: {
        id: true,
        opId: true,
        producto: true,
        cantidad: true,
        fechaEntregaReal: true,
        etapaId: true,
        responsableUsuario: { select: { id: true, nombre: true } },
        responsableExterno: true,
        pedido: { select: { id: true, pedId: true, clienteNombre: true, fechaCompromiso: true } },
      },
    }),
    prisma.etapa.findMany({ orderBy: { orden: "asc" } }),
    // Actividad reciente: últimos cambios de etapa de toda la empresa (no
    // por orden individual), para el "qué pasó últimamente" del dashboard.
    prisma.bitacoraEvento.findMany({
      where: { empresaId, tipoEvento: "cambio_etapa" },
      orderBy: { ocurridoEn: "desc" },
      take: 15,
      include: {
        usuario: { select: { nombre: true } },
        ordenProduccion: {
          select: { id: true, opId: true, producto: true, pedido: { select: { clienteNombre: true } } },
        },
      },
    }),
  ]);

  const ordenesConSituacion = ordenes.map((orden) => ({
    ...orden,
    situacion: calcularSituacionEntrega({
      fechaEntregaReal: orden.fechaEntregaReal,
      fechaCompromiso: orden.pedido.fechaCompromiso,
    }),
  }));

  const ordenesPorEtapa = etapas.map((etapa) => ({
    etapaId: etapa.id,
    etapa: etapa.nombre,
    orden: etapa.orden,
    cantidad: ordenes.filter((o) => o.etapaId === etapa.id).length,
  }));

  const ordenesPorSituacion = ordenesConSituacion.reduce((acc, o) => {
    acc[o.situacion] = (acc[o.situacion] ?? 0) + 1;
    return acc;
  }, {});

  // Centro de Control Diario: las órdenes reales detrás de cada conteo,
  // para que el supervisor entre directo al problema en vez de solo ver
  // un número.
  const centroControl = {};
  for (const situacion of SITUACIONES_ACCIONABLES) {
    centroControl[situacion] = ordenesConSituacion
      .filter((o) => o.situacion === situacion)
      .map((o) => ({
        id: o.id,
        opId: o.opId,
        producto: o.producto,
        cantidad: o.cantidad,
        pedido: o.pedido,
        responsable: o.responsableUsuario?.nombre ?? o.responsableExterno ?? null,
      }));
  }

  const desde = inicioDelDia();
  const hasta = finDelDia();
  const desdeAyer = new Date(desde);
  desdeAyer.setDate(desdeAyer.getDate() - 1);
  const hastaAyer = new Date(hasta);
  hastaAyer.setDate(hastaAyer.getDate() - 1);

  const entregadasHoy = ordenesConSituacion.filter(
    (o) => o.fechaEntregaReal && new Date(o.fechaEntregaReal) >= desde && new Date(o.fechaEntregaReal) <= hasta
  );
  // "vs ayer" en entregadasHoy: comparación honesta porque ambos lados son el
  // mismo cálculo (entregas reales) sobre una ventana de 24h — no se inventa
  // una tendencia sobre datos que no tenemos (ej. "pedidos activos" no tiene
  // foto histórica guardada, así que no se le agrega variación).
  const entregadasAyer = ordenesConSituacion.filter(
    (o) => o.fechaEntregaReal && new Date(o.fechaEntregaReal) >= desdeAyer && new Date(o.fechaEntregaReal) <= hastaAyer
  );
  const vencenHoy = ordenesConSituacion.filter(
    (o) =>
      o.situacion !== "Entregado" &&
      new Date(o.pedido.fechaCompromiso) >= desde &&
      new Date(o.pedido.fechaCompromiso) <= hasta
  );

  // Próximas entregas: lo que no está entregado, ordenado por fecha de
  // compromiso más próxima primero — la cola de trabajo real.
  const proximasEntregas = ordenesConSituacion
    .filter((o) => o.situacion !== "Entregado")
    .sort((a, b) => new Date(a.pedido.fechaCompromiso) - new Date(b.pedido.fechaCompromiso))
    .slice(0, 10)
    .map((o) => ({
      id: o.id,
      opId: o.opId,
      producto: o.producto,
      cliente: o.pedido.clienteNombre,
      fechaCompromiso: o.pedido.fechaCompromiso,
      situacion: o.situacion,
    }));

  // Carga por responsable: cuántas órdenes activas (no entregadas) tiene
  // cada persona — para detectar quién está sobrecargado de un vistazo.
  const cargaPorResponsable = new Map();
  for (const o of ordenesConSituacion) {
    if (o.situacion === "Entregado") continue;
    const nombre = o.responsableUsuario?.nombre ?? o.responsableExterno ?? "Sin asignar";
    cargaPorResponsable.set(nombre, (cargaPorResponsable.get(nombre) ?? 0) + 1);
  }
  const cargaResponsables = [...cargaPorResponsable.entries()]
    .map(([responsable, cantidad]) => ({ responsable, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Producción semanal: entregas reales por día (últimos 7 días, hoy
  // incluido) — mismo criterio de "entregada" que entregadasHoy, solo que
  // agrupado día a día para el mini-gráfico del Centro de Control.
  const produccionSemanal = [...Array(7)].map((_, i) => {
    const dia = new Date();
    dia.setHours(0, 0, 0, 0);
    dia.setDate(dia.getDate() - (6 - i));
    const finDia = new Date(dia);
    finDia.setHours(23, 59, 59, 999);
    const cantidad = ordenesConSituacion.filter(
      (o) => o.fechaEntregaReal && new Date(o.fechaEntregaReal) >= dia && new Date(o.fechaEntregaReal) <= finDia
    ).length;
    return { fecha: dia.toISOString().slice(0, 10), cantidad };
  });

  return {
    pedidosActivos,
    ordenesActivas: ordenes.length,
    entregadasHoy: entregadasHoy.length,
    entregadasAyer: entregadasAyer.length,
    vencenHoy: vencenHoy.length,
    ordenesPorEtapa,
    ordenesPorSituacion,
    centroControl,
    proximasEntregas,
    cargaResponsables,
    produccionSemanal,
    actividadReciente: actividadReciente.map((e) => ({
      id: e.id,
      ocurridoEn: e.ocurridoEn,
      usuario: e.usuario?.nombre ?? "Sistema",
      opId: e.ordenProduccion?.opId,
      ordenId: e.ordenProduccion?.id,
      producto: e.ordenProduccion?.producto,
      cliente: e.ordenProduccion?.pedido?.clienteNombre,
      etapaAnterior: e.valorAnterior,
      etapaNueva: e.valorNuevo,
    })),
  };
}
