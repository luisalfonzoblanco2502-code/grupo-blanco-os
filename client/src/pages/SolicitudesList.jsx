import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

// Filtro rápido: RECIBIDA/EN_REVISION es la "bandeja de entrada" que el
// equipo revisa a diario; el resto queda a un clic para consultar historial.
const FILTROS = [
  { valor: "", etiqueta: "Pendientes de revisión", estados: ["RECIBIDA", "EN_REVISION", "CORRECCION_SOLICITADA"] },
  { valor: "APROBADA", etiqueta: "Aprobadas" },
  { valor: "RECHAZADA", etiqueta: "Rechazadas" },
  { valor: "CONVERTIDA", etiqueta: "Convertidas" },
];

export function SolicitudesList() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [filtro, setFiltro] = useState(FILTROS[0]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const carga = filtro.valor
      ? api.getSolicitudes(filtro.valor)
      : Promise.all(filtro.estados.map((e) => api.getSolicitudes(e))).then((listas) => listas.flat());

    carga
      .then((data) => data.sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn)))
      .then(setSolicitudes)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filtro]);

  return (
    <div>
      <h1>Solicitudes del catálogo</h1>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {FILTROS.map((f) => (
          <button
            key={f.etiqueta}
            onClick={() => setFiltro(f)}
            className={f.etiqueta === filtro.etiqueta ? "btn-primary" : undefined}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!loading && !error && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Solicitud</th>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th>Ítems</th>
              <th>Estado</th>
              <th>Recibida</th>
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link to={`/solicitudes/${s.id}`}>{s.solId}</Link>
                </td>
                <td>{s.clienteNombre}</td>
                <td>{s.clienteTelefono}</td>
                <td>{s.items.reduce((n, i) => n + i.cantidad, 0)} u.</td>
                <td>
                  <Badge>{s.estado}</Badge>
                </td>
                <td>{new Date(s.creadoEn).toLocaleString()}</td>
              </tr>
            ))}
            {solicitudes.length === 0 && (
              <tr>
                <td colSpan={6}>No hay solicitudes en este filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
