// Tarjeta de indicador reutilizable para los dashboards de módulo. `valor`
// acepta "—" a propósito: en esta fase varios dashboards son solo
// estructura visual, sin lógica real conectada todavía, y un guion es más
// honesto que inventar un número que alguien podría confundir con un dato
// real (mismo criterio que se usó en Núcleo de Facturación).
export function StatCard({ label, valor = "—", nota, icono, color = "#2554c7" }) {
  return (
    <div className="card" style={{ minWidth: "11.5rem", flex: "1 1 11.5rem" }}>
      {icono && (
        <span className="card-icono" style={{ background: `${color}1a`, color }}>
          {icono}
        </span>
      )}
      <div className="card-valor">{valor}</div>
      <div className="card-label">{label}</div>
      {nota && (
        <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "0.25rem" }}>{nota}</div>
      )}
    </div>
  );
}
