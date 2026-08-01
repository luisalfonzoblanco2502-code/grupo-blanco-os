// Badge de color estable por texto (hash simple). No hay una lista fija de
// estados/prioridades en el código — etapas y prioridades vienen de la base
// de datos y son configurables, así que no se puede mapear color por nombre
// conocido de antemano. Fondo suave + texto saturado (mismo lenguaje visual
// que SituacionBadge) en vez del bloque de color sólido de antes.
const PALETA = [
  { bg: "#eef2ff", text: "#4338ca" },
  { bg: "#e6f6fd", text: "#0369a1" },
  { bg: "#e7f6ec", text: "#15803d" },
  { bg: "#fef3e2", text: "#b45309" },
  { bg: "#fdeceb", text: "#c2410c" },
  { bg: "#fce7f3", text: "#be185d" },
  { bg: "#ede9fe", text: "#6d28d9" },
  { bg: "#f0f9ff", text: "#0e7490" },
];

function colorPara(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return PALETA[Math.abs(hash) % PALETA.length];
}

export function Badge({ children }) {
  const texto = String(children ?? "");
  const { bg, text } = colorPara(texto);
  return (
    <span className="badge-suave" style={{ background: bg, color: text }}>
      {texto}
    </span>
  );
}
