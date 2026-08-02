import { useState } from "react";
import { subirArchivo, esImagen } from "../utils/storage";

// Retoma de Fase 2 (antes pausada durante el rollout de Paso 6): reemplaza
// el placeholder puramente visual por el upload real, mismo mecanismo
// (Storage + ArchivoAdjunto) que ya usan las líneas manuales en
// LineaForm.jsx. El nombre del archivo se mantiene por compatibilidad con
// el import existente en LineaProductoMaestro — sigue siendo el único
// lugar que cambia cuando evoluciona la captura de diseño personalizado.
export function DisenoPlaceholder({ requierePersonalizacion, archivos, carpeta, onCambiar }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  if (!requierePersonalizacion) return null;

  const foto = archivos?.[0] || null;

  async function handleArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    setError(null);
    try {
      const archivo = await subirArchivo(file, carpeta);
      onCambiar([{ ...archivo, esPrincipal: true }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="diseno-placeholder diseno-personalizado">
      {foto ? (
        esImagen(foto.tipo) ? (
          <img src={foto.ubicacion} alt="Diseño del cliente" className="diseno-personalizado-preview" />
        ) : (
          <a href={foto.ubicacion} target="_blank" rel="noreferrer">
            📎 {foto.nombre}
          </a>
        )
      ) : (
        <span aria-hidden="true">📸 Sin foto del personalizado todavía</span>
      )}
      <label className="btn-ghost btn-sm">
        {subiendo ? "Subiendo..." : foto ? "Cambiar foto" : "Adjuntar foto del personalizado"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleArchivo}
          disabled={subiendo}
          style={{ display: "none" }}
        />
      </label>
      {error && <span style={{ color: "#f87171", fontSize: "0.78rem" }}>{error}</span>}
    </div>
  );
}
