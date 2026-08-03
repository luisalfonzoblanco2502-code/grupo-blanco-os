import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { AlertaError } from "../components/AlertaError";

const ESTADOS_PENDIENTES = ["RECIBIDA", "EN_REVISION", "CORRECCION_SOLICITADA"];

export function SolicitudDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [solicitud, setSolicitud] = useState(null);
  const [error, setError] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
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
      setMostrarRechazo(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(false);
    }
  }

  // "Aprobar y convertir a Pedido" (2026-08-02): un solo clic — el backend
  // aprueba (si todavía no lo estaba) y crea el Pedido en la misma llamada.
  async function convertir(e) {
    e.preventDefault();
    if (!fechaCompromiso) {
      setError("Elegí una fecha de compromiso antes de convertir");
      return;
    }
    setError(null);
    setProcesando(true);
    try {
      const { pedido } = await api.convertirSolicitud(id, { fechaCompromiso });
      navigate(`/pedidos/${pedido.id}`);
    } catch (err) {
      setError(err.message);
      setProcesando(false);
    }
  }

  if (error && !solicitud) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!solicitud) {
    return (
      <div className="fade-in">
        <p>Cargando...</p>
      </div>
    );
  }

  const { estado } = solicitud;
  const puedeAprobarOConvertir = ESTADOS_PENDIENTES.includes(estado);
  const puedeConvertir = puedeAprobarOConvertir || estado === "APROBADA";

  return (
    <div className="fade-in">
      <p style={{ marginTop: 0 }}>
        <Link to="/solicitudes">&larr; Volver a solicitudes</Link>
      </p>
      <div className="pagina-titulo">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h1 style={{ margin: 0 }}>{solicitud.numeroOrden || solicitud.solId}</h1>
          <Badge>{estado}</Badge>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <div className="panel-titulo">Datos del cliente</div>
        <div className="op-grid">
          <div className="op-campo">
            <span className="op-campo-label">Cliente</span>
            <span className="op-campo-valor">{solicitud.clienteNombre}</span>
          </div>
          <div className="op-campo">
            <span className="op-campo-label">Teléfono</span>
            <span className="op-campo-valor">{solicitud.clienteTelefono}</span>
          </div>
          {solicitud.clienteEmail && (
            <div className="op-campo">
              <span className="op-campo-label">Email</span>
              <span className="op-campo-valor">{solicitud.clienteEmail}</span>
            </div>
          )}
          <div className="op-campo">
            <span className="op-campo-label">Tipo de entrega</span>
            <span className="op-campo-valor">
              {solicitud.tipoEntrega === "ENVIO" ? "Envío" : solicitud.tipoEntrega === "RETIRO" ? "Retiro" : "—"}
              {solicitud.agenciaEnvio ? ` (${solicitud.agenciaEnvio})` : ""}
            </span>
          </div>
          <div className="op-campo">
            <span className="op-campo-label">Recibida</span>
            <span className="op-campo-valor">{new Date(solicitud.creadoEn).toLocaleString()}</span>
          </div>
          {solicitud.pedido && (
            <div className="op-campo">
              <span className="op-campo-label">Pedido generado</span>
              <span className="op-campo-valor">
                <Link to={`/pedidos/${solicitud.pedido.id}`}>{solicitud.pedido.pedId}</Link>
              </span>
            </div>
          )}
        </div>
        {solicitud.notasPersonalizacion && (
          <p style={{ marginBottom: 0, marginTop: "0.75rem" }}>
            <strong>Notas:</strong> {solicitud.notasPersonalizacion}
          </p>
        )}
        {solicitud.motivoRechazo && (
          <p style={{ marginBottom: 0, marginTop: "0.75rem", color: "var(--danger)" }}>
            <strong>Motivo de rechazo:</strong> {solicitud.motivoRechazo}
          </p>
        )}
      </div>

      <h2>Ítems solicitados</h2>
      <div className="tabla-envoltorio">
        <table className="tabla">
          <thead>
            <tr>
              <th>Foto</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio unit. estimado</th>
              <th>Notas / observaciones</th>
            </tr>
          </thead>
          <tbody>
            {solicitud.items.map((item) => {
              const foto = item.disenoFotoUrl || item.producto?.imagenUrl;
              return (
                <tr key={item.id}>
                  <td>
                    {foto ? (
                      <img src={foto} alt="" style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "6px" }} />
                    ) : (
                      <div style={{ width: "40px", height: "40px", borderRadius: "6px", background: "var(--surface-sunken)" }} />
                    )}
                  </td>
                  <td>
                    {item.producto?.nombre || item.productoNombrePersonalizado}
                    {!item.productoId && (
                      <span className="badge-suave" style={{ marginLeft: "0.4rem" }}>
                        Personalizado
                      </span>
                    )}
                  </td>
                  <td>{item.cantidad}</td>
                  <td>{item.precioUnitarioEstimado ? `$${Number(item.precioUnitarioEstimado).toFixed(2)}` : "A cotizar"}</td>
                  <td>{item.disenoNotas || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertaError>{error}</AlertaError>

      {puedeAprobarOConvertir && (
        <div className="panel" style={{ marginTop: "1.5rem" }}>
          <div className="panel-titulo">¿Qué hacemos con esta solicitud?</div>
          <div className="acciones" style={{ marginBottom: mostrarRechazo ? "0.75rem" : 0 }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => cambiarEstado("APROBADA")}
              disabled={procesando}
              title="Aprueba sin crear el Pedido todavía"
            >
              Solo aprobar
            </button>
            <button
              type="button"
              onClick={() => setMostrarRechazo((v) => !v)}
              disabled={procesando}
            >
              Descartar solicitud
            </button>
          </div>
          {mostrarRechazo && (
            <div className="item-row">
              <input
                type="text"
                placeholder="Motivo (ej. spam, duplicado, cliente se arrepintió)"
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
              />
              <button
                type="button"
                className="btn-danger"
                onClick={() => cambiarEstado("RECHAZADA", { motivoRechazo })}
                disabled={procesando || !motivoRechazo.trim()}
              >
                Confirmar descarte
              </button>
            </div>
          )}
        </div>
      )}

      {puedeConvertir && (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <div className="panel-titulo">Convertir a Pedido</div>
          <p style={{ color: "var(--text-muted)" }}>
            Crea el Pedido en el ERP con estos datos — cliente (buscado por teléfono o creado si es nuevo), ítems y
            entrega ya cargados, listo para revisar/facturar. Confirmá precio final y fecha con el cliente por
            WhatsApp antes de este paso si hace falta.
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
              {procesando && <Spinner />}
              {procesando ? "Convirtiendo..." : "Aprobar y convertir a Pedido"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
