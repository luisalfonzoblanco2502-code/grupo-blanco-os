import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { StatCard } from "../../components/StatCard";
import { DashboardGrid } from "../../components/DashboardGrid";

const formatoMonto = new Intl.NumberFormat("es", { style: "currency", currency: "USD" });

function esEsteMes(fechaIso) {
  const f = new Date(fechaIso);
  const hoy = new Date();
  return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
}

// Conectado a persistencia real (Facturador Administrativo Inteligente,
// 2026-07-28). La ficha (clientes.service.js) guarda solo identidad; todo lo
// demás (totales, ticket, clasificación, saldo por cobrar) se calcula acá
// agregando Documentos de Venta — nunca un contador que reprocesar pudiera
// duplicar. Se indexa por nombre normalizado: no existe todavía una UI de
// fusión/búsqueda, así que dos formas de escribir el mismo cliente todavía
// cuentan como fichas distintas.
export function CrmDashboard() {
  const [clientes, setClientes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getCrmClientes().then(setClientes).catch((err) => setError(err.message));
  }, []);

  const nuevosEsteMes = clientes?.filter((c) => c.cantidadPedidos === 1 && c.ultimaCompra && esEsteMes(c.ultimaCompra)).length;
  const vip = clientes?.filter((c) => c.clasificacion === "VIP").length;
  const totalComprado = clientes?.reduce((s, c) => s + c.totalComprado, 0);
  const totalPedidos = clientes?.reduce((s, c) => s + c.cantidadPedidos, 0);
  const ticketPromedioGlobal = totalPedidos > 0 ? totalComprado / totalPedidos : null;

  return (
    <div>
      <h1>CRM</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Ficha por cliente — totales calculados en vivo desde los documentos de venta reales.
      </p>
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <DashboardGrid>
        <StatCard label="Clientes activos" valor={clientes?.length ?? "—"} />
        <StatCard label="Nuevos este mes" valor={clientes ? nuevosEsteMes : "—"} />
        <StatCard
          label="Ticket promedio"
          valor={ticketPromedioGlobal != null ? formatoMonto.format(ticketPromedioGlobal) : "—"}
        />
        <StatCard label="Clientes VIP" valor={clientes ? vip : "—"} />
      </DashboardGrid>

      <h2>Clientes</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Pedidos</th>
            <th>Total comprado</th>
            <th>Ticket promedio</th>
            <th>Saldo por cobrar</th>
            <th>Clasificación</th>
            <th>Última compra</th>
          </tr>
        </thead>
        <tbody>
          {clientes
            ?.slice()
            .sort((a, b) => b.totalComprado - a.totalComprado)
            .map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.cantidadPedidos}</td>
                <td>{formatoMonto.format(c.totalComprado)}</td>
                <td>{formatoMonto.format(c.ticketPromedio)}</td>
                <td>{formatoMonto.format(c.saldoPorCobrar)}</td>
                <td>{c.clasificacion}</td>
                <td>{c.ultimaCompra ? new Date(c.ultimaCompra).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          {clientes?.length === 0 && (
            <tr>
              <td colSpan={7}>Sin clientes todavía — se generan al facturar un pedido.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
