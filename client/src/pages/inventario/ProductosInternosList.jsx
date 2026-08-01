import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../components/ToastContext";

const PRODUCTO_VACIO = { codigo: "", nombre: "", categoria: "", precioReferencia: "" };
const INSUMO_VACIO = { itemInventarioId: "", cantidadPorUnidad: "" };

// Catálogo Interno de Productos — base del BOM (ajuste de arquitectura
// aprobado antes del Facturador Administrativo). Cada producto interno
// declara qué ítems de Materia Prima requiere por unidad; de eso depende
// que Inventario pueda reservar (al facturar) y consumir (en Corte).
export function ProductosInternosList() {
  const { mostrarToast } = useToast();
  const [productos, setProductos] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [nuevo, setNuevo] = useState({ ...PRODUCTO_VACIO });
  const [insumoNuevo, setInsumoNuevo] = useState({});
  const [expandido, setExpandido] = useState(null);
  const [enviando, setEnviando] = useState(false);

  function cargar() {
    return Promise.all([api.getProductosInternos(), api.getItemsInventario()])
      .then(([p, i]) => {
        setProductos(p);
        setItems(i);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleCrear(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.crearProductoInterno({
        ...nuevo,
        precioReferencia: nuevo.precioReferencia ? Number(nuevo.precioReferencia) : undefined,
      });
      mostrarToast(`Producto "${nuevo.nombre}" creado`);
      setNuevo({ ...PRODUCTO_VACIO });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function handleAgregarInsumo(productoId) {
    const datos = insumoNuevo[productoId];
    if (!datos?.itemInventarioId || !(Number(datos?.cantidadPorUnidad) > 0)) return;
    try {
      await api.agregarInsumoProducto(productoId, {
        itemInventarioId: datos.itemInventarioId,
        cantidadPorUnidad: Number(datos.cantidadPorUnidad),
      });
      mostrarToast("Insumo agregado al BOM");
      setInsumoNuevo((prev) => ({ ...prev, [productoId]: { ...INSUMO_VACIO } }));
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleQuitarInsumo(insumoId) {
    try {
      await api.quitarInsumoProducto(insumoId);
      mostrarToast("Insumo quitado del BOM");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!productos) return <p>Cargando...</p>;

  return (
    <div>
      <h1>Productos Terminados — Catálogo Interno</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Cada producto define su BOM (materiales requeridos por unidad). Sin BOM, facturar ese
        producto no reserva ni consume inventario.
      </p>

      {productos.map((producto) => (
        <div key={producto.id} className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{producto.codigo}</strong> — {producto.nombre}
              {producto.categoria && <span style={{ color: "var(--text-muted)" }}> · {producto.categoria}</span>}
              {producto.precioReferencia != null && (
                <span style={{ color: "var(--text-muted)" }}> · ref. {producto.precioReferencia}</span>
              )}
            </div>
            <button type="button" onClick={() => setExpandido((e) => (e === producto.id ? null : producto.id))}>
              {expandido === producto.id ? "Ocultar BOM" : "Ver BOM"}
            </button>
          </div>

          {expandido === producto.id && (
            <div style={{ marginTop: "1rem" }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Cantidad por unidad</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {producto.insumos.map((insumo) => (
                    <tr key={insumo.id}>
                      <td>
                        {insumo.itemInventario.codigo} — {insumo.itemInventario.nombre}
                      </td>
                      <td>
                        {insumo.cantidadPorUnidad} {insumo.itemInventario.unidadMedida}
                      </td>
                      <td>
                        <button type="button" onClick={() => handleQuitarInsumo(insumo.id)}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {producto.insumos.length === 0 && (
                    <tr>
                      <td colSpan={3}>Sin insumos definidos todavía.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="item-row">
                <select
                  value={insumoNuevo[producto.id]?.itemInventarioId ?? ""}
                  onChange={(e) =>
                    setInsumoNuevo((prev) => ({
                      ...prev,
                      [producto.id]: { ...prev[producto.id], itemInventarioId: e.target.value },
                    }))
                  }
                >
                  <option value="">-- Ítem de inventario --</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.codigo} — {item.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.0001"
                  placeholder="Cantidad por unidad"
                  style={{ width: "10rem" }}
                  value={insumoNuevo[producto.id]?.cantidadPorUnidad ?? ""}
                  onChange={(e) =>
                    setInsumoNuevo((prev) => ({
                      ...prev,
                      [producto.id]: { ...prev[producto.id], cantidadPorUnidad: e.target.value },
                    }))
                  }
                />
                <button type="button" onClick={() => handleAgregarInsumo(producto.id)}>
                  + Agregar insumo
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {productos.length === 0 && <p>Sin productos todavía.</p>}

      <h2>Nuevo producto</h2>
      <form onSubmit={handleCrear} className="form" style={{ maxWidth: "28rem" }}>
        <div className="item-row">
          <input
            type="text"
            placeholder="Código"
            value={nuevo.codigo}
            onChange={(e) => setNuevo((p) => ({ ...p, codigo: e.target.value }))}
            required
          />
          <input
            type="text"
            placeholder="Nombre"
            value={nuevo.nombre}
            onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
            required
          />
        </div>
        <div className="item-row">
          <input
            type="text"
            placeholder="Categoría (opcional)"
            value={nuevo.categoria}
            onChange={(e) => setNuevo((p) => ({ ...p, categoria: e.target.value }))}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Precio de referencia (opcional)"
            value={nuevo.precioReferencia}
            onChange={(e) => setNuevo((p) => ({ ...p, precioReferencia: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? "Creando..." : "Crear producto"}
        </button>
      </form>
    </div>
  );
}
