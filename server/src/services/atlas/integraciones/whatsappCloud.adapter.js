// Adaptador de WhatsApp Cloud API (oficial) — CONTRATO únicamente. Subfase
// 0.6 del ROADMAP: llega después de validar el flujo completo con
// Instagram. Nota importante (ver DECISIONES.md): "ManyChat para WhatsApp"
// no es una alternativa a esto — es un wrapper de pago SOBRE esta misma
// API, así que el trámite de Meta (verificación de negocio + número) es
// inevitable de cualquier forma. Este adaptador asume que se hizo directo.
//
// Requiere, cuando se implemente: número de WhatsApp Business migrado a la
// Cloud API, un token de acceso permanente (System User), y
// WHATSAPP_APP_SECRET para verificar firma de webhook. Nada existe todavía.

function noImplementado(metodo) {
  throw new Error(`[whatsappCloud.adapter] "${metodo}" no implementado todavía — requiere verificación de negocio + credenciales, ver docs/atlas/DECISIONES.md`);
}

export function verificarFirmaWebhook(_req) {
  noImplementado("verificarFirmaWebhook");
}

export function parsearEventoEntrante(_payload) {
  noImplementado("parsearEventoEntrante");
}

export function enviarMensaje(_numeroDestino, _texto) {
  noImplementado("enviarMensaje");
}
