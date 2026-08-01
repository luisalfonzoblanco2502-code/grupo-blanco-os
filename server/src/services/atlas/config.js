// Fuente única de constantes de ATLAS — mismo criterio que ESTADOS_SOLICITUD
// en solicitudes.service.js: strings de negocio validados en un solo lugar,
// no un enum de Prisma (permite agregar un canal/estado nuevo sin migración).

export const CANALES = ["instagram", "whatsapp", "facebook", "tiktok", "catalogo"];

export const TIPOS_CLIENTE = [
  "cliente_final",
  "emprendedor",
  "mayorista",
  "boutique",
  "empresa",
  "disenador",
  "marca",
  "cliente_recurrente",
  "no_clasificado",
];

// Orden intencional: refleja el avance real de un lead, de "nuevo" a
// "convertido"/"perdido"/"bloqueado" — algunas UI futuras (Inbox, Kanban de
// leads) podrían apoyarse en este orden para columnas, no solo para validar.
export const ESTADOS_COMERCIALES = [
  "nuevo",
  "atendido_automaticamente",
  "esperando_respuesta",
  "interesado",
  "catalogo_enviado",
  "pedido_iniciado",
  "pedido_generado",
  "seguimiento_pendiente",
  "requiere_atencion_humana",
  "convertido",
  "perdido",
  "bloqueado",
];

// Intenciones mínimas (Parte 4 del sprint 0.1). "no_comprendida" es la
// salida obligatoria del clasificador cuando no hay confianza suficiente —
// nunca se inventa una intención para forzar una respuesta automática.
export const INTENCIONES = [
  "solicitar_catalogo",
  "consultar_precio",
  "comprar_unidad",
  "comprar_mayor",
  "personalizar_producto",
  "consultar_pedido",
  "consultar_tiempo_entrega",
  "hablar_con_persona",
  "no_comprendida",
];

export const DIRECCIONES_MENSAJE = ["entrante", "saliente"];
export const ORIGENES_MENSAJE = ["cliente", "automatico", "humano"];

// Corrección arquitectónica 0.1.1 (Parte 7): estado de suscripción POR
// CANAL (AtlasIdentidadCanal.estadoSuscripcion) — alguien puede estar
// "activo" en WhatsApp y "bloqueado" en Instagram al mismo tiempo.
export const ESTADOS_SUSCRIPCION = ["activo", "baja", "bloqueado"];

// Estado de una identidad de canal en sí (no de la suscripción) — "fusionado"
// se usa cuando una fusión manual reasigna esta identidad a otro
// AtlasContacto (ver fusionarContactos en contactos.service.js): la fila
// nunca se borra, solo cambia de estado y de dueño.
export const ESTADOS_IDENTIDAD_CANAL = ["activo", "inactivo", "fusionado"];

// Palabras/frases de salida — si un mensaje ENTRANTE matchea alguna de
// estas, la regla es absoluta (Parte 7): se corta cualquier automatización
// para esa identidad de canal y se marca de baja, ANTES de intentar
// clasificar intención. Nunca se seguiría "conversando" con quien pidió
// parar. Ver detectarPalabraSalida en intents.service.js.
export const PALABRAS_SALIDA = [
  /\bstop\b/i,
  /\bbaja\b/i,
  /\bcancelar\b/i,
  /no (me )?(escrib|molest|contact)/i,
  /\bunsubscribe\b/i,
  /dejen? de escribirme/i,
  /no quiero (mas|más) mensajes/i,
];

// Estado de un AtlasWebhookEvento (Parte 3 — idempotencia).
export const ESTADOS_WEBHOOK_EVENTO = ["pendiente", "procesado", "error"];

// Estado de un AtlasAtribucionToken (Parte 2).
export const ESTADOS_TOKEN_ATRIBUCION = ["activo", "revocado"];

// Forma documentada (NO enforced — son JSON/columnas nullable, no un tipo
// de Prisma) que debe respetar tanto el objeto `utms` que recibe
// crearTokenAtribucion() como los snapshots atribucionPrimerToque/
// atribucionUltimoToque de AtlasContacto. Extendido en la corrección de
// Subfase 0.2 (2026-07-31) para que ATLAS nazca listo para más
// plataformas que Meta/UTM puro — la mayoría de estos campos hoy llega
// vacía, y eso es esperado, no un bug.
export const CAMPOS_ATRIBUCION = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
  "adset_id",
  "ad_id",
  "placement",
  "device",
  "fbclid",
  "gclid",
  "ttclid",
  "landing_url",
  "referer",
];
