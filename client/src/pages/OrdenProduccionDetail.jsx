import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";

export function OrdenProduccionDetail() {
  const { id } = useParams();
  const [orden, setOrden] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [error, setError] = useState(null);
  const [avanzando, setAvanzando] = useState(false);

  function recargar() {
    return api.getOrdenProduccion(id).then(setOrden).catch((err) => setError(err.message));
  }

  useEffect(() => {
    recargar();
    api.getEtapas().then(setEtapas).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAvanzar(siguienteEtapa) {
    setError(null);
    setAvanzando(true);
    try {
      await api.cambiarEtapaOrden(id, siguienteEtapa.id);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAvanzando(false);
    }
  }

  if (error && !orden) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!orden) return <p>Cargando...</p>;

  const siguienteEtapa = etapas.find((e) => e.orden === orden.etapa.orden + 1);

  return (
    <div>
      <p>
        <Link to="/ordenes">&larr; Volver a órdenes de producción</Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>{orden.opId}</h1>
        <Badge>{orden.etapa.nombre}</Badge>
      </div>

      <p>
        <strong>Pedido:</strong> <Link to={`/pedidos/${orden.pedido.id}`}>{orden.pedido.pedId}</Link>{" "}
        ({orden.pedido.clienteNombre})
        <br />
        <strong>Empresa:</strong> {orden.empresa?.nombre}
        <br />
        <strong>Producto:</strong> {orden.producto}
        {orden.tipoTrabajo && <> — {orden.tipoTrabajo}</>}
        {orden.medida && <> ({orden.medida})</>}
        <br />
        <strong>Cantidad:</strong> {orden.cantidad}
        <br />
        <strong>Prioridad:</strong> <Badge>{orden.prioridad.nombre}</Badge>
        <br />
        <strong>Responsable:</strong>{" "}
        {orden.responsableUsuario?.nombre ?? orden.responsableExterno ?? "—"}
        {orden.fechaEntregaReal && (
          <>
            <br />
            <strong>Fecha de entrega real:</strong>{" "}
            {new Date(orden.fechaEntregaReal).toLocaleDateString()}
          </>
        )}
        {orden.observaciones && (
          <>
            <br />
            <strong>Observaciones:</strong> {orden.observaciones}
          </>
        )}
      </p>

      <h2>Avanzar etapa</h2>
      {siguienteEtapa ? (
        <button onClick={() => handleAvanzar(siguienteEtapa)} disabled={avanzando} className="btn-primary">
          {avanzando ? "Avanzando..." : `Avanzar a: ${siguienteEtapa.nombre}`}
        </button>
      ) : (
        <p>Esta orden ya llegó a la etapa final del pipeline.</p>
      )}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      <h2>Tiempo por etapa</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Desde</th>
            <th>Hasta</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          {orden.tiemposPorEtapa.map((tramo, i) => (
            <tr key={i}>
              <td>{tramo.etapa}</td>
              <td>{new Date(tramo.desde).toLocaleString()}</td>
              <td>{tramo.hasta ? new Date(tramo.hasta).toLocaleString() : "En curso"}</td>
              <td>
                {tramo.duracionMinutos < 60
                  ? `${tramo.duracionMinutos} min`
                  : `${(tramo.duracionMinutos / 60).toFixed(1)} h`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Bitácora</h2>
      <ul>
        {orden.bitacoraEventos.map((evento) => (
          <li key={evento.id}>
            {new Date(evento.ocurridoEn).toLocaleString()} — {evento.usuario?.nombre ?? "Sistema"}:{" "}
            {evento.campoAfectado ?? evento.tipoEvento}
            {evento.valorAnterior || evento.valorNuevo
              ? ` (${evento.valorAnterior ?? "—"} → ${evento.valorNuevo ?? "—"})`
              : ""}
          </li>
        ))}
        {orden.bitacoraEventos.length === 0 && <li>Sin eventos registrados.</li>}
      </ul>
    </div>
  );
}
