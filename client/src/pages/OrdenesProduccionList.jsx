import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export function OrdenesProduccionList() {
  const [ordenes, setOrdenes] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [prioridades, setPrioridades] = useState([]);
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [filtroPrioridad, setFiltroPrioridad] = useState("");
  const [soloMias, setSoloMias] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getEtapas().then(setEtapas).catch(() => {});
    api.getPrioridades().then(setPrioridades).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filtroEtapa) params.etapaId = filtroEtapa;
    if (filtroPrioridad) params.prioridadId = filtroPrioridad;
    if (soloMias) params.mias = "true";
    api
      .getOrdenesProduccion(params)
      .then(setOrdenes)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filtroEtapa, filtroPrioridad, soloMias]);

  return (
    <div>
      <h1>Órdenes de producción</h1>

      <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <label>
          Etapa:{" "}
          <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
            <option value="">Todas</option>
            {etapas.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad:{" "}
          <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
            <option value="">Todas</option>
            {prioridades.map((prioridad) => (
              <option key={prioridad.id} value={prioridad.id}>
                {prioridad.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={soloMias}
            onChange={(e) => setSoloMias(e.target.checked)}
          />{" "}
          Solo mis órdenes
        </label>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!loading && !error && (
        <table className="tabla">
          <thead>
            <tr>
              <th>OP</th>
              <th>Pedido</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Etapa</th>
              <th>Prioridad</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {ordenes.map((orden) => (
              <tr key={orden.id}>
                <td>
                  <Link to={`/ordenes/${orden.id}`}>{orden.opId}</Link>
                </td>
                <td>
                  <Link to={`/pedidos/${orden.pedido.id}`}>{orden.pedido.pedId}</Link>
                </td>
                <td>{orden.producto}</td>
                <td>{orden.cantidad}</td>
                <td>
                  <Badge>{orden.etapa.nombre}</Badge>
                </td>
                <td>
                  <Badge>{orden.prioridad.nombre}</Badge>
                </td>
                <td>{orden.responsableUsuario?.nombre ?? orden.responsableExterno ?? "—"}</td>
              </tr>
            ))}
            {ordenes.length === 0 && (
              <tr>
                <td colSpan={7}>No hay órdenes con ese filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
