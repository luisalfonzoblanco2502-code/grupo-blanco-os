import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export function PedidosList() {
  const [pedidos, setPedidos] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPedidos()
      .then(setPedidos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Cargando...</p>;
  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Pedidos</h1>
        <Link to="/pedidos/nuevo" className="btn-primary">
          + Nuevo pedido
        </Link>
      </div>
      <table className="tabla">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Empresa</th>
            <th>Estado</th>
            <th>Órdenes</th>
            <th>Fecha compromiso</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/pedidos/${p.id}`}>{p.pedId}</Link>
              </td>
              <td>{p.clienteNombre}</td>
              <td>{p.empresa?.nombre}</td>
              <td>
                <Badge>{p.estado}</Badge>
              </td>
              <td>{p._count?.ordenesProduccion ?? 0}</td>
              <td>{new Date(p.fechaCompromiso).toLocaleDateString()}</td>
            </tr>
          ))}
          {pedidos.length === 0 && (
            <tr>
              <td colSpan={6}>No hay pedidos.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
