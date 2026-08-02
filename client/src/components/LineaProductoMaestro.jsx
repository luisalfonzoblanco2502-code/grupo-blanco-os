import { useEffect, useRef } from "react";
import { precioEsperado } from "../utils/precioProducto";
import { DisenoPlaceholder } from "./DisenoPlaceholder";

// Formato humano de tiempoProduccionMinutos (guardado en minutos en la
// base) — solo para MOSTRAR "2 días"/"3 horas" en la tarjeta; nunca se
// reescribe el valor guardado.
function formatoTiempoProduccion(minutos) {
  if (!minutos) return null;
  if (minutos % 1440 === 0) return `${minutos / 1440} día${minutos / 1440 === 1 ? "" : "s"}`;
  if (minutos % 60 === 0) return `${minutos / 60} hora${minutos / 60 === 1 ? "" : "s"}`;
  return `${minutos} min`;
}

// Tarjeta compacta de una línea nacida de un Producto Maestro (Paso 5) —
// SIEMPRE expandida (a diferencia de LineaCard/LineaForm): no hay campos
// técnicos que mostrar u ocultar, solo lo comercial. Nunca envía/edita
// talla/tela/medidas/tipoImpresion/forro/tiras/insumos/productoInternoId/
// instrucciones/tiempos/molde — eso ya vive en el snapshot que arma el
// backend al guardar (Paso 4); acá ni siquiera se leen esos campos.
export function LineaProductoMaestro({ linea, autoFocus, onCambiar, onEliminar, onContinuar, puedeEditarPrecio }) {
  const cantidadRef = useRef(null);

  useEffect(() => {
    if (autoFocus && cantidadRef.current) {
      cantidadRef.current.focus();
      cantidadRef.current.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const cantidad = Number(linea.cantidad) || 0;
  // Una vez que la vendedora tocó el precio a mano, dejar de recalcularlo
  // solo porque cambió la cantidad — precioManual es la señal de esa
  // decisión explícita (ver manejarPrecio/restablecerPrecio abajo).
  const precioUnitario = linea.precioManual ? Number(linea.precioUnitario) : precioEsperado(linea, cantidad);
  const subtotal = precioUnitario * cantidad;

  function manejarCantidad(valor) {
    const cantidadNueva = Math.max(1, Number(valor) || 1);
    onCambiar({
      cantidad: cantidadNueva,
      precioUnitario: linea.precioManual ? linea.precioUnitario : precioEsperado(linea, cantidadNueva),
    });
  }

  function manejarPrecio(valor) {
    onCambiar({ precioUnitario: valor === "" ? "" : Number(valor), precioManual: true });
  }

  function restablecerPrecio() {
    onCambiar({ precioUnitario: precioEsperado(linea, cantidad), precioManual: false });
  }

  function manejarEnterCantidad(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onContinuar?.();
  }

  return (
    <div className="linea-card linea-producto-maestro fade-in">
      <div className="linea-producto-maestro-cuerpo">
        {linea.imagenReferenciaProduccionUrl || linea.imagenUrl ? (
          <img src={linea.imagenReferenciaProduccionUrl || linea.imagenUrl} alt="" className="linea-card-thumb" />
        ) : (
          <div className="linea-card-thumb linea-card-thumb-vacia" aria-hidden="true" />
        )}

        <div className="linea-producto-maestro-info">
          <span className="linea-producto-maestro-nombre">{linea.producto}</span>
          <span className="card-label">
            Ref. {linea.productoCodigo}
            {linea.tela ? ` · ${linea.tela}` : ""}
            {formatoTiempoProduccion(linea.tiempoProduccionMinutos)
              ? ` · ${formatoTiempoProduccion(linea.tiempoProduccionMinutos)}`
              : ""}
          </span>
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
          {puedeEditarPrecio ? (
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={linea.precioManual ? linea.precioUnitario : precioUnitario}
                onChange={(e) => manejarPrecio(e.target.value)}
                style={{ width: "5rem" }}
              />
              {linea.precioManual && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={restablecerPrecio}
                  title="Volver al precio del catálogo"
                  aria-label="Restablecer precio"
                >
                  ↺
                </button>
              )}
            </span>
          ) : (
            <span>${precioUnitario.toFixed(2)}</span>
          )}
        </div>

        <div className="linea-producto-maestro-campo">
          <span className="card-label">Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>

        <button type="button" className="btn-ghost btn-sm" onClick={onEliminar} title="Eliminar línea" aria-label="Eliminar línea">
          🗑
        </button>
      </div>

      <DisenoPlaceholder
        requierePersonalizacion={linea.requierePersonalizacion}
        archivos={linea.archivos}
        carpeta={linea._carpeta}
        onCambiar={(archivos) => onCambiar({ archivos })}
      />

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
