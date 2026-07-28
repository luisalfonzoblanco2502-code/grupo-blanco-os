// Preparado para una futura página de detalle de producto — NO está
// importado ni montado en ningún lado todavía (App.jsx sigue siendo una
// sola vista con estado local, sin router). Cuando se decida implementarla:
//   1. Agregar react-router-dom (o el estado "vista" ya existente con un
//      "productoSeleccionado" en vez de una URL propia, si se quiere seguir
//      sin router).
//   2. Pasarle el objeto `producto` completo (mismo shape que ya devuelve
//      getProductos() en api.js) — este componente no pide datos por su
//      cuenta, solo los recibe por props, igual que ProductoCard.
//   3. `onAgregar` es la misma función `agregarAlCarrito` de App.jsx — la
//      idea es que esta vista pueda reusar el carrito existente tal cual.
export function ProductoDetalle({ producto, onAgregar, onVolver }) {
  if (!producto) return null;

  const agotado = producto.disponible === false;

  return (
    <div className="producto-detalle">
      <button className="producto-detalle-volver" onClick={onVolver}>
        &larr; Volver al catálogo
      </button>
      <div className="producto-detalle-cuerpo">
        {producto.imagenUrl ? (
          <img src={producto.imagenUrl} alt={producto.nombre} />
        ) : (
          <div className="producto-imagen-vacia" aria-hidden="true" />
        )}
        <div className="producto-detalle-info">
          <span className="producto-codigo">{producto.codigo}</span>
          <h2>{producto.nombre}</h2>
          {producto.descripcion && <p className="producto-descripcion">{producto.descripcion}</p>}
          <p className="producto-precio">desde ${Number(producto.precioBase).toFixed(2)}</p>
          <button className="btn-primary" onClick={() => onAgregar(producto)} disabled={agotado}>
            {agotado ? "Agotado" : "Agregar al pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
