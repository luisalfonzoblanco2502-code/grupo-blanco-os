import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export function ProductosList() {
  const [productos, setProductos] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);

  function recargar() {
    return api.getProductos().then(setProductos).catch((err) => setError(err.message));
  }

  useEffect(() => {
    recargar().finally(() => setLoading(false));
  }, []);

  async function alternarPublicado(producto) {
    setProcesandoId(producto.id);
    try {
      await api.updateProducto(producto.id, { publicadoCatalogo: !producto.publicadoCatalogo });
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function alternarDisponible(producto) {
    setProcesandoId(producto.id);
    try {
      await api.updateProducto(producto.id, { disponible: !producto.disponible });
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  async function eliminar(producto) {
    if (!confirm(`¿Eliminar "${producto.nombre}"? Deja de verse en todos lados, no se puede deshacer.`)) return;
    setProcesandoId(producto.id);
    try {
      await api.eliminarProducto(producto.id);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesandoId(null);
    }
  }

  if (loading) return <p>Cargando...</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Productos</h1>
        <Link to="/productos/nuevo" className="btn-primary">
          + Agregar producto
        </Link>
      </div>
      <p style={{ color: "var(--text-muted)" }}>
        Los cambios de acá se reflejan en el catálogo público al instante, sin volver a desplegar nada.
      </p>
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <table className="tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Foto</th>
            <th>Nombre</th>
            <th>Personalizable</th>
            <th>Precio base</th>
            <th>Categoría</th>
            <th>Catálogo</th>
            <th>Disponibilidad</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td>{p.codigo}</td>
              <td>
                {p.imagenReferenciaProduccionUrl ? (
                  <img
                    src={p.imagenReferenciaProduccionUrl}
                    alt=""
                    style={{ width: "2.5rem", height: "2.5rem", objectFit: "cover", borderRadius: "6px" }}
                  />
                ) : (
                  <span aria-hidden="true" style={{ fontSize: "1.25rem" }}>
                    📦
                  </span>
                )}
              </td>
              <td>{p.nombre}</td>
              <td style={{ textAlign: "center" }}>{p.requierePersonalizacion ? "✓" : "—"}</td>
              <td>${Number(p.precioBase).toFixed(2)}</td>
              <td>
                <Badge>{p.categoria}</Badge>
              </td>
              <td>{p.publicadoCatalogo ? "Publicado" : "Oculto"}</td>
              <td>{p.disponible ? "Disponible" : "Agotado"}</td>
              <td style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <Link to={`/productos/${p.id}/editar`}>Editar</Link>
                <button onClick={() => alternarPublicado(p)} disabled={procesandoId === p.id}>
                  {p.publicadoCatalogo ? "Ocultar" : "Publicar"}
                </button>
                <button onClick={() => alternarDisponible(p)} disabled={procesandoId === p.id}>
                  {p.disponible ? "Marcar agotado" : "Marcar disponible"}
                </button>
                <button onClick={() => eliminar(p)} disabled={procesandoId === p.id} className="btn-danger">
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {productos.length === 0 && (
            <tr>
              <td colSpan={9}>No hay productos todavía.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
