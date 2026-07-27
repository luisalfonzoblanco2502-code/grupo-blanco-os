import { useState } from "react";
import { supabase } from "../supabaseClient";

const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
const TAMANO_MAXIMO_MB = 5;
const BUCKET = "productos-catalogo";

// Sube directo desde el navegador a Supabase Storage usando la sesión ya
// autenticada del usuario del ERP (mismo cliente supabase-js que usa
// AuthContext) — no pasa por nuestro backend, evita tener que proxyear
// bytes de imagen a través de Express. El bucket y sus políticas de
// autenticado los crea la migración manual (ver
// server/prisma/migrations_manual/0001_catalogo_solicitudes.sql).
export function ImagenProductoUpload({ empresaId, imagenUrl, onChange }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(false);

  async function handleArchivo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hay error
    if (!archivo) return;

    setError(null);
    setExito(false);

    if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
      setError("Formato no permitido. Usá JPG, PNG o WebP.");
      return;
    }
    if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
      setError(`La imagen no puede pesar más de ${TAMANO_MAXIMO_MB}MB.`);
      return;
    }

    setSubiendo(true);
    try {
      const extension = archivo.name.split(".").pop().toLowerCase();
      const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const ruta = `${empresaId}/${nombreArchivo}`;

      const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(ruta, archivo);
      if (errorSubida) throw errorSubida;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(ruta);
      onChange(data.publicUrl);
      setExito(true);
    } catch (err) {
      setError(err.message || "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div>
      {imagenUrl && (
        <img
          src={imagenUrl}
          alt="Vista previa"
          style={{ maxWidth: "160px", maxHeight: "160px", display: "block", marginBottom: "0.5rem", borderRadius: "8px" }}
        />
      )}
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleArchivo} disabled={subiendo} />
      {subiendo && <p style={{ color: "var(--text-muted)" }}>Subiendo imagen...</p>}
      {exito && !subiendo && <p style={{ color: "#22c55e" }}>Imagen subida correctamente.</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
    </div>
  );
}
