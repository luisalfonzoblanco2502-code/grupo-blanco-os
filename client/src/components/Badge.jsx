// Badge genérico de color estable por texto (hash simple). No hay una lista
// fija de estados/prioridades en el código — etapas y prioridades vienen de
// la base de datos y son configurables, así que no se puede mapear color por
// nombre conocido de antemano.
const PALETA = ["#818cf8", "#38bdf8", "#34d399", "#fbbf24", "#fb923c", "#f472b6", "#a78bfa"];

function colorPara(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return PALETA[Math.abs(hash) % PALETA.length];
}

export function Badge({ children }) {
  const texto = String(children ?? "");
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.2rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.8rem",
        fontWeight: 600,
        color: "#0b0f1a",
        background: colorPara(texto),
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}
