import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { FacturarPedido } from "../components/FacturarPedido";

const ESTADOS_EDITABLES = ["BORRADOR", "PENDIENTE"];
const ESTADOS_CANCELABLES = ["BORRADOR", "PENDIENTE"];

export function PedidoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  function recargar() {
    return api.getPedido(id).then(setPedido).catch((err) => setError(err.message));
  }

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleCancelar() {
    if (!confirm(`¿Cancelar el pedido ${pedido.pedId}? Esta acción no se puede deshacer.`)) return;
    setCancelando(true);
    try {
      await api.cancelarPedido(id);
      navigate("/pedidos");
    } catch (err) {
      setError(err.message);
      setCancelando(false);
    }
  }

  async function handleCambiarEstado(estadoNuevo) {
    setCambiandoEstado(true);
    try {
      await api.cambiarEstadoPedido(id, estadoNuevo);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoEstado(false);
    }
  }

  if (error && !pedido) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!pedido) return <p>Cargando...</p>;

  const puedeEditar = ESTADOS_EDITABLES.includes(pedido.estado);
  const puedeCancelar = ESTADOS_CANCELABLES.includes(pedido.estado);

  return (
    <div>
      <p>
        <Link to="/pedidos">&larr; Volver a pedidos</Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h1>{pedido.pedId}</h1>
          <Badge>{pedido.estado}</Badge>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {puedeEditar && <Link to={`/pedidos/${id}/editar`}>Editar</Link>}
          {puedeCancelar && (
            <button onClick={handleCancelar} disabled={cancelando} className="btn-danger">
              {cancelando ? "Cancelando..." : "Cancelar pedido"}
            </button>
          )}
          {pedido.estado === "LISTO" && (
            <button onClick={() => handleCambiarEstado("DESPACHADO")} disabled={cambiandoEstado}>
              Marcar como despachado
            </button>
          )}
          {pedido.estado === "ENTREGADO" && (
            <button onClick={() => handleCambiarEstado("CERRADO")} disabled={cambiandoEstado}>
              Cerrar pedido
            </button>
          )}
        </div>
      </div>
      <p>
        <strong>Cliente:</strong> {pedido.clienteNombre}
        <br />
        <strong>Empresa:</strong> {pedido.empresa?.nombre}
        <br />
        <strong>Creado por:</strong> {pedido.creadoPor?.nombre ?? "—"}
        <br />
        <strong>Fecha de ingreso:</strong> {new Date(pedido.fechaIngreso).toLocaleDateString()}
        <br />
        <strong>Fecha de compromiso:</strong>{" "}
        {new Date(pedido.fechaCompromiso).toLocaleDateString()}
        <br />
        <strong>Cantidad total:</strong> {pedido.cantidadTotal}
        {pedido.observaciones && (
          <>
            <br />
            <strong>Observaciones:</strong> {pedido.observaciones}
          </>
        )}
      </p>

      <h2>Órdenes de producción</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>OP</th>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Etapa</th>
            <th>Prioridad</th>
          </tr>
        </thead>
        <tbody>
          {pedido.ordenesProduccion.map((orden) => (
            <tr key={orden.id}>
              <td>
                <Link to={`/ordenes/${orden.id}`}>{orden.opId}</Link>
              </td>
              <td>{orden.producto}</td>
              <td>{orden.cantidad}</td>
              <td>
                <Badge>{orden.etapa.nombre}</Badge>
              </td>
              <td>
                <Badge>{orden.prioridad.nombre}</Badge>
              </td>
            </tr>
          ))}
          {pedido.ordenesProduccion.length === 0 && (
            <tr>
              <td colSpan={5}>Este pedido no tiene órdenes de producción todavía.</td>
            </tr>
          )}
        </tbody>
      </table>

      {pedido.estado === "PENDIENTE" && (
        <>
          <h2>Facturar pedido</h2>
          <p style={{ color: "var(--text-muted)" }}>
            Define las líneas de producción reales de este pedido. Al facturar se crean las
            Órdenes de Producción correspondientes y ya no se puede volver atrás.
          </p>
          <FacturarPedido pedidoId={id} onFacturado={recargar} />
        </>
      )}

      {error && <p style={{ color: "#f87171" }}>{error}</p>}
    </div>
  );
}
