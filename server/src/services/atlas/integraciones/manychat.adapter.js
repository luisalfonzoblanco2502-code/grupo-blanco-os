// Adaptador de ManyChat — CONTRATO únicamente, sin implementación real
// todavía. Ver DECISIONES.md: ManyChat es la capa delgada elegida para el
// primer canal (Instagram), pero toda la inteligencia real vive en
// contactos.service.js/intents.service.js/respuestas.service.js — este
// adaptador solo debe traducir entre "lo que ManyChat manda/espera" y esos
// servicios, nunca contener lógica de negocio propia.
//
// Requiere, cuando se implemente: un token de API de ManyChat (variable de
// entorno, ej. MANYCHAT_API_TOKEN) y la URL del webhook que ManyChat debe
// llamar (configurada en su editor de flujos vía "External Request").
// Ninguna credencial existe todavía — no se toca hasta la subfase 0.4.

function noImplementado(metodo) {
  throw new Error(`[manychat.adapter] "${metodo}" no implementado todavía — requiere credenciales, ver docs/atlas/DECISIONES.md`);
}

// Verifica que un request entrante realmente viene de ManyChat (firma o
// token compartido, según lo que ManyChat ofrezca) — sin esto, NUNCA se
// debe procesar un webhook como real.
export function verificarOrigen(_req) {
  noImplementado("verificarOrigen");
}

// Traduce el payload crudo de ManyChat a la forma que espera
// contactos.service.js/conversaciones.service.js.
export function parsearEventoEntrante(_payload) {
  noImplementado("parsearEventoEntrante");
}

// Envía la respuesta elegida por respuestas.service.js de vuelta a
// ManyChat para que la entregue por Instagram/WhatsApp.
export function enviarRespuesta(_destinatario, _texto) {
  noImplementado("enviarRespuesta");
}
