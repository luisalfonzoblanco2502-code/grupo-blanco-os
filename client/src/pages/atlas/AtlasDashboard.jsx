import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { StatCard } from "../../components/StatCard";
import { DashboardGrid } from "../../components/DashboardGrid";

// Sprint ATLAS 0.1 (fundación técnica, 2026-07-31): esta pantalla ya lee
// datos reales de /api/atlas/metricas/resumen — pero como todavía no hay
// ningún canal conectado (ManyChat/Meta Graph/WhatsApp Cloud son
// adaptadores vacíos, ver server/src/services/atlas/integraciones/), es
// esperable y correcto que todo aparezca en cero hasta la subfase 0.4.
export function AtlasDashboard() {
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getAtlasResumen().then(setResumen).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <h1>ATLAS — Centro de Atención Inteligente</h1>
      <p style={{ color: "var(--text-muted)" }}>
        Fundación técnica del Sprint 0.1 — capta, clasifica y da seguimiento a leads de Instagram,
        WhatsApp, Facebook, TikTok y el catálogo. Sin ningún canal conectado todavía: los números de
        abajo son reales, no simulados, y por eso están en cero.
      </p>
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      <DashboardGrid>
        <StatCard label="Contactos totales" valor={resumen?.totalContactos ?? "—"} />
        <StatCard label="Requieren atención humana" valor={resumen?.porEstado?.requiere_atencion_humana ?? 0} />
        <StatCard label="Seguimiento pendiente" valor={resumen?.porEstado?.seguimiento_pendiente ?? 0} />
        <StatCard label="Convertidos" valor={resumen?.porEstado?.convertido ?? 0} />
      </DashboardGrid>
    </div>
  );
}
