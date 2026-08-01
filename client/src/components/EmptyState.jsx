// Empty state estándar — ninguna tabla/lista/búsqueda vacía debe quedar como
// una pantalla muerta (celda con una sola línea de texto gris). Mismo
// componente en toda la app: ícono + mensaje + acción opcional.
export function EmptyState({ icono = "🗂️", titulo, mensaje, accion }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icono">{icono}</div>
      {titulo && <div style={{ fontWeight: 650, color: "var(--text)", marginBottom: "0.2rem" }}>{titulo}</div>}
      {mensaje && <div>{mensaje}</div>}
      {accion && <div className="empty-state-accion">{accion}</div>}
    </div>
  );
}
