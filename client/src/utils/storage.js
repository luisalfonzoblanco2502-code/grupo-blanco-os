import { supabase } from "../supabaseClient";

// Sube un archivo real a Storage (bucket "pedidos-adjuntos", ver migración
// 0003) — nunca se guarda una ruta local del computador. Acepta cualquier
// tipo de archivo: si no es previsualizable (AI, CDR, etc.) igual queda
// adjuntable/descargable por su URL pública.
export async function subirArchivo(file, carpeta) {
  const nombreSeguro = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
  const ruta = `${carpeta}/${nombreSeguro}`;
  const { error } = await supabase.storage
    .from("pedidos-adjuntos")
    .upload(ruta, file, { cacheControl: "3600", upsert: false });
  if (error) throw new Error(`No se pudo subir "${file.name}": ${error.message}`);
  const { data } = supabase.storage.from("pedidos-adjuntos").getPublicUrl(ruta);
  return {
    nombre: file.name,
    tipo: file.type || "application/octet-stream",
    tamano: file.size,
    ubicacion: data.publicUrl,
  };
}

export function esImagen(tipo) {
  return tipo?.startsWith("image/");
}

export function formatoTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ICONOS_POR_EXTENSION = {
  pdf: "📕",
  ai: "🎨",
  cdr: "🖍️",
  eps: "🎨",
  psd: "🖼️",
  zip: "🗜️",
  rar: "🗜️",
  doc: "📄",
  docx: "📄",
  xls: "📊",
  xlsx: "📊",
};

// Ícono por tipo real de archivo — nunca solo el nombre, para que el ojo
// distinga PDF/imagen/vectorial/comprimido de un vistazo (pedido explícito:
// "no mostrar únicamente el nombre").
export function iconoArchivo(nombre, tipo) {
  if (esImagen(tipo)) return "🖼️";
  const ext = nombre?.split(".").pop()?.toLowerCase();
  return ICONOS_POR_EXTENSION[ext] || "📎";
}
