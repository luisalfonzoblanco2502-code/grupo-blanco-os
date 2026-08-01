// Seguimientos: recordatorios comerciales sobre un contacto que no compró
// todavía. Fase 0.1: se apoya en los campos ya existentes en AtlasContacto
// (proximaAccion, estadoComercial) — no crea una tabla propia todavía,
// para no adelantarse a cómo se termine viendo el Inbox real (subfase 0.3,
// ver ROADMAP.md). Si más adelante hace falta historial de MÚLTIPLES
// seguimientos por contacto (no solo "el próximo"), ahí sí se justifica una
// tabla AtlasSeguimiento separada — no antes.
import { prisma } from "../../db.js";
import { ValidacionError } from "../errors.js";

export async function programarSeguimiento(contactoId, empresaId, { proximaAccion, fecha }) {
  const actual = await prisma.atlasContacto.findFirst({ where: { id: contactoId, empresaId } });
  if (!actual) throw new ValidacionError("Contacto no encontrado");
  if (!proximaAccion?.trim()) throw new ValidacionError("proximaAccion es obligatoria");

  return prisma.atlasContacto.update({
    where: { id: contactoId },
    data: {
      proximaAccion: fecha ? `${proximaAccion.trim()} (${new Date(fecha).toLocaleDateString("es-VE")})` : proximaAccion.trim(),
      estadoComercial: "seguimiento_pendiente",
      actualizadoEn: new Date(),
    },
  });
}

// Lista simple de contactos con seguimiento pendiente — para un futuro
// widget de "Seguimientos de hoy" en el Inbox.
export async function listarSeguimientosPendientes(empresaId) {
  return prisma.atlasContacto.findMany({
    where: { empresaId, estadoComercial: "seguimiento_pendiente" },
    orderBy: { ultimoContacto: "asc" },
  });
}
