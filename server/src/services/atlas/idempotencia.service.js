// Idempotencia de webhooks (corrección arquitectónica 0.1.1, Parte 3): la
// MISMA interacción reenviada varias veces por Meta/ManyChat (reintentos
// automáticos si el proveedor no recibe 200 a tiempo, entre otras causas)
// NUNCA debe crear varios mensajes/contactos/respuestas.
//
// Dedup primario: (proveedor, eventIdExterno) cuando el proveedor manda un
// id de evento estable. Dedup de respaldo: (proveedor, payloadHash) SOLO
// entre eventos sin eventIdExterno, para proveedores que no garantizan un
// event id único o cuando llega vacío.
//
// Auditoría Subfase 0.3 (Punto 1): un UNIQUE(proveedor, eventIdExterno)
// normal NO alcanza — Postgres permite múltiples NULL en un UNIQUE, así
// que dos webhooks sin eventIdExterno nunca chocarían ahí. La base real
// usa DOS ÍNDICES ÚNICOS PARCIALES en vez de un UNIQUE simple (ver
// 0008_atlas_fundacion.sql): uno para proveedor+eventIdExterno cuando
// existe, otro para proveedor+payloadHash cuando no existe. Prisma no
// soporta índices parciales en su DSL (mismo caso ya documentado para
// OrdenProduccion en schema.prisma) — por eso este archivo ya NO puede
// usar `findUnique` con una clave compuesta generada por Prisma
// (`proveedor_eventIdExterno`): esa clave nace de un `@@unique` real, y el
// `@@unique` de schema.prisma quedó reemplazado por un `@@index`
// (aproximación, sin el WHERE parcial) — se usa `findFirst` en su lugar.
//
// Los índices únicos parciales son la ÚLTIMA línea de defensa bajo
// concurrencia real: si dos webhooks duplicados llegan casi al mismo
// tiempo, ambos pueden pasar el `findFirst` de abajo (todavía no ve la
// fila del otro) y ambos intentar `create()` — Postgres deja pasar el
// primero y rechaza el segundo con una violación de unicidad (P2002).
// `registrarEventoWebhook` atrapa ese error y responde exactamente igual
// que si el duplicado se hubiera detectado por `findFirst` desde el
// principio — sin esa red, dos webhooks simultáneos crearían dos filas.
//
// Este servicio es puramente técnico y NO se usa todavía en producción
// (atlasWebhooks.routes.js sigue sin montar) — queda listo para cuando se
// apruebe la Subfase 0.4/0.5, ver docs/atlas/ROADMAP.md.
import crypto from "node:crypto";
import { prisma } from "../../db.js";
import { ValidacionError } from "../errors.js";
import { ESTADOS_WEBHOOK_EVENTO } from "./config.js";

export function calcularPayloadHash(payloadCrudo) {
  const texto = typeof payloadCrudo === "string" ? payloadCrudo : JSON.stringify(payloadCrudo);
  return crypto.createHash("sha256").update(texto).digest("hex");
}

function buscarEventoExistente(client, { proveedor, eventIdExterno, payloadHash }) {
  return eventIdExterno
    ? client.atlasWebhookEvento.findFirst({ where: { proveedor, eventIdExterno } })
    : client.atlasWebhookEvento.findFirst({ where: { proveedor, eventIdExterno: null, payloadHash } });
}

// Se llama ANTES de procesar cualquier webhook. Devuelve
// { yaProcesado: true, evento } si esta interacción ya se manejó (el
// llamador debe responder 200 sin volver a hacer nada), o
// { yaProcesado: false, evento } si es genuinamente nueva (el llamador
// procesa y después llama marcarProcesado/marcarError con evento.id).
export async function registrarEventoWebhook({ proveedor, canal, eventIdExterno, payloadCrudo }) {
  if (!proveedor?.trim()) throw new ValidacionError("proveedor es obligatorio");
  const payloadHash = calcularPayloadHash(payloadCrudo);
  const criterio = { proveedor, eventIdExterno: eventIdExterno || null, payloadHash };

  try {
    return await prisma.$transaction(async (tx) => {
      const existente = await buscarEventoExistente(tx, criterio);
      if (existente) {
        await tx.atlasWebhookEvento.update({
          where: { id: existente.id },
          data: { cantidadIntentos: { increment: 1 } },
        });
        return { yaProcesado: existente.estadoProcesamiento === "procesado", evento: existente };
      }

      const nuevo = await tx.atlasWebhookEvento.create({
        data: { proveedor, canal: canal || null, eventIdExterno: eventIdExterno || null, payloadHash },
      });
      return { yaProcesado: false, evento: nuevo };
    });
  } catch (err) {
    // P2002 = violación de restricción única. Solo puede pasar acá si otra
    // transacción concurrente ganó la carrera entre nuestro findFirst y
    // nuestro create (ver nota de cabecera) — Postgres ya abortó ESTA
    // transacción, así que la recuperación corre como una consulta nueva,
    // no dentro de la misma tx.
    if (err.code === "P2002") {
      const existente = await buscarEventoExistente(prisma, criterio);
      if (existente) {
        await prisma.atlasWebhookEvento.update({
          where: { id: existente.id },
          data: { cantidadIntentos: { increment: 1 } },
        });
        return { yaProcesado: existente.estadoProcesamiento === "procesado", evento: existente };
      }
    }
    throw err;
  }
}

export async function marcarEventoProcesado(eventoId) {
  return prisma.atlasWebhookEvento.update({
    where: { id: eventoId },
    data: { estadoProcesamiento: "procesado" },
  });
}

export async function marcarEventoConError(eventoId, error) {
  if (!ESTADOS_WEBHOOK_EVENTO.includes("error")) throw new Error("Estado 'error' inconsistente con config.js");
  return prisma.atlasWebhookEvento.update({
    where: { id: eventoId },
    data: { estadoProcesamiento: "error", ultimoError: String(error?.message || error).slice(0, 2000) },
  });
}
