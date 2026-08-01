// Historial de mensajes por IDENTIDAD DE CANAL (corrección arquitectónica
// 0.1.1: una conversación cuelga de AtlasIdentidadCanal, no directamente
// del AtlasContacto unificado — si la misma persona escribe por Instagram
// y por WhatsApp, son dos hilos separados, uno por identidad). "Ningún
// mensaje se elimina" (Parte 5): este servicio solo agrega filas, nunca
// las borra ni las edita — un mensaje mal enviado se corrige con un
// mensaje nuevo, no reescribiendo el anterior.
import { prisma } from "../../db.js";
import { ValidacionError } from "../errors.js";
import { DIRECCIONES_MENSAJE, ORIGENES_MENSAJE } from "./config.js";

// Una conversación por identidad de canal — si ya existe una abierta, se
// reutiliza en vez de abrir una segunda en paralelo.
//
// Auditoría Subfase 0.3 (Punto 4b): AtlasConversacion.canal se eliminó —
// duplicaba AtlasIdentidadCanal.canal sin ninguna razón real (el canal de
// una identidad no cambia nunca después de creada, así que no era un
// snapshot con valor propio, solo el mismo dato repetido). Esta función ya
// no recibe `canal` como parámetro — lo toma de la identidad, así que
// nunca puede pasarse uno que no coincida con la identidad real.
export async function obtenerOCrearConversacion(identidadCanalId) {
  const identidad = await prisma.atlasIdentidadCanal.findUnique({ where: { id: identidadCanalId } });
  if (!identidad) throw new ValidacionError("Identidad de canal no encontrada");

  const existente = await prisma.atlasConversacion.findFirst({
    where: { identidadCanalId },
    orderBy: { creadoEn: "desc" },
  });
  if (existente) return existente;
  return prisma.atlasConversacion.create({ data: { identidadCanalId } });
}

export async function agregarMensaje(conversacionId, { direccion, origen, contenido, intencionDetectada, idProveedor }) {
  if (!DIRECCIONES_MENSAJE.includes(direccion)) {
    throw new ValidacionError(`direccion inválida: "${direccion}"`);
  }
  if (!ORIGENES_MENSAJE.includes(origen)) {
    throw new ValidacionError(`origen inválido: "${origen}"`);
  }
  if (!contenido?.trim()) {
    throw new ValidacionError("El mensaje no puede estar vacío");
  }
  return prisma.atlasMensaje.create({
    data: {
      conversacionId,
      direccion,
      origen,
      contenido: contenido.trim(),
      intencionDetectada: intencionDetectada || null,
      idProveedor: idProveedor || null,
    },
  });
}

export async function listarMensajes(conversacionId) {
  return prisma.atlasMensaje.findMany({ where: { conversacionId }, orderBy: { creadoEn: "asc" } });
}
