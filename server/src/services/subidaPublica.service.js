// Subida pública de fotos de diseños personalizados (catálogo, sin auth) —
// 2026-08-02. Única responsabilidad de este archivo: recibir bytes de
// imagen, validarlos en serio, y devolver una URL — nunca escribe en
// ninguna tabla de negocio (solicitudes_pedido/items se escriben aparte,
// cuando el catálogo envía la solicitud completa).
//
// Controles de seguridad (todos obligatorios, pedidos explícitamente):
// 1. Tipo de archivo por MAGIC BYTES reales, no por extensión/Content-Type
//    (cualquiera puede mentir esos dos con curl). Solo JPG/PNG/WEBP.
// 2. Máximo 5MB, rechazado antes de tocar Storage.
// 3. Rate limit por IP (10/hora) — respaldado en Postgres, no en memoria:
//    server corre serverless (Vercel), así que un contador en memoria de
//    proceso no sirve — cada invocación puede ser una instancia distinta.
// 4. Nombre de archivo aleatorio (nunca el original del cliente) en una
//    carpeta separada de los uploads internos del ERP.
// 5. Nunca se sirve/ejecuta como código — solo como imagen estática desde
//    Storage.
// 6. Log de cada intento (IP, tamaño, éxito/motivo) en la misma tabla que
//    resuelve el rate limit — un solo mecanismo para las dos cosas.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { prisma } from "../db.js";
import { ValidacionError } from "./errors.js";

const BUCKET = "catalogo-uploads-publicos";
const MAX_BYTES = 5 * 1024 * 1024;
const LIMITE_POR_HORA = 10;

let clienteAdminCache = null;

// Cliente separado del server/src/supabaseClient.js normal (ese usa la
// clave anon, pensada para validar JWT de usuarios del ERP) — subir a un
// bucket sin que quien llama tenga sesión de Supabase requiere la clave de
// servicio, que nunca debe llegar al navegador del catálogo.
function clienteAdmin() {
  if (clienteAdminCache) return clienteAdminCache;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ValidacionError(
      "La subida de fotos no está configurada en el servidor (falta SUPABASE_SERVICE_ROLE_KEY)"
    );
  }
  clienteAdminCache = createClient(url, key, { auth: { persistSession: false } });
  return clienteAdminCache;
}

const FIRMAS = [
  { tipo: "image/jpeg", extension: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { tipo: "image/png", extension: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

function detectarTipoReal(buffer) {
  for (const firma of FIRMAS) {
    if (firma.bytes.every((b, i) => buffer[i] === b)) return firma;
  }
  // WEBP no tiene una firma de bytes fija al inicio: es un contenedor RIFF
  // ("RIFF" en 0-3, tamaño en 4-7, "WEBP" en 8-11) — se valida por posición.
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return { tipo: "image/webp", extension: "webp" };
  }
  return null;
}

async function contarSubidasRecientes(ip) {
  const desde = new Date(Date.now() - 60 * 60 * 1000);
  return prisma.solicitudFotoUploadLog.count({ where: { ip, creadoEn: { gte: desde }, exitoso: true } });
}

// El log nunca debe tumbar la subida real (ni un rechazo real) — si
// Postgres estuviera caído justo para esta escritura, se prioriza no
// romper la experiencia del cliente por un problema de auditoría.
async function registrarIntento({ ip, tamanoBytes, exitoso, motivoRechazo }) {
  try {
    await prisma.solicitudFotoUploadLog.create({
      data: { ip, tamanoBytes, exitoso, motivoRechazo: motivoRechazo || null },
    });
  } catch (err) {
    console.error("[subida-publica] no se pudo registrar el intento en el log:", err.message);
  }
}

export async function subirFotoPublica({ ip, buffer }) {
  const ipNormalizada = ip || "desconocida";

  if (!buffer || buffer.length === 0) {
    throw new ValidacionError("No se recibió ningún archivo");
  }

  if (buffer.length > MAX_BYTES) {
    await registrarIntento({ ip: ipNormalizada, tamanoBytes: buffer.length, exitoso: false, motivoRechazo: "excede_tamano_maximo" });
    throw new ValidacionError("La imagen no puede superar 5MB");
  }

  const subidasRecientes = await contarSubidasRecientes(ipNormalizada);
  if (subidasRecientes >= LIMITE_POR_HORA) {
    await registrarIntento({ ip: ipNormalizada, tamanoBytes: buffer.length, exitoso: false, motivoRechazo: "rate_limit" });
    throw new ValidacionError("Demasiadas subidas desde esta conexión — probá de nuevo en un rato");
  }

  const firma = detectarTipoReal(buffer);
  if (!firma) {
    await registrarIntento({ ip: ipNormalizada, tamanoBytes: buffer.length, exitoso: false, motivoRechazo: "tipo_no_permitido" });
    throw new ValidacionError("Solo se permiten imágenes JPG, PNG o WEBP");
  }

  const nombreAleatorio = `${crypto.randomUUID()}.${firma.extension}`;
  const ruta = `publico/${new Date().toISOString().slice(0, 10)}/${nombreAleatorio}`;

  const admin = clienteAdmin();
  const { error } = await admin.storage.from(BUCKET).upload(ruta, buffer, { contentType: firma.tipo, upsert: false });
  if (error) {
    await registrarIntento({ ip: ipNormalizada, tamanoBytes: buffer.length, exitoso: false, motivoRechazo: `storage: ${error.message}` });
    throw new ValidacionError("No se pudo guardar la imagen — intentá de nuevo");
  }

  await registrarIntento({ ip: ipNormalizada, tamanoBytes: buffer.length, exitoso: true });

  const { data } = admin.storage.from(BUCKET).getPublicUrl(ruta);
  return { url: data.publicUrl };
}
