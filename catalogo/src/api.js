// Capa de datos del catálogo. Un solo lugar decide de dónde vienen los
// productos y a dónde intenta ir la solicitud — los componentes (App.jsx)
// no saben si están hablando con Supabase o con datos locales.
//
// VITE_DATA_SOURCE=local  -> usa catalogo/src/data/productos.js (sin red).
// VITE_DATA_SOURCE=api    -> pide a VITE_API_URL/publico/productos.
// Sin variable definida    -> "local" por defecto: el catálogo nunca debe
//                             quedar bloqueado por Supabase todavía sin migrar.
//
// Además, aunque DATA_SOURCE sea "api", si la llamada falla (backend caído,
// tablas no migradas, CORS, etc.) se cae automáticamente a los datos locales
// en vez de mostrar una pantalla rota — ver getProductos().
import { productosLocal } from "./data/productos.js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
const DATA_SOURCE = import.meta.env.VITE_DATA_SOURCE || "local";
const TIMEOUT_MS = 4000;

async function fetchConTimeout(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Cada producto local ya trae `codigo`; a los que vengan de la API real
// (que todavía no tiene esa columna, ver deuda técnica en README) se les
// arma uno cortando el UUID, para que la vista nunca se quede sin código
// que mostrar.
function conCodigo(producto) {
  return { codigo: producto.id.slice(0, 8).toUpperCase(), ...producto };
}

// data/productos.js solo pide 4 campos (codigo, nombre, precio, imagen) —
// acá se completa el resto con defaults fijos para que el resto de la app
// (que espera el shape completo, igual al de la API real) no tenga que
// saber que está en modo local.
function normalizarProductoLocal(p) {
  return {
    id: p.codigo,
    codigo: p.codigo,
    nombre: p.nombre,
    categoria: "Pañoletas",
    descripcion: null,
    imagenUrl: p.imagen ? `/productos/${p.imagen}` : null,
    precioBase: p.precio,
    activo: true,
    publicadoCatalogo: true,
    disponible: p.disponible ?? true,
    preciosVolumen: p.preciosVolumen ?? [],
  };
}

export async function getProductos() {
  if (DATA_SOURCE === "local") {
    return productosLocal.map(normalizarProductoLocal);
  }
  try {
    const productos = await fetchConTimeout("/publico/productos");
    return productos.map(conCodigo);
  } catch (err) {
    console.warn("No se pudo cargar el catálogo desde la API, usando datos locales:", err.message);
    return productosLocal.map(normalizarProductoLocal);
  }
}

// Se espera (await) en handleEnviarPedido porque de acá sale el numeroOrden
// REAL y secuencial (PP-2026-000154, generado server-side en
// crearSolicitudPublica) — pero su fallo NUNCA debe impedir enviar el
// pedido por WhatsApp: si esto falla (migración de Supabase pendiente, sin
// red, etc.), App.jsx genera un número de referencia local y sigue el flujo
// igual, solo que ese número no va a aparecer en "Rastrea tu pedido".
export async function intentarCrearSolicitudEnERP(payload) {
  if (DATA_SOURCE === "local") {
    return { ok: false, motivo: "modo local: Supabase todavía no está conectado" };
  }
  try {
    const data = await fetchConTimeout("/publico/solicitudes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: true, solId: data.solId, numeroOrden: data.numeroOrden };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

// Consulta pública de estado — usada por "Rastrea tu pedido". No depende de
// DATA_SOURCE=local (no tendría sentido rastrear un pedido en modo local,
// que nunca llega a ningún backend): si no hay API configurada o falla,
// devuelve ok:false con un motivo legible para mostrar al cliente.
export async function consultarRastreo(numeroOrden) {
  try {
    const data = await fetchConTimeout(`/publico/rastreo/${encodeURIComponent(numeroOrden)}`);
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

function soloDigitos(texto) {
  return String(texto || "").replace(/\D/g, "");
}

// Mensaje corto — dos variantes, ninguna miente sobre si hay un archivo
// realmente adjunto (sprint correctivo, 2026-07-29 — antes una sola frase
// decía "adjunto el PDF" incluso cuando no viajaba ningún archivo):
//  - compartido=true:  se usa como texto de navigator.share({ text }),
//    donde el PDF SÍ viaja adjunto de verdad (lo entrega el share sheet
//    del sistema operativo) — "te comparto" es cierto acá.
//  - compartido=false: el PDF se descargó al dispositivo pero no se pudo
//    compartir como archivo (navegador/SO sin soporte) — el cliente lo
//    adjunta a mano, así que nunca dice "adjunto".
function mensajeCorto(numeroOrden, compartido) {
  const lineaPdf = compartido ? "Te comparto el PDF de mi pedido." : "Te envío el PDF de mi pedido a continuación.";
  return ["Hola Panaprice.", "Acabo de generar mi pedido.", "", `Orden: ${numeroOrden}`, "", lineaPdf, "Muchas gracias."].join("\n");
}

// Fallback con el detalle completo — se usa SOLO si el PDF no se pudo
// generar (imagen rota, jsPDF no cargó, etc.), para que el pedido nunca
// quede sin información aunque falte el adjunto. Mismo formato que las
// versiones anteriores del catálogo.
function mensajeDetallado({ cliente, lineas, total, resumenCategorias, numeroOrden }) {
  const detalleItems = lineas
    .map((l) => {
      const nota = l.disenoNotas ? ` (${l.disenoNotas})` : "";
      const precio = l.tipo === "personalizado" ? "a cotizar" : `${l.cantidad}x $${l.unitario.toFixed(2)} = $${l.subtotal.toFixed(2)}`;
      return `- [${l.producto.codigo}] ${l.producto.nombre}${nota} — ${precio}`;
    })
    .join("\n");

  const bloquesResumen = resumenCategorias
    .map(
      (r) =>
        `\nResumen ${r.categoria}:\n` +
        `Total ${r.categoria.toLowerCase()}: ${r.cantidad}\n` +
        `Tarifa aplicada: desde ${r.escalon.cantidadMinima} ${r.escalon.cantidadMinima === 1 ? "unidad" : "unidades"}\n` +
        `Precio unitario: $${r.escalon.precioUnitario.toFixed(2)}\n` +
        `Subtotal ${r.categoria}: $${r.subtotal.toFixed(2)}`
    )
    .join("\n");

  return [
    "Pedido desde el catálogo PanaPrice (no se pudo adjuntar el PDF)",
    numeroOrden ? `N.º de orden: ${numeroOrden}` : null,
    "",
    `Cliente: ${cliente.nombre}`,
    `Teléfono: ${cliente.telefono}`,
    `Ubicación: ${cliente.ubicacion}`,
    "",
    "Productos:",
    detalleItems,
    bloquesResumen,
    "",
    `Total estimado: $${total.toFixed(2)}`,
  ].join("\n");
}

// Único lugar que decide QUÉ texto corresponde — usado por armarLinkWhatsApp
// (fallback sin compartir archivo), por "Copiar mensaje" y por
// handleCompartirPedido en App.jsx (texto de navigator.share). Así los tres
// lugares nunca pueden desincronizarse sobre qué es honesto decir.
export function textoMensajePedido({ cliente, lineas, total, resumenCategorias, numeroOrden, pdfOk, compartido = false }) {
  if (!pdfOk) return mensajeDetallado({ cliente, lineas, total, resumenCategorias, numeroOrden });
  return mensajeCorto(numeroOrden, compartido);
}

// Arma el link wa.me — usado en los caminos donde NO hubo navigator.share
// (fallback de descarga manual, o PDF que ni se pudo generar). Si
// VITE_WHATSAPP_NUMERO no está configurado, devuelve null (App.jsx lo
// maneja mostrando un aviso en vez de romper).
export function armarLinkWhatsApp({ cliente, lineas, total, resumenCategorias = [], numeroOrden, pdfOk }) {
  const numero = soloDigitos(import.meta.env.VITE_WHATSAPP_NUMERO);
  if (!numero) return null;

  const mensaje = textoMensajePedido({ cliente, lineas, total, resumenCategorias, numeroOrden, pdfOk, compartido: false });

  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

// Link genérico para el botón flotante de "consultar por WhatsApp" (antes
// de armar un pedido) — mismo número, mensaje de saludo simple.
export function armarLinkWhatsAppGenerico() {
  const numero = soloDigitos(import.meta.env.VITE_WHATSAPP_NUMERO);
  if (!numero) return null;
  const mensaje = "Hola, quiero información sobre el catálogo de pañoletas PanaPrice";
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
