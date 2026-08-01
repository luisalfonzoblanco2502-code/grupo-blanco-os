import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { SkeletonTabla } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { useAuth } from "../auth/AuthContext";

// Mismo orden real de transición que pedidoEstado.service.js — no una lista
// inventada. Filtro en cliente (mismo criterio que la búsqueda: el volumen
// por empresa no justifica todavía un parámetro de servidor para esto).
const ESTADOS = ["BORRADOR", "PENDIENTE", "FACTURADO", "EN_PRODUCCION", "LISTO", "DESPACHADO", "ENTREGADO", "CERRADO", "CANCELADO"];

export function PedidosList() {
  const { perfil } = useAuth();
  const puedeCrear = !!perfil?.rol?.permisos?.crear_pedido;
  const [pedidos, setPedidos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPedidos()
      .then(setPedidos)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  // Búsqueda en cliente (RC2 prioridad 6): el volumen de pedidos por
  // empresa no justifica todavía un parámetro de búsqueda en el backend.
  const texto = busqueda.trim().toLowerCase();
  const pedidosVisibles = pedidos.filter((p) => {
    if (filtroEstado && p.estado !== filtroEstado) return false;
    if (texto && !p.pedId.toLowerCase().includes(texto) && !p.clienteNombre.toLowerCase().includes(texto)) return false;
    return true;
  });

  return (
    <div className="fade-in">
      <div className="pagina-titulo">
        <h1>Pedidos</h1>
        {puedeCrear && (
          <Link to="/pedidos/nuevo" className="btn-primary">
            + Nuevo pedido
          </Link>
        )}
      </div>
      <div className="buscador" style={{ margin: "0.9rem 0" }}>
        <span className="buscador-icono">🔍</span>
        <input
          type="text"
          placeholder="Buscar por pedido o cliente..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="toolbar-filtros">
        <label>
          Estado
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <SkeletonTabla filas={7} columnas={6} />}

      {!loading && (
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Empresa</th>
                <th>Estado</th>
                <th>Órdenes</th>
                <th>Fecha compromiso</th>
              </tr>
            </thead>
            <tbody>
              {pedidosVisibles.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/pedidos/${p.id}`}>{p.pedId}</Link>
                  </td>
                  <td>{p.clienteNombre}</td>
                  <td>{p.empresa?.nombre}</td>
                  <td>
                    <Badge>{p.estado}</Badge>
                  </td>
                  <td>{p._count?.ordenesProduccion ?? 0}</td>
                  <td>{new Date(p.fechaCompromiso).toLocaleDateString()}</td>
                </tr>
              ))}
              {pedidosVisibles.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icono={texto || filtroEstado ? "🔍" : "📦"}
                      titulo={texto || filtroEstado ? "Sin resultados" : "Todavía no hay pedidos"}
                      mensaje={
                        texto
                          ? `Ningún pedido coincide con "${busqueda}".`
                          : filtroEstado
                          ? `Ningún pedido está en estado ${filtroEstado}.`
                          : "Crea el primero desde el botón + Nuevo pedido."
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
