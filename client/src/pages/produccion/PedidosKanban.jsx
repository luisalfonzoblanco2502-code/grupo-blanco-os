import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/Badge";
import { SituacionBadge } from "../../components/SituacionBadge";
import { Avatar } from "../../components/Avatar";
import { SkeletonKanban } from "../../components/Skeleton";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastContext";

// Kanban de Producción POR PEDIDO (refactor crítico, 2026-08-01) — una
// tarjeta por PEDIDO, no por Orden de Producción individual. Un pedido
// facturado con varios productos/telas distintos puede generar varias OPs
// (ver "OP agrupada por lote", ordenesProduccion.service.js) — antes cada
// una era su propia tarjeta; con 2000 items de 10 clientes eso era
// literalmente inutilizable. Acá "Avanzar" mueve TODAS las OPs del pedido
// juntas, con el mismo responsable (decisión explícita: se pierde la
// posibilidad de asignar productos distintos del mismo pedido a
// responsables distintos — ver nota en avanzarPedido()).
export function PedidosKanban() {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const puedeAvanzar = !!perfil?.rol?.permisos?.cambiar_etapa;

  const [etapas, setEtapas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { pedido, etapaDestino }
  const [tipoResponsable, setTipoResponsable] = useState("interno");
  const [responsableUsuarioId, setResponsableUsuarioId] = useState("");
  const [responsableExterno, setResponsableExterno] = useState("");
  const [enviando, setEnviando] = useState(false);

  function cargar() {
    setLoading(true);
    return Promise.all([api.getPedidosKanban(), api.getUsuarios()])
      .then(([kanban, usuariosRes]) => {
        setEtapas(kanban.etapas);
        setPedidos(kanban.pedidos);
        setUsuarios(usuariosRes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  const columnas = useMemo(
    () => etapas.map((etapa) => ({ etapa, pedidos: pedidos.filter((p) => p.etapaId === etapa.id) })),
    [etapas, pedidos]
  );

  function abrirModal(pedido) {
    const etapaDestino = etapas.find((e) => e.orden === pedido.etapaOrden + 1);
    if (!etapaDestino) return;
    if (pedido.divergente) {
      mostrarToast(
        `${pedido.pedId} tiene órdenes en etapas distintas — reconciliálas desde /produccion/ordenes antes de avanzar el pedido completo`
      );
      return;
    }
    setModal({ pedido, etapaDestino });
    setTipoResponsable("interno");
    setResponsableUsuarioId("");
    setResponsableExterno("");
  }

  async function confirmarAvance() {
    setEnviando(true);
    setError(null);
    try {
      await api.avanzarPedido(modal.pedido.pedidoId, {
        etapaId: modal.etapaDestino.id,
        responsableUsuarioId: tipoResponsable === "interno" ? responsableUsuarioId : undefined,
        responsableExterno: tipoResponsable === "externo" ? responsableExterno : undefined,
      });
      mostrarToast(`${modal.pedido.pedId} avanzó a ${modal.etapaDestino.nombre}`);
      setModal(null);
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (error && !modal) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div className="fade-in">
      <div className="pagina-titulo">
        <h1>Kanban de producción</h1>
        <Link to="/produccion/ordenes" className="btn-secundario">
          ☰ Ver por item (detalle)
        </Link>
      </div>
      <p className="pagina-subtitulo">
        Una tarjeta por pedido — todos sus items viajan juntos. Clic en la tarjeta para ver el detalle completo.
      </p>

      {loading && <SkeletonKanban columnas={5} />}

      {!loading && (
        <div className="kanban-board">
          {columnas.map(({ etapa, pedidos: pedidosCol }) => (
            <div key={etapa.id} className="kanban-columna">
              <div className="kanban-columna-header">
                <span>{etapa.nombre}</span>
                <span className="kanban-columna-contador">{pedidosCol.length}</span>
              </div>
              <div className="kanban-columna-body">
                {pedidosCol.map((pedido) => (
                  <div key={pedido.pedidoId} className="kanban-tarjeta">
                    <Link
                      to={`/pedidos/${pedido.pedidoId}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <div style={{ color: "var(--text-faint)", fontSize: "0.72rem", fontWeight: 700 }}>
                        {pedido.pedId}
                      </div>
                      <div className="kanban-tarjeta-titulo">{pedido.clienteNombre}</div>
                      <div className="kanban-tarjeta-meta">
                        {pedido.itemsCount} item{pedido.itemsCount === 1 ? "" : "s"}
                      </div>
                    </Link>
                    <div className="kanban-tarjeta-pie">
                      {pedido.prioridad && <Badge>{pedido.prioridad}</Badge>}
                      <SituacionBadge situacion={pedido.situacion} />
                      {pedido.divergente && (
                        <span title="Las órdenes de este pedido están en etapas distintas" style={{ color: "var(--warning, #b45309)" }}>
                          ⚠️
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.5rem" }}>
                      <Avatar nombre={pedido.responsable} conNombre tamano={1.4} cargo={pedido.rolResponsable} />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-faint)" }}>
                        {new Date(pedido.fechaCompromiso).toLocaleDateString()}
                      </span>
                    </div>
                    {puedeAvanzar && etapas.some((e) => e.orden === pedido.etapaOrden + 1) && (
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        style={{ width: "100%", marginTop: "0.6rem" }}
                        onClick={() => abrirModal(pedido)}
                      >
                        Avanzar →
                      </button>
                    )}
                  </div>
                ))}
                {pedidosCol.length === 0 && (
                  <div style={{ color: "var(--text-faint)", fontSize: "0.78rem", textAlign: "center", padding: "1.5rem 0" }}>
                    <div style={{ fontSize: "1.3rem", marginBottom: "0.2rem", opacity: 0.6 }}>🗂️</div>
                    Sin pedidos acá
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-fondo" onClick={() => !enviando && setModal(null)}>
          <div className="modal-contenido" onClick={(e) => e.stopPropagation()}>
            <h2>
              ¿A quién va {modal.pedido.pedId} a "{modal.etapaDestino.nombre}"?
            </h2>
            <p className="pagina-subtitulo">
              {modal.pedido.clienteNombre} · {modal.pedido.itemsCount} item{modal.pedido.itemsCount === 1 ? "" : "s"} — todos
              se mueven juntos.
            </p>
            <div className="form" style={{ gap: "0.6rem" }}>
              <div className="item-row">
                <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", margin: 0 }}>
                  <input
                    type="radio"
                    checked={tipoResponsable === "interno"}
                    onChange={() => setTipoResponsable("interno")}
                  />
                  Usuario del sistema
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", margin: 0 }}>
                  <input
                    type="radio"
                    checked={tipoResponsable === "externo"}
                    onChange={() => setTipoResponsable("externo")}
                  />
                  Externo
                </label>
              </div>
              {tipoResponsable === "interno" ? (
                <select value={responsableUsuarioId} onChange={(e) => setResponsableUsuarioId(e.target.value)} required>
                  <option value="">-- Elegir responsable --</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                      {u.puesto?.nombre ? ` (${u.puesto.nombre})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Nombre del responsable externo"
                  value={responsableExterno}
                  onChange={(e) => setResponsableExterno(e.target.value)}
                />
              )}
              <AlertaErrorLocal>{error}</AlertaErrorLocal>
              <div className="acciones">
                <button type="button" onClick={() => setModal(null)} disabled={enviando}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={confirmarAvance}
                  disabled={enviando || (tipoResponsable === "interno" ? !responsableUsuarioId : !responsableExterno.trim())}
                >
                  {enviando ? "Moviendo..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertaErrorLocal({ children }) {
  if (!children) return null;
  return <p style={{ color: "#f87171" }}>{children}</p>;
}
