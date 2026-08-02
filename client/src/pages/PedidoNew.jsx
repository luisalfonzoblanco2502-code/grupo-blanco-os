import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { SelectorCliente } from "../components/SelectorCliente";
import { SelectorProductoMaestro } from "../components/SelectorProductoMaestro";
import { LineaProductoMaestro } from "../components/LineaProductoMaestro";
import { FormSection } from "../components/FormSection";
import { Spinner } from "../components/Spinner";
import { AlertaError } from "../components/AlertaError";
import { useToast } from "../components/ToastContext";
import { precioEsperado } from "../utils/precioProducto";

function nuevaCarpeta() {
  return `nuevo-pedido/${crypto.randomUUID()}`;
}

// Línea nacida de un Producto Maestro (Paso 5) — a diferencia de LINEA_VACIA,
// nunca lleva campos técnicos: el backend arma ese snapshot solo, al guardar
// (Paso 4). Acá solo vive lo comercial + lo necesario para MOSTRAR la
// tarjeta (nombre/código/imagen/preciosVolumen), que se descarta antes de
// enviar — ver normalizarLineaParaEnviar.
function lineaDesdeProducto(producto) {
  return {
    _key: crypto.randomUUID(),
    _carpeta: nuevaCarpeta(),
    productoId: producto.id,
    producto: producto.nombre,
    productoCodigo: producto.codigo,
    // Catálogo regular usa imagenUrl; personalizados usan
    // imagenReferenciaProduccionUrl — mismo fallback que ya aplica el
    // buscador (SelectorProductoMaestro), para que la miniatura no
    // dependa de cuál de las dos columnas se pobló.
    imagenReferenciaProduccionUrl: producto.imagenReferenciaProduccionUrl,
    imagenUrl: producto.imagenUrl,
    requierePersonalizacion: producto.requierePersonalizacion,
    // Solo para MOSTRAR en la tarjeta ("el item ya trae todo") — nunca
    // viajan al backend, que arma su propio snapshot desde el Producto
    // Maestro real al guardar (Paso 4). Mostrarlos acá evita que la
    // vendedora tenga que volver a mirar la ficha del producto.
    tela: producto.tela,
    tiempoProduccionMinutos: producto.tiempoProduccionMinutos,
    preciosVolumen: producto.preciosVolumen,
    precioBase: producto.precioBase,
    cantidad: 1,
    precioUnitario: precioEsperado(producto, 1),
    precioManual: false,
    observacionesProduccion: "",
    // Foto del personalizado (retoma Fase 2, antes pausada) — mismo
    // mecanismo real de Storage que ya usan las líneas manuales.
    archivos: [],
  };
}

// Contrato exacto de lo que la UI envía por línea (Paso 5 + retoma Fase 2):
// productoId, cantidad, precioUnitario, observaciones, archivos (la foto del
// personalizado que adjuntó la vendedora) — nada de talla/tela/medidas/
// tipoImpresion/forro/tiras/insumos/productoInternoId/instrucciones/tiempos/
// molde: eso lo arma el backend desde el snapshot del Producto Maestro. El
// resto de los campos de lineaDesdeProducto son solo para pintar la tarjeta
// en pantalla, nunca viajan al backend.
function normalizarLineaParaEnviar(linea) {
  if (linea.productoId) {
    return {
      productoId: linea.productoId,
      cantidad: Number(linea.cantidad),
      precioUnitario: linea.precioUnitario,
      observacionesProduccion: linea.observacionesProduccion || undefined,
      archivos: linea.archivos?.length ? linea.archivos : undefined,
    };
  }
  const { _carpeta, _key, ...resto } = linea;
  return resto;
}

// Nuevo Pedido rediseñado (Paso 2.2): 4 pestañas en vez de una sola
// pantalla larga — "no saturar la pantalla". Cliente/Entrega/Ítems/Notas.
const TABS = [
  { key: "cliente", label: "Cliente", icono: "👤" },
  { key: "entrega", label: "Entrega", icono: "🚚" },
  { key: "items", label: "Ítems", icono: "🧵" },
  { key: "notas", label: "Notas", icono: "📝" },
];

// Empresas de encomienda frecuentes en Venezuela — "primero sugerir, nunca
// obligar": es un <select>, pero direccionAgencia sigue siendo el mismo
// campo de texto libre real de siempre, así que cualquier otro valor
// (escrito a mano si hiciera falta) no rompe nada.
const EMPRESAS_ENCOMIENDA = ["MRW", "Zoom", "Tealca", "Domesa"];

// Autoguardado (hallazgo Nivel 1 del shadowing operacional): Nuevo Pedido
// vivía SOLO en memoria del navegador — un cierre accidental o una caída de
// internet a media captura borraba el pedido completo, con imágenes ya
// subidas, sin ninguna forma de recuperarlo. Este borrador es puramente del
// navegador (localStorage, "primero sugerir, nunca obligar"): nunca se
// aplica solo, siempre se le pregunta a la vendedora si quiere continuarlo o
// empezar de cero. Los archivos NO se re-suben (ya están en Storage); solo
// se guarda su metadata (ubicación/nombre/tamaño), igual que en memoria.
const CLAVE_BORRADOR = "gbos-borrador-nuevo-pedido";

function borradorVacio(datos) {
  return !datos.clienteNombre?.trim() && !datos.lineas?.some((l) => l.producto?.trim());
}

function cargarBorrador() {
  try {
    const crudo = localStorage.getItem(CLAVE_BORRADOR);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

function guardarBorrador(datos) {
  try {
    if (borradorVacio(datos)) {
      localStorage.removeItem(CLAVE_BORRADOR);
      return;
    }
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ ...datos, guardadoEn: new Date().toISOString() }));
  } catch {
    // localStorage lleno o no disponible (modo incógnito) — el autoguardado
    // es una ayuda, no una garantía; si falla, la captura sigue funcionando
    // igual que antes, solo sin recuperación.
  }
}

function borrarBorrador() {
  try {
    localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // ver nota en guardarBorrador
  }
}

// "La información debe capturarse una sola vez": cliente + cabecera + TODAS
// las líneas (con imágenes/archivos) se arman acá en memoria y se envían
// juntas en un solo POST — nada de esto se vuelve a pedir al facturar.
// pedidos.cantidad_total tiene un CHECK > 0 en la base real: por eso el
// pedido no puede nacer sin al menos una línea (no es una limitación
// arbitraria de la UI, es una restricción real de la BD).
export function PedidoNew() {
  const navigate = useNavigate();
  const { mostrarToast } = useToast();
  const { perfil } = useAuth();
  const puedeEditarPrecio = !!perfil?.rol?.permisos?.editar_pedido;
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteId, setClienteId] = useState(null);
  const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().slice(0, 10));
  const [fechaCompromiso, setFechaCompromiso] = useState("");
  const [prioridadId, setPrioridadId] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState("");
  const [direccionAgencia, setDireccionAgencia] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [lineas, setLineas] = useState([]);
  const [ultimaLineaKey, setUltimaLineaKey] = useState(null);
  const [prioridades, setPrioridades] = useState([]);
  const [productosMaestro, setProductosMaestro] = useState([]);
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [borradorDisponible, setBorradorDisponible] = useState(() => cargarBorrador());
  const [tabActiva, setTabActiva] = useState("cliente");
  // "Otra empresa" en el selector de encomienda: direccionAgencia sigue
  // siendo el mismo campo de texto libre de siempre — este estado es solo
  // de UI, para decidir si mostrar el <select> de sugerencias o un input
  // libre ("primero sugerir, nunca obligar").
  const [courierEsOtro, setCourierEsOtro] = useState(false);
  // Ítems — simplificación radical (Paso 2 revisión): dos entradas
  // separadas y explícitas en vez de un solo buscador combinado.
  // null = ninguna abierta, "regular" = catálogo sin personalización,
  // "personalizado" = solo items con requierePersonalizacion.
  const [modoAgregar, setModoAgregar] = useState(null);
  const [pedidoCreado, setPedidoCreado] = useState(null);
  const buscadorRef = useRef(null);

  // Idempotencia (Paso 6.1): una clave por borrador, no por intento de envío.
  // Se reutiliza la del borrador guardado (timeout/reconexión/recarga/reintento
  // del mismo borrador); solo se genera una nueva al iniciar un pedido
  // explícitamente nuevo, al descartar el borrador, o tras una confirmación
  // exitosa (ese caso desmonta este componente vía navigate, así que el
  // próximo montaje entra aquí de nuevo sin borrador en localStorage).
  const claveIdempotenciaRef = useRef(null);
  if (claveIdempotenciaRef.current === null) {
    claveIdempotenciaRef.current = borradorDisponible?.claveIdempotencia || crypto.randomUUID();
  }
  // Candado síncrono además de `enviando`: un doble clic/doble evento puede
  // disparar el handler dos veces antes de que el re-render con `enviando`
  // en true llegue a deshabilitar el botón.
  const envioEnCursoRef = useRef(false);

  useEffect(() => {
    api.getPrioridades().then(setPrioridades).catch(() => {});
    api.getProductos().then(setProductosMaestro).catch(() => {});
  }, []);

  // Autoguardado silencioso: cada cambio real se refleja en localStorage con
  // un pequeño debounce, sin ningún indicador intrusivo — se nota únicamente
  // si hay que recuperarlo.
  useEffect(() => {
    const id = setTimeout(() => {
      guardarBorrador({
        clienteNombre,
        clienteId,
        fechaIngreso,
        fechaCompromiso,
        prioridadId,
        tipoEntrega,
        direccionAgencia,
        observaciones,
        lineas,
        claveIdempotencia: claveIdempotenciaRef.current,
      });
    }, 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteNombre, clienteId, fechaIngreso, fechaCompromiso, prioridadId, tipoEntrega, direccionAgencia, observaciones, lineas]);

  function continuarConBorrador() {
    const b = borradorDisponible;
    setClienteNombre(b.clienteNombre ?? "");
    setClienteId(b.clienteId ?? null);
    setFechaIngreso(b.fechaIngreso ?? new Date().toISOString().slice(0, 10));
    setFechaCompromiso(b.fechaCompromiso ?? "");
    setPrioridadId(b.prioridadId ?? "");
    setTipoEntrega(b.tipoEntrega ?? "");
    setDireccionAgencia(b.direccionAgencia ?? "");
    setObservaciones(b.observaciones ?? "");
    if (Array.isArray(b.lineas) && b.lineas.length > 0) setLineas(b.lineas);
    setBorradorDisponible(null);
  }

  function descartarBorrador() {
    borrarBorrador();
    // Descarte explícito del borrador: es un pedido nuevo a todos los
    // efectos, incluida la idempotencia — no debe seguir arrastrando la
    // clave del borrador descartado.
    claveIdempotenciaRef.current = crypto.randomUUID();
    setBorradorDisponible(null);
  }

  // Seleccionar un item crea la línea DE INMEDIATO (sin botón "Agregar
  // línea" intermedio) y deja lista la cantidad para tipear encima — se
  // siente a POS, no a formulario. Cierra el buscador abierto (regular o
  // personalizado) al agregar, para volver al estado "elegir qué botón".
  function agregarLineaDesdeProducto(producto) {
    const linea = lineaDesdeProducto(producto);
    setLineas((prev) => [...prev, linea]);
    setUltimaLineaKey(linea._key);
    setModoAgregar(null);
  }

  function actualizarLineaProductoMaestro(key, cambios) {
    setLineas((prev) => prev.map((l) => (l._key === key ? { ...l, ...cambios } : l)));
  }

  function eliminarLineaPorKey(key) {
    setLineas((prev) => prev.filter((l) => l._key !== key));
  }

  const cantidadTotal = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const totalEstimado = lineas.reduce((s, l) => {
    const precio = l.precioUnitario !== "" && l.precioUnitario != null ? Number(l.precioUnitario) : 0;
    return s + (Number(l.cantidad) || 0) * precio;
  }, 0);

  // Devuelve también en qué tab está el problema — así se puede llevar a la
  // vendedora directo ahí en vez de solo mostrar un mensaje de error suelto.
  function validar() {
    if (!clienteNombre.trim()) return { mensaje: "El cliente es obligatorio", tab: "cliente" };
    if (!fechaCompromiso) return { mensaje: "La fecha de compromiso es obligatoria", tab: "entrega" };
    if (lineas.length === 0) return { mensaje: "El pedido necesita al menos una línea", tab: "items" };
    for (const l of lineas) {
      if (!l.producto.trim()) return { mensaje: "Cada línea necesita un producto o referencia", tab: "items" };
      if (!Number.isInteger(Number(l.cantidad)) || Number(l.cantidad) <= 0) {
        return {
          mensaje: `La línea "${l.producto || "(sin nombre)"}" necesita una cantidad entera mayor a 0`,
          tab: "items",
        };
      }
    }
    return null;
  }

  async function handleRevisar(e) {
    e.preventDefault();
    const problema = validar();
    if (problema) {
      setError(problema.mensaje);
      setTabActiva(problema.tab);
      return;
    }
    setError(null);
    setMostrarResumen(true);
  }

  async function handleConfirmar() {
    // Candado síncrono: si ya hay un envío en curso desde esta misma
    // instancia (doble clic, doble evento), este intento no hace nada — no
    // solo lo evita `enviando`, que depende de un re-render.
    if (envioEnCursoRef.current) return;
    envioEnCursoRef.current = true;
    setEnviando(true);
    setError(null);
    try {
      const { pedido, idempotentReplay } = await api.createPedido({
        clienteNombre,
        clienteId,
        fechaIngreso,
        fechaCompromiso,
        prioridadId: prioridadId || undefined,
        tipoEntrega: tipoEntrega || undefined,
        direccionAgencia: direccionAgencia || undefined,
        observaciones,
        lineas: lineas.map(normalizarLineaParaEnviar),
        claveIdempotencia: claveIdempotenciaRef.current,
      });
      // Éxito (nuevo o reenvío detectado): misma respuesta para el usuario.
      // idempotentReplay queda disponible para diagnóstico/certificación,
      // nunca cambia lo que ve la vendedora.
      void idempotentReplay;
      borrarBorrador();
      // Pantalla de éxito (Paso 3) en vez de navegar directo — deja elegir
      // Descargar PDF / Ver pedido / Crear otro sin perder el contexto.
      setPedidoCreado(pedido);
      // No se libera el candado ni `enviando`: esta clave nunca debe
      // reutilizarse para un pedido nuevo (solo "Crear otro pedido" genera
      // una nueva, ver más abajo).
    } catch (err) {
      setError(err.message);
      setMostrarResumen(false);
      envioEnCursoRef.current = false;
      setEnviando(false);
    }
  }

  // Pantalla de éxito (Paso 3) — se muestra en vez de navegar directo tras
  // crear el pedido, para poder descargar el PDF sin perder el contexto.
  if (pedidoCreado) {
    return (
      <div className="fade-in">
        <div className="panel" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
          <p style={{ fontSize: "2.5rem", margin: 0 }}>✅</p>
          <h1 style={{ margin: "0.5rem 0" }}>Pedido {pedidoCreado.pedId} creado</h1>
          <p className="pagina-subtitulo">Estado: Pendiente de pago</p>
          <div className="acciones" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
            <a
              className="btn-primary"
              href={`/pedidos/${pedidoCreado.id}/recibo`}
              target="_blank"
              rel="noreferrer"
            >
              Descargar PDF
            </a>
            <button type="button" onClick={() => navigate(`/pedidos/${pedidoCreado.id}`)}>
              Ver pedido
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                // "Crear otro pedido": recién acá se genera una clave de
                // idempotencia nueva — la del pedido recién creado nunca se
                // reutiliza. Recargar la ruta es la forma más simple de
                // reiniciar todo el estado del formulario de punta a punta.
                navigate(0);
              }}
            >
              Crear otro pedido
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mostrarResumen) {
    return (
      <div className="fade-in">
        <h1>Revisar antes de confirmar</h1>
        <p className="pagina-subtitulo">
          <strong style={{ color: "var(--text)" }}>{clienteNombre}</strong> · compromiso{" "}
          {new Date(fechaCompromiso + "T00:00:00").toLocaleDateString()}
          {tipoEntrega ? ` · entrega: ${tipoEntrega}${direccionAgencia ? ` (${direccionAgencia})` : ""}` : ""}
        </p>
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr>
                <th>Item</th>
                <th>Foto ref.</th>
                <th>Foto personal.</th>
                <th>Tela</th>
                <th>Cantidad</th>
                <th>Precio unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const fotoPersonal = l.archivos?.[0];
                return (
                  <tr key={i}>
                    <td>{l.producto}</td>
                    <td>
                      {l.imagenReferenciaProduccionUrl || l.imagenUrl ? (
                        <img
                          src={l.imagenReferenciaProduccionUrl || l.imagenUrl}
                          alt=""
                          style={{ width: "2.2rem", height: "2.2rem", objectFit: "cover", borderRadius: "6px" }}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {fotoPersonal ? (
                        <img
                          src={fotoPersonal.ubicacion}
                          alt=""
                          style={{ width: "2.2rem", height: "2.2rem", objectFit: "cover", borderRadius: "6px" }}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{l.tela || "—"}</td>
                    <td>{l.cantidad}</td>
                    <td>{l.precioUnitario || "—"}</td>
                    <td>{l.precioUnitario ? (Number(l.cantidad) * Number(l.precioUnitario)).toFixed(2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Cantidad total:</strong> {cantidadTotal} · <strong>Total estimado:</strong>{" "}
          {totalEstimado.toFixed(2)}
        </p>
        <AlertaError>{error}</AlertaError>
        <div className="acciones">
          <button type="button" onClick={() => setMostrarResumen(false)}>
            &larr; Atrás
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirmar} disabled={enviando}>
            {enviando && <Spinner />}
            {enviando ? "Creando..." : "CREAR PEDIDO"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h1>Nuevo pedido</h1>
      <p className="pagina-subtitulo">Captura una sola vez: cliente, productos, especificaciones y archivos.</p>

      {borradorDisponible && (
        <div
          className="panel fade-in"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            background: "var(--accent-soft)",
            borderColor: "var(--accent)",
            marginBottom: "1rem",
          }}
        >
          <div>
            <b>Hay un borrador sin terminar</b>
            <p style={{ margin: 0 }}>
              {borradorDisponible.clienteNombre ? `Cliente: ${borradorDisponible.clienteNombre} · ` : ""}
              {(borradorDisponible.lineas || []).length} línea(s) ·{" "}
              guardado {new Date(borradorDisponible.guardadoEn).toLocaleString()}
            </p>
          </div>
          <div className="acciones">
            <button type="button" className="btn-primary" onClick={continuarConBorrador}>
              Continuar con el borrador
            </button>
            <button type="button" className="btn-ghost" onClick={descartarBorrador}>
              Empezar de cero
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleRevisar} className="form form-ancho" style={{ maxWidth: "48rem" }}>
        <div className="tabs-barra" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tabActiva === t.key}
              className={`tabs-boton${tabActiva === t.key ? " activo" : ""}`}
              onClick={() => setTabActiva(t.key)}
            >
              <span aria-hidden="true">{t.icono}</span> {t.label}
              {t.key === "items" && lineas.length > 0 && <span className="tabs-boton-contador">{lineas.length}</span>}
            </button>
          ))}
        </div>

        {tabActiva === "cliente" && (
          <FormSection icono="👤" titulo="Datos del cliente">
            <div className="form-grid">
              <label style={{ margin: 0, gridColumn: "1 / -1" }}>
                Cliente
                <SelectorCliente
                  clienteNombre={clienteNombre}
                  clienteId={clienteId}
                  cedulaObligatoria={tipoEntrega === "ENCOMIENDA"}
                  onChange={(v) => {
                    setClienteNombre(v.clienteNombre);
                    setClienteId(v.clienteId);
                  }}
                />
              </label>
            </div>
          </FormSection>
        )}

        {tabActiva === "entrega" && (
          <FormSection icono="🚚" titulo="Entrega">
            <div className="form-grid">
              <label style={{ margin: 0 }}>
                Fecha de compromiso
                <input
                  type="date"
                  value={fechaCompromiso}
                  onChange={(e) => setFechaCompromiso(e.target.value)}
                  required
                />
              </label>
              <label style={{ margin: 0 }}>
                Prioridad
                <select value={prioridadId} onChange={(e) => setPrioridadId(e.target.value)}>
                  <option value="">Sin definir</option>
                  {prioridades.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ margin: 0 }}>
                Tipo de entrega
                <select
                  value={tipoEntrega}
                  onChange={(e) => {
                    setTipoEntrega(e.target.value);
                    if (e.target.value !== "ENCOMIENDA") setDireccionAgencia("");
                  }}
                >
                  <option value="">Sin definir</option>
                  <option value="ENCOMIENDA">Encomienda</option>
                  <option value="RETIRO">Retiro en tienda</option>
                  <option value="DELIVERY">Delivery</option>
                </select>
              </label>
              {tipoEntrega === "ENCOMIENDA" &&
                (courierEsOtro ? (
                  <label style={{ margin: 0 }}>
                    Empresa de encomienda
                    <input
                      type="text"
                      autoFocus
                      value={direccionAgencia}
                      onChange={(e) => setDireccionAgencia(e.target.value)}
                    />
                  </label>
                ) : (
                  <label style={{ margin: 0 }}>
                    Empresa de encomienda
                    <select
                      value={EMPRESAS_ENCOMIENDA.includes(direccionAgencia) ? direccionAgencia : ""}
                      onChange={(e) => {
                        if (e.target.value === "__otra__") {
                          setCourierEsOtro(true);
                          setDireccionAgencia("");
                        } else {
                          setDireccionAgencia(e.target.value);
                        }
                      }}
                    >
                      <option value="">Elegir...</option>
                      {EMPRESAS_ENCOMIENDA.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                      <option value="__otra__">Otra...</option>
                    </select>
                  </label>
                ))}
            </div>
          </FormSection>
        )}

        {tabActiva === "items" && (
          <FormSection
            icono="🧵"
            titulo="Ítems del pedido"
            subtitulo={`${lineas.length} línea${lineas.length === 1 ? "" : "s"} · cantidad total ${cantidadTotal} · estimado ${totalEstimado.toFixed(2)}`}
          >
            <div className="lineas-lista">
              {lineas.map((linea) => (
                <LineaProductoMaestro
                  key={linea._key}
                  linea={linea}
                  autoFocus={linea._key === ultimaLineaKey}
                  puedeEditarPrecio={puedeEditarPrecio}
                  onCambiar={(cambios) => actualizarLineaProductoMaestro(linea._key, cambios)}
                  onEliminar={() => eliminarLineaPorKey(linea._key)}
                  onContinuar={() => buscadorRef.current?.focus()}
                />
              ))}
              {lineas.length === 0 && (
                <p className="card-label">Elegí uno de los dos botones de abajo para agregar el primer ítem.</p>
              )}
            </div>
            {/* Botones de ingresar item DEBAJO de la lista (2026-08-02): el
                flujo natural es ver lo ya agregado y seguir agregando más
                abajo, como una lista que crece hacia abajo. */}
            {modoAgregar ? (
              <div className="panel" style={{ marginTop: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <b>{modoAgregar === "regular" ? "Catálogo regular" : "Producto personalizado"}</b>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setModoAgregar(null)}>
                    Cancelar
                  </button>
                </div>
                <SelectorProductoMaestro
                  ref={buscadorRef}
                  productos={productosMaestro.filter((p) =>
                    modoAgregar === "personalizado" ? p.requierePersonalizacion : !p.requierePersonalizacion
                  )}
                  onSeleccionar={agregarLineaDesdeProducto}
                />
              </div>
            ) : (
              <div className="agregar-producto-barra" style={{ marginTop: "0.75rem", gap: "0.5rem" }}>
                <button type="button" className="btn-primary btn-sm" onClick={() => setModoAgregar("regular")}>
                  ➕ Ingresar ITEM (Catálogo regular)
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={() => setModoAgregar("personalizado")}>
                  ➕ Ingresar ITEM PRODUCTO PERSONALIZADO
                </button>
              </div>
            )}
          </FormSection>
        )}

        {tabActiva === "notas" && (
          <FormSection icono="📝" titulo="Observaciones">
            <textarea
              placeholder="Observaciones generales del pedido (opcional)"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={4}
              style={{ width: "100%" }}
            />
          </FormSection>
        )}

        <AlertaError>{error}</AlertaError>

        <div className="acciones">
          <button type="button" className="btn-ghost" onClick={() => navigate("/pedidos")}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              // El autoguardado silencioso ya corre solo — este botón es
              // la confirmación explícita que pidió el usuario, para que
              // no dependa de confiar en un guardado invisible.
              guardarBorrador({
                clienteNombre,
                clienteId,
                fechaIngreso,
                fechaCompromiso,
                prioridadId,
                tipoEntrega,
                direccionAgencia,
                observaciones,
                lineas,
                claveIdempotencia: claveIdempotenciaRef.current,
              });
              mostrarToast("Borrador guardado");
            }}
          >
            Guardar borrador
          </button>
          <button type="submit" className="btn-primary">
            REVISAR ANTES DE CONFIRMAR
          </button>
        </div>
      </form>
    </div>
  );
}
