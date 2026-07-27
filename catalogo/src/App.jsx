import { useEffect, useMemo, useState } from "react";
import { getProductos, intentarCrearSolicitudEnERP, armarLinkWhatsApp } from "./api";

// Mismo criterio que precioUnitarioParaCantidad en
// server/src/services/productos.service.js: el escalón de mayor
// cantidadMinima que no supere la cantidad pedida, si no hay ninguno el
// precioBase. Se recalcula acá solo para feedback inmediato en el carrito —
// los precios en sí SIEMPRE vienen de la fuente de datos activa (local o
// API), nunca hardcodeados en la interfaz.
function precioUnitario(producto, cantidad) {
  const aplicable = [...(producto.preciosVolumen ?? [])]
    .filter((e) => cantidad >= e.cantidadMinima)
    .sort((a, b) => b.cantidadMinima - a.cantidadMinima)[0];
  return aplicable ? Number(aplicable.precioUnitario) : Number(producto.precioBase);
}

function ProductoCard({ producto, onAgregar }) {
  const agotado = producto.disponible === false;
  return (
    <div className="producto-card">
      {producto.imagenUrl ? (
        <img src={producto.imagenUrl} alt={producto.nombre} loading="lazy" />
      ) : (
        <div className="producto-imagen-vacia" aria-hidden="true" />
      )}
      <div className="producto-info">
        <span className="producto-codigo">
          {producto.codigo}
          {agotado && <span className="badge-agotado"> · Agotado</span>}
        </span>
        <h3>{producto.nombre}</h3>
        {producto.descripcion && <p className="producto-descripcion">{producto.descripcion}</p>}
        <p className="producto-precio">desde ${Number(producto.precioBase).toFixed(2)}</p>
        {producto.preciosVolumen?.length > 0 && (
          <ul className="producto-volumen">
            {producto.preciosVolumen.map((e) => (
              <li key={e.id}>
                {e.cantidadMinima}+ u. → ${Number(e.precioUnitario).toFixed(2)} c/u
              </li>
            ))}
          </ul>
        )}
        <button className="btn-primary" onClick={() => onAgregar(producto)} disabled={agotado}>
          {agotado ? "Agotado" : "Agregar al pedido"}
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [carrito, setCarrito] = useState([]); // [{ clave, producto, cantidad, disenoNotas }]
  const [vista, setVista] = useState("catalogo"); // catalogo | checkout | confirmacion
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", ubicacion: "" });
  const [enviando, setEnviando] = useState(false);
  const [linkWhatsApp, setLinkWhatsApp] = useState(null);
  const [avisoErp, setAvisoErp] = useState(null);

  useEffect(() => {
    getProductos()
      .then(setProductos)
      .finally(() => setCargando(false));
  }, []);

  function agregarAlCarrito(producto) {
    setCarrito((prev) => [
      ...prev,
      { clave: `${producto.id}-${prev.length}-${Date.now()}`, producto, cantidad: 1, disenoNotas: "" },
    ]);
  }

  function actualizarLinea(clave, cambios) {
    setCarrito((prev) => prev.map((linea) => (linea.clave === clave ? { ...linea, ...cambios } : linea)));
  }

  function quitarLinea(clave) {
    setCarrito((prev) => prev.filter((linea) => linea.clave !== clave));
  }

  const lineasConSubtotal = useMemo(
    () =>
      carrito.map((l) => {
        const cantidad = Number(l.cantidad) || 0;
        const unitario = precioUnitario(l.producto, cantidad);
        return { ...l, cantidad, unitario, subtotal: unitario * cantidad };
      }),
    [carrito]
  );

  const total = useMemo(() => lineasConSubtotal.reduce((suma, l) => suma + l.subtotal, 0), [lineasConSubtotal]);
  const cantidadTotal = useMemo(() => lineasConSubtotal.reduce((n, l) => n + l.cantidad, 0), [lineasConSubtotal]);

  // El catálogo NUNCA debe quedar bloqueado por un error de conexión: se
  // arma y abre el link de WhatsApp siempre, y el intento de crear la
  // solicitud en el ERP corre aparte (fire-and-forget) sin que su
  // resultado condicione el paso a la pantalla de confirmación.
  async function handleEnviarPedido(e) {
    e.preventDefault();
    setEnviando(true);

    const link = armarLinkWhatsApp({ cliente, lineas: lineasConSubtotal, total });
    setLinkWhatsApp(link);

    intentarCrearSolicitudEnERP({
      clienteNombre: cliente.nombre,
      clienteTelefono: cliente.telefono,
      notasPersonalizacion: `Ubicación: ${cliente.ubicacion}`,
      items: lineasConSubtotal.map((l) => ({
        productoId: l.producto.id,
        cantidad: l.cantidad,
        disenoNotas: l.disenoNotas || undefined,
      })),
    }).then((resultado) => setAvisoErp(resultado));

    if (link) window.open(link, "_blank");
    setVista("confirmacion");
    setEnviando(false);
  }

  if (vista === "confirmacion") {
    return (
      <div className="pagina">
        <header className="cabecera">
          <h1>PanaPrice</h1>
        </header>
        <main className="confirmacion">
          <h2>¡Pedido listo!</h2>
          <p>
            Se abrió WhatsApp con tu pedido redactado — solo tenés que tocar <strong>Enviar</strong> en
            la conversación para confirmarlo con nuestro equipo.
          </p>
          {linkWhatsApp ? (
            <a className="btn-primary" href={linkWhatsApp} target="_blank" rel="noreferrer">
              ¿No se abrió? Tocá acá para abrir WhatsApp
            </a>
          ) : (
            <p className="error">
              El catálogo todavía no tiene configurado el número de WhatsApp. Contactá a PanaPrice
              directamente para confirmar tu pedido.
            </p>
          )}
          {avisoErp && !avisoErp.ok && (
            <p className="nota-tecnica">(Nota interna: no se pudo registrar automáticamente en el sistema — {avisoErp.motivo}. El pedido por WhatsApp sigue siendo válido.)</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="pagina">
      <header className="cabecera">
        <h1>PanaPrice</h1>
        <button className="btn-carrito" onClick={() => setVista(vista === "checkout" ? "catalogo" : "checkout")}>
          Carrito ({cantidadTotal}) · ${total.toFixed(2)}
        </button>
      </header>

      {vista === "catalogo" && (
        <main>
          {cargando && <p>Cargando catálogo...</p>}
          <div className="grilla-productos">
            {productos.map((p) => (
              <ProductoCard key={p.id} producto={p} onAgregar={agregarAlCarrito} />
            ))}
          </div>
          {!cargando && productos.length === 0 && <p>Todavía no hay productos publicados en el catálogo.</p>}
        </main>
      )}

      {vista === "checkout" && (
        <main className="checkout">
          <h2>Tu pedido</h2>
          {carrito.length === 0 && <p>Tu carrito está vacío.</p>}
          {lineasConSubtotal.map((linea) => (
            <div className="linea-carrito" key={linea.clave}>
              <div>
                <strong>{linea.producto.nombre}</strong>
                <span className="linea-precio">${linea.unitario.toFixed(2)} c/u</span>
              </div>
              <div className="linea-controles">
                <input
                  type="number"
                  min={1}
                  value={linea.cantidad}
                  onChange={(e) => actualizarLinea(linea.clave, { cantidad: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Notas de diseño (ej. colores, logo)"
                  value={linea.disenoNotas}
                  onChange={(e) => actualizarLinea(linea.clave, { disenoNotas: e.target.value })}
                />
                <button onClick={() => quitarLinea(linea.clave)}>Quitar</button>
              </div>
            </div>
          ))}

          {carrito.length > 0 && (
            <>
              <p className="total">Total estimado: ${total.toFixed(2)}</p>
              <form onSubmit={handleEnviarPedido} className="form-checkout">
                <label>
                  Nombre completo
                  <input
                    type="text"
                    required
                    value={cliente.nombre}
                    onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })}
                  />
                </label>
                <label>
                  Teléfono (WhatsApp)
                  <input
                    type="tel"
                    required
                    value={cliente.telefono}
                    onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })}
                  />
                </label>
                <label>
                  Ubicación (ciudad / zona de entrega)
                  <input
                    type="text"
                    required
                    value={cliente.ubicacion}
                    onChange={(e) => setCliente({ ...cliente, ubicacion: e.target.value })}
                  />
                </label>

                <button type="submit" className="btn-primary" disabled={enviando}>
                  {enviando ? "Preparando..." : "Enviar pedido por WhatsApp"}
                </button>
              </form>
            </>
          )}
        </main>
      )}
    </div>
  );
}
