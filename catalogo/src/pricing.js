// Escalas de precio por CATEGORÍA — fuente única de verdad, definida acá
// UNA sola vez. No se configura por producto: cualquier producto cuya
// `categoria` tenga entrada acá hereda esta tarifa automáticamente, sin
// tocar cada fila de la base de datos. Preparado para el día que otra
// categoría (Pareos, Uniformes, DTF...) necesite su propia escala: alcanza
// con agregar una entrada nueva a este objeto.
//
// El precio aplicable NO es por línea/referencia individual: se calcula
// sobre la cantidad TOTAL acumulada de esa categoría en el carrito, sumando
// todas las referencias distintas que la tengan (ver acumularPorCategoria).
// Categorías que no aparecen acá siguen su comportamiento anterior, sin
// cambios: precio por producto (producto.preciosVolumen / precioBase).
export const ESCALAS_POR_CATEGORIA = {
  Pañoletas: [
    { cantidadMinima: 1, precioUnitario: 10.0 },
    { cantidadMinima: 3, precioUnitario: 6.5 },
    { cantidadMinima: 6, precioUnitario: 5.5 },
    { cantidadMinima: 12, precioUnitario: 5.0 },
    { cantidadMinima: 50, precioUnitario: 4.75 },
    { cantidadMinima: 100, precioUnitario: 4.5 },
  ],
};

export function escalaDeCategoria(categoria) {
  return ESCALAS_POR_CATEGORIA[categoria] ?? null;
}

// Escalón alcanzado: el de mayor cantidadMinima que no supere `cantidad`
// (cantidades intermedias aplican el mejor nivel ya alcanzado, no el
// siguiente escalón sin llegar — ej. 8 unidades sigue en el escalón de 6).
export function escalonAplicable(categoria, cantidad) {
  const escala = escalaDeCategoria(categoria);
  if (!escala) return null;
  return (
    [...escala].filter((e) => cantidad >= e.cantidadMinima).sort((a, b) => b.cantidadMinima - a.cantidadMinima)[0] ??
    escala[0]
  );
}

export function precioUnitarioPorCategoria(categoria, cantidadAcumulada) {
  const escalon = escalonAplicable(categoria, cantidadAcumulada);
  return escalon ? escalon.precioUnitario : null;
}

// Suma la cantidad total por categoría de todas las líneas del carrito que
// pertenezcan a una categoría con escala definida — las demás categorías no
// se acumulan (cada una sigue su propio precio por producto, sin mezclarse).
export function acumularPorCategoria(lineas) {
  const acumulado = {};
  for (const linea of lineas) {
    const categoria = linea.producto?.categoria;
    if (!categoria || !ESCALAS_POR_CATEGORIA[categoria]) continue;
    acumulado[categoria] = (acumulado[categoria] || 0) + (Number(linea.cantidad) || 0);
  }
  return acumulado;
}

// Escala "de referencia" para mostrar en la tarjeta de un producto: la de su
// categoría si está definida; si no, la propia (producto.preciosVolumen,
// normalizada) para no cambiarle nada a categorías sin escala unificada
// todavía; si el producto tampoco tiene escalones propios, null (un solo
// precio, precioBase).
export function escalaParaMostrar(producto) {
  const deCategoria = escalaDeCategoria(producto.categoria);
  if (deCategoria) return deCategoria;
  if (producto.preciosVolumen?.length > 0) {
    const escalones = [...producto.preciosVolumen]
      .map((e) => ({ cantidadMinima: e.cantidadMinima, precioUnitario: Number(e.precioUnitario) }))
      .sort((a, b) => a.cantidadMinima - b.cantidadMinima);
    // Si el primer escalón propio no arranca en 1 unidad, la fila "1 unidad"
    // de la tabla/tarjeta tiene que ser precioBase (lo que de verdad paga
    // alguien que compra 1), no el precio del primer escalón que no aplica
    // todavía a esa cantidad.
    if (escalones[0].cantidadMinima > 1) {
      escalones.unshift({ cantidadMinima: 1, precioUnitario: Number(producto.precioBase) });
    }
    return escalones;
  }
  return null;
}
