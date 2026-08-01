import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { StatCard } from "../../components/StatCard";
import { DashboardGrid } from "../../components/DashboardGrid";

const formatoMonto = new Intl.NumberFormat("es", { style: "currency", currency: "USD" });

function esHoy(fechaIso) {
  return new Date(fechaIso).toDateString() === new Date().toDateString();
}

// Conectado a persistencia real (Facturador Administrativo Inteligente,
// 2026-07-28) — items_inventario/movimientos_inventario. Reservar (al
// facturar) y consumir (en Corte) son movimientos distintos; "sobreventa" es
// visible pero no bloquea (decisión aprobada).
export function InventarioDashboard() {
  const [items, setItems] = useState(null);
  const [movimientos, setMovimientos] = useState(null);
  const [alertas, setAlertas] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getItemsInventario(), api.getInventarioMovimientos(), api.getInventarioAlertas()])
      .then(([i, m, a]) => {
        setItems(i);
        setMovimientos(m);
        setAlertas(a);
      })
      .catch((err) => setError(err.message));
  }, []);

  const valorInventario = items?.reduce((s, i) => s + Number(i.existencia) * Number(i.costoUnitario), 0);
  const reservadoHoy = movimientos?.filter((m) => m.tipo === "RESERVA" && esHoy(m.fecha)).length;
  const consumidoHoy = movimientos?.filter((m) => m.tipo === "CONSUMO" && esHoy(m.fecha)).length;

  return (
    <div>
      <h1>Inventario</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Materia prima real — reservar (al facturar) y consumir (al entrar a Corte) son movimientos
        distintos.
      </p>
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <DashboardGrid>
        <StatCard
          label="Valor del inventario"
          valor={items ? formatoMonto.format(valorInventario) : "—"}
        />
        <StatCard label="Ítems trackeados" valor={items?.length ?? "—"} />
        <StatCard label="Alertas activas" valor={alertas?.length ?? "—"} nota="sobreventa + stock crítico" />
        <StatCard label="Reservado hoy" valor={movimientos ? reservadoHoy : "—"} />
        <StatCard label="Consumido hoy (Corte)" valor={movimientos ? consumidoHoy : "—"} />
      </DashboardGrid>

      {alertas?.length > 0 && (
        <>
          <h2>Alertas</h2>
          <ul>
            {alertas.map((a) => (
              <li key={a.id} style={{ color: a.alertas.includes("SOBREVENTA") ? "#f87171" : "#d97706" }}>
                <strong>{a.nombre}</strong> — disponible {a.disponible} / mínimo {a.stockMinimo} (
                {a.alertas.join(", ")})
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Últimos movimientos</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Ítem</th>
            <th>Tipo</th>
            <th>Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {movimientos?.slice(0, 15).map((m) => (
            <tr key={m.id}>
              <td>{new Date(m.fecha).toLocaleString()}</td>
              <td>{m.itemInventario.nombre}</td>
              <td>{m.tipo}</td>
              <td>{m.cantidad}</td>
            </tr>
          ))}
          {movimientos?.length === 0 && (
            <tr>
              <td colSpan={4}>Sin movimientos todavía — se generan al facturar/producir con productos del catálogo interno.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
