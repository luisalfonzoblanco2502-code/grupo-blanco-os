import { useId, useState } from "react";
import { subirArchivo, formatoTamano, iconoArchivo } from "../utils/storage";

// Campos de UNA línea de pedido — reutilizado tanto en "Nuevo Pedido" (líneas
// en memoria, antes de que el pedido exista) como en el editor de líneas de
// un pedido ya creado (cada cambio se guarda de verdad). Puramente
// controlado: value + onChange, nunca sabe si ya existe en la base.
// Organizado en 3 subgrupos visuales (Producto / Especificaciones / Archivos)
// en vez de una lista plana de ~15 inputs sin jerarquía.
//
// `sugerencias` (opcional, {tela:[], color:[], ...}): valores ya usados por
// la empresa, ofrecidos como <datalist> — "primero sugerir, nunca obligar"
// (ver CLAUDE.md). Sigue siendo texto libre: el datalist solo propone, el
// navegador deja escribir cualquier cosa igual.
export function LineaForm({ valor, onChange, productosInternos, prioridades, carpetaArchivos, sugerencias = {} }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const idBase = useId();
  const idSugerencia = (campo) => `${idBase}-sug-${campo}`;

  function set(campo, val) {
    onChange({ ...valor, [campo]: val });
  }

  function elegirProductoInterno(productoInternoId) {
    const producto = productosInternos.find((p) => p.id === productoInternoId);
    onChange({
      ...valor,
      productoInternoId,
      producto: producto ? producto.nombre : valor.producto,
      precioUnitario: producto?.precioReferencia ?? valor.precioUnitario,
    });
  }

  async function handleSubirArchivo(e, esPrincipal) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    setError(null);
    try {
      const archivo = await subirArchivo(file, carpetaArchivos);
      const archivos = (valor.archivos || []).filter((a) => !(esPrincipal && a.esPrincipal));
      onChange({ ...valor, archivos: [...archivos, { ...archivo, esPrincipal }] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  function quitarArchivo(index) {
    onChange({ ...valor, archivos: valor.archivos.filter((_, i) => i !== index) });
  }

  const cantidad = Number(valor.cantidad) || 0;
  const precioUnitario = valor.precioUnitario !== "" && valor.precioUnitario != null ? Number(valor.precioUnitario) : null;
  const subtotal = precioUnitario != null ? cantidad * precioUnitario : null;
  const imagenPrincipal = (valor.archivos || []).find((a) => a.esPrincipal);
  const otrosArchivos = (valor.archivos || []).filter((a) => !a.esPrincipal);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <div className="linea-subgrupo-titulo">🧾 Producto</div>
        <div className="form-grid">
          <select value={valor.productoInternoId || ""} onChange={(e) => elegirProductoInterno(e.target.value)}>
            <option value="">Catálogo interno (opcional)</option>
            {productosInternos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Producto o referencia"
            value={valor.producto || ""}
            onChange={(e) => set("producto", e.target.value)}
            required
          />
          <input
            type="number"
            min={1}
            placeholder="Cantidad"
            value={valor.cantidad ?? 1}
            onChange={(e) => set("cantidad", e.target.value)}
            required
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Precio unitario"
            value={valor.precioUnitario ?? ""}
            onChange={(e) => set("precioUnitario", e.target.value)}
          />
          <select value={valor.prioridadId || ""} onChange={(e) => set("prioridadId", e.target.value)}>
            <option value="">Prioridad (opcional)</option>
            {prioridades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.4rem" }}>
          <span className="card-label">Subtotal: {subtotal != null ? subtotal.toFixed(2) : "—"}</span>
        </div>
        <textarea
          placeholder="Descripción (opcional)"
          value={valor.descripcion || ""}
          onChange={(e) => set("descripcion", e.target.value)}
          rows={2}
          style={{ width: "100%", marginTop: "0.5rem" }}
        />
      </div>

      <div>
        <div className="linea-subgrupo-titulo">📐 Especificaciones</div>
        <div className="form-grid">
          <input type="text" placeholder="Talla" value={valor.talla || ""} onChange={(e) => set("talla", e.target.value)} />
          <input
            type="text"
            placeholder="Tela / material"
            value={valor.tela || ""}
            onChange={(e) => set("tela", e.target.value)}
            list={idSugerencia("tela")}
          />
          <input
            type="text"
            placeholder="Color"
            value={valor.color || ""}
            onChange={(e) => set("color", e.target.value)}
            list={idSugerencia("color")}
          />
          <input
            type="text"
            placeholder="Tipo de impresión"
            value={valor.tipoImpresion || ""}
            onChange={(e) => set("tipoImpresion", e.target.value)}
            list={idSugerencia("tipoImpresion")}
          />
          <input
            type="text"
            placeholder="Forro"
            value={valor.forro || ""}
            onChange={(e) => set("forro", e.target.value)}
            list={idSugerencia("forro")}
          />
          <input
            type="text"
            placeholder="Tiras"
            value={valor.tiras || ""}
            onChange={(e) => set("tiras", e.target.value)}
            list={idSugerencia("tiras")}
          />
          <input
            type="text"
            placeholder="Medidas"
            value={valor.medidas || ""}
            onChange={(e) => set("medidas", e.target.value)}
            list={idSugerencia("medidas")}
          />
          <input
            type="text"
            placeholder="Insumos"
            value={valor.insumos || ""}
            onChange={(e) => set("insumos", e.target.value)}
            list={idSugerencia("insumos")}
          />
        </div>
        {["tela", "color", "tipoImpresion", "forro", "tiras", "insumos", "medidas"].map((campo) => (
          <datalist id={idSugerencia(campo)} key={campo}>
            {(sugerencias[campo] || []).map((valorSugerido) => (
              <option key={valorSugerido} value={valorSugerido} />
            ))}
          </datalist>
        ))}
        <textarea
          placeholder="Observaciones de producción (opcional)"
          value={valor.observacionesProduccion || ""}
          onChange={(e) => set("observacionesProduccion", e.target.value)}
          rows={2}
          style={{ width: "100%", marginTop: "0.5rem" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.6rem", fontSize: "0.85rem" }}>
          <input
            type="checkbox"
            checked={!!valor.separarEnOtraOp}
            onChange={(e) => set("separarEnOtraOp", e.target.checked)}
          />
          Separar en otra Orden de Producción
        </label>
      </div>

      <div>
        <div className="linea-subgrupo-titulo">📎 Archivos</div>
        <div className="item-row" style={{ alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem", margin: 0 }}>
            Imagen principal{" "}
            <input type="file" accept="image/*" onChange={(e) => handleSubirArchivo(e, true)} disabled={subiendo} />
          </label>
          <label style={{ fontSize: "0.85rem", margin: 0 }}>
            Adjuntar archivo (PDF, AI, CDR...){" "}
            <input type="file" onChange={(e) => handleSubirArchivo(e, false)} disabled={subiendo} />
          </label>
          {subiendo && <span className="card-label">Subiendo...</span>}
        </div>
        {(imagenPrincipal || otrosArchivos.length > 0) && (
          <div className="archivo-lista" style={{ marginTop: "0.6rem" }}>
            {imagenPrincipal && (
              <div className="archivo-item">
                <img
                  src={imagenPrincipal.ubicacion}
                  alt=""
                  style={{ width: "1.9rem", height: "1.9rem", borderRadius: "6px", objectFit: "cover" }}
                />
                <span className="archivo-nombre">{imagenPrincipal.nombre} · imagen principal</span>
                <span className="archivo-tamano">{formatoTamano(imagenPrincipal.tamano)}</span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => quitarArchivo(valor.archivos.indexOf(imagenPrincipal))}>
                  Quitar
                </button>
              </div>
            )}
            {otrosArchivos.map((a) => (
              <div className="archivo-item" key={a.ubicacion}>
                <span className="archivo-icono">{iconoArchivo(a.nombre, a.tipo)}</span>
                <a href={a.ubicacion} target="_blank" rel="noreferrer" className="archivo-nombre">
                  {a.nombre}
                </a>
                <span className="archivo-tamano">{formatoTamano(a.tamano)}</span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => quitarArchivo(valor.archivos.indexOf(a))}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
