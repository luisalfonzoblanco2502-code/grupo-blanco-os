// Previsualización instantánea del precio esperado — espejo DELIBERADO del
// algoritmo real de productos.service.js (escalonAplicableProducto /
// precioUnitarioParaCantidad), autorizado explícitamente para evitar un
// round-trip HTTP por cada cambio de cantidad (Paso 5, corrección 3).
//
// El backend sigue siendo la ÚNICA fuente de verdad: vuelve a calcular y
// valida el precio definitivo dentro de la misma transacción al guardar la
// línea (construirSnapshotDesdeProducto, Paso 4) — esto es solo para que la
// vendedora vea el número correcto en pantalla antes de guardar, nunca lo
// que efectivamente se persiste.
export function precioEsperado(producto, cantidad) {
  const aplicable = (producto?.preciosVolumen || [])
    .filter((e) => cantidad >= e.cantidadMinima)
    .sort((a, b) => b.cantidadMinima - a.cantidadMinima)[0];
  return aplicable ? Number(aplicable.precioUnitario) : Number(producto?.precioBase ?? 0);
}
