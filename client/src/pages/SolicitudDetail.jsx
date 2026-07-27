import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export function SolicitudDetail() {
  const { id } = useParams();
  const [solicitud, setSolicitud] = useState(null);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [fechaCompromiso, setFechaCompromiso] = useState("");

  function recargar() {
    return api.getSolicitud(id).then(setSolicitud).catch((err) => setError(err.message));
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cambiarEstado(estadoNuevo, extra = {}) {
    setError(null);
    setProcesando(true);
    try {
      await api.cambiarEstadoSolicitud(id, { estadoNuevo, ...extra });
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  async function convertir(e) {
    e.preventDefault();
    setError(null);
    setProcesando(true);
    try {
      const { pedido } = await api.convertirSolicitud(id, { fechaCompromiso });
      await recargar();
      alert(`Pedido ${pedido.pedId} creado. Ya podés seguirlo desde Pedidos.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  if (error && !solicitud) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!solicitud) return <p>Cargando...</p>;

  const { estado } = solicitud;

  return (
    <div>
      <p>
        <Link to="/solicitudes">&larr; Volver a solicitudes</Link>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <h1>{solicitud.solId}</h1>
        <Badge>{estado}</Badge>
      </div>

      <p>
        <strong>Cliente:</strong> {solicitud.clienteNombre}
        <br />
        <strong>Teléfono:</strong> {solicitud.clienteTelefono}
        <br />
        {solicitud.clienteEmail && (
          <>
            <strong>Email:</strong> {solicitud.clienteEmail}
            <br />
          </>
        )}
        {solicitud.notasPersonalizacion && (
          <>
            <strong>Personalización:</strong> {solicitud.notasPersonalizacion}
            <br />
          </>
        )}
        <strong>Recibida:</strong> {new Date(solicitud.creadoEn).toLocaleString()}
        {solicitud.motivoRechazo && (
          <>
            <br />
            <strong>Motivo de rechazo:</strong> {solicitud.motivoRechazo}
          </>
        )}
        {solicitud.pedido && (
          <>
            <br />
            <strong>Pedido generado:</strong> <Link to={`/pedidos/${solicitud.pedido.id}`}>{solicitud.pedido.pedId}</Link>
          </>
        )}
      </p>

      <h2>Productos solicitados</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Precio unit. estimado</th>
            <th>Notas de diseño</th>
          </tr>
        </thead>
        <tbody>
          {solicitud.items.map((item) => (
            <tr key={item.id}>
              <td>{item.producto.nombre}</td>
              <td>{item.cantidad}</td>
              <td>{item.precioUnitarioEstimado ? `$${Number(item.precioUnitarioEstimado).toFixed(2)}` : "—"}</td>
              <td>{item.disenoNotas || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {["RECIBIDA", "EN_REVISION", "CORRECCION_SOLICITADA"].includes(estado) && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
          {estado === "RECIBIDA" && (
            <button onClick={() => cambiarEstado("EN_REVISION")} disabled={procesando}>
              Poner en revisión
            </button>
          )}
          <button onClick={() => cambiarEstado("APROBADA")} disabled={procesando} className="btn-primary">
            Aprobar
          </button>
          <button
            onClick={() => cambiarEstado("CORRECCION_SOLICITADA")}
            disabled={procesando}
          >
            Pedir corrección al cliente
          </button>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="text"
              placeholder="Motivo de rechazo"
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
            />
            <button
              onClick={() => cambiarEstado("RECHAZADA", { motivoRechazo })}
              disabled={procesando || !motivoRechazo.trim()}
              className="btn-danger"
            >
              Rechazar
            </button>
          </div>
        </div>
      )}

      {estado === "APROBADA" && (
        <>
          <h2>Convertir en pedido formal</h2>
          <p style={{ color: "var(--text-muted)" }}>
            Crea el Pedido en el ERP con estos datos. Desde ahí seguís el flujo normal
            (facturar → órdenes de producción). Confirmá la fecha y precio final con el
            cliente por WhatsApp antes de este paso.
          </p>
          <form onSubmit={convertir} className="form" style={{ maxWidth: "20rem" }}>
            <label>
              Fecha de compromiso
              <input
                type="date"
                value={fechaCompromiso}
                onChange={(e) => setFechaCompromiso(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn-primary" disabled={procesando}>
              {procesando ? "Convirtiendo..." : "Convertir a pedido"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
