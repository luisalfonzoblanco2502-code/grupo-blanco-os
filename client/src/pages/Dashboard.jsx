import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getDashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!data) return <p>Cargando...</p>;

  return (
    <div>
      <h1>Dashboard</h1>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="card">
          <div className="card-valor">{data.pedidosActivos}</div>
          <div className="card-label">Pedidos activos</div>
        </div>
        <div className="card">
          <div className="card-valor">{data.ordenesActivas}</div>
          <div className="card-label">Órdenes de producción activas</div>
        </div>
      </div>

      <h2>Órdenes por etapa</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {data.ordenesPorEtapa.map((e) => (
            <tr key={e.etapaId}>
              <td>{e.etapa}</td>
              <td>{e.cantidad}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Órdenes por situación</h2>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {Object.entries(data.ordenesPorSituacion).map(([situacion, cantidad]) => (
          <Badge key={situacion}>{`${situacion}: ${cantidad}`}</Badge>
        ))}
      </div>
    </div>
  );
}
