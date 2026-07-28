import { useEffect, useMemo, useState } from "react";
import { getProductos, intentarCrearSolicitudEnERP, armarLinkWhatsApp, armarLinkWhatsAppGenerico } from "./api";

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

// Logo real opcional: si catalogo/public/logo-panaprice.png existe, se usa;
// si no (o falla la carga), cae a un wordmark de texto con el mismo
// espíritu que el logo de marca (PANAPRICE en negro + CUSTOM en azul).
// Poner el archivo ahí lo activa sin tocar código.
function LogoPanaprice({ grande = false }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className={grande ? "logo-texto logo-texto-grande" : "logo-texto"} aria-label="PanaPrice Custom">
        <span className="logo-principal">PANAPRICE</span>
        <span className="logo-secundario">— CUSTOM —</span>
      </div>
    );
  }
  return (
    <img
      src="/logo-panaprice.png"
      alt="PanaPrice Custom"
      className={grande ? "logo-imagen logo-imagen-grande" : "logo-imagen"}
      onError={() => setError(true)}
    />
  );
}

function IconoWhatsApp() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" fill="currentColor" aria-hidden="true">
      <path d="M16.04 3C9.02 3 3.32 8.7 3.32 15.72c0 2.27.6 4.44 1.72 6.36L3 29l7.13-1.98a12.6 12.6 0 0 0 5.9 1.5h.01c7.02 0 12.72-5.7 12.72-12.72C28.77 8.78 23.06 3 16.04 3Zm0 23.3h-.01a10.5 10.5 0 0 1-5.35-1.47l-.38-.23-4.23 1.17 1.13-4.13-.25-.42a10.47 10.47 0 0 1-1.6-5.6c0-5.8 4.72-10.52 10.53-10.52 2.81 0 5.45 1.1 7.44 3.09a10.44 10.44 0 0 1 3.08 7.44c0 5.8-4.72 10.52-10.36 10.52Zm5.77-7.88c-.32-.16-1.87-.92-2.16-1.03-.29-.1-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.19.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.57-.94-.84-1.58-1.87-1.76-2.19-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.55.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54-.18-.01-.4-.01-.61-.01-.21 0-.55.08-.84.4-.29.32-1.1 1.08-1.1 2.63 0 1.55 1.13 3.05 1.29 3.26.16.21 2.22 3.39 5.38 4.75.75.32 1.34.51 1.79.66.75.24 1.44.2 1.98.13.6-.09 1.87-.76 2.14-1.5.26-.74.26-1.37.18-1.5-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  );
}

function BotonWhatsAppFlotante() {
  const link = armarLinkWhatsAppGenerico();
  if (!link) return null;
  return (
    <a className="whatsapp-flotante" href={link} target="_blank" rel="noreferrer" aria-label="Consultar por WhatsApp">
      <IconoWhatsApp />
    </a>
  );
}

// Hero superior — solo presentación/CTAs, no toca datos ni carrito. "Ver
// catálogo" es un ancla pura (#grilla-productos, scroll suave por CSS);
// "Cotizar por WhatsApp" reutiliza el mismo link genérico del botón
// flotante, no agrega ninguna integración nueva.
function Hero() {
  const linkWhatsApp = armarLinkWhatsAppGenerico();
  return (
    <section className="hero">
      <LogoPanaprice grande />
      <h1 className="hero-titulo">Catálogo de Pañoletas Personalizadas</h1>
      <p className="hero-subtitulo">Seda importada • Personalización • Producción nacional</p>
      <div className="hero-botones">
        <a className="btn-primary" href="#grilla-productos">
          Ver catálogo
        </a>
        {linkWhatsApp && (
          <a className="btn-secundario" href={linkWhatsApp} target="_blank" rel="noreferrer">
            Cotizar por WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}

// Deriva las categorías directamente de los productos ya cargados (locales
// o de la API, da igual) — no hardcodea una lista fija, así que el día que
// el catálogo real tenga "Uniformes" o "DTF" aparecen solos, sin tocar
// este componente.
function BarraCategorias({ productos, categoriaActiva, onSeleccionar }) {
  const categorias = useMemo(() => {
    const unicas = [...new Set(productos.map((p) => p.categoria).filter(Boolean))];
    return ["Todos", ...unicas];
  }, [productos]);

  if (categorias.length <= 1) return null;

  return (
    <nav className="barra-categorias" aria-label="Categorías">
      {categorias.map((cat) => (
        <button
          key={cat}
          className={cat === categoriaActiva ? "chip chip-activo" : "chip"}
          onClick={() => onSeleccionar(cat)}
        >
          {cat.toUpperCase()}
        </button>
      ))}
    </nav>
  );
}

function Buscador({ valor, onChange }) {
  return (
    <div className="buscador">
      <input
        type="search"
        placeholder="Buscar por nombre, código o categoría..."
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Buscar productos"
      />
    </div>
  );
}

const BENEFICIOS = [
  "Seda importada",
  "Personalización",
  "Producción nacional",
  "Envíos nacionales",
];

function BarraBeneficios() {
  return (
    <ul className="barra-beneficios">
      {BENEFICIOS.map((b) => (
        <li key={b}>
          <span className="beneficio-check" aria-hidden="true">✓</span> {b}
        </li>
      ))}
    </ul>
  );
}

function ProductoCard({ producto, onAgregar }) {
  const agotado = producto.disponible === false;
  const [imagenRota, setImagenRota] = useState(false);
  return (
    <div className="producto-card">
      <div className="producto-imagen-wrap">
        {producto.imagenUrl && !imagenRota ? (
          <img
            src={producto.imagenUrl}
            alt={producto.nombre}
            loading="lazy"
            onError={() => setImagenRota(true)}
          />
        ) : (
          <div className="producto-imagen-vacia" aria-hidden="true" />
        )}
        {producto.categoria && <span className="badge-categoria">{producto.categoria}</span>}
        {agotado && <span className="badge-agotado-card">Agotado</span>}
      </div>
      <div className="producto-info">
        <span className="producto-codigo">{producto.codigo}</span>
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
  const [categoriaActiva, setCategoriaActiva] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    getProductos()
      .then(setProductos)
      .finally(() => setCargando(false));
  }, []);

  // Buscador + barra de categorías: puramente client-side sobre lo que ya
  // trajo getProductos() — no dispara ninguna consulta nueva.
  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      const coincideCategoria = categoriaActiva === "Todos" || p.categoria === categoriaActiva;
      const coincideBusqueda =
        !texto ||
        p.nombre?.toLowerCase().includes(texto) ||
        p.codigo?.toLowerCase().includes(texto) ||
        p.categoria?.toLowerCase().includes(texto);
      return coincideCategoria && coincideBusqueda;
    });
  }, [productos, categoriaActiva, busqueda]);

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
          <LogoPanaprice />
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
        <BotonWhatsAppFlotante />
      </div>
    );
  }

  return (
    <div className="pagina">
      <header className="cabecera">
        <div className="cabecera-marca">
          <LogoPanaprice />
        </div>
        <button className="btn-carrito" onClick={() => setVista(vista === "checkout" ? "catalogo" : "checkout")}>
          Carrito ({cantidadTotal}) · ${total.toFixed(2)}
        </button>
      </header>

      {vista === "catalogo" && (
        <main>
          <Hero />
          <BarraBeneficios />
          <div className="controles-catalogo">
            <BarraCategorias
              productos={productos}
              categoriaActiva={categoriaActiva}
              onSeleccionar={setCategoriaActiva}
            />
            <Buscador valor={busqueda} onChange={setBusqueda} />
          </div>
          {cargando && <p>Cargando catálogo...</p>}
          <div className="grilla-productos" id="grilla-productos">
            {productosFiltrados.map((p) => (
              <ProductoCard key={p.id} producto={p} onAgregar={agregarAlCarrito} />
            ))}
          </div>
          {!cargando && productos.length === 0 && <p>Todavía no hay productos publicados en el catálogo.</p>}
          {!cargando && productos.length > 0 && productosFiltrados.length === 0 && (
            <p>Ningún producto coincide con la búsqueda.</p>
          )}
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
      <BotonWhatsAppFlotante />
    </div>
  );
}
