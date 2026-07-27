// Event Bus interno, muy liviano: envuelve el EventEmitter nativo de Node
// (cero dependencias externas). El objetivo es desacoplar quién ORIGINA un
// hecho de negocio (ej. FacturacionService) de quién REACCIONA a él (hoy
// Producción; mañana Inventario, CRM, Finanzas) — el emisor no importa ni
// conoce esos módulos, solo publica el evento.
//
// Diferencia clave con EventEmitter.emit crudo: EventEmitter no espera a que
// los listeners async terminen, así que un error dentro de un handler se
// perdería como una promesa rechazada sin dueño. Este `emit` sí espera a
// todos los handlers (uno por uno, en orden de registro) y propaga el primer
// error — así quien emite el evento se entera si algo falló antes de
// responderle al usuario.
import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function on(evento, handler) {
  emitter.on(evento, handler);
}

export function off(evento, handler) {
  emitter.off(evento, handler);
}

// Devuelve un array con lo que cada handler haya retornado, en orden de
// registro — útil cuando a quien emite le sirve saber "qué pasó" (ej. qué
// se creó), sin tener que conocer el tipo de dato de vuelta.
export async function emit(evento, payload) {
  const resultados = [];
  for (const handler of emitter.listeners(evento)) {
    resultados.push(await handler(payload));
  }
  return resultados;
}
