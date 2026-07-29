import { useEffect, useMemo, useRef, useState } from "react";
import {
  getProductos,
  intentarCrearSolicitudEnERP,
  armarLinkWhatsApp,
  armarLinkWhatsAppGenerico,
  consultarRastreo,
  textoMensajePedido,
} from "./api";

// Vive acá (no en pdf.js) a propósito: pdf.js importa jsPDF, una librería
// pesada (~200KB gzip) que NO debe entrar al bundle inicial del catálogo
// (prioridad #1 del sprint mobile-first) — se carga con import() dinámico
// recién cuando el cliente confirma el pedido, ver handleEnviarPedido. Este
// número, en cambio, no depende de jsPDF y hace falta antes (para el
// mensaje de WhatsApp), así que se queda liviano acá.
//
// SOLO se usa como respaldo si intentarCrearSolicitudEnERP falla (ver
// handleEnviarPedido): el número "oficial" es el que genera el backend
// (secuencial real, PP-2026-000154) al guardar la solicitud. Este de acá es
// un identificador de referencia para que el pedido nunca se quede sin
// número aunque el guardado falle — no es secuencial ni consultable en
// "Rastrea tu pedido".
function numeroOrdenLocal() {
  const ahora = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `PP-${ahora.getFullYear()}-${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
}
import {
  ESCALAS_POR_CATEGORIA,
  escalaParaMostrar,
  escalonAplicable,
  precioUnitarioPorCategoria,
  acumularPorCategoria,
  estadoMotivacion,
  iconoCategoria,
  TIPOS_PRODUCTO_PERSONALIZABLE,
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

// Navegación superior: 3 anclas puras (<a href="#id"> + scroll-behavior:
// smooth global, sin JS de scroll propio). Va inmediatamente DESPUÉS del
// Hero (orden aprobado: Header → Hero → Navegación → Beneficios →
// Catálogo) — es la ÚNICA navegación rápida del catálogo ahora: el Hero ya
// no tiene sus propios botones ("Ver catálogo"/"Cotizar por WhatsApp"),
// que quedaban duplicados con esto (sprint de simplificación de UX,
// 2026-07-29). Cotizar por WhatsApp lo sigue cubriendo el botón flotante
// durante toda la navegación, sin duplicar acá. "Personaliza tus diseños"
// es el acceso prioritario (estilo relleno) — el resto, secundario.
function NavegacionPrincipal() {
  return (
    <nav className="nav-principal" aria-label="Accesos principales">
      <a href="#grilla-productos" className="nav-principal-item nav-principal-secundario">
        📦 Ver catálogo
      </a>
      <a href="#personaliza-tus-disenos" className="nav-principal-item nav-principal-prioritario">
        🎨 Personaliza tus diseños
      </a>
      <a href="#rastreo" className="nav-principal-item nav-principal-secundario">
        📍 Rastrea tu pedido
      </a>
    </nav>
  );
}

// Hero superior — limpio a propósito (solo logo/título/subtítulo/
// descripción): sus botones se eliminaron porque quedaban duplicados con
// NavegacionPrincipal, que ahora es la única navegación rápida del
// catálogo (sprint de simplificación de UX). "Cotizar por WhatsApp" sigue
// disponible todo el recorrido vía el botón flotante (BotonWhatsAppFlotante).
function Hero() {
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

// Asistente Comercial — parte del carrito, no un módulo aparte (ver el
// orden Productos → Resumen → Asistente Comercial → Botón en la vista de
// checkout). Una sola vez por categoría con escala. Se recalcula solo de
// `estadoMotivacion`, que ya depende del carrito completo — reactivo
// automáticamente a cualquier cambio de cantidad, sin lógica propia acá.
function AsistenteComercial({ categoria, cantidad, onVerMasDisenos }) {
  const estado = estadoMotivacion(categoria, cantidad);
  if (!estado) return null;

  return (
    <div className="asistente-comercial" role="status">
      <p className="asistente-eyebrow">Asistente Comercial</p>
      <p className="asistente-mensaje">
        {estado.mensaje.emoji && <span aria-hidden="true">{estado.mensaje.emoji} </span>}
        {estado.mensaje.texto}
      </p>
      {estado.siguiente && (
        <>
          <div className="asistente-barra">
            <div className="asistente-barra-relleno" style={{ width: `${estado.progreso}%` }} />
          </div>
          {estado.ahorro > 0 && (
            <p className="asistente-detalle">
              Ahorro estimado: <strong>${estado.ahorro.toFixed(2)}</strong>
            </p>
          )}
          <button type="button" className="btn-ver-mas-disenos" onClick={onVerMasDisenos}>
            ➜ Ver más diseños
          </button>
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

function crearDisenoVacio() {
  return {
    id: `d-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    archivo: null,
    previewUrl: null,
    nombreArchivo: "",
    cantidad: 1,
    producto: TIPOS_PRODUCTO_PERSONALIZABLE[0],
    observaciones: "",
  };
}

// Una tarjeta por diseño en edición — sube su propio archivo, no un
// formulario compartido. "Agregar al pedido" solo se habilita cuando tiene
// archivo + cantidad + producto, igual que una tarjeta de catálogo normal.
function DisenoPersonalizadoCard({ diseno, onActualizar, onArchivo, onQuitar, onAgregar }) {
  const listo = Boolean(diseno.archivo) && diseno.cantidad > 0 && diseno.producto;
  return (
    <div className="diseno-card">
      <div className="diseno-imagen-wrap">
        {diseno.previewUrl ? (
          <img src={diseno.previewUrl} alt={diseno.nombreArchivo} className="diseno-miniatura" />
        ) : (
          <label className="diseno-subir">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
              hidden
            />
            <span aria-hidden="true">📁</span>
            <span>Subir imagen</span>
          </label>
        )}
      </div>
      <div className="diseno-cuerpo">
        {diseno.nombreArchivo && <p className="diseno-nombre-archivo">{diseno.nombreArchivo}</p>}
        <label className="diseno-campo">
          Cantidad
          <input
            type="number"
            min={1}
            value={diseno.cantidad}
            onChange={(e) => onActualizar({ cantidad: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
        <label className="diseno-campo">
          Producto
          <select value={diseno.producto} onChange={(e) => onActualizar({ producto: e.target.value })}>
            {TIPOS_PRODUCTO_PERSONALIZABLE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="diseno-campo">
          Observaciones
          <textarea
            placeholder="Tallas, colores, ubicación del logo, detalles..."
            value={diseno.observaciones}
            onChange={(e) => onActualizar({ observaciones: e.target.value })}
            rows={2}
          />
        </label>
        <div className="diseno-acciones">
          {onQuitar && (
            <button type="button" className="btn-eliminar" onClick={onQuitar}>
              🗑 Eliminar
            </button>
          )}
          <button type="button" className="btn-primary" disabled={!listo} onClick={onAgregar}>
            Agregar al pedido
          </button>
        </div>
      </div>
    </div>
  );
}

// Se siente como otra forma de comprar, no un formulario — el cliente sube
// tantos diseños como quiera (sin límite) y cada uno se agrega al MISMO
// carrito que los productos de catálogo (ver agregarDisenoAlCarrito en
// App()). El precio de estos productos es "a cotizar": no hay tarifa fija
// para un diseño propio, se confirma por WhatsApp como siempre.
function PersonalizaTusDisenos({ onAgregarDiseno }) {
  const [disenos, setDisenos] = useState(() => [crearDisenoVacio()]);

  function actualizar(id, cambios) {
    setDisenos((prev) => prev.map((d) => (d.id === id ? { ...d, ...cambios } : d)));
  }

  function manejarArchivo(id, archivo) {
    if (!archivo) return;
    const previewUrl = URL.createObjectURL(archivo);
    actualizar(id, { archivo, previewUrl, nombreArchivo: archivo.name });
  }

  function agregarFila() {
    setDisenos((prev) => [...prev, crearDisenoVacio()]);
  }

  function quitarFila(id) {
    setDisenos((prev) => {
      const fila = prev.find((d) => d.id === id);
      if (fila?.previewUrl) URL.revokeObjectURL(fila.previewUrl);
      return prev.filter((d) => d.id !== id);
    });
  }

  function handleAgregar(diseno) {
    onAgregarDiseno(diseno);
    // Reemplaza esa fila por una nueva vacía — no deja un hueco ni permite
    // agregarla dos veces sin querer.
    setDisenos((prev) => prev.map((d) => (d.id === diseno.id ? crearDisenoVacio() : d)));
  }

  return (
    <section className="seccion-personaliza" id="personaliza-tus-disenos">
      <p className="eyebrow">Personaliza tus diseños</p>
      <h2 className="seccion-titulo">Sube tus propios archivos para fabricar exactamente lo que necesitas.</h2>
      <div className="disenos-lista">
        {disenos.map((d) => (
          <DisenoPersonalizadoCard
            key={d.id}
            diseno={d}
            onActualizar={(cambios) => actualizar(d.id, cambios)}
            onArchivo={(archivo) => manejarArchivo(d.id, archivo)}
            onQuitar={disenos.length > 1 ? () => quitarFila(d.id) : null}
            onAgregar={() => handleAgregar(d)}
          />
        ))}
      </div>
      <button type="button" className="btn-agregar-diseno" onClick={agregarFila}>
        ➕ Agregar otro diseño
      </button>
    </section>
  );
}

// Estados públicos de producción/entrega — mismo orden y copy que
// ETAPAS_PUBLICAS en server/src/services/solicitudes.service.js (frontend y
// backend son apps separadas, sin imports compartidos en este monorepo,
// así que se duplica intencionalmente acá; si cambia uno, revisar el otro).
const ETAPAS_INFO = {
  RECIBIDO: {
    emoji: "✅",
    titulo: "Pedido recibido",
    texto: "Tu pedido fue recibido correctamente y está siendo validado por nuestro equipo.",
  },
  PRODUCCION_INICIO: {
    emoji: "🖨",
    titulo: "Inicio de producción",
    texto: "Tu pedido ya ingresó a producción. Nuestro equipo comenzó el proceso de fabricación.",
  },
  PRODUCCION_FIN: {
    emoji: "✅",
    titulo: "Fin de producción",
    texto: "La fabricación terminó correctamente. Ahora inicia el proceso de revisión y preparación.",
  },
  PREPARANDO_ENVIO: {
    emoji: "📦",
    titulo: "Preparando envío",
    texto: "Estamos preparando cuidadosamente tu pedido para el despacho o retiro.",
  },
  LISTO_RETIRO: {
    emoji: "🏪",
    titulo: "Listo para retiro",
    texto: "Tu pedido ya puede ser retirado en nuestras instalaciones.",
  },
  ENVIADO: {
    emoji: "🚚",
    titulo: "Enviado",
    texto: "Tu pedido ya salió de nuestras instalaciones y va camino hacia tu ciudad.",
  },
  DISPONIBLE_RETIRO: {
    emoji: "📍",
    titulo: "Disponible para retirar",
    texto: (agencia) => `Tu pedido ya se encuentra disponible para retiro en la agencia de ${agencia || "tu ciudad"}.`,
  },
  ENTREGADO: {
    emoji: "🎉",
    titulo: "Pedido entregado",
    texto: "Tu pedido fue retirado correctamente. Gracias por confiar en Panaprice. Esperamos volver a fabricar para ti muy pronto.",
  },
};

// LISTO_RETIRO y ENVIADO/DISPONIBLE_RETIRO son ramas alternativas según
// tipoEntrega, no una secuencia única — ver nota en schema.prisma.
function secuenciaParaTipoEntrega(tipoEntrega) {
  const base = ["RECIBIDO", "PRODUCCION_INICIO", "PRODUCCION_FIN", "PREPARANDO_ENVIO"];
  if (tipoEntrega === "ENVIO") return [...base, "ENVIADO", "DISPONIBLE_RETIRO", "ENTREGADO"];
  return [...base, "LISTO_RETIRO", "ENTREGADO"];
}

// "Rastrea tu pedido" — timeline visual del estado real (ver
// GET /api/publico/rastreo/:numeroOrden). valorInicial llega prefilled
// desde el QR del PDF (?orden=...) o desde el botón de la confirmación —
// en ambos casos se autoconsulta al montar.
function RastreaTuPedido({ valorInicial }) {
  const [numero, setNumero] = useState(valorInicial || "");
  const [consultando, setConsultando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [buscado, setBuscado] = useState(false);

  async function consultar(e) {
    e?.preventDefault();
    if (!numero.trim()) return;
    setConsultando(true);
    setBuscado(true);
    const r = await consultarRastreo(numero.trim());
    setResultado(r);
    setConsultando(false);
  }

  useEffect(() => {
    if (valorInicial) consultar();
    // Solo al montar (o cuando cambia valorInicial vía key en App()) — no
    // en cada tecleo del input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorInicial]);

  const secuencia = resultado?.ok ? secuenciaParaTipoEntrega(resultado.tipoEntrega) : [];
  const indiceActual = secuencia.indexOf(resultado?.estadoPublico);

  return (
    <section className="seccion-rastreo" id="rastreo">
      <p className="eyebrow">Rastrea tu pedido</p>
      <h2 className="seccion-titulo">¿Dónde está tu pedido?</h2>
      <form className="form-rastreo" onSubmit={consultar}>
        <input
          type="text"
          placeholder="Ej. PP-2026-000154"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          aria-label="Número de orden"
        />
        <button type="submit" className="btn-primary" disabled={consultando}>
          {consultando ? "Buscando..." : "Consultar"}
        </button>
      </form>

      {buscado && !consultando && resultado && !resultado.ok && (
        <p className="rastreo-no-encontrado">
          No encontramos un pedido con ese número. Revisá que esté bien escrito, o escribinos por
          WhatsApp si acabás de hacer tu pedido — puede tardar unos minutos en aparecer.
        </p>
      )}

      {resultado?.ok && (
        <div className="rastreo-timeline">
          <p className="rastreo-numero">Pedido {resultado.numeroOrden}</p>
          {secuencia.map((clave, i) => {
            const info = ETAPAS_INFO[clave];
            const estado = i < indiceActual ? "completado" : i === indiceActual ? "actual" : "pendiente";
            const texto = typeof info.texto === "function" ? info.texto(resultado.agenciaEnvio) : info.texto;
            return (
              <div className={`rastreo-paso rastreo-paso-${estado}`} key={clave}>
                <div className="rastreo-paso-icono" aria-hidden="true">
                  {info.emoji}
                </div>
                <div className="rastreo-paso-cuerpo">
                  <h3>{info.titulo}</h3>
                  <p>{texto}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// "Tu pedido incluye: 🧣 12 Pañoletas · 👕 6 Franelas · 🎨 3 Diseños
// personalizados" — resumen visual antes de enviar (punto 10 del sprint
// "experiencia de compra"). Agrupa TODOS los diseños personalizados bajo
// una sola etiqueta (sin importar su tipo de producto elegido) porque así
// es como el cliente los piensa: "mis diseños", no por categoría suelta.
function ResumenVisualPedido({ lineas }) {
  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const l of lineas) {
      const esPersonalizado = l.tipo === "personalizado";
      const etiqueta = esPersonalizado ? "Diseños personalizados" : l.producto.categoria || "Productos";
      const emoji = iconoCategoria(esPersonalizado ? "personalizado" : l.producto.categoria);
      const actual = mapa.get(etiqueta) || { emoji, cantidad: 0 };
      actual.cantidad += l.cantidad;
      mapa.set(etiqueta, actual);
    }
    return [...mapa.entries()].map(([etiqueta, v]) => ({ etiqueta, ...v }));
  }, [lineas]);

  if (grupos.length === 0) return null;

  return (
    <div className="resumen-visual">
      <p className="resumen-visual-titulo">Tu pedido incluye:</p>
      <ul className="resumen-visual-lista">
        {grupos.map((g) => (
          <li key={g.etiqueta}>
            <span aria-hidden="true">{g.emoji}</span> {g.cantidad} {g.etiqueta}
          </li>
        ))}
      </ul>
    </div>
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
  // Mejor precio posible de ESTA MISMA escala (la que ya alimenta la tabla
  // "Ver precios por cantidad") — nunca un valor fijo/inventado. Si el
  // producto no tiene escala (else de arriba), esto simplemente no se usa.
  const mejorPrecio = escala ? escala[escala.length - 1].precioUnitario : null;

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
                entrar al carrito. Sin "Desde": esta cifra YA es el precio
                real para la cantidad acumulada actual, no un piso teórico. */}
            <p className="producto-precio">
              ${unitarioSubtotal.toFixed(2)}
              <span className="precio-sufijo"> c/u</span>
            </p>
            {/* Gancho comercial: el mejor precio de la MISMA escala que ya
                alimenta la tabla de abajo (nunca un número inventado). Si
                todavía hay un precio mejor por desbloquear, se muestra ese
                número; si el carrito ya llegó al mejor escalón, la línea no
                desaparece — pasa a confirmar que ya se aplicó el mejor
                precio (refuerzo positivo en vez de un hueco vacío). */}
            {mejorPrecio < unitarioSubtotal ? (
              <p className="producto-precio-volumen">
                Por volumen, desde ${mejorPrecio.toFixed(2)} c/u
              </p>
            ) : (
              <p className="producto-precio-volumen producto-precio-volumen-alcanzado">
                Mejor precio por volumen aplicado
              </p>
            )}
            <button type="button" className="link-tarifas" onClick={onToggleTarifa} aria-expanded={tarifaAbierta}>
              Ver precios por cantidad {tarifaAbierta ? "▲" : "▼"}
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
                      <td data-label="Cantidad">{e.cantidadMinima}</td>
                      <td data-label="Total">${(e.cantidadMinima * e.precioUnitario).toFixed(2)}</td>
                      <td data-label="Precio unitario">${e.precioUnitario.toFixed(2)}</td>
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

// Lee ?orden=... de la URL una sola vez al cargar — es como llega el
// cliente que escaneó el QR del PDF (ver pdf.js) directo a "Rastrea tu
// pedido" con el número ya cargado.
function ordenDesdeUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("orden") || "";
}

export function App() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [carrito, setCarrito] = useState([]); // [{ clave, producto, cantidad, disenoNotas, tipo }]
  const [vista, setVista] = useState("catalogo"); // catalogo | checkout | confirmacion
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", ubicacion: "", tipoEntrega: "" });
  const [enviando, setEnviando] = useState(false);
  const [pasoEnvio, setPasoEnvio] = useState(null);
  const [avisoErp, setAvisoErp] = useState(null);
  const [numeroOrden, setNumeroOrden] = useState(null);
  const [numeroOrdenRastreable, setNumeroOrdenRastreable] = useState(false);
  const [pdfInfo, setPdfInfo] = useState(null);
  // El blob vive en memoria (no se descarga solo) hasta que el cliente
  // toca el botón de la pantalla "Tu orden está lista" — recién ahí se
  // decide compartirlo de verdad o descargarlo, según lo que el
  // dispositivo permita (ver handleCompartirPedido/handleDescargarPedido).
  const [pdfBlob, setPdfBlob] = useState(null);
  const [nombreArchivoPdf, setNombreArchivoPdf] = useState(null);
  // null = todavía no se intentó compartir/descargar; luego { ok, motivo? }.
  const [resultadoEnvio, setResultadoEnvio] = useState(null);
  const [mensajeCopiado, setMensajeCopiado] = useState(false);
  const [categoriaActiva, setCategoriaActiva] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  // Solo una tarjeta puede tener la tabla de tarifas abierta a la vez —
  // guardar el id acá (no un booleano por tarjeta) es lo que lo garantiza.
  const [tarifaAbiertaId, setTarifaAbiertaId] = useState(null);
  // Número que "Rastrea tu pedido" debe autoconsultar — llega del QR del
  // PDF (?orden=...) o del botón en la pantalla de confirmación. Cambiar
  // este valor se usa como `key` de <RastreaTuPedido> para forzar que
  // remonte y vuelva a buscar (ver más abajo).
  const [ordenParaRastrear, setOrdenParaRastrear] = useState(() => ordenDesdeUrl());
  const seccionRastreoRef = useRef(null);

  useEffect(() => {
    if (ordenParaRastrear && seccionRastreoRef.current) {
      seccionRastreoRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [ordenParaRastrear]);

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
      const existente = prev.find((l) => l.tipo === "catalogo" && l.producto.id === producto.id);
      if (existente) {
        return prev.map((l) =>
          l.clave === existente.clave ? { ...l, cantidad: l.cantidad + cantidad } : l
        );
      }
      return [...prev, { clave: `${producto.id}-${Date.now()}`, producto, cantidad, disenoNotas: "", tipo: "catalogo" }];
    });
  }

  // Un diseño subido en "Personaliza tus diseños" se agrega al MISMO
  // carrito que los productos de catálogo (carrito mixto). `categoria`
  // queda en singular ("Pañoleta", no "Pañoletas") a propósito: así nunca
  // choca con ESCALAS_POR_CATEGORIA (claves en plural) y no se mezcla sin
  // querer con la acumulación de precio por volumen del catálogo — un
  // diseño propio siempre es "a cotizar", nunca hereda una tarifa fija.
  function agregarDisenoAlCarrito(diseno) {
    const productoSintetico = {
      id: `personalizado-${diseno.id}`,
      codigo: "PERSONALIZADO",
      nombre: `Diseño personalizado — ${diseno.producto}`,
      categoria: diseno.producto,
      imagenUrl: null,
      precioBase: 0,
      preciosVolumen: [],
    };
    setCarrito((prev) => [
      ...prev,
      {
        clave: `personalizado-${diseno.id}`,
        producto: productoSintetico,
        cantidad: diseno.cantidad,
        disenoNotas: diseno.observaciones,
        tipo: "personalizado",
        archivoLocal: diseno.archivo,
        previewUrl: diseno.previewUrl,
      },
    ]);
  }

  function actualizarLinea(clave, cambios) {
    setCarrito((prev) => prev.map((linea) => (linea.clave === clave ? { ...linea, ...cambios } : linea)));
  }

  function quitarLinea(clave) {
    setCarrito((prev) => {
      const linea = prev.find((l) => l.clave === clave);
      if (linea?.previewUrl) URL.revokeObjectURL(linea.previewUrl);
      return prev.filter((l) => l.clave !== clave);
    });
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

  // Ya NO abre WhatsApp acá — solo guarda el pedido (número real si el ERP
  // responde) y genera el PDF en memoria (blob). Compartirlo o descargarlo
  // pasa a un botón propio en la pantalla de confirmación: navigator.share
  // con archivos necesita un gesto de usuario FRESCO, y llamarlo acá
  // (después de dos `await`) es frágil sobre todo en Safari — ver
  // handleCompartirPedido/handleDescargarPedido. El catálogo NUNCA debe
  // quedar bloqueado por un error de conexión: si el guardado falla, se
  // sigue con un número de referencia local (ver numeroOrdenLocal), solo
  // que ese número no será consultable en "Rastrea tu pedido".
  async function handleEnviarPedido(e) {
    e.preventDefault();
    setEnviando(true);
    setPasoEnvio("Guardando tu pedido...");

    // crearSolicitudPublica exige productoId real de catálogo — los
    // diseños personalizados todavía no se sincronizan al ERP (ver nota en
    // agregarDisenoAlCarrito), así que se excluyen de este envío; igual
    // viajan completos en el PDF y en el mensaje de WhatsApp.
    const itemsCatalogo = lineasConSubtotal
      .filter((l) => l.tipo !== "personalizado")
      .map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad, disenoNotas: l.disenoNotas || undefined }));

    let ordenFinal = null;
    let ordenEsReal = false;
    if (itemsCatalogo.length > 0) {
      const resultado = await intentarCrearSolicitudEnERP({
        clienteNombre: cliente.nombre,
        clienteTelefono: cliente.telefono,
        notasPersonalizacion: `Ubicación: ${cliente.ubicacion}`,
        tipoEntrega: cliente.tipoEntrega || undefined,
        items: itemsCatalogo,
      });
      setAvisoErp(resultado);
      if (resultado.ok && resultado.numeroOrden) {
        ordenFinal = resultado.numeroOrden;
        ordenEsReal = true;
      }
    } else {
      setAvisoErp({ ok: false, motivo: "pedido compuesto solo por diseños personalizados: todavía no se registra en el ERP" });
    }
    if (!ordenFinal) ordenFinal = numeroOrdenLocal();
    setNumeroOrden(ordenFinal);
    setNumeroOrdenRastreable(ordenEsReal);

    setPasoEnvio("Generando tu Orden Comercial en PDF...");
    try {
      const { generarPdfPedido } = await import("./pdf");
      const { blob, nombreArchivo } = await generarPdfPedido({
        cliente,
        lineas: lineasConSubtotal,
        resumenCategorias,
        total,
        numeroOrden: ordenFinal,
        tipoEntrega: cliente.tipoEntrega,
      });
      setPdfBlob(blob);
      setNombreArchivoPdf(nombreArchivo);
      setPdfInfo({ ok: true, nombreArchivo });
    } catch (err) {
      setPdfInfo({ ok: false, motivo: err.message });
    }

    setVista("confirmacion");
    setEnviando(false);
    setPasoEnvio(null);
  }

  // Se recalcula solo cuando cambia el PDF — evita reconstruir el File en
  // cada render. navigator.canShare exige el objeto File real (no alcanza
  // con mirar el tipo MIME a mano), por eso se construye acá.
  const puedeCompartirArchivo = useMemo(() => {
    if (!pdfBlob || !nombreArchivoPdf) return false;
    if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
    try {
      const archivo = new File([pdfBlob], nombreArchivoPdf, { type: "application/pdf" });
      return navigator.canShare({ files: [archivo] });
    } catch {
      return false;
    }
  }, [pdfBlob, nombreArchivoPdf]);

  // Camino real de compartir: el PDF viaja adjunto de verdad en el picker
  // nativo del sistema operativo — acá "te comparto el PDF" (ver
  // textoMensajePedido) es una promesa cierta, no como el mensaje viejo.
  // Nunca asumimos que el cliente elige WhatsApp: el picker lo decide él.
  async function handleCompartirPedido() {
    const archivo = new File([pdfBlob], nombreArchivoPdf, { type: "application/pdf" });
    const texto = textoMensajePedido({
      cliente,
      lineas: lineasConSubtotal,
      total,
      resumenCategorias,
      numeroOrden,
      pdfOk: true,
      compartido: true,
    });
    try {
      await navigator.share({ files: [archivo], title: "Orden Panaprice", text: texto });
      setResultadoEnvio({ ok: true });
    } catch (err) {
      // El cliente cerró el picker sin elegir nada — no es un error real,
      // no hay nada que avisar (podría volver a tocar el botón).
      if (err?.name === "AbortError") return;
      setResultadoEnvio({ ok: false, motivo: err.message });
    }
  }

  // Fallback: descarga real del blob (no depende de que el navegador haya
  // "guardado" nada antes) + abre WhatsApp con el mensaje que NO promete
  // un adjunto que no existe. Clic directo del botón = gesto de usuario
  // legítimo, ya no hace falta el truco de ventana en blanco.
  function handleDescargarPedido() {
    if (pdfBlob && nombreArchivoPdf) {
      const url = URL.createObjectURL(pdfBlob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoPdf;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    const link = armarLinkWhatsApp({
      cliente,
      lineas: lineasConSubtotal,
      total,
      resumenCategorias,
      numeroOrden,
      pdfOk: Boolean(pdfBlob),
    });
    if (link) window.open(link, "_blank");
    setResultadoEnvio({ ok: true });
  }

  async function handleCopiarMensaje() {
    const texto = textoMensajePedido({
      cliente,
      lineas: lineasConSubtotal,
      total,
      resumenCategorias,
      numeroOrden,
      pdfOk: Boolean(pdfBlob),
      compartido: puedeCompartirArchivo,
    });
    try {
      await navigator.clipboard.writeText(texto);
      setMensajeCopiado(true);
      setTimeout(() => setMensajeCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (poco común) — no rompe nada más.
    }
  }

  // Solo hace falta si el PDF no se pudo generar en absoluto — ahí el
  // único camino que queda es el mensaje detallado de siempre por wa.me.
  const linkWhatsAppSinPdf = pdfInfo && !pdfInfo.ok
    ? armarLinkWhatsApp({ cliente, lineas: lineasConSubtotal, total, resumenCategorias, numeroOrden, pdfOk: false })
    : null;

  if (vista === "confirmacion") {
    return (
      <div className="pagina">
        <header className="cabecera">
          <LogoPanaprice onClick={() => setVista("catalogo")} />
        </header>
        <main className="confirmacion">
          <h2>Tu orden está lista</h2>
          {numeroOrden && (
            <p className="orden-numero">
              N.º de orden: <strong>{numeroOrden}</strong>
            </p>
          )}

          {pdfInfo?.ok && (
            <div className="accion-final">
              {!resultadoEnvio &&
                (puedeCompartirArchivo ? (
                  <>
                    <button type="button" className="btn-primary btn-accion-final" onClick={handleCompartirPedido}>
                      Compartir pedido y PDF
                    </button>
                    <p className="ayuda-accion-final">Selecciona WhatsApp para enviarlo a Panaprice.</p>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-primary btn-accion-final" onClick={handleDescargarPedido}>
                      Descargar PDF y continuar por WhatsApp
                    </button>
                    <p className="ayuda-accion-final">Se descarga el archivo y se abre WhatsApp — adjuntalo ahí para completar tu pedido.</p>
                  </>
                ))}
              {/* Siempre disponible, tomó o no la acción principal — útil si
                  ya tiene WhatsApp Web abierto o si compartir falló. */}
              <button type="button" className="link-copiar" onClick={handleCopiarMensaje}>
                {mensajeCopiado ? "Mensaje copiado ✓" : "Copiar mensaje"}
              </button>
            </div>
          )}

          {pdfInfo?.ok && resultadoEnvio?.ok && (
            <p>
              {puedeCompartirArchivo
                ? "Se abrió el menú para compartir tu pedido — si elegiste WhatsApp, solo falta tocar enviar."
                : "Se descargó tu PDF y se abrió WhatsApp — adjuntalo en la misma conversación para que tu pedido quede completo."}
            </p>
          )}

          {resultadoEnvio && !resultadoEnvio.ok && (
            <p className="nota-tecnica">
              (No se pudo compartir automáticamente — {resultadoEnvio.motivo}. Probá "Copiar mensaje" y adjuntá el PDF descargado a mano.)
            </p>
          )}

          {pdfInfo && !pdfInfo.ok && (
            <>
              <p className="error">No se pudo generar el PDF automáticamente ({pdfInfo.motivo}).</p>
              {linkWhatsAppSinPdf ? (
                <a className="btn-primary" href={linkWhatsAppSinPdf} target="_blank" rel="noreferrer">
                  Abrir WhatsApp con el detalle de tu pedido
                </a>
              ) : (
                <p className="error">
                  El catálogo todavía no tiene configurado el número de WhatsApp. Contactá a PanaPrice
                  directamente para confirmar tu pedido.
                </p>
              )}
            </>
          )}

          {numeroOrdenRastreable && (
            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setOrdenParaRastrear(numeroOrden);
                setVista("catalogo");
              }}
            >
              Rastrea tu pedido
            </button>
          )}
          {avisoErp && !avisoErp.ok && (
            <p className="nota-tecnica">(Nota interna: no se pudo registrar automáticamente en el sistema — {avisoErp.motivo}. Tu pedido sigue siendo válido.)</p>
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
          <NavegacionPrincipal />
          <PorQuePanaprice />
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
          <PersonalizaTusDisenos onAgregarDiseno={agregarDisenoAlCarrito} />
          <div ref={seccionRastreoRef}>
            <RastreaTuPedido key={ordenParaRastrear || "vacio"} valorInicial={ordenParaRastrear} />
          </div>
        </main>
      )}

      {vista === "checkout" && (
        <main className="checkout">
          <button type="button" className="link-volver" onClick={() => setVista("catalogo")}>
            ← Volver al catálogo
          </button>
          <h2>Tu pedido</h2>
          {carrito.length === 0 && <p>Tu carrito está vacío.</p>}
          {lineasConSubtotal.map((linea) => {
            const esPersonalizado = linea.tipo === "personalizado";
            return (
              <div className="linea-carrito" key={linea.clave}>
                <div className="linea-miniatura-wrap">
                  {linea.producto.imagenUrl || linea.previewUrl ? (
                    <img
                      src={linea.producto.imagenUrl || linea.previewUrl}
                      alt={linea.producto.nombre}
                      className="linea-miniatura"
                    />
                  ) : (
                    <div className="linea-miniatura linea-miniatura-vacia" aria-hidden="true" />
                  )}
                </div>
                <div className="linea-cuerpo">
                  <div className="linea-encabezado">
                    <strong>{linea.producto.nombre}</strong>
                    <span className="linea-ref">{esPersonalizado ? "Diseño propio" : `Ref. ${linea.producto.codigo}`}</span>
                    <span className="linea-precio">{esPersonalizado ? "A cotizar" : `$${linea.unitario.toFixed(2)} c/u`}</span>
                  </div>
                  {esPersonalizado && linea.disenoNotas && <p className="linea-notas">Obs: {linea.disenoNotas}</p>}
                  <div className="linea-controles">
                    <input
                      type="number"
                      min={1}
                      value={linea.cantidad}
                      onChange={(e) => actualizarLinea(linea.clave, { cantidad: e.target.value })}
                    />
                    <button type="button" className="btn-eliminar" onClick={() => quitarLinea(linea.clave)}>
                      🗑 Eliminar producto
                    </button>
                  </div>
                  <p className="linea-subtotal">
                    {esPersonalizado ? "Subtotal: a cotizar por WhatsApp" : `Subtotal: $${linea.subtotal.toFixed(2)}`}
                  </p>
                </div>
              </div>
            );
          })}

          <ResumenVisualPedido lineas={lineasConSubtotal} />

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

          {Object.keys(ESCALAS_POR_CATEGORIA).map((categoria) => (
            <AsistenteComercial
              key={categoria}
              categoria={categoria}
              cantidad={acumuladoPorCategoriaEnCarrito[categoria] || 0}
              onVerMasDisenos={() => setVista("catalogo")}
            />
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

                <fieldset className="fieldset-entrega">
                  <legend>Entrega</legend>
                  <label className="opcion-entrega">
                    <input
                      type="radio"
                      name="tipoEntrega"
                      value="RETIRO"
                      required
                      checked={cliente.tipoEntrega === "RETIRO"}
                      onChange={(e) => setCliente({ ...cliente, tipoEntrega: e.target.value })}
                    />
                    Retiro en tienda
                  </label>
                  <label className="opcion-entrega">
                    <input
                      type="radio"
                      name="tipoEntrega"
                      value="ENVIO"
                      required
                      checked={cliente.tipoEntrega === "ENVIO"}
                      onChange={(e) => setCliente({ ...cliente, tipoEntrega: e.target.value })}
                    />
                    Envío a domicilio
                  </label>
                </fieldset>

                <button type="submit" className="btn-primary" disabled={enviando}>
                  {enviando ? pasoEnvio || "Preparando..." : "Enviar pedido por WhatsApp"}
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
