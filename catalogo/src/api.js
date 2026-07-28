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

// Best-effort: se intenta crear la solicitud en el ERP, pero el resultado
// NUNCA debe frenar el flujo de WhatsApp (ver handleEnviarPedido en App.jsx,
// que llama a esto sin esperar/depender de su resultado para abrir wa.me).
export async function intentarCrearSolicitudEnERP(payload) {
  if (DATA_SOURCE === "local") {
    return { ok: false, motivo: "modo local: Supabase todavía no está conectado" };
  }
  try {
    const data = await fetchConTimeout("/publico/solicitudes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { ok: true, solId: data.solId };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

function soloDigitos(texto) {
  return String(texto || "").replace(/\D/g, "");
}

// Arma el link wa.me con el pedido ya redactado — el cliente solo tiene que
// tocar "Enviar" en WhatsApp. Si VITE_WHATSAPP_NUMERO no está configurado,
// devuelve null (App.jsx lo maneja mostrando un aviso en vez de romper).
export function armarLinkWhatsApp({ cliente, lineas, total }) {
  const numero = soloDigitos(import.meta.env.VITE_WHATSAPP_NUMERO);
  if (!numero) return null;

  const detalleItems = lineas
    .map((l) => {
      const nota = l.disenoNotas ? ` (${l.disenoNotas})` : "";
      return `- [${l.producto.codigo}] ${l.producto.nombre}${nota} — ${l.cantidad}x $${l.unitario.toFixed(2)} = $${l.subtotal.toFixed(2)}`;
    })
    .join("\n");

  const mensaje = [
    "Pedido desde el catálogo PanaPrice",
    "",
    `Cliente: ${cliente.nombre}`,
    `Teléfono: ${cliente.telefono}`,
    `Ubicación: ${cliente.ubicacion}`,
    "",
    "Productos:",
    detalleItems,
    "",
    `Total estimado: $${total.toFixed(2)}`,
  ].join("\n");

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
