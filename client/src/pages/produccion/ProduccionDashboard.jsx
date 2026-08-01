import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { StatCard } from "../../components/StatCard";
import { DashboardGrid } from "../../components/DashboardGrid";
import { SkeletonKPIs } from "../../components/Skeleton";
import { useAuth } from "../../auth/AuthContext";

// Reutiliza endpoints ya existentes y probados (dashboard.service.js /
// ordenesProduccion.service.js) — nada nuevo de negocio. El Centro de
// Control real (con el detalle por situación) sigue viviendo en
// /centro-control; esto es solo el resumen que corresponde al módulo.
// Operador no tiene ver_dashboard_ejecutivo (ese endpoint le daría 403), así
// que ve un resumen de SUS órdenes en vez del agregado de toda la empresa.
export function ProduccionDashboard() {
  const { perfil } = useAuth();
  const veTodas = !!perfil?.rol?.permisos?.ver_dashboard_ejecutivo;
  const [resumen, setResumen] = useState(null);
  const [misOrdenes, setMisOrdenes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (veTodas) {
      api.getDashboard().then(setResumen).catch((err) => setError(err.message));
    } else {
      api.getOrdenesProduccion().then(setMisOrdenes).catch((err) => setError(err.message));
    }
  }, [veTodas]);

  return (
    <div className="fade-in">
      <h1>Producción</h1>
      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {(veTodas ? !resumen : !misOrdenes) && !error ? (
        <SkeletonKPIs cantidad={4} />
      ) : veTodas ? (
        <DashboardGrid>
          <StatCard label="Pedidos activos" valor={resumen?.pedidosActivos ?? "—"} icono="📦" color="#2554c7" />
          <StatCard label="Órdenes activas" valor={resumen?.ordenesActivas ?? "—"} icono="🏭" color="#2554c7" />
          <StatCard label="Atrasadas" valor={resumen ? resumen.ordenesPorSituacion?.Atrasado ?? 0 : "—"} icono="⚠️" color="#d92d20" />
          <StatCard label="Urgentes" valor={resumen ? resumen.ordenesPorSituacion?.Urgente ?? 0 : "—"} icono="🔥" color="#c2410c" />
        </DashboardGrid>
      ) : (
        <DashboardGrid>
          <StatCard label="Mis órdenes" valor={misOrdenes?.length ?? "—"} icono="🏭" color="#2554c7" />
          <StatCard
            label="Mis órdenes atrasadas/urgentes"
            valor={
              misOrdenes
                ? misOrdenes.filter((o) => o.situacion === "Atrasado" || o.situacion === "Urgente").length
                : "—"
            }
            icono="⚠️"
            color="#d92d20"
          />
        </DashboardGrid>
      )}

      <div className="acciones" style={{ marginTop: "0.5rem" }}>
        <Link to="/produccion/ordenes" className="btn-secundario">
          Ver {veTodas ? "todas las órdenes" : "mis órdenes"}
        </Link>
        <Link to="/produccion/kanban" className="btn-secundario">
          ▤ Vista Kanban
        </Link>
        {veTodas && (
          <Link to="/centro-control" className="btn-secundario">
            Ver Centro de Control
          </Link>
        )}
      </div>
    </div>
  );
}
