import { useEffect, useMemo, useRef, useState } from "react";
import { getProductos, intentarCrearSolicitudEnERP, armarLinkWhatsApp, armarLinkWhatsAppGenerico } from "./api";

// Vive acá (no en pdf.js) a propósito: pdf.js importa jsPDF, una librería
// pesada (~200KB gzip) que NO debe entrar al bundle inicial del catálogo
// (prioridad #1 de este sprint: velocidad mobile-first) — se carga con
// import() dinámico recién cuando el cliente confirma el pedido, ver
// handleEnviarPedido. Este número, en cambio, no depende de jsPDF y hace
// falta antes (para el mensaje de WhatsApp), así que se queda liviano acá.
function numeroOrdenBorrador() {
  const ahora = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `BP-${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}-${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
}
import {
  ESCALAS_POR_CATEGORIA,
  escalaParaMostrar,
  escalonAplicable,
  precioUnitarioPorCategoria,
  acumularPorCategoria,
  estadoMotivacion,
} from "./pricing";

// Fallback para categorías SIN escala unificada (ver pricing.js): mismo
// criterio de siempre, precio por producto individual. Categorías con
// escala propia (hoy: Pañoletas) no pasan por acá — usan
// precioUnitarioPorCategoria sobre la cantidad acumulada del carrito.
function precioUnitario(producto, cantidad) {
  const aplicable = [...(producto.preciosVolumen ?? [])]
    .filter((e) => cantidad >= e.cantidadMinima)
    .sort((a, b) => b.cantidadMinima - a.cantidadMinima)[0];
  return aplicable ? Number(aplicable.precioUnitario) : Number(producto.precioBase);
}

// Precio unitario "real" de una línea, sea cual sea su categoría —
// centraliza la decisión "¿esta categoría tiene escala propia o no?" para
// no repetirla en cada lugar que calcula precios (tarjeta, carrito, resumen).
function precioUnitarioLinea(producto, cantidad, cantidadAcumuladaCategoria) {
  const conEscala = ESCALAS_POR_CATEGORIA[producto.categoria];
  return conEscala
    ? precioUnitarioPorCategoria(producto.categoria, cantidadAcumuladaCategoria)
    : precioUnitario(producto, cantidad);
}

// ============================================================================
// DEMO TEMPORAL — el ERP todavía no manda el campo `badge` desde la API.
// Este mapa (por código de producto) es solo para poder mostrar el diseño
// de los badges mientras tanto. BORRAR este bloque completo (y la línea
// `?? BADGES_DEMO[producto.codigo]` de abajo) el día que Producto tenga un
// campo `badge` real y la API lo devuelva — en ese momento `producto.badge`
// ya alcanza por sí solo, no hace falta ningún otro cambio acá.
const BADGES_DEMO = {
  "PA-001": "mas_vendido",
};
// ============================================================================

// Sin emoji a propósito — la nueva identidad visual pide iconografía
// mínima y nada "caricaturesco" (ver sprint de branding); el texto solo
// alcanza para transmitir el mensaje sin restarle seriedad a la tarjeta.
const BADGE_CONFIG = {
  nuevo: { texto: "NUEVO" },
  tendencia: { texto: "TENDENCIA" },
  mas_vendido: { texto: "MÁS VENDIDO" },
  oferta: { texto: "OFERTA" },
  edicion_limitada: { texto: "EDICIÓN LIMITADA" },
};

function BadgeProducto({ tipo }) {
  const config = BADGE_CONFIG[tipo];
  if (!config) return null;
  return <span className={`badge-producto badge-producto-${tipo}`}>{config.texto}</span>;
}

// Logo real opcional: si catalogo/public/logo-panaprice.png existe, se usa;
// si no (o falla la carga), cae a un wordmark de texto con el mismo
// espíritu que el logo de marca (PANAPRICE en negro + CUSTOM en azul).
// Poner el archivo ahí lo activa sin tocar código.
function LogoPanaprice({ grande = false, onClick }) {
  const [error, setError] = useState(false);
  const contenido = error ? (
    <div className={grande ? "logo-texto logo-texto-grande" : "logo-texto"} aria-label="PanaPrice Custom">
      <span className="logo-principal">PANAPRICE</span>
      <span className="logo-secundario">— CUSTOM —</span>
    </div>
  ) : (
    <img
      src="/logo-panaprice.png"
      alt="PanaPrice Custom"
      className={grande ? "logo-imagen logo-imagen-grande" : "logo-imagen"}
      onError={() => setError(true)}
    />
  );

  // Tocar el logo vuelve al catálogo (patrón universal) — solo cuando hay
  // algo a donde volver; en el hero grande no hace falta que sea clicable.
  if (!onClick) return contenido;
  return (
    <button type="button" className="logo-boton" onClick={onClick} aria-label="Ir al inicio del catálogo">
      {contenido}
    </button>
  );
}

function IconoCarrito() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M2.5 3h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20 7H6" />
    </svg>
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

// Foto de producción opcional: mismo patrón que LogoPanaprice — si
// catalogo/public/hero-produccion.jpg no existe todavía, el hero se apoya
// solo en tipografía/espacio (nunca un fondo decorativo de relleno). Poner
// el archivo ahí la activa sin tocar código. object-fit: contain a
// propósito (ver index.css) — nunca recorta la foto, sea cual sea su
// proporción real.
function FotoHero() {
  const [error, setError] = useState(false);
  if (error) return null;
  return (
    <img
      src="/hero-produccion.jpg"
      alt="Modelo luciendo una pañoleta personalizada Panaprice"
      className="hero-foto"
      onError={() => setError(true)}
    />
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
      <div className="hero-texto">
        <p className="eyebrow">Fábrica de personalización textil</p>
        <h1 className="hero-titulo">
          FABRICAMOS IDEAS.
          <span>Construimos marcas.</span>
        </h1>
        <p className="hero-subtitulo">Producción personalizada desde una unidad.</p>
        <p className="hero-categorias">Pañoletas · Franelas · Chemises · Merchandising</p>
        <div className="hero-botones">
          <a className="btn-hero" href="#grilla-productos">
            Ver catálogo
          </a>
          {linkWhatsApp && (
            <a className="btn-secundario" href={linkWhatsApp} target="_blank" rel="noreferrer">
              Cotizar por WhatsApp
            </a>
          )}
        </div>
      </div>
      <div className="hero-imagen-wrap">
        <FotoHero />
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

// Banner de motivación de compra — una sola vez por categoría con escala
// (no por tarjeta: la tarjeta se mantiene mínima a propósito, ver
// ProductoCard). Se recalcula solo de `estadoMotivacion`, que ya depende
// del carrito completo — reactivo automáticamente a cualquier cambio de
// cantidad, sin lógica propia acá.
function MotivacionCompra({ categoria, cantidad }) {
  const estado = estadoMotivacion(categoria, cantidad);
  if (!estado) return null;

  return (
    <div className="motivacion" role="status">
      <p className="motivacion-mensaje">
        {estado.mensaje.emoji && <span aria-hidden="true">{estado.mensaje.emoji} </span>}
        {estado.mensaje.texto}
      </p>
      {estado.siguiente && (
        <>
          <div className="motivacion-barra">
            <div className="motivacion-barra-relleno" style={{ width: `${estado.progreso}%` }} />
          </div>
          <p className="motivacion-detalle">
            Te faltan <strong>{estado.siguiente.cantidadMinima - cantidad}</strong> para $
            {estado.siguiente.precioUnitario.toFixed(2)} c/u
            {estado.ahorro > 0 && (
              <>
                {" "}
                · Ahorro estimado: <strong>${estado.ahorro.toFixed(2)}</strong>
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

// Iconografía mínima a propósito: trazo simple (currentColor, sin relleno),
// nada ilustrativo ni caricaturesco — son marcas de apoyo al texto, no
// protagonistas.
function IconoLinea({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONOS_PORQUE = {
  produccion: (
    <IconoLinea>
      <path d="M3 20h18M5 20V9l4 3V9l4 3V9l4 3v8" />
      <path d="M5 20V9" />
    </IconoLinea>
  ),
  calidad: (
    <IconoLinea>
      <circle cx="12" cy="9" r="5.5" />
      <path d="M9 13.5 7.5 21 12 18.5 16.5 21 15 13.5" />
    </IconoLinea>
  ),
  personalizacion: (
    <IconoLinea>
      <path d="M4 20l1-4.2L15.8 5 19 8.2 8.2 19 4 20Z" />
      <path d="M13 7l4 4" />
    </IconoLinea>
  ),
  envios: (
    <IconoLinea>
      <rect x="3" y="7" width="11" height="9" rx="1" />
      <path d="M14 10h3.5L20 13v3h-6" />
      <circle cx="7.5" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </IconoLinea>
  ),
  atencion: (
    <IconoLinea>
      <path d="M4 5h16v10H9l-4 3.5V15H4Z" />
    </IconoLinea>
  ),
  tiempo: (
    <IconoLinea>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </IconoLinea>
  ),
};

const PORQUE_ITEMS = [
  { icono: "produccion", titulo: "Producción propia", texto: "Fabricamos en nuestras propias instalaciones, sin intermediarios." },
  { icono: "calidad", titulo: "Calidad Premium", texto: "Materiales e insumos seleccionados en cada proceso." },
  { icono: "personalizacion", titulo: "Personalización total", texto: "Diseños a medida, desde una unidad hasta grandes volúmenes." },
  { icono: "envios", titulo: "Envíos nacionales", texto: "Hacemos llegar tu pedido a cualquier punto del país." },
  { icono: "atencion", titulo: "Atención personalizada", texto: "Un equipo real acompaña cada pedido, de inicio a fin." },
  { icono: "tiempo", titulo: "Tiempo de producción", texto: "Procesos ordenados que cuidan cada fecha de entrega." },
];

function PorQuePanaprice() {
  return (
    <section className="seccion-porque">
      <p className="eyebrow">¿Por qué Panaprice?</p>
      <h2 className="seccion-titulo">Una fábrica, no un intermediario</h2>
      <div className="porque-grid">
        {PORQUE_ITEMS.map((item) => (
          <div className="porque-item" key={item.icono}>
            <div className="porque-icono">{ICONOS_PORQUE[item.icono]}</div>
            <h3>{item.titulo}</h3>
            <p>{item.texto}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductoCard({ producto, onAgregar, acumuladoCategoriaActual, tarifaAbierta, onToggleTarifa }) {
  const agotado = producto.disponible === false;
  const [imagenRota, setImagenRota] = useState(false);
  const [cantidad, setCantidad] = useState(1);

  // Vista previa honesta: si esta categoría tiene escala unificada, el
  // precio que se le aplicaría a ESTA línea es el de la cantidad total que
  // quedaría en esa categoría (lo que ya hay en el carrito + lo que se está
  // por agregar acá) — no un precio aislado que después cambiaría al
  // agregarlo. Categorías sin escala siguen su lógica de siempre.
  const cantidadProyectada = (acumuladoCategoriaActual || 0) + cantidad;
  const unitarioSubtotal = precioUnitarioLinea(producto, cantidad, cantidadProyectada);
  const subtotal = unitarioSubtotal * cantidad;

  const escala = escalaParaMostrar(producto);

  function restar() {
    setCantidad((c) => Math.max(1, c - 1));
  }

  function sumar() {
    setCantidad((c) => c + 1);
  }

  function handleAgregar() {
    onAgregar(producto, cantidad);
    setCantidad(1);
  }

  // producto.badge es lo que mandaría la API el día de mañana; mientras
  // tanto cae al mapa de demo de arriba (ver nota DEMO TEMPORAL).
  const badge = producto.badge ?? BADGES_DEMO[producto.codigo] ?? null;

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
        {badge && (
          <span className="badge-esquina-inferior">
            <BadgeProducto tipo={badge} />
          </span>
        )}
      </div>
      <div className="producto-info">
        <h3>{producto.nombre}</h3>
        <span className="producto-codigo">Ref. {producto.codigo}</span>

        {escala ? (
          <>
            {/* Precio EN VIVO, no un techo estático: refleja la cantidad ya
                acumulada de la categoría en el carrito + lo que se está por
                agregar acá (mismo cálculo que el Subtotal de abajo). Por
                eso el cliente ve el precio bajar en TODAS las tarjetas de
                Pañoletas apenas el carrito cruza un escalón, sin tener que
                entrar al carrito — el incentivo central de este sprint. */}
            <p className="producto-precio">
              Desde ${unitarioSubtotal.toFixed(2)}
              <span className="precio-sufijo"> c/u</span>
            </p>
            <button type="button" className="link-tarifas" onClick={onToggleTarifa} aria-expanded={tarifaAbierta}>
              Ver tabla de producción {tarifaAbierta ? "▲" : "▼"}
            </button>
            {tarifaAbierta && (
              <table className="tabla-tarifas">
                <thead>
                  <tr>
                    <th>Cantidad</th>
                    <th>Total</th>
                    <th>Precio unitario</th>
                  </tr>
                </thead>
                <tbody>
                  {escala.map((e) => (
                    <tr key={e.cantidadMinima}>
                      <td>{e.cantidadMinima}</td>
                      <td>${(e.cantidadMinima * e.precioUnitario).toFixed(2)}</td>
                      <td>${e.precioUnitario.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <p className="producto-precio">
            ${Number(producto.precioBase).toFixed(2)}
            <span className="precio-sufijo"> c/u</span>
          </p>
        )}

        <div className="selector-cantidad">
          <button type="button" onClick={restar} disabled={agotado || cantidad <= 1} aria-label="Restar unidad">
            −
          </button>
          <span className="cantidad-valor">{cantidad}</span>
          <button type="button" onClick={sumar} disabled={agotado} aria-label="Sumar unidad">
            +
          </button>
        </div>
        <p className="producto-subtotal">Subtotal: ${subtotal.toFixed(2)}</p>

        <button className="btn-primary" onClick={handleAgregar} disabled={agotado}>
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
  const [numeroOrden, setNumeroOrden] = useState(null);
  const [pdfInfo, setPdfInfo] = useState(null);
  const [categoriaActiva, setCategoriaActiva] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  // Solo una tarjeta puede tener la tabla de tarifas abierta a la vez —
  // guardar el id acá (no un booleano por tarjeta) es lo que lo garantiza.
  const [tarifaAbiertaId, setTarifaAbiertaId] = useState(null);

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

  // Cantidad ya acumulada por categoría (solo las que tienen escala propia)
  // dentro del carrito actual — se le pasa a cada tarjeta para que su vista
  // previa de precio/subtotal sea honesta (ver precioUnitarioLinea).
  const acumuladoPorCategoriaEnCarrito = useMemo(() => acumularPorCategoria(carrito), [carrito]);

  // Si el producto ya está en el carrito, suma a esa línea en vez de crear
  // una duplicada — un mismo diseño con distintas cantidades agregadas
  // desde la tarjeta siempre queda como una sola línea.
  function agregarAlCarrito(producto, cantidad) {
    setCarrito((prev) => {
      const existente = prev.find((l) => l.producto.id === producto.id);
      if (existente) {
        return prev.map((l) =>
          l.clave === existente.clave ? { ...l, cantidad: l.cantidad + cantidad } : l
        );
      }
      return [...prev, { clave: `${producto.id}-${Date.now()}`, producto, cantidad, disenoNotas: "" }];
    });
  }

  function actualizarLinea(clave, cambios) {
    setCarrito((prev) => prev.map((linea) => (linea.clave === clave ? { ...linea, ...cambios } : linea)));
  }

  function quitarLinea(clave) {
    setCarrito((prev) => prev.filter((linea) => linea.clave !== clave));
  }

  // Precio por línea: para categorías con escala propia (ver pricing.js) el
  // precio unitario es el mismo para TODAS las líneas de esa categoría,
  // calculado sobre la cantidad total acumulada — no por línea individual.
  // Cambiar la cantidad de cualquier pañoleta recalcula automáticamente el
  // precio de todas las demás pañoletas (este memo depende de `carrito`
  // completo, así que cualquier cambio dispara el recálculo).
  const lineasConSubtotal = useMemo(() => {
    const acumulado = acumularPorCategoria(carrito);
    return carrito.map((l) => {
      const cantidad = Number(l.cantidad) || 0;
      const unitario = precioUnitarioLinea(l.producto, cantidad, acumulado[l.producto.categoria]);
      return { ...l, cantidad, unitario, subtotal: unitario * cantidad };
    });
  }, [carrito]);

  const total = useMemo(() => lineasConSubtotal.reduce((suma, l) => suma + l.subtotal, 0), [lineasConSubtotal]);
  const cantidadTotal = useMemo(() => lineasConSubtotal.reduce((n, l) => n + l.cantidad, 0), [lineasConSubtotal]);

  // Pequeño "bump" en el botón del carrito cada vez que sube la cantidad
  // total — puramente visual, no toca el estado del carrito en sí.
  const [carritoAnimado, setCarritoAnimado] = useState(false);
  const cantidadPrevia = useRef(cantidadTotal);
  useEffect(() => {
    if (cantidadTotal > cantidadPrevia.current) {
      setCarritoAnimado(true);
      const temporizador = setTimeout(() => setCarritoAnimado(false), 450);
      cantidadPrevia.current = cantidadTotal;
      return () => clearTimeout(temporizador);
    }
    cantidadPrevia.current = cantidadTotal;
  }, [cantidadTotal]);

  // Resumen por categoría (para el bloque del carrito y el mensaje de
  // WhatsApp): cuántas unidades de esa categoría hay en total, qué escalón
  // alcanzaron y cuánto suma esa categoría sola. Recorre ESCALAS_POR_CATEGORIA
  // (no una lista fija) — cuando otra categoría tenga su propia escala,
  // aparece acá sola.
  const resumenCategorias = useMemo(() => {
    const acumulado = acumularPorCategoria(carrito);
    return Object.keys(ESCALAS_POR_CATEGORIA)
      .map((categoria) => {
        const cantidad = acumulado[categoria] || 0;
        if (cantidad <= 0) return null;
        const escalon = escalonAplicable(categoria, cantidad);
        return { categoria, cantidad, escalon, subtotal: escalon.precioUnitario * cantidad };
      })
      .filter(Boolean);
  }, [carrito]);

  // El catálogo NUNCA debe quedar bloqueado por un error de conexión: se
  // arma y abre el link de WhatsApp siempre, y el intento de crear la
  // solicitud en el ERP corre aparte (fire-and-forget) sin que su
  // resultado condicione el paso a la pantalla de confirmación.
  async function handleEnviarPedido(e) {
    e.preventDefault();
    setEnviando(true);

    const orden = numeroOrdenBorrador();
    setNumeroOrden(orden);

    const link = armarLinkWhatsApp({ cliente, lineas: lineasConSubtotal, total, resumenCategorias, numeroOrden: orden });
    setLinkWhatsApp(link);

    // El navegador solo deja abrir un popup sin bloquearlo si pasa DENTRO
    // del mismo gesto síncrono del usuario (este click) — por eso se abre
    // ACÁ, antes de cualquier `await` (generar el PDF implica esperar
    // fetch() de las imágenes, y para entonces el navegador ya no lo
    // consideraría "originado por el usuario"). El pedido por WhatsApp
    // sigue siendo la vía garantizada aunque el PDF tarde o falle.
    if (link) window.open(link, "_blank");

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

    // Best-effort también: si el PDF falla (imagen rota, navegador raro, o
    // el import() dinámico de jsPDF no carga), no debe impedir llegar a la
    // pantalla de confirmación — el pedido por WhatsApp ya se disparó
    // arriba de todos modos. import() dinámico a propósito: jsPDF es
    // pesado y no debe estar en el bundle inicial del catálogo.
    try {
      const { generarPdfPedido } = await import("./pdf");
      const nombreArchivo = await generarPdfPedido({
        cliente,
        lineas: lineasConSubtotal,
        resumenCategorias,
        total,
        numeroOrden: orden,
      });
      setPdfInfo({ ok: true, nombreArchivo });
    } catch (err) {
      setPdfInfo({ ok: false, motivo: err.message });
    }

    setVista("confirmacion");
    setEnviando(false);
  }

  if (vista === "confirmacion") {
    return (
      <div className="pagina">
        <header className="cabecera">
          <LogoPanaprice onClick={() => setVista("catalogo")} />
        </header>
        <main className="confirmacion">
          <h2>¡Pedido listo!</h2>
          {numeroOrden && (
            <p className="orden-numero">
              N.º de orden: <strong>{numeroOrden}</strong>
            </p>
          )}
          <p>
            Se abrió WhatsApp con tu pedido redactado — solo tenés que tocar <strong>Enviar</strong> en
            la conversación para confirmarlo con nuestro equipo.
          </p>
          {pdfInfo?.ok && (
            <p>
              También se descargó tu pedido en PDF (<strong>{pdfInfo.nombreArchivo}</strong>) — adjuntalo en la
              misma conversación de WhatsApp para que quede completo.
            </p>
          )}
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
          {pdfInfo && !pdfInfo.ok && (
            <p className="nota-tecnica">(No se pudo generar el PDF automáticamente — {pdfInfo.motivo}. El pedido por WhatsApp sigue siendo válido.)</p>
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
          <LogoPanaprice onClick={() => setVista("catalogo")} />
        </div>
        <button
          className={`btn-carrito${carritoAnimado ? " btn-carrito-bump" : ""}`}
          onClick={() => setVista(vista === "checkout" ? "catalogo" : "checkout")}
        >
          <IconoCarrito />
          <span className="btn-carrito-cifras">
            <span className="btn-carrito-cantidad">{cantidadTotal}</span>
            <span className="btn-carrito-total">${total.toFixed(2)}</span>
          </span>
        </button>
      </header>

      {vista === "catalogo" && (
        <main>
          <Hero />
          <PorQuePanaprice />
          <div className="controles-catalogo">
            <BarraCategorias
              productos={productos}
              categoriaActiva={categoriaActiva}
              onSeleccionar={setCategoriaActiva}
            />
            <Buscador valor={busqueda} onChange={setBusqueda} />
          </div>
          {Object.keys(ESCALAS_POR_CATEGORIA).map((categoria) => (
            <MotivacionCompra
              key={categoria}
              categoria={categoria}
              cantidad={acumuladoPorCategoriaEnCarrito[categoria] || 0}
            />
          ))}
          {cargando && <p>Cargando catálogo...</p>}
          <div className="grilla-productos" id="grilla-productos">
            {productosFiltrados.map((p) => (
              <ProductoCard
                key={p.id}
                producto={p}
                onAgregar={agregarAlCarrito}
                acumuladoCategoriaActual={acumuladoPorCategoriaEnCarrito[p.categoria]}
                tarifaAbierta={tarifaAbiertaId === p.id}
                onToggleTarifa={() => setTarifaAbiertaId((actual) => (actual === p.id ? null : p.id))}
              />
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
          <button type="button" className="link-volver" onClick={() => setVista("catalogo")}>
            ← Volver al catálogo
          </button>
          <h2>Tu pedido</h2>
          {carrito.length === 0 && <p>Tu carrito está vacío.</p>}
          {lineasConSubtotal.map((linea) => (
            <div className="linea-carrito" key={linea.clave}>
              <div className="linea-miniatura-wrap">
                {linea.producto.imagenUrl ? (
                  <img src={linea.producto.imagenUrl} alt={linea.producto.nombre} className="linea-miniatura" />
                ) : (
                  <div className="linea-miniatura linea-miniatura-vacia" aria-hidden="true" />
                )}
              </div>
              <div className="linea-cuerpo">
                <div className="linea-encabezado">
                  <strong>{linea.producto.nombre}</strong>
                  <span className="linea-ref">Ref. {linea.producto.codigo}</span>
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
                <p className="linea-subtotal">Subtotal: ${linea.subtotal.toFixed(2)}</p>
              </div>
            </div>
          ))}

          {resumenCategorias.length > 0 && (
            <div className="resumen-categorias">
              {resumenCategorias.map((r) => (
                <div className="resumen-categoria" key={r.categoria}>
                  <p>
                    <strong>{r.categoria} en el pedido:</strong> {r.cantidad}
                  </p>
                  <p>
                    <strong>Tarifa aplicada:</strong> Desde {r.escalon.cantidadMinima}{" "}
                    {r.escalon.cantidadMinima === 1 ? "unidad" : "unidades"}
                  </p>
                  <p>
                    <strong>Precio por unidad:</strong> ${r.escalon.precioUnitario.toFixed(2)}
                  </p>
                  <p>
                    <strong>Subtotal de {r.categoria}:</strong> ${r.subtotal.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}

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
