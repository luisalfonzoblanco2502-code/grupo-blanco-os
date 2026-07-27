import { prisma } from "../db.js";

// Lista mínima para selects (ej. elegir responsable al facturar). No expone
// email/rol — eso es para una futura pantalla de administración de usuarios,
// no para este propósito.
export async function listarUsuariosActivos(empresaId) {
  return prisma.usuario.findMany({
    where: { empresaId, activo: true },
    select: { id: true, nombre: true, puesto: { select: { nombre: true } } },
    orderBy: { nombre: "asc" },
  });
}
