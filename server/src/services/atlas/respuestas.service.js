// Plantillas de respuesta por intención — texto fijo, revisado por el
// negocio, NUNCA generado en el momento. Esto es lo que garantiza la regla
// "no prometer existencia, precio o fecha que no provenga de una fuente
// confiable" (Parte 5): estas plantillas no inventan precios ni plazos,
// remiten siempre al catálogo real o a una persona.
//
// enlaceCatalogo se recibe como parámetro (no se hardcodea acá) para que
// cada respuesta pueda llevar su propio parámetro de atribución
// (?atlas_contacto=<id>, ver DECISIONES.md) sin que esta plantilla tenga
// que saber de dónde sale la URL base.
import { esSaludo } from "./intents.service.js";

const PLANTILLAS = {
  solicitar_catalogo: (enlaceCatalogo) => `¡Hola! Acá tenés nuestro catálogo completo, con precios por cantidad: ${enlaceCatalogo}`,
  consultar_precio: (enlaceCatalogo) => `Los precios varían según cantidad — en el catálogo los ves todos actualizados: ${enlaceCatalogo}`,
  comprar_unidad: (enlaceCatalogo) => `¡Genial! Podés armar tu pedido directo acá: ${enlaceCatalogo}`,
  comprar_mayor: (enlaceCatalogo) => `Tenemos tarifas especiales por volumen — los precios exactos por cantidad están en el catálogo: ${enlaceCatalogo}`,
  personalizar_producto: (enlaceCatalogo) => `Podés subir tu propio diseño acá — nuestro equipo lo revisa antes de fabricar: ${enlaceCatalogo}#personaliza-tus-disenos`,
  consultar_pedido: (enlaceCatalogo) => `Podés rastrear tu pedido con tu número de orden acá: ${enlaceCatalogo}#rastreo`,
  consultar_tiempo_entrega: () => `Los tiempos varían según el producto y la cantidad — un miembro de nuestro equipo te confirma el tuyo enseguida.`,
  hablar_con_persona: () => `¡Por supuesto! Ya avisamos a nuestro equipo para que te atienda directamente.`,
  no_comprendida: () => `Gracias por escribir — ya transferimos tu mensaje a nuestro equipo para responderte bien.`,
};

const SALUDO = (enlaceCatalogo) => `¡Hola! Bienvenido a Panaprice 👋 ¿Buscás algo del catálogo? ${enlaceCatalogo}`;

// Nunca lanza si la intención no tiene plantilla: cae a "no_comprendida",
// mismo espíritu que el clasificador (jamás bloquear ni inventar).
export function textoParaIntencion(intencion, { textoOriginal, enlaceCatalogo } = {}) {
  if (esSaludo(textoOriginal)) return SALUDO(enlaceCatalogo);
  const plantilla = PLANTILLAS[intencion] ?? PLANTILLAS.no_comprendida;
  return plantilla(enlaceCatalogo);
}
