// Variación honesta: solo se usa donde de verdad existe un punto de
// comparación real (ej. entregadas hoy vs ayer). No se inventa una
// tendencia sobre métricas sin foto histórica — ver dashboard.service.js.
export function KpiTendencia({ actual, anterior }) {
  if (actual == null || anterior == null) return null;
  const delta = actual - anterior;
  const clase = delta > 0 ? "kpi-tendencia-arriba" : delta < 0 ? "kpi-tendencia-abajo" : "kpi-tendencia-neutro";
  const flecha = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  return (
    <span className={`kpi-tendencia ${clase}`}>
      {flecha} {Math.abs(delta)} vs ayer
    </span>
  );
}
