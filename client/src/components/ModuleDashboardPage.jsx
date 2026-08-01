import { StatCard } from "./StatCard";
import { DashboardGrid } from "./DashboardGrid";

// Dashboard genérico de módulo: título + grilla de tarjetas. Los dashboards
// de Inventario/CRM/Centro Financiero/Producción son, por ahora, solo esto
// con distinta lista de `tarjetas` — cuando cada módulo tenga lógica real,
// esas páginas dejan de usar este componente genérico si necesitan algo
// más específico, pero por ahora evita repetir el mismo layout 4 veces.
export function ModuleDashboardPage({ titulo, subtitulo, tarjetas }) {
  return (
    <div>
      <h1>{titulo}</h1>
      {subtitulo && <p style={{ color: "var(--text-muted)" }}>{subtitulo}</p>}
      <DashboardGrid>
        {tarjetas.map((t) => (
          <StatCard key={t.label} {...t} />
        ))}
      </DashboardGrid>
    </div>
  );
}
