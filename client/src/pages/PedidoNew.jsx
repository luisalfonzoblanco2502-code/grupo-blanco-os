import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { SelectorCliente } from "../components/SelectorCliente";
import { LineaForm } from "../components/LineaForm";
import { LineaCard } from "../components/LineaCard";
import { SelectorProductoMaestro } from "../components/SelectorProductoMaestro";
import { LineaProductoMaestro } from "../components/LineaProductoMaestro";
import { FormSection } from "../components/FormSection";
import { Spinner } from "../components/Spinner";
import { AlertaError } from "../components/AlertaError";
import { useToast } from "../components/ToastContext";
import { precioEsperado } from "../utils/precioProducto";

const LINEA_VACIA = {
  producto: "",
  descripcion: "",
  talla: "",
  cantidad: 1,
  precioUnitario: "",
  tela: "",
  color: "",
  tipoImpresion: "",
  forro: "",
  tiras: "",
  insumos: "",
  medidas: "",
  observacionesProduccion: "",
  prioridadId: "",
  productoInternoId: "",
  archivos: [],
  separarEnOtraOp: false,
};

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
    productoId: producto.id,
    producto: producto.nombre,
    productoCodigo: producto.codigo,
    imagenReferenciaProduccionUrl: producto.imagenReferenciaProduccionUrl,
    requierePersonalizacion: producto.requierePersonalizacion,
    preciosVolumen: producto.preciosVolumen,
    precioBase: producto.precioBase,
    cantidad: 1,
    precioUnitario: precioEsperado(producto, 1),
    observacionesProduccion: "",
  };
}

// Contrato exacto de lo que la UI envía por línea (Paso 5): productoId,
// cantidad, precioUnitario, observaciones — nada de talla/tela/medidas/
// tipoImpresion/forro/tiras/insumos/productoInternoId/instrucciones/tiempos/
// molde. El resto de los campos de lineaDesdeProducto son solo para pintar
// la tarjeta en pantalla, nunca viajan al backend.
function normalizarLineaParaEnviar(linea) {
  if (linea.productoId) {
    return {
      productoId: linea.productoId,
      cantidad: Number(linea.cantidad),
      precioUnitario: linea.precioUnitario,
      observacionesProduccion: linea.observacionesProduccion || undefined,
    };
  }
  const { _carpeta, _key, ...resto } = linea;
  return resto;
}

function mover(arr, desde, hasta) {
  const copia = [...arr];
  const [item] = copia.splice(desde, 1);
  copia.splice(hasta, 0, item);
  return copia;
}

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
  const [productosInternos, setProductosInternos] = useState([]);
  const [productosMaestro, setProductosMaestro] = useState([]);
  const [sugerencias, setSugerencias] = useState({});
  const [mostrarResumen, setMostrarResumen] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [borradorDisponible, setBorradorDisponible] = useState(() => cargarBorrador());
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
    api.getProductosInternos().then(setProductosInternos).catch(() => {});
    api.getSugerenciasTecnicas().then(setSugerencias).catch(() => {});
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

  function actualizarLinea(index, nuevaLinea) {
    setLineas((prev) => prev.map((l, i) => (i === index ? nuevaLinea : l)));
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, { ...LINEA_VACIA, _carpeta: nuevaCarpeta(), _key: crypto.randomUUID() }]);
  }

  // Paso 5, correcciones 1 y 5: seleccionar un producto crea la línea DE
  // INMEDIATO (sin botón "Agregar línea" intermedio) y deja lista la
  // cantidad para tipear encima — se siente a POS, no a formulario.
  function agregarLineaDesdeProducto(producto) {
    const linea = lineaDesdeProducto(producto);
    setLineas((prev) => [...prev, linea]);
    setUltimaLineaKey(linea._key);
  }

  function actualizarLineaProductoMaestro(key, cambios) {
    setLineas((prev) => prev.map((l) => (l._key === key ? { ...l, ...cambios } : l)));
  }

  function eliminarLineaPorKey(key) {
    setLineas((prev) => prev.filter((l) => l._key !== key));
  }

  function duplicarLinea(index) {
    setLineas((prev) => {
      const copia = { ...prev[index], _carpeta: nuevaCarpeta(), _key: crypto.randomUUID() };
      return [...prev.slice(0, index + 1), copia, ...prev.slice(index + 1)];
    });
  }

  function eliminarLinea(index) {
    setLineas((prev) => prev.filter((_, i) => i !== index));
  }

  function moverLinea(index, direccion) {
    setLineas((prev) => {
      const destino = index + direccion;
      if (destino < 0 || destino >= prev.length) return prev;
      return mover(prev, index, destino);
    });
  }

  const cantidadTotal = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const totalEstimado = lineas.reduce((s, l) => {
    const precio = l.precioUnitario !== "" && l.precioUnitario != null ? Number(l.precioUnitario) : 0;
    return s + (Number(l.cantidad) || 0) * precio;
  }, 0);

  function validar() {
    if (!clienteNombre.trim()) return "El cliente es obligatorio";
    if (!fechaCompromiso) return "La fecha de compromiso es obligatoria";
    if (lineas.length === 0) return "El pedido necesita al menos una línea";
    for (const l of lineas) {
      if (!l.producto.trim()) return "Cada línea necesita un producto o referencia";
      if (!Number.isInteger(Number(l.cantidad)) || Number(l.cantidad) <= 0) {
        return `La línea "${l.producto || "(sin nombre)"}" necesita una cantidad entera mayor a 0`;
      }
    }
    return null;
  }

  async function handleRevisar(e) {
    e.preventDefault();
    const problema = validar();
    if (problema) {
      setError(problema);
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
      mostrarToast("Pedido guardado correctamente");
      navigate(`/pedidos/${pedido.id}`);
      // No se libera el candado ni `enviando`: este componente se desmonta al
      // navegar, y esta clave nunca debe reutilizarse para un pedido nuevo.
    } catch (err) {
      setError(err.message);
      setMostrarResumen(false);
      envioEnCursoRef.current = false;
      setEnviando(false);
    }
  }

  if (mostrarResumen) {
    return (
      <div className="fade-in">
        <h1>Revisar antes de confirmar</h1>
        <p className="pagina-subtitulo">
          <strong style={{ color: "var(--text)" }}>{clienteNombre}</strong> · compromiso{" "}
          {new Date(fechaCompromiso + "T00:00:00").toLocaleDateString()}
        </p>
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i}>
                  <td>{l.producto}</td>
                  <td>{l.cantidad}</td>
                  <td>{l.precioUnitario || "—"}</td>
                  <td>{l.precioUnitario ? (Number(l.cantidad) * Number(l.precioUnitario)).toFixed(2) : "—"}</td>
                </tr>
              ))}
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
            &larr; Seguir editando
          </button>
          <button type="button" className="btn-primary" onClick={handleConfirmar} disabled={enviando}>
            {enviando && <Spinner />}
            {enviando ? "Guardando..." : "Confirmar y crear pedido"}
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
        <FormSection icono="👤" titulo="Datos del cliente">
          <div className="form-grid">
            <label style={{ margin: 0, gridColumn: "1 / -1" }}>
              Cliente
              <SelectorCliente
                clienteNombre={clienteNombre}
                clienteId={clienteId}
                onChange={(v) => {
                  setClienteNombre(v.clienteNombre);
                  setClienteId(v.clienteId);
                }}
              />
            </label>
            <label style={{ margin: 0 }}>
              Fecha de ingreso
              <input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} required />
            </label>
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
              <select value={tipoEntrega} onChange={(e) => setTipoEntrega(e.target.value)}>
                <option value="">Sin definir</option>
                <option value="RETIRO">Retiro en tienda</option>
                <option value="ENVIO">Envío</option>
                <option value="AGENCIA">Agencia</option>
              </select>
            </label>
            <label style={{ margin: 0 }}>
              Dirección / agencia
              <input type="text" value={direccionAgencia} onChange={(e) => setDireccionAgencia(e.target.value)} />
            </label>
          </div>
        </FormSection>

        <FormSection
          icono="🧵"
          titulo="Productos"
          subtitulo={`${lineas.length} línea${lineas.length === 1 ? "" : "s"} · cantidad total ${cantidadTotal} · estimado ${totalEstimado.toFixed(2)}`}
        >
          <div className="lineas-lista">
            {lineas.map((linea, index) =>
              linea.productoId ? (
                <LineaProductoMaestro
                  key={linea._key}
                  linea={linea}
                  autoFocus={linea._key === ultimaLineaKey}
                  onCambiar={(cambios) => actualizarLineaProductoMaestro(linea._key, cambios)}
                  onEliminar={() => eliminarLineaPorKey(linea._key)}
                  onContinuar={() => buscadorRef.current?.focus()}
                />
              ) : (
                <LineaCard
                  key={linea._key}
                  numero={index + 1}
                  valor={linea}
                  abiertoPorDefecto
                  puedeMoverArriba={index > 0}
                  puedeMoverAbajo={index < lineas.length - 1}
                  onMoverArriba={() => moverLinea(index, -1)}
                  onMoverAbajo={() => moverLinea(index, 1)}
                  onDuplicar={() => duplicarLinea(index)}
                  onEliminar={lineas.length > 1 ? () => eliminarLinea(index) : undefined}
                  eliminarLabel="Quitar línea"
                >
                  <LineaForm
                    valor={linea}
                    onChange={(v) => actualizarLinea(index, v)}
                    productosInternos={productosInternos}
                    prioridades={prioridades}
                    carpetaArchivos={linea._carpeta}
                    sugerencias={sugerencias}
                  />
                </LineaCard>
              )
            )}
          </div>
          <div className="agregar-producto-barra">
            <SelectorProductoMaestro ref={buscadorRef} productos={productosMaestro} onSeleccionar={agregarLineaDesdeProducto} />
            <button type="button" className="btn-ghost btn-sm" onClick={agregarLinea}>
              Producto fuera del catálogo
            </button>
          </div>
        </FormSection>

        <FormSection icono="📝" titulo="Observaciones">
          <textarea
            placeholder="Observaciones generales del pedido (opcional)"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            style={{ width: "100%" }}
          />
        </FormSection>

        <AlertaError>{error}</AlertaError>

        <button type="submit" className="btn-primary">
          Revisar antes de confirmar
        </button>
      </form>
    </div>
  );
}
