// Captura utm_source/medium/campaign/content/term + fbclid de la URL al
// cargar la app y los persiste con atribución FIRST-TOUCH: si ya había
// algo guardado de una visita anterior, no se pisa — es el estándar para
// responder "qué campaña originó a este cliente", no la última que tocó
// justo antes de comprar.
//
// Este sprint: solo se usan como referencia cruzada (custom_data) en los
// eventos de Meta — todavía NO viajan a SolicitudPedido (eso requeriría
// extender schema.prisma + una migración nueva, mismo proceso ya usado
// para numeroOrden/tipoEntrega — se deja pendiente como paso aparte).
const CLAVE = "panaprice_utms";
const CAMPOS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"];

export function capturarUtms() {
  if (typeof window === "undefined") return;
  if (obtenerUtms()) return; // first-touch: ya hay una atribución guardada, no se pisa

  const params = new URLSearchParams(window.location.search);
  const encontrados = {};
  for (const campo of CAMPOS) {
    const valor = params.get(campo);
    if (valor) encontrados[campo] = valor;
  }
  if (Object.keys(encontrados).length === 0) return;

  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...encontrados, capturadoEn: new Date().toISOString() }));
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — nunca debe
    // romper el catálogo por esto.
  }
}

export function obtenerUtms() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}
