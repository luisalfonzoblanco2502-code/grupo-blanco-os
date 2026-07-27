import { prisma } from "../db.js";
import { registrarAuditoria } from "./auditoria.service.js";
import { emit } from "../events/eventBus.js";
import { USUARIO_LOGIN, USUARIO_LOGOUT } from "../events/eventos.js";

// El login/logout real ocurre en Supabase Auth, fuera de nuestro backend —
// el frontend nos avisa explícitamente para que quede auditado y para que
// el Event Bus pueda reaccionar (hoy nadie más escucha estos eventos).
export async function registrarLogin(usuario) {
  await registrarAuditoria(prisma, {
    empresaId: usuario.empresaId,
    usuarioId: usuario.id,
    accion: "usuario.login",
  });
  await emit(USUARIO_LOGIN, { usuario });
}

export async function registrarLogout(usuario) {
  await registrarAuditoria(prisma, {
    empresaId: usuario.empresaId,
    usuarioId: usuario.id,
    accion: "usuario.logout",
  });
  await emit(USUARIO_LOGOUT, { usuario });
}
