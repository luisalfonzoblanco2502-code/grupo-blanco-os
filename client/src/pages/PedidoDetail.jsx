import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { FacturarPedido } from "../components/FacturarPedido";
import { RegistrarPago } from "../components/RegistrarPago";
import { PedidoLineasEditor } from "../components/PedidoLineasEditor";
import { SkeletonPanel } from "../components/Skeleton";
import { Spinner } from "../components/Spinner";
import { AlertaError } from "../components/AlertaError";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastContext";

const ESTADOS_EDITABLES = ["BORRADOR", "PENDIENTE"];
const ESTADOS_CANCELABLES = ["BORRADOR", "PENDIENTE"];

function Campo({ label, valor }) {
  return (
    <div className="op-campo">
      <span className="op-campo-label">{label}</span>
      <span className="op-campo-valor">{valor ?? "—"}</span>
    </div>
  );
}

export function PedidoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const permisos = perfil?.rol?.permisos || {};
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
      mostrarToast(`Pedido ${pedido.pedId} cancelado`);
      navigate("/pedidos/lista");
    } catch (err) {
      setError(err.message);
      setCancelando(false);
    }
  }

  async function handleCambiarEstado(estadoNuevo, confirmacion) {
    if (confirmacion && !confirm(confirmacion)) return;
    setCambiandoEstado(true);
    try {
      await api.cambiarEstadoPedido(id, estadoNuevo);
      mostrarToast(`Pedido ${pedido.pedId} actualizado a ${estadoNuevo}`);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoEstado(false);
    }
  }

  if (error && !pedido) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!pedido) {
    return (
      <div className="fade-in">
        <SkeletonPanel lineas={2} />
        <div style={{ marginTop: "1rem" }}>
          <SkeletonPanel lineas={3} />
        </div>
      </div>
    );
  }

  const puedeEditar = permisos.editar_pedido && ESTADOS_EDITABLES.includes(pedido.estado);
  const puedeCancelar = permisos.eliminar_pedido && ESTADOS_CANCELABLES.includes(pedido.estado);
  const puedeFacturar = !!permisos.facturar_pedido;
  const puedeCambiarEstado = !!permisos.facturar_pedido;
  const puedeImprimir = !!permisos.imprimir_orden;

  return (
    <div className="fade-in">
      <p style={{ marginTop: 0 }}>
        <Link to="/pedidos/lista">&larr; Volver a pedidos</Link>
      </p>
      <div className="pagina-titulo">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h1 style={{ margin: 0 }}>{pedido.pedId}</h1>
          <Badge>{pedido.estado}</Badge>
        </div>
        <div className="acciones">
          {puedeImprimir && (
            <Link to={`/pedidos/${id}/imprimir`} className="btn-secundario">
              🖨 Imprimir pedido completo
            </Link>
          )}
          {puedeEditar && (
            <Link to={`/pedidos/${id}/editar`} className="btn-secundario">
              ✎ Editar
            </Link>
          )}
          {puedeCancelar && (
            <button onClick={handleCancelar} disabled={cancelando} className="btn-danger">
              {cancelando && <Spinner />}
              {cancelando ? "Cancelando..." : "Cancelar pedido"}
            </button>
          )}
          {puedeCambiarEstado && pedido.estado === "LISTO" && (
            <button
              onClick={() =>
                handleCambiarEstado("DESPACHADO", `¿Marcar el pedido ${pedido.pedId} como despachado?`)
              }
              disabled={cambiandoEstado}
            >
              Marcar como despachado
            </button>
          )}
          {puedeCambiarEstado && pedido.estado === "ENTREGADO" && (
            <button
              onClick={() =>
                handleCambiarEstado("CERRADO", `¿Cerrar el pedido ${pedido.pedId}? Esta acción no se puede deshacer.`)
              }
              disabled={cambiandoEstado}
            >
              Cerrar pedido
            </button>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1rem" }}>
        <div className="op-grid">
          <Campo label="Cliente" valor={pedido.clienteNombre} />
          <Campo label="Empresa" valor={pedido.empresa?.nombre} />
          <Campo label="Creado por" valor={pedido.creadoPor?.nombre} />
          <Campo label="Fecha de ingreso" valor={new Date(pedido.fechaIngreso).toLocaleDateString()} />
          <Campo label="Fecha de compromiso" valor={new Date(pedido.fechaCompromiso).toLocaleDateString()} />
          <Campo label="Cantidad total" valor={pedido.cantidadTotal} />
        </div>
        {pedido.observaciones && (
          <p style={{ marginBottom: 0, marginTop: "1rem" }}>
            <strong>Observaciones:</strong> {pedido.observaciones}
          </p>
        )}
      </div>

      {pedido.ordenesProduccion.length > 0 && (
        <>
          <h2>Órdenes de producción</h2>
          <div className="tabla-envoltorio">
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
                      <Link to={`/produccion/ordenes/${orden.id}`}>{orden.opId}</Link>
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
              </tbody>
            </table>
          </div>
        </>
      )}

      {puedeEditar && (
        <div style={{ marginTop: "1.5rem" }}>
          <PedidoLineasEditor pedidoId={id} onCambio={recargar} />
        </div>
      )}

      {pedido.documentoVenta && (
        <RegistrarPago
          documento={pedido.documentoVenta}
          onPagoRegistrado={async () => {
            mostrarToast("Pago registrado correctamente");
            await recargar();
          }}
        />
      )}

      {puedeFacturar && pedido.estado === "PENDIENTE" && (
        <div style={{ marginTop: "1.5rem" }}>
          <h2>Facturar pedido</h2>
          <p className="pagina-subtitulo" style={{ marginTop: "-0.5rem" }}>
            Revisa las líneas ya capturadas y asigna responsable. Al facturar se crean las Órdenes de
            Producción y no se puede volver atrás.
          </p>
          <FacturarPedido
            pedidoId={id}
            pedidoPrioridadNombre={pedido.prioridad?.nombre}
            onFacturado={async () => {
              mostrarToast(`Pedido ${pedido.pedId} facturado correctamente`);
              await recargar();
            }}
          />
        </div>
      )}

      <AlertaError>{error}</AlertaError>
    </div>
  );
}
