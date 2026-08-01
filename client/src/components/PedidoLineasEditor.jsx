import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { LineaForm } from "./LineaForm";
import { LineaCard } from "./LineaCard";
import { SelectorProductoMaestro } from "./SelectorProductoMaestro";
import { LineaProductoMaestro } from "./LineaProductoMaestro";
import { FormSection } from "./FormSection";
import { SkeletonPanel } from "./Skeleton";
import { AlertaError } from "./AlertaError";
import { useToast } from "./ToastContext";
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

// Agregar/editar/duplicar/eliminar líneas de un pedido YA CREADO, mientras
// siga PENDIENTE (antes de facturar) — cada acción es un guardado real,
// inmediato, no un borrador en memoria (ver PedidoNew para la captura
// inicial, que sí es en memoria hasta el primer submit).
export function PedidoLineasEditor({ pedidoId, onCambio }) {
  const { mostrarToast } = useToast();
  const [lineas, setLineas] = useState(null);
  const [prioridades, setPrioridades] = useState([]);
  const [productosInternos, setProductosInternos] = useState([]);
  const [productosMaestro, setProductosMaestro] = useState([]);
  const [sugerencias, setSugerencias] = useState({});
  const [nuevaLinea, setNuevaLinea] = useState(null);
  const [guardandoId, setGuardandoId] = useState(null);
  const [ultimaLineaId, setUltimaLineaId] = useState(null);
  const [error, setError] = useState(null);
  const buscadorRef = useRef(null);

  function cargar() {
    return api.getLineasPedido(pedidoId).then(setLineas).catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
    api.getPrioridades().then(setPrioridades).catch(() => {});
    api.getProductosInternos().then(setProductosInternos).catch(() => {});
    api.getSugerenciasTecnicas().then(setSugerencias).catch(() => {});
    api.getProductos().then(setProductosMaestro).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  // Paso 5: seleccionar un producto guarda la línea DE INMEDIATO (mismo
  // criterio "cada acción es un guardado real" que ya rige este componente),
  // y deja el foco listo en Cantidad de la línea recién creada.
  async function agregarLineaDesdeProducto(producto) {
    setError(null);
    try {
      const linea = await api.crearLineaPedido(pedidoId, {
        productoId: producto.id,
        cantidad: 1,
        precioUnitario: precioEsperado(producto, 1),
      });
      setUltimaLineaId(linea.id);
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function actualizarLineaProductoMaestro(linea, cambios) {
    setGuardandoId(linea.id);
    setError(null);
    try {
      await api.actualizarLineaPedido(linea.id, cambios);
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoId(null);
    }
  }

  async function guardarNueva() {
    setGuardandoId("nueva");
    setError(null);
    try {
      await api.crearLineaPedido(pedidoId, nuevaLinea);
      mostrarToast("Línea agregada");
      setNuevaLinea(null);
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoId(null);
    }
  }

  async function guardarEdicion(linea, cambios) {
    setGuardandoId(linea.id);
    setError(null);
    try {
      await api.actualizarLineaPedido(linea.id, cambios);
      mostrarToast("Línea actualizada");
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoId(null);
    }
  }

  async function duplicar(linea) {
    setGuardandoId(linea.id);
    try {
      await api.duplicarLineaPedido(linea.id);
      mostrarToast("Línea duplicada");
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoId(null);
    }
  }

  async function eliminar(linea) {
    if (!confirm(`¿Quitar la línea "${linea.producto}" del pedido?`)) return;
    setGuardandoId(linea.id);
    try {
      await api.eliminarLineaPedido(linea.id);
      mostrarToast("Línea eliminada");
      await cargar();
      onCambio?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardandoId(null);
    }
  }

  if (!lineas) return <SkeletonPanel lineas={2} />;

  return (
    <FormSection icono="🧵" titulo="Líneas del pedido" subtitulo={`${lineas.length} línea${lineas.length === 1 ? "" : "s"}`}>
      <AlertaError>{error}</AlertaError>
      <div className="lineas-lista">
        {lineas.map((linea, index) =>
          linea.productoId ? (
            <LineaProductoMaestro
              key={linea.id}
              linea={{
                ...linea,
                // preciosVolumen no viaja en listarLineas (no es un snapshot,
                // es tarifa vigente) — se busca en el Producto Maestro ya
                // cargado para poder previsualizar sin pegarle al backend.
                preciosVolumen: productosMaestro.find((p) => p.id === linea.productoId)?.preciosVolumen,
                precioBase: productosMaestro.find((p) => p.id === linea.productoId)?.precioBase,
              }}
              autoFocus={linea.id === ultimaLineaId}
              onCambiar={(cambios) => actualizarLineaProductoMaestro(linea, cambios)}
              onEliminar={() => eliminar(linea)}
              onContinuar={() => buscadorRef.current?.focus()}
            />
          ) : (
            <LineaCard
              key={linea.id}
              numero={index + 1}
              valor={linea}
              onDuplicar={() => duplicar(linea)}
              onEliminar={() => eliminar(linea)}
            >
              <LineaForm
                valor={linea}
                onChange={(v) => guardarEdicion(linea, v)}
                productosInternos={productosInternos}
                prioridades={prioridades}
                carpetaArchivos={`pedidos/${pedidoId}/lineas/${linea.id}`}
                sugerencias={sugerencias}
              />
              {guardandoId === linea.id && <p className="card-label">Guardando...</p>}
            </LineaCard>
          )
        )}
      </div>

      {nuevaLinea && (
        <div className="linea-card" style={{ marginTop: "0.75rem" }}>
          <div className="linea-card-body" style={{ borderTop: "none", paddingTop: "1rem" }}>
            <LineaForm
              valor={nuevaLinea}
              onChange={setNuevaLinea}
              productosInternos={productosInternos}
              prioridades={prioridades}
              carpetaArchivos={`pedidos/${pedidoId}/lineas-nuevas`}
              sugerencias={sugerencias}
            />
            <div className="acciones">
              <button type="button" className="btn-primary" onClick={guardarNueva} disabled={guardandoId === "nueva"}>
                {guardandoId === "nueva" ? "Guardando..." : "Guardar línea"}
              </button>
              <button type="button" onClick={() => setNuevaLinea(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="agregar-producto-barra">
        <SelectorProductoMaestro ref={buscadorRef} productos={productosMaestro} onSeleccionar={agregarLineaDesdeProducto} />
        {!nuevaLinea && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setNuevaLinea({ ...LINEA_VACIA })}>
            Producto fuera del catálogo
          </button>
        )}
      </div>
    </FormSection>
  );
}
