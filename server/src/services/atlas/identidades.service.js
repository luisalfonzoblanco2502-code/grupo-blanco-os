// Gestión de AtlasIdentidadCanal — verificación, consentimiento y
// suscripción POR CANAL (corrección arquitectónica 0.1.1, Parte 7): la
// misma persona puede estar "activa" en WhatsApp y "bloqueada" en
// Instagram al mismo tiempo, así que estos estados viven acá, no en
// AtlasContacto.
import { prisma } from "../../db.js";
import { ValidacionError } from "../errors.js";
import { ESTADOS_SUSCRIPCION } from "./config.js";

export async function listarIdentidadesDeContacto(contactoId, empresaId) {
  return prisma.atlasIdentidadCanal.findMany({
    where: { atlasContactoId: contactoId, empresaId },
    orderBy: { primeraInteraccion: "asc" },
  });
}

// Marca un teléfono/email de ESTA identidad como confirmado — es la única
// llave que contactos.service.js acepta para intentar una fusión fuerte
// más adelante. `fuente` documenta CÓMO se confirmó (ej. "coincide con
// Cliente facturado", "confirmado por agente humano").
export async function verificarIdentidad(identidadId, empresaId, { fuente }) {
  const actual = await prisma.atlasIdentidadCanal.findFirst({ where: { id: identidadId, empresaId } });
  if (!actual) throw new ValidacionError("Identidad de canal no encontrada");
  if (!fuente?.trim()) throw new ValidacionError('Debe indicar "fuente" de la verificación (queda en datosAdicionales)');

  return prisma.atlasIdentidadCanal.update({
    where: { id: identidadId },
    data: {
      verificado: true,
      datosAdicionales: { ...(actual.datosAdicionales || {}), verificacion: { fuente, fecha: new Date().toISOString() } },
    },
  });
}

// Registra consentimiento explícito PARA ESTE CANAL puntual — nunca se
// asume: siempre requiere fuente (ej. "cliente escribió SÍ", "aceptó
// checkbox del catálogo").
export async function registrarConsentimientoCanal(identidadId, empresaId, { fuente }) {
  const actual = await prisma.atlasIdentidadCanal.findFirst({ where: { id: identidadId, empresaId } });
  if (!actual) throw new ValidacionError("Identidad de canal no encontrada");
  if (!fuente?.trim()) throw new ValidacionError("Debe indicar la fuente del consentimiento");

  return prisma.atlasIdentidadCanal.update({
    where: { id: identidadId },
    data: {
      consentimientoCanal: true,
      consentimientoFecha: new Date(),
      consentimientoFuente: fuente,
      estadoSuscripcion: "activo",
    },
  });
}

// Baja/bloqueo — se llama tanto manualmente (staff) como automáticamente
// cuando intents.service.js detecta una palabra de salida en un mensaje
// entrante (ver detectarPalabraSalida). A partir de acá, NINGUNA
// automatización debe volver a escribirle a esta identidad puntual —
// ese enforcement vive donde se orqueste el envío real (subfase 0.4+),
// esta función solo dejar registrado el estado.
export async function registrarBajaCanal(identidadId, empresaId, { motivo, comoBloqueo = false }) {
  const actual = await prisma.atlasIdentidadCanal.findFirst({ where: { id: identidadId, empresaId } });
  if (!actual) throw new ValidacionError("Identidad de canal no encontrada");

  const nuevoEstado = comoBloqueo ? "bloqueado" : "baja";
  if (!ESTADOS_SUSCRIPCION.includes(nuevoEstado)) {
    throw new ValidacionError(`Estado de suscripción inválido: "${nuevoEstado}"`);
  }

  return prisma.atlasIdentidadCanal.update({
    where: { id: identidadId },
    data: {
      estadoSuscripcion: nuevoEstado,
      fechaBaja: new Date(),
      motivoBloqueo: motivo || null,
    },
  });
}

// Antes de disparar CUALQUIER automatización hacia una identidad, esto
// debe consultarse — "prohibición de continuar automatizaciones cuando el
// contacto solicite detenerlas" (Parte 7) es una regla dura, no una
// sugerencia.
export function puedeAutomatizarse(identidadCanal) {
  return identidadCanal.estadoSuscripcion === "activo";
}
