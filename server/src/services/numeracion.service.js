// Genera el siguiente número secuencial de un prefijo dado (ej. "PED-0007"),
// buscando el máximo ya usado entre los valores existentes y sumando 1.
// Reutilizable para pedId (prefijo "PED"), opId (prefijo = pedId del padre,
// ej. "PED-0007-01") o cualquier numeración futura con este mismo patrón.
export function siguienteNumero(valoresExistentes, prefijo, padding = 4) {
  const regex = new RegExp(`^${prefijo}-(\\d+)$`);
  const maxActual = valoresExistentes.reduce((max, valor) => {
    const match = valor.match(regex);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  return `${prefijo}-${String(maxActual + 1).padStart(padding, "0")}`;
}
