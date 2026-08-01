import { useState } from "react";

// Envoltorio visual de una línea de producto como tarjeta colapsable —
// mover/duplicar/eliminar/colapsar viven acá; el contenido real de los
// campos (LineaForm) se pasa como children para no duplicar esa lógica
// entre Nuevo Pedido y el editor de un pedido ya creado.
export function LineaCard({
  numero,
  valor,
  abiertoPorDefecto = false,
  puedeMoverArriba,
  puedeMoverAbajo,
  onMoverArriba,
  onMoverAbajo,
  onDuplicar,
  onEliminar,
  eliminarLabel = "Eliminar",
  children,
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);

  const imagenPrincipal = (valor.archivos || []).find((a) => a.esPrincipal);
  const meta = [valor.talla && `Talla ${valor.talla}`, valor.tela, valor.color].filter(Boolean).join(" · ");
  const precio = valor.precioUnitario !== "" && valor.precioUnitario != null ? Number(valor.precioUnitario) : null;

  function detener(e) {
    e.stopPropagation();
  }

  return (
    <div className="linea-card fade-in">
      <div
        className="linea-card-header"
        role="button"
        tabIndex={0}
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAbierto((v) => !v);
          }
        }}
      >
        <span className="linea-card-numero">{numero}</span>
        {imagenPrincipal && <img src={imagenPrincipal.ubicacion} alt="" className="linea-card-thumb" />}
        <div className="linea-card-resumen">
          <span className="linea-card-resumen-titulo">
            {valor.producto || "Producto sin nombre"} — {Number(valor.cantidad) || 0} u.
            {precio != null && ` · $${precio.toFixed(2)} c/u`}
          </span>
          {meta && <span className="linea-card-resumen-meta">{meta}</span>}
        </div>
        <div className="linea-card-acciones" onClick={detener}>
          {onMoverArriba && (
            <button type="button" className="btn-ghost btn-icon btn-sm" disabled={!puedeMoverArriba} onClick={onMoverArriba} title="Mover arriba" aria-label="Mover arriba">
              ↑
            </button>
          )}
          {onMoverAbajo && (
            <button type="button" className="btn-ghost btn-icon btn-sm" disabled={!puedeMoverAbajo} onClick={onMoverAbajo} title="Mover abajo" aria-label="Mover abajo">
              ↓
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={onDuplicar} title="Duplicar línea" aria-label="Duplicar línea">
            ⧉
          </button>
          {onEliminar && (
            <button type="button" className="btn-ghost btn-sm" onClick={onEliminar} title={eliminarLabel} aria-label={eliminarLabel}>
              🗑
            </button>
          )}
        </div>
        <span className={`linea-card-chevron${abierto ? " linea-card-chevron-abierto" : ""}`}>▾</span>
      </div>
      {abierto && <div className="linea-card-body">{children}</div>}
    </div>
  );
}
