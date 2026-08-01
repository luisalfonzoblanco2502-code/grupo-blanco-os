// Analytics de ATLAS — lecturas agregadas, nunca contadores mutables (mismo
// criterio que clientes.service.js con Cliente: todo se calcula al leer,
// nada se guarda como número que reprocesar pueda desalinear).
//
// Fase 0.1: sin ninguna automatización real corriendo todavía, estas
// consultas devuelven datos reales pero probablemente en cero — quedan
// listas para el día que haya tráfico de verdad, no simuladas.
//
// Corrección arquitectónica 0.1.1: `canal` ya no vive en AtlasContacto
// (movió a AtlasIdentidadCanal) — "identidades por canal" es la métrica
// correcta ahora, no "contactos por canal": un mismo contacto puede tener
// identidades en varios canales a la vez, así que sumaría más de una vez
// si se contara por contacto.
import { prisma } from "../../db.js";

export async function resumenGeneral(empresaId) {
  const [totalContactos, porEstado, identidadesPorCanal] = await Promise.all([
    prisma.atlasContacto.count({ where: { empresaId, fusionadoEnId: null } }),
    prisma.atlasContacto.groupBy({ by: ["estadoComercial"], where: { empresaId, fusionadoEnId: null }, _count: true }),
    prisma.atlasIdentidadCanal.groupBy({ by: ["canal"], where: { empresaId }, _count: true }),
  ]);

  return {
    totalContactos,
    porEstado: Object.fromEntries(porEstado.map((r) => [r.estadoComercial, r._count])),
    identidadesPorCanal: Object.fromEntries(identidadesPorCanal.map((r) => [r.canal, r._count])),
  };
}

// Métrica principal del sprint (Parte 7): tiempo entre el primer mensaje
// ENTRANTE y la primera respuesta SALIENTE de una misma conversación.
// Objetivo declarado: menos de 5 segundos en automatizaciones activas.
export async function tiempoPromedioPrimeraRespuesta(empresaId, { desde, hasta } = {}) {
  const conversaciones = await prisma.atlasConversacion.findMany({
    where: {
      identidadCanal: { empresaId },
      ...(desde || hasta ? { creadoEn: { gte: desde, lte: hasta } } : {}),
    },
    include: { mensajes: { orderBy: { creadoEn: "asc" } } },
  });

  const tiempos = [];
  for (const conv of conversaciones) {
    const primerEntrante = conv.mensajes.find((m) => m.direccion === "entrante");
    const primeraRespuesta = conv.mensajes.find((m) => m.direccion === "saliente" && m.creadoEn >= (primerEntrante?.creadoEn ?? 0));
    if (primerEntrante && primeraRespuesta) {
      tiempos.push((primeraRespuesta.creadoEn - primerEntrante.creadoEn) / 1000);
    }
  }

  if (tiempos.length === 0) return { promedioSegundos: null, muestras: 0 };
  return {
    promedioSegundos: tiempos.reduce((a, b) => a + b, 0) / tiempos.length,
    muestras: tiempos.length,
  };
}
