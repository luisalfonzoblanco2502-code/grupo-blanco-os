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

// Mensajes de celebración al alcanzar exactamente un escalón — tono de
// Asistente Comercial: elegante, nunca infantil ni técnico ("excelente
// socio", no "genial!!! 🥳🥳"). Redactados 2026-07-29 (sprint "experiencia
// de compra") con la voz exacta pedida por el negocio.
const CELEBRACION_POR_CANTIDAD = {
  3: { emoji: "🎉", texto: "Excelente. Ya desbloqueaste la tarifa para 3 unidades." },
  6: { emoji: "🚀", texto: "Ahora eres cliente mayorista." },
  12: {
    emoji: "🤝",
    texto: "Excelente socio. Ya eres un Aliado Comercial Panaprice. Ahora disfrutas nuestra tarifa preferencial de producción.",
  },
  50: { emoji: "🏭", texto: "Producción comercial desbloqueada." },
  100: { emoji: "🔥", texto: "Producción empresarial." },
};

// Nombre de marca de cada tramo — para no repetir "el precio de $X c/u" en
// todos los mensajes: cada umbral tiene su propia identidad comercial
// (mayorista, Aliado Comercial, etc.), igual que las celebraciones de arriba.
const ETIQUETA_TRAMO = {
  3: "el precio de producción",
  6: "el precio mayorista",
  12: "la tarifa de Aliado Comercial",
  50: "la tarifa de producción comercial",
  100: "la tarifa de producción empresarial",
};

// Estado completo del Asistente Comercial para una categoría con escala,
// dada la cantidad ya acumulada en el carrito — de acá salen el mensaje, la
// barra de progreso y el ahorro estimado (ver AsistenteComercial en
// App.jsx). Devuelve null si la categoría no tiene escala o no hay nada
// todavía en el carrito (no hay nada que motivar con cantidad 0).
export function estadoMotivacion(categoria, cantidad) {
  const escala = escalaDeCategoria(categoria);
  if (!escala || !cantidad || cantidad <= 0) return null;

  const actual = escalonAplicable(categoria, cantidad);
  const siguiente = escala.find((e) => e.cantidadMinima > cantidad) ?? null;

  const celebracion = CELEBRACION_POR_CANTIDAD[cantidad];
  let mensaje;
  if (celebracion) {
    mensaje = celebracion;
  } else if (siguiente) {
    const faltan = siguiente.cantidadMinima - cantidad;
    const etiqueta = ETIQUETA_TRAMO[siguiente.cantidadMinima] ?? "la siguiente tarifa";
    const precio = `$${siguiente.precioUnitario.toFixed(2)} c/u`;
    if (faltan === 1) {
      mensaje = { emoji: "🔥", texto: `Ya casi llegas. Solo falta 1 unidad para obtener ${etiqueta} (${precio}).` };
    } else if (actual.cantidadMinima === 1) {
      mensaje = {
        emoji: "💡",
        texto: `Tu pedido comenzó muy bien. Con solo ${faltan} unidades más desbloqueas ${etiqueta} de ${precio}.`,
      };
    } else {
      mensaje = { emoji: "💡", texto: `Con ${faltan} unidades más desbloqueas ${etiqueta} de ${precio}.` };
    }
  } else {
    mensaje = { emoji: "🔥", texto: "Ya tenés la mejor tarifa disponible de Panaprice." };
  }

  // Ahorro: lo que se ahorraría comprando exactamente la cantidad mínima
  // del siguiente escalón a su precio, contra pagar esas mismas unidades
  // al precio actual (mismo criterio del ejemplo: 1 unidad a $10 -> a 3
  // unidades y $6.50 c/u ahorra (10-6.5)*3 = $10.50).
  const ahorro = siguiente ? (actual.precioUnitario - siguiente.precioUnitario) * siguiente.cantidadMinima : 0;

  const inicioTramo = actual.cantidadMinima;
  const finTramo = siguiente ? siguiente.cantidadMinima : actual.cantidadMinima;
  const progreso = siguiente ? Math.min(100, Math.max(0, ((cantidad - inicioTramo) / (finTramo - inicioTramo)) * 100)) : 100;

  return { mensaje, actual, siguiente, ahorro, progreso, cantidad };
}

// Emoji por categoría — usado en el resumen visual del pedido ("Tu pedido
// incluye: 🧣 12 Pañoletas") y en el módulo de diseños personalizados.
// Coincide por substring (no exacto) para cubrir tanto la categoría real de
// un Producto ("Pañoletas", plural, viene de la API) como la opción elegida
// en el selector de "Personaliza tus diseños" (singular).
const ICONOS_CATEGORIA = [
  { match: /pañoleta/i, emoji: "🧣" },
  { match: /franela|camisa|t-?shirt/i, emoji: "👕" },
  { match: /chemise/i, emoji: "👔" },
  { match: /pareo/i, emoji: "🧵" },
  { match: /bandana/i, emoji: "🎽" },
  { match: /lanyard/i, emoji: "🪢" },
  { match: /personalizad/i, emoji: "🎨" },
];

export function iconoCategoria(categoria) {
  const encontrado = ICONOS_CATEGORIA.find((i) => i.match.test(categoria || ""));
  return encontrado ? encontrado.emoji : "🛍️";
}

// Opciones del selector "Producto" en Personaliza tus diseños — texto libre
// en el fondo (SolicitudPedidoItem no se toca este sprint), esto solo
// ordena la lista visible en el formulario.
export const TIPOS_PRODUCTO_PERSONALIZABLE = [
  "Pañoleta",
  "Franela",
  "Chemise",
  "Pareo",
  "Bandana",
  "Lanyard",
  "Otro",
];
