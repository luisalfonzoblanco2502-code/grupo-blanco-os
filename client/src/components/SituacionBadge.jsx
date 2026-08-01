// A diferencia de Badge (color por hash, para etapas/prioridades que son
// configurables), la situación de entrega es un set fijo y conocido de 5
// valores — acá el color SÍ es semántico a propósito: rojo = problema,
// verde = bien. Ver calcularSituacionEntrega en ordenesProduccion.service.js.
const COLORES = {
  Atrasado: { bg: "#fdeceb", text: "#b91c1c", dot: "#d92d20" },
  Urgente: { bg: "#fef3e2", text: "#c2410c", dot: "#c2410c" },
  "Próximo a vencer": { bg: "#fef9e2", text: "#a16207", dot: "#ca8a04" },
  "A tiempo": { bg: "#e7f6ec", text: "#15803d", dot: "#15803d" },
  Entregado: { bg: "#e6f6fd", text: "#0369a1", dot: "#0369a1" },
};

export function SituacionBadge({ situacion }) {
  const c = COLORES[situacion] || { bg: "var(--surface-sunken)", text: "var(--text-muted)", dot: "var(--text-faint)" };
  return (
    <span className="badge-suave" style={{ background: c.bg, color: c.text }}>
      <span style={{ width: "0.4rem", height: "0.4rem", borderRadius: "999px", background: c.dot, flexShrink: 0 }} />
      {situacion}
    </span>
  );
}
