// Adaptador de la API oficial de Meta (Graph API — Instagram Messaging /
// Facebook Messenger) — CONTRATO únicamente. Este es el reemplazo directo
// de manychat.adapter.js el día que se decida dejar de depender de
// ManyChat (ver DECISIONES.md: "cómo evitar dependencia permanente de
// ManyChat" — cambiar UN adaptador, no rediseñar ATLAS).
//
// Requiere, cuando se implemente: una Meta App con permisos de
// instagram_manage_messages/pages_messaging aprobados (App Review),
// Business verification, y un token de página/cuenta de larga duración
// (variables de entorno futuras, ej. META_GRAPH_ACCESS_TOKEN,
// META_APP_SECRET para verificar firma de webhook). Nada de esto existe
// todavía — no se toca hasta que se apruebe esta fase específicamente.

function noImplementado(metodo) {
  throw new Error(`[metaGraph.adapter] "${metodo}" no implementado todavía — requiere App Review + credenciales, ver docs/atlas/DECISIONES.md`);
}

// Verifica X-Hub-Signature-256 contra META_APP_SECRET — sin esto, un
// webhook de Meta nunca debe considerarse auténtico.
export function verificarFirmaWebhook(_req) {
  noImplementado("verificarFirmaWebhook");
}

export function parsearEventoEntrante(_payload) {
  noImplementado("parsearEventoEntrante");
}

export function enviarRespuesta(_destinatario, _texto) {
  noImplementado("enviarRespuesta");
}

// Responder directamente a un COMENTARIO (no un DM) — Graph API lo soporta
// nativo; ManyChat lo resuelve distinto (auto-DM al comentar). Se deja el
// contrato separado desde ya para no forzar ambos adaptadores a la misma
// forma si sus capacidades reales terminan siendo distintas.
export function responderComentario(_comentarioId, _texto) {
  noImplementado("responderComentario");
}
