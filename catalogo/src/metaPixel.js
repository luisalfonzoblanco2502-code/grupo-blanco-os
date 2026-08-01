// Meta Pixel — carga condicional, mismo criterio que VITE_WHATSAPP_NUMERO
// en api.js: si VITE_META_PIXEL_ID no está configurado (dev local por
// defecto), esto no hace NADA — ni siquiera se inyecta el script de
// terceros. Un despliegue sin la env var seteada queda idéntico a como
// estaba antes de este sprint.
//
// Fase actual (solo Pixel de navegador): PageView, ViewContent, AddToCart,
// InitiateCheckout, Lead. Purchase NO sale de acá — ver nota en App.jsx
// junto a handleEnviarPedido: la única "venta confirmada" real del sistema
// es PEDIDO_FACTURADO, que se emite del lado del ERP (server/), no en el
// catálogo público. Conectar eso es un sprint aparte (Conversions API +
// access token de servidor).
let inicializado = false;

function pixelId() {
  return import.meta.env.VITE_META_PIXEL_ID || null;
}

// Snippet oficial de Meta — se inyecta desde JS (no pegado en index.html)
// justamente para que, sin Pixel ID configurado, ni siquiera se intente
// cargar fbevents.js.
function inyectarScript() {
  if (window.fbq) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
}

export function initMetaPixel() {
  if (inicializado) return;
  const id = pixelId();
  if (!id) return;
  inyectarScript();
  window.fbq("init", id);
  inicializado = true;
}

// Único punto por el que pasa CUALQUIER evento de este catálogo — genera
// un event_id (crypto.randomUUID()) y lo manda como `eventID` a fbq(). Hoy
// no lo usa nadie más, pero es exactamente el campo que Meta usa para
// deduplicar Pixel vs. Conversions API cuando el mismo evento lógico viaja
// por los dos caminos — dejarlo listo ahora es gratis y evita rehacer esto
// cuando se conecte CAPI. Devuelve el event_id (o null si el pixel no está
// activo) por si el llamador lo necesita más adelante.
export function trackMetaEvent(nombre, params = {}) {
  if (!inicializado || typeof window.fbq !== "function") return null;
  const eventId = crypto.randomUUID();
  window.fbq("track", nombre, params, { eventID: eventId });
  return eventId;
}
