import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { SkeletonPanel } from "../../components/Skeleton";
import { AlertaError } from "../../components/AlertaError";

const ETIQUETAS = {
  tela: "Tela / material",
  color: "Color",
  tipoImpresion: "Tipo de impresión",
  forro: "Forro",
  tiras: "Tiras",
  insumos: "Insumos",
  medidas: "Medidas",
};

// Umbral de "poco frecuente" — no es una regla exacta, es una lupa: un valor
// usado 1-2 veces frente a variantes con decenas de usos casi siempre es un
// typo ("Poliester" vs "poliéster"), no una decisión real. Esta pantalla
// NUNCA corrige ni fusiona nada sola — solo señala dónde mirar.
const UMBRAL_POCO_FRECUENTE = 2;

export function CalidadDatos() {
  const [calidad, setCalidad] = useState(null);
  const [error, setError] = useState(null);
  const [expandido, setExpandido] = useState({});

  useEffect(() => {
    api.getCalidadDatosTecnicos().then(setCalidad).catch((err) => setError(err.message));
  }, []);

  if (error) return <AlertaError>{error}</AlertaError>;
  if (!calidad) {
    return (
      <div className="fade-in">
        <h1>Calidad de datos</h1>
        <SkeletonPanel lineas={4} />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h1>Calidad de datos</h1>
      <p className="pagina-subtitulo">
        Valores técnicos usados en las líneas de pedido, agrupados por campo. Los que aparecen en{" "}
        <span style={{ color: "var(--pending, #b45309)", fontWeight: 650 }}>ámbar</span> se usaron{" "}
        {UMBRAL_POCO_FRECUENTE} vez/veces o menos — revisa si son una variante mal escrita de un valor más
        frecuente. Esto es solo una lupa: no corrige ni fusiona nada automáticamente.
      </p>

      {Object.entries(ETIQUETAS).map(([campo, etiqueta]) => {
        const valores = calidad[campo] || [];
        if (valores.length === 0) return null;
        const pocoFrecuentes = valores.filter((v) => v.cantidad <= UMBRAL_POCO_FRECUENTE);
        const frecuentes = valores.filter((v) => v.cantidad > UMBRAL_POCO_FRECUENTE);
        const abierto = expandido[campo];
        return (
          <div className="panel" key={campo} style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="panel-titulo" style={{ marginBottom: 0 }}>
                {etiqueta} <span className="card-label">({valores.length} valores distintos)</span>
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setExpandido((p) => ({ ...p, [campo]: !p[campo] }))}>
                {abierto ? "Ver menos" : "Ver todos"}
              </button>
            </div>

            {pocoFrecuentes.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <div className="linea-subgrupo-titulo" style={{ color: "var(--pending, #b45309)" }}>
                  ⚠ Poco frecuentes — revisar
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {pocoFrecuentes.map((v) => (
                    <span
                      key={v.valor}
                      className="badge-suave"
                      style={{ background: "var(--pending-soft, #fef3c7)", color: "var(--pending, #b45309)" }}
                      title={`Usado ${v.cantidad} vez/veces`}
                    >
                      {v.valor} · {v.cantidad}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {abierto && frecuentes.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <div className="linea-subgrupo-titulo">Frecuentes</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {frecuentes.map((v) => (
                    <span key={v.valor} className="badge-suave" style={{ background: "var(--good-soft, #dcfce7)", color: "var(--good, #15803d)" }}>
                      {v.valor} · {v.cantidad}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {Object.values(calidad).every((v) => v.length === 0) && (
        <p className="pagina-subtitulo">Todavía no hay suficientes líneas de pedido capturadas para analizar.</p>
      )}
    </div>
  );
}
