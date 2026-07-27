import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export function ProductosList() {
  const [productos, setProductos] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getProductos()
      .then(setProductos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Cargando...</p>;
  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Productos</h1>
        <Link to="/productos/nuevo" className="btn-primary">
          + Nuevo producto
        </Link>
      </div>
      <p style={{ color: "var(--text-muted)" }}>
        Solo los productos <Badge>activo</Badge> y publicados en catálogo aparecen en
        catalogo.panaprice.com.
      </p>
      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Categoría</th>
            <th>Precio base</th>
            <th>Estado</th>
            <th>Catálogo</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td>{p.nombre}</td>
              <td>
                <Badge>{p.categoria}</Badge>
              </td>
              <td>${Number(p.precioBase).toFixed(2)}</td>
              <td>{p.activo ? "Activo" : "Inactivo"}</td>
              <td>{p.publicadoCatalogo ? "Publicado" : "Oculto"}</td>
            </tr>
          ))}
          {productos.length === 0 && (
            <tr>
              <td colSpan={5}>No hay productos todavía.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
