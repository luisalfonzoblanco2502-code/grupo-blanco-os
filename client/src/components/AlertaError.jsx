// Reemplaza el <p style={{ color: "#f87171" }}>{error}</p> repetido en
// cada formulario por un mismo bloque de alerta — mismo idioma visual que
// las demás alertas del sistema (fondo suave + ícono), no una línea roja
// suelta que compite en jerarquía con el resto del texto.
export function AlertaError({ children }) {
  if (!children) return null;
  return (
    <div className="alerta alerta-error">
      <span className="alerta-icono">⚠️</span>
      <span>{children}</span>
    </div>
  );
}
