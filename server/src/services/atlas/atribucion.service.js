// Tokens públicos de atribución (corrección arquitectónica 0.1.1, Parte 2):
// un enlace al catálogo con "?ref=<token>" NUNCA debe llevar el id interno
// de AtlasContacto — ese id, si se filtra (logs de servidor, referrer de
// terceros, capturas de pantalla compartidas), permitiría a cualquiera
// enumerar/adivinar contactos. `token` es un valor aleatorio propio,
// generado acá, sin relación matemática con `id`.
//
// Definición funcional (Auditoría Subfase 0.3, Punto 3): SÍ cubre tráfico
// anónimo, no solo enlaces para contactos ya identificados — es el caso de
// uso más valioso (medir qué anuncio/campaña realmente genera clientes,
// ver VISION.md). Flujo completo:
//
//   Anuncio → clic anónimo → token → identificación → contacto → atribución
//
//   1. Anuncio: Marketing pone `?utm_source=meta&...&fbclid=...` en el
//      destino del anuncio.
//   2. Clic anónimo: alguien sin AtlasContacto todavía llega al catálogo.
//      Nada de esto se conecta todavía (Subfase 0.8, sigue sin tocar
//      catalogo/) — cuando se conecte, ESE momento es el que llama acá a
//      crearTokenAtribucion() SIN atlasContactoId: el token nace huérfano,
//      con solo los datos de campaña/UTM/click-IDs del clic.
//   3. Token: `atlasContactoId` es NULL — representa el clic en sí, no a
//      una persona identificada todavía. Por eso ya no es NOT NULL en el
//      modelo (antes lo era, y eso era incompatible con este caso).
//   4. Identificación: la misma persona después escribe por WhatsApp/
//      Instagram o completa el checkout del catálogo — en ese momento
//      existe (o se crea) un AtlasContacto real.
//   5. Contacto: se llama a vincularTokenAContacto() para "reclamar" el
//      token huérfano hacia ese AtlasContacto — una asignación de una sola
//      vez (no se puede reclamar dos veces ni robar un token ya reclamado
//      por otro contacto).
//   6. Atribución: los datos de campaña del token reclamado alimentan
//      atribucionPrimerToque/atribucionUltimoToque del contacto (ver
//      DECISIONES.md, Decisión 6).
//
// El otro caso de uso (compartir un enlace personalizado con alguien que
// YA es un AtlasContacto conocido) sigue funcionando igual: se llama a
// crearTokenAtribucion() CON atlasContactoId desde el principio, y el
// token nace ya "reclamado".
import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { ValidacionError, NoEncontradoError } from "../errors.js";
import { ESTADOS_TOKEN_ATRIBUCION } from "./config.js";

// 32 bytes aleatorios en base64url (~43 caracteres, sin +/=) — no
// derivados de ningún id, no reversibles, no enumerables (2^256 posibles).
function generarTokenOpaco() {
  return crypto.randomBytes(32).toString("base64url");
}

// atlasContactoId ahora es OPCIONAL — omitirlo genera un token anónimo
// (clic sin identificar todavía, ver nota de cabecera). Si se pasa, debe
// pertenecer a la empresa (mismo criterio que el resto del servicio).
export async function crearTokenAtribucion(empresaId, atlasContactoId, { canal, campana, anuncio, utms, diasExpiracion } = {}) {
  if (atlasContactoId) {
    const contacto = await prisma.atlasContacto.findFirst({ where: { id: atlasContactoId, empresaId } });
    if (!contacto) throw new ValidacionError("Contacto no encontrado");
  }

  return prisma.atlasAtribucionToken.create({
    data: {
      empresaId,
      atlasContactoId: atlasContactoId || null,
      token: generarTokenOpaco(),
      canal: canal || null,
      campana: campana || null,
      anuncio: anuncio || null,
      utmSource: utms?.utm_source || null,
      utmMedium: utms?.utm_medium || null,
      utmCampaign: utms?.utm_campaign || null,
      utmContent: utms?.utm_content || null,
      utmTerm: utms?.utm_term || null,
      campaignId: utms?.campaign_id || null,
      adsetId: utms?.adset_id || null,
      adId: utms?.ad_id || null,
      fbclid: utms?.fbclid || null,
      // Extensión (Subfase 0.2-corrección): mismo criterio, todos
      // opcionales — la mayoría llega vacía hasta conectar más
      // plataformas/canales, pero la columna ya existe.
      placement: utms?.placement || null,
      device: utms?.device || null,
      gclid: utms?.gclid || null,
      ttclid: utms?.ttclid || null,
      landingUrl: utms?.landing_url || null,
      referer: utms?.referer || null,
      fechaExpiracion: diasExpiracion ? new Date(Date.now() + diasExpiracion * 86400_000) : null,
    },
  });
}

// Contrato de consumo — se llamará desde un futuro endpoint público cuando
// el catálogo reciba ?ref=<token> (NO implementado todavía, ver cabecera).
// Valida estado + expiración, incrementa el contador de usos y marca
// fechaPrimerUso la primera vez.
export async function consumirToken(token) {
  if (!token?.trim()) throw new ValidacionError("token es obligatorio");

  return prisma.$transaction(async (tx) => {
    const registro = await tx.atlasAtribucionToken.findUnique({ where: { token } });
    if (!registro) throw new NoEncontradoError("Token de atribución no encontrado");
    if (registro.estado !== "activo") {
      throw new ValidacionError(`Token ${registro.estado} — ya no es válido`);
    }
    if (registro.fechaExpiracion && registro.fechaExpiracion < new Date()) {
      throw new ValidacionError("Token expirado");
    }

    const actualizado = await tx.atlasAtribucionToken.update({
      where: { id: registro.id },
      data: {
        cantidadUsos: { increment: 1 },
        fechaPrimerUso: registro.fechaPrimerUso ?? new Date(),
      },
    });

    return actualizado;
  });
}

// Paso 5 del flujo de cabecera: "reclama" un token anónimo (creado sin
// atlasContactoId, en un clic previo a que existiera un contacto) hacia un
// AtlasContacto real, una vez que esa persona se identificó. Asignación de
// UNA SOLA VEZ — nunca se reasigna un token que ya pertenece a otro
// contacto, ni siquiera al mismo (evita perder de dónde vino el primer
// reclamo si el llamador se equivoca de contacto y reintenta).
export async function vincularTokenAContacto(empresaId, token, atlasContactoId) {
  if (!token?.trim()) throw new ValidacionError("token es obligatorio");

  return prisma.$transaction(async (tx) => {
    const registro = await tx.atlasAtribucionToken.findUnique({ where: { token } });
    if (!registro) throw new NoEncontradoError("Token de atribución no encontrado");
    if (registro.empresaId !== empresaId) {
      throw new ValidacionError("El token no pertenece a esta empresa");
    }
    if (registro.atlasContactoId) {
      throw new ValidacionError("Este token ya fue reclamado por otro contacto");
    }

    const contacto = await tx.atlasContacto.findFirst({ where: { id: atlasContactoId, empresaId } });
    if (!contacto) throw new ValidacionError("Contacto no encontrado");

    return tx.atlasAtribucionToken.update({
      where: { id: registro.id },
      data: { atlasContactoId },
    });
  });
}

export async function revocarToken(tokenId, empresaId) {
  const registro = await prisma.atlasAtribucionToken.findFirst({ where: { id: tokenId, empresaId } });
  if (!registro) throw new ValidacionError("Token no encontrado");
  if (!ESTADOS_TOKEN_ATRIBUCION.includes("revocado")) throw new Error("Estado 'revocado' inconsistente con config.js");

  return prisma.atlasAtribucionToken.update({ where: { id: tokenId }, data: { estado: "revocado" } });
}
