import { useEffect, useRef } from "react";
import { precioEsperado } from "../utils/precioProducto";
import { DisenoPlaceholder } from "./DisenoPlaceholder";

// Tarjeta compacta de una línea nacida de un Producto Maestro (Paso 5) —
// SIEMPRE expandida (a diferencia de LineaCard/LineaForm): no hay campos
// técnicos que mostrar u ocultar, solo lo comercial. Nunca envía/edita
// talla/tela/medidas/tipoImpresion/forro/tiras/insumos/productoInternoId/
// instrucciones/tiempos/molde — eso ya vive en el snapshot que arma el
// backend al guardar (Paso 4); acá ni siquiera se leen esos campos.
export function LineaProductoMaestro({ linea, autoFocus, onCambiar, onEliminar, onContinuar }) {
  const cantidadRef = useRef(null);

  useEffect(() => {
    if (autoFocus && cantidadRef.current) {
      cantidadRef.current.focus();
      cantidadRef.current.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const cantidad = Number(linea.cantidad) || 0;
  const precioUnitario = precioEsperado(linea, cantidad);
  const subtotal = precioUnitario * cantidad;

  function manejarCantidad(valor) {
    const cantidadNueva = Math.max(1, Number(valor) || 1);
    onCambiar({ cantidad: cantidadNueva, precioUnitario: precioEsperado(linea, cantidadNueva) });
  }

  function manejarEnterCantidad(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onContinuar?.();
  }

  return (
    <div className="linea-card linea-producto-maestro fade-in">
      <div className="linea-producto-maestro-cuerpo">
        {linea.imagenReferenciaProduccionUrl ? (
          <img src={linea.imagenReferenciaProduccionUrl} alt="" className="linea-card-thumb" />
        ) : (
          <div className="linea-card-thumb linea-card-thumb-vacia" aria-hidden="true" />
        )}

        <div className="linea-producto-maestro-info">
          <span className="linea-producto-maestro-nombre">{linea.producto}</span>
          <span className="card-label">Ref. {linea.productoCodigo}</span>
        </div>

        <label className="linea-producto-maestro-campo">
          Cantidad
          <input
            ref={cantidadRef}
            type="number"
            min={1}
            value={linea.cantidad}
            onChange={(e) => manejarCantidad(e.target.value)}
            onKeyDown={manejarEnterCantidad}
          />
        </label>

        <div className="linea-producto-maestro-campo">
          <span className="card-label">Precio unit.</span>
          <span>${precioUnitario.toFixed(2)}</span>
        </div>

        <div className="linea-producto-maestro-campo">
          <span className="card-label">Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>

        <button type="button" className="btn-ghost btn-sm" onClick={onEliminar} title="Eliminar línea" aria-label="Eliminar línea">
          🗑
        </button>
      </div>

      <DisenoPlaceholder requierePersonalizacion={linea.requierePersonalizacion} />

      <input
        type="text"
        className="linea-producto-maestro-observaciones"
        placeholder="Observaciones (opcional)"
        value={linea.observacionesProduccion || ""}
        onChange={(e) => onCambiar({ observacionesProduccion: e.target.value })}
      />
    </div>
  );
}
