import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { StatCard } from "../../components/StatCard";
import { DashboardGrid } from "../../components/DashboardGrid";

const formatoMonto = new Intl.NumberFormat("es", { style: "currency", currency: "USD" });

// Conectado a persistencia real (Facturador Administrativo Inteligente,
// 2026-07-28). Egresos/Caja/Bancos/Cuentas por cobrar/Cuentas por pagar se
// dejan en "—": no existe ninguna fuente de esos datos todavía, en ningún
// lado — inventar un número ahí sería peor que no mostrarlo.
export function FinancieroDashboard() {
  const [indicadores, setIndicadores] = useState(null);
  const [costos, setCostos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getIndicadoresFacturacion(), api.getCostos()])
      .then(([i, c]) => {
        setIndicadores(i);
        setCostos(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>Centro Financiero</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Ingresos/utilidad reales del día (Núcleo de Facturación). Egresos, caja y cuentas todavía
        no tienen fuente de datos — quedan pendientes de una fase futura.
      </p>
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <DashboardGrid>
        <StatCard label="Ingresos del día" valor={indicadores ? formatoMonto.format(indicadores.ventasHoy) : "—"} />
        <StatCard label="Egresos del día" nota="sin fuente de datos" />
        <StatCard
          label="Utilidad estimada"
          valor={indicadores ? formatoMonto.format(indicadores.utilidadEstimadaHoy) : "—"}
          nota={indicadores ? "estimada, factor de costo temporal" : undefined}
        />
        <StatCard label="Pedidos facturados hoy" valor={indicadores?.pedidosFacturadosHoy ?? "—"} />
        <StatCard label="Ingresos totales" valor={indicadores ? formatoMonto.format(indicadores.ingresosTotales) : "—"} />
        <StatCard label="Caja" nota="sin fuente de datos" />
        <StatCard label="Cuentas por cobrar" nota="sin fuente de datos" />
        <StatCard label="Cuentas por pagar" nota="sin fuente de datos" />
      </DashboardGrid>

      <h2>Costos por pedido</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Monto</th>
            <th>Costo estimado</th>
            <th>Utilidad</th>
            <th>Margen</th>
          </tr>
        </thead>
        <tbody>
          {costos?.slice(0, 10).map((c) => (
            <tr key={c.pedidoId}>
              <td>{c.pedido.pedId}</td>
              <td>{formatoMonto.format(Number(c.costoEstimado) + Number(c.utilidadEstimada))}</td>
              <td>{formatoMonto.format(c.costoEstimado)}</td>
              <td>{formatoMonto.format(c.utilidadEstimada)}</td>
              <td>{c.margenEstimado != null ? `${(Number(c.margenEstimado) * 100).toFixed(0)}%` : "—"}</td>
            </tr>
          ))}
          {costos?.length === 0 && (
            <tr>
              <td colSpan={5}>Sin costos todavía — se generan al facturar un pedido.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
