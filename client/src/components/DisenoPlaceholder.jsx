// Placeholder de Fase 2 (captura de archivos personalizados) — deliberadamente
// aislado: cuando se retome Fase 2, solo el interior de este componente
// cambia (el picker real de archivos), sin tocar LineaProductoMaestro ni el
// resto del flujo de captura compacta. Hoy no sube nada, no conecta
// Storage, no crea buckets — es puramente visual.
export function DisenoPlaceholder({ requierePersonalizacion }) {
  if (!requierePersonalizacion) return null;

  return (
    <div className="diseno-placeholder">
      <span aria-hidden="true">🎨</span> Diseño personalizado (próximamente)
    </div>
  );
}
