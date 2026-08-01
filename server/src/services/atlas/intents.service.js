// Clasificador de intención POR REGLAS — determinista y auditable, NUNCA
// generativo. Regla de oro del sprint (Parte 4/5): si ninguna regla matchea
// con confianza, la intención es "no_comprendida" y el contacto pasa a
// revisión humana — jamás se inventa una respuesta para forzar un match.
//
// Deliberadamente simple (palabras clave, no NLP/ML) para que cualquiera en
// el equipo pueda leer por qué un mensaje se clasificó como se clasificó.
// Si en el futuro esto no alcanza, se reemplaza este archivo — el contrato
// (recibe texto, devuelve una de las INTENCIONES) no cambia para quien lo
// llama.
import { INTENCIONES, PALABRAS_SALIDA } from "./config.js";

// Regla DURA de Parte 7: se evalúa ANTES que cualquier clasificación de
// intención. Si esto da true, quien orqueste el mensaje debe llamar a
// identidades.service.js#registrarBajaCanal y NUNCA seguir automatizando
// esa identidad — no es una intención más de la lista INTENCIONES, es un
// corte previo a todo lo demás.
export function detectarPalabraSalida(textoMensaje) {
  const texto = (textoMensaje || "").trim();
  if (!texto) return false;
  return PALABRAS_SALIDA.some((patron) => patron.test(texto));
}

// Orden intencional: reglas más ESPECÍFICAS primero (comprar_mayor antes
// que consultar_precio) — un mensaje como "precio al mayor, soy mayorista"
// matchea ambas, pero "mayorista" es la señal más útil para el negocio, así
// que su regla se evalúa antes. Se usa la primera coincidencia, no la más
// específica calculada en runtime — mantener este orden a mano en vez de
// un sistema de puntajes es deliberado: sigue siendo legible por cualquiera
// del equipo sin tener que razonar sobre pesos numéricos.
const REGLAS = [
  { intencion: "hablar_con_persona", patrones: [/hablar con (una persona|alguien|un asesor)/i, /persona real/i, /humano/i] },
  { intencion: "comprar_mayor", patrones: [/mayor(ista)?/i, /por (mayor|volumen|cantidad)/i, /al por mayor/i] },
  { intencion: "personalizar_producto", patrones: [/personaliza/i, /a mi gusto/i, /con mi (logo|diseñ)/i, /diseñ[oa]r/i] },
  { intencion: "consultar_pedido", patrones: [/mi pedido/i, /estado de mi orden/i, /rastrea/i, /n[uú]mero de orden/i] },
  { intencion: "consultar_tiempo_entrega", patrones: [/tiempo de entrega/i, /cu[aá]ndo llega/i, /demora/i, /env[ií]o/i] },
  { intencion: "solicitar_catalogo", patrones: [/cat[aá]logo/i, /\bver productos?\b/i] },
  { intencion: "consultar_precio", patrones: [/precio/i, /cu[aá]nto (cuesta|vale|sale)/i, /costo/i] },
  { intencion: "comprar_unidad", patrones: [/quiero comprar/i, /^comprar\b/i, /hacer un pedido/i] },
];

// Devuelve SIEMPRE una de las INTENCIONES válidas (nunca null/undefined) —
// quien llama no tiene que manejar un caso "sin clasificar" aparte de
// "no_comprendida", que ya está en la lista.
export function clasificarIntencion(textoMensaje) {
  const texto = (textoMensaje || "").trim();
  if (!texto) return "no_comprendida";

  for (const regla of REGLAS) {
    if (regla.patrones.some((patron) => patron.test(texto))) {
      return regla.intencion;
    }
  }
  return "no_comprendida";
}

// Saludo simple ("Hola") no es una intención de negocio en sí — se
// distingue acá para que respuestas.service.js pueda decidir un saludo en
// vez de forzarlo dentro de las INTENCIONES formales.
export function esSaludo(textoMensaje) {
  return /^\s*(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches)\s*[!.]*\s*$/i.test(textoMensaje || "");
}

export { INTENCIONES };
