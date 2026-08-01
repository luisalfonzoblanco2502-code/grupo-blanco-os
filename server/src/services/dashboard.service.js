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

// ─────────────────────────────────────────────────────────────────────────
// Panel General (Home ejecutivo, 2026-08-01) — distinto de "Centro de
// Control Diario" arriba (ese sigue siendo la vista operativa de
// Producción, sin tocar). Esto es el resumen comercial/financiero que se
// ve al entrar al sistema.
//
// Decisión explícita del usuario: TODO con datos reales, sin inventar
// márgenes ni empresas de ejemplo — hoy solo existe 1 fila en `empresas`
// (Grupo Blanco) y muy pocos DocumentoVenta/CostoPedido reales (el
// Facturador Administrativo/Registrar Pago todavía no está activo en
// producción), así que la mayoría de estos números van a verse en cero o
// casi — es lo honesto, no un bug. "Ganancias" usa utilidadReal/
// utilidadEstimada de CostoPedido (dato real, aunque disperso), nunca un
// margen inventado.
function inicioDelMes(fecha = new Date()) {
  const d = new Date(fecha);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function inicioMesAnterior(fecha = new Date()) {
  const d = inicioDelMes(fecha);
  d.setMonth(d.getMonth() - 1);
  return d;
}
function variacionPorcentual(actual, anterior) {
  if (!anterior) return null; // sin base real de comparación — no se inventa un "0%" ni un "100%"
  return Math.round(((actual - anterior) / anterior) * 100);
}

export async function obtenerPanelGeneral(empresaId) {
  const hoy = inicioDelDia();
  const finHoy = finDelDia();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  const finAyer = new Date(finHoy);
  finAyer.setDate(finAyer.getDate() - 1);
  const inicioMes = inicioDelMes();
  const inicioMesAnt = inicioMesAnterior();
  const hace7dias = new Date(hoy);
  hace7dias.setDate(hace7dias.getDate() - 6);
  const en3dias = new Date(finHoy);
  en3dias.setDate(en3dias.getDate() + 3);

  const [empresas, documentos, costos, ordenes, lineasPorProducto] = await Promise.all([
    prisma.empresa.findMany({ select: { id: true, nombre: true } }),
    // Ventana amplia (desde el inicio del mes anterior) para poder derivar
    // hoy/ayer/mes/mes anterior/tendencia 7 días de UNA sola consulta, en
    // vez de 5 consultas separadas.
    prisma.documentoVenta.findMany({
      where: { fechaEmision: { gte: inicioMesAnt }, estado: "EMITIDO" },
      select: { total: true, fechaEmision: true, empresaId: true },
    }),
    prisma.costoPedido.findMany({
      where: { creadoEn: { gte: inicioMesAnt } },
      select: { utilidadReal: true, utilidadEstimada: true, creadoEn: true, empresaId: true },
    }),
    prisma.ordenProduccion.findMany({
      where: { empresaId, eliminadoEn: null },
      select: {
        id: true,
        pedidoId: true,
        cantidad: true,
        producto: true,
        etapaId: true,
        fechaEntregaReal: true,
        etapa: { select: { orden: true } },
        pedido: { select: { id: true, fechaCompromiso: true } },
      },
    }),
    prisma.pedidoLinea.groupBy({
      by: ["producto"],
      where: { empresaId },
      _sum: { cantidad: true },
      orderBy: { _sum: { cantidad: "desc" } },
      take: 1,
    }),
  ]);

  const sumaTotal = (docs) => docs.reduce((s, d) => s + Number(d.total), 0);
  const enRango = (fecha, desde, hasta) => fecha >= desde && (!hasta || fecha <= hasta);

  const ventasHoy = sumaTotal(documentos.filter((d) => enRango(d.fechaEmision, hoy, finHoy)));
  const ventasAyer = sumaTotal(documentos.filter((d) => enRango(d.fechaEmision, ayer, finAyer)));
  const ventasMes = sumaTotal(documentos.filter((d) => enRango(d.fechaEmision, inicioMes)));
  const ventasMesAnterior = sumaTotal(documentos.filter((d) => enRango(d.fechaEmision, inicioMesAnt, new Date(inicioMes - 1))));

  const utilidad = (c) => Number(c.utilidadReal ?? c.utilidadEstimada ?? 0);
  const gananciasMes = costos.filter((c) => enRango(c.creadoEn, inicioMes)).reduce((s, c) => s + utilidad(c), 0);
  const gananciasMesAnterior = costos
    .filter((c) => enRango(c.creadoEn, inicioMesAnt, new Date(inicioMes - 1)))
    .reduce((s, c) => s + utilidad(c), 0);

  const tendencia7dias = [...Array(7)].map((_, i) => {
    const dia = new Date(hace7dias);
    dia.setDate(dia.getDate() + i);
    const finDia = new Date(dia);
    finDia.setHours(23, 59, 59, 999);
    return {
      dia: dia.toISOString().slice(0, 10),
      ventas: sumaTotal(documentos.filter((d) => enRango(d.fechaEmision, dia, finDia))),
    };
  });

  // Tasa de cumplimiento: de las OPs ya entregadas (fechaEntregaReal
  // presente), qué porcentaje llegó a tiempo o antes del compromiso. Sin
  // entregas todavía, no hay base real para el porcentaje — null, no 0%.
  const entregadas = ordenes.filter((o) => o.fechaEntregaReal);
  const aTiempo = entregadas.filter((o) => new Date(o.fechaEntregaReal) <= new Date(o.pedido.fechaCompromiso));
  const tasaCumplimiento = entregadas.length > 0 ? Math.round((aTiempo.length / entregadas.length) * 100) : null;

  const etapaMaxima = Math.max(1, ...ordenes.map((o) => o.etapa.orden));
  const activas = ordenes.filter((o) => o.etapa.orden < etapaMaxima);
  const enRiesgo = activas.filter((o) => {
    const situacion = calcularSituacionEntrega({ fechaEntregaReal: o.fechaEntregaReal, fechaCompromiso: o.pedido.fechaCompromiso });
    return situacion === "Atrasado" || situacion === "Urgente";
  });
  const pedidosPorVencer = new Set(
    activas
      .filter((o) => new Date(o.pedido.fechaCompromiso) >= hoy && new Date(o.pedido.fechaCompromiso) <= en3dias)
      .map((o) => o.pedidoId)
  );

  const porEmpresa = empresas.map((e) => {
    const docsEmpresa = documentos.filter((d) => d.empresaId === e.id);
    const ventas = sumaTotal(docsEmpresa.filter((d) => enRango(d.fechaEmision, inicioMes)));
    const ventasAnt = sumaTotal(docsEmpresa.filter((d) => enRango(d.fechaEmision, inicioMesAnt, new Date(inicioMes - 1))));
    return { nombre: e.nombre, ventas, variacion: variacionPorcentual(ventas, ventasAnt) };
  });

  return {
    ventasHoy,
    variacionVentasVsAyer: variacionPorcentual(ventasHoy, ventasAyer),
    gananciasMes,
    variacionGananciasVsMesAnterior: variacionPorcentual(gananciasMes, gananciasMesAnterior),
    tasaCumplimiento,
    ordenesEnProduccion: activas.length,
    ordenesEnRiesgo: enRiesgo.length,
    pedidosPorVencer3Dias: pedidosPorVencer.size,
    topProducto: lineasPorProducto[0]
      ? { nombre: lineasPorProducto[0].producto, unidades: lineasPorProducto[0]._sum.cantidad }
      : null,
    porEmpresa,
    tendencia7dias,
  };
}
