// Placeholders de carga con la forma real de cada pantalla — reemplazan el
// "Cargando..." de texto plano, que con la latencia real de este entorno
// (~10-15s en varias pantallas) se siente como que la app se congeló.
// Un skeleton comunica "está trabajando" desde el primer frame.
export function SkeletonKPIs({ cantidad = 6 }) {
  return (
    <div className="skeleton-kpis">
      {Array.from({ length: cantidad }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  );
}

export function SkeletonPanel({ lineas = 4 }) {
  return (
    <div className="panel">
      <div className="skeleton skeleton-texto" style={{ width: "40%", height: "1.1em" }} />
      {Array.from({ length: lineas }).map((_, i) => (
        <div key={i} className="skeleton skeleton-texto" style={{ width: `${85 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function SkeletonTabla({ filas = 6, columnas = 5 }) {
  return (
    <div className="tabla-envoltorio">
      {Array.from({ length: filas }).map((_, i) => (
        <div className="skeleton-fila" key={i}>
          {Array.from({ length: columnas }).map((__, j) => (
            <div key={j} className="skeleton" style={{ height: "0.9rem", flex: j === 0 ? "0 0 4rem" : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonKanban({ columnas = 5 }) {
  return (
    <div className="kanban-board">
      {Array.from({ length: columnas }).map((_, i) => (
        <div className="kanban-columna" key={i}>
          <div className="kanban-columna-header">
            <div className="skeleton skeleton-texto" style={{ width: "60%" }} />
          </div>
          <div className="kanban-columna-body">
            {Array.from({ length: 2 }).map((__, j) => (
              <div key={j} className="skeleton" style={{ height: "5.5rem", borderRadius: "var(--radius)" }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
