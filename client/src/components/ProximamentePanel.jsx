// Placeholder para submenús ya enrutados pero sin pantalla real todavía —
// deja la navegación completa y clicable sin fingir contenido que no existe.
export function ProximamentePanel({ titulo }) {
  return (
    <div className="card" style={{ maxWidth: "32rem" }}>
      <h2 style={{ marginTop: 0 }}>{titulo}</h2>
      <p style={{ color: "var(--text-muted)" }}>
        Esta sección todavía no está desarrollada — la navegación ya está lista para cuando se
        construya el contenido.
      </p>
    </div>
  );
}
