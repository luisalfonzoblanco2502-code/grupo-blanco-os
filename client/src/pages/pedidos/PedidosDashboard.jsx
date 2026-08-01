import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { StatCard } from "../../components/StatCard";
import { DashboardGrid } from "../../components/DashboardGrid";
import { SkeletonKPIs } from "../../components/Skeleton";
import { useAuth } from "../../auth/AuthContext";

// A diferencia de Inventario/CRM/Financiero (todavía sin datos reales),
// Pedidos ya tiene backend real y funcionando — así que este dashboard sí
// muestra números reales, agregados en el cliente sobre la misma lista que
// ya trae /api/pedidos (sin endpoint nuevo, sin lógica de negocio nueva).
const GRUPOS = {
  pendientes: ["BORRADOR", "PENDIENTE"],
  enProceso: ["FACTURADO", "EN_PRODUCCION", "LISTO", "DESPACHADO"],
  cerrados: ["ENTREGADO", "CERRADO"],
  cancelados: ["CANCELADO"],
};

function contarPorGrupo(pedidos, estados) {
  return pedidos.filter((p) => estados.includes(p.estado)).length;
}

export function PedidosDashboard() {
  const { perfil } = useAuth();
  const puedeCrear = !!perfil?.rol?.permisos?.crear_pedido;
  const [pedidos, setPedidos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getPedidos().then(setPedidos).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Pedidos</h1>
        {puedeCrear && (
          <Link to="/pedidos/nuevo" className="btn-primary">
            + Nuevo pedido
          </Link>
        )}
      </div>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {!pedidos && !error ? (
        <SkeletonKPIs cantidad={5} />
      ) : (
        <DashboardGrid>
          <StatCard label="Total de pedidos" valor={pedidos?.length ?? "—"} icono="📦" color="#2554c7" />
          <StatCard label="Pendientes" valor={pedidos ? contarPorGrupo(pedidos, GRUPOS.pendientes) : "—"} icono="⏳" color="#b45309" />
          <StatCard label="En proceso" valor={pedidos ? contarPorGrupo(pedidos, GRUPOS.enProceso) : "—"} icono="🏭" color="#2554c7" />
          <StatCard label="Entregados / cerrados" valor={pedidos ? contarPorGrupo(pedidos, GRUPOS.cerrados) : "—"} icono="✅" color="#15803d" />
          <StatCard label="Cancelados" valor={pedidos ? contarPorGrupo(pedidos, GRUPOS.cancelados) : "—"} icono="✕" color="#d92d20" />
        </DashboardGrid>
      )}
      <p>
        <Link to="/pedidos/lista">Ver todos los pedidos →</Link>
      </p>
    </div>
  );
}
