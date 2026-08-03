import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

// Filtro rápido: RECIBIDA/EN_REVISION/CORRECCION_SOLICITADA es la "bandeja
// de entrada" que el equipo revisa a diario; el resto queda a un clic para
// consultar historial.
const FILTROS = [
  { valor: "", etiqueta: "Pendientes de revisión", estados: ["RECIBIDA", "EN_REVISION", "CORRECCION_SOLICITADA"] },
  { valor: "APROBADA", etiqueta: "Aprobadas" },
  { valor: "RECHAZADA", etiqueta: "Rechazadas" },
  { valor: "CONVERTIDA", etiqueta: "Convertidas" },
];

function totalEstimado(solicitud) {
  const total = solicitud.items.reduce((suma, item) => {
    if (item.precioUnitarioEstimado == null) return suma;
    return suma + Number(item.precioUnitarioEstimado) * item.cantidad;
  }, 0);
  const algunoACotizar = solicitud.items.some((i) => i.precioUnitarioEstimado == null);
  if (total === 0 && algunoACotizar) return "A cotizar";
  return `$${total.toFixed(2)}${algunoACotizar ? " + a cotizar" : ""}`;
}

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
    <div className="fade-in">
      <h1>Solicitudes del catálogo</h1>
      <p className="pagina-subtitulo" style={{ marginTop: "-0.5rem" }}>
        Pedidos armados por clientes en catalogo.panaprice.com, listos para revisar y convertir en Pedido.
      </p>
      <div className="acciones" style={{ marginBottom: "1rem" }}>
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
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {!loading && !error && (
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr>
                <th>N° orden</th>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th>Fecha</th>
                <th>Ítems</th>
                <th>Total estimado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/solicitudes/${s.id}`}>{s.numeroOrden || s.solId}</Link>
                  </td>
                  <td>{s.clienteNombre}</td>
                  <td>{s.clienteTelefono}</td>
                  <td>{new Date(s.creadoEn).toLocaleDateString()}</td>
                  <td>{s.items.reduce((n, i) => n + i.cantidad, 0)} u. ({s.items.length})</td>
                  <td>{totalEstimado(s)}</td>
                  <td>
                    <Badge>{s.estado}</Badge>
                  </td>
                </tr>
              ))}
              {solicitudes.length === 0 && (
                <tr>
                  <td colSpan={7}>No hay solicitudes en este filtro.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
