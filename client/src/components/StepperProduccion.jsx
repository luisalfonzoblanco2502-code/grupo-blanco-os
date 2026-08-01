// Línea de progreso visual del pipeline de Producción — reemplaza la lectura
// de una tabla como única forma de saber "dónde va" una orden. `etapas` es el
// pipeline completo y ordenado (viene de Etapa en BD, configurable); el
// estado de cada paso se deriva comparando su `orden` contra el de la etapa
// actual de la orden — no hay una lista fija de nombres de etapa en el código.
export function StepperProduccion({ etapas, etapaActualOrden, tiemposPorEtapa = [] }) {
  if (!etapas?.length) return null;

  return (
    <div className="stepper">
      {etapas.map((etapa) => {
        const estado =
          etapa.orden < etapaActualOrden ? "completado" : etapa.orden === etapaActualOrden ? "actual" : "pendiente";
        const tramo = tiemposPorEtapa.find((t) => t.etapa === etapa.nombre);
        return (
          <div key={etapa.id} className={`stepper-paso stepper-${estado}`}>
            <span className="stepper-linea" />
            <span className="stepper-circulo">{estado === "completado" ? "✓" : etapa.orden}</span>
            <span className="stepper-label">{etapa.nombre}</span>
            {tramo?.responsable && <span className="stepper-meta">{tramo.responsable}</span>}
          </div>
        );
      })}
    </div>
  );
}
