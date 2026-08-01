// Bloque agrupado con ícono + título — el mismo patrón visual en toda
// captura de datos (Nuevo Pedido, líneas, etc.) en vez de una lista plana
// de inputs sin jerarquía.
export function FormSection({ icono, titulo, subtitulo, children }) {
  return (
    <div className="form-seccion">
      <div className="form-seccion-header">
        <span className="form-seccion-icono">{icono}</span>
        <div>
          <div className="form-seccion-titulo">{titulo}</div>
          {subtitulo && <div className="form-seccion-sub">{subtitulo}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
