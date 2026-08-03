import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { MODULOS } from "../nav/modules";
import { moduloVisible } from "../nav/permisos";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function formatoMoneda(valor) {
  return `$${Number(valor).toLocaleString("es-VE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Flecha + porcentaje — null (sin base real de comparación) se muestra
// como "—", nunca como 0% o 100% inventado. `azul`: la tabla "Desempeño por
// empresa" pide explícitamente azul de marca para variación positiva en vez
// del verde/rojo semántico que usan las tarjetas KPI.
function Variacion({ valor, azul = false }) {
  if (valor === null || valor === undefined) {
    return <span style={{ color: "var(--pg-texto-secundario, var(--text-faint))" }}>— sin datos del período anterior</span>;
  }
  const positivo = valor >= 0;
  const colorPositivo = azul ? "#1D4ED8" : "var(--success)";
  return (
    <span style={{ color: positivo ? colorPositivo : "var(--danger)" }}>
      {positivo ? "↑" : "↓"} {Math.abs(valor)}%
    </span>
  );
}

// Launcher simple — lo que ya mostraba Inicio.jsx antes de este rediseño,
// preservado tal cual para roles sin ver_dashboard_ejecutivo (ej. Operador),
// que no deben ver cifras de ventas/ganancias.
function LauncherSimple({ perfil, accesos }) {
  return (
    <div>
      <h1>Hola, {perfil?.nombre ?? "de nuevo"}</h1>
      <p style={{ color: "var(--text-muted)" }}>
        {perfil?.empresa?.nombre} · {perfil?.rol?.nombre}
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
        {accesos.map((m) => (
          <Link key={m.key} to={m.path} className="card" style={{ textDecoration: "none", minWidth: "10rem" }}>
            <div style={{ fontSize: "1.5rem" }}>{m.icon}</div>
            <div className="card-label">{m.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Panel General — Home ejecutivo (2026-08-01). Distinto del Centro de
// Control Diario (/centro-control, sigue siendo la vista operativa de
// Producción, sin tocar) — esto es el resumen comercial/financiero al
// entrar al sistema. Todo con datos reales (decisión explícita del
// usuario): hoy solo existe 1 empresa real y pocas ventas/costos
// registrados (el Facturador Administrativo/Registrar Pago todavía no está
// activo en producción) — la mayoría de estos números se van a ver en cero
// o casi, y eso es correcto: no se inventa ningún margen ni empresa de
// ejemplo. Crece solo con actividad real.
function PanelGeneral() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ordenTabla, setOrdenTabla] = useState({ campo: "ventas", asc: false });

  useEffect(() => {
    api.getPanelGeneral().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!data) return <p className="pagina-subtitulo">Cargando panel general...</p>;

  const empresasOrdenadas = [...data.porEmpresa].sort((a, b) => {
    const dir = ordenTabla.asc ? 1 : -1;
    const va = ordenTabla.campo === "variacion" ? a.variacion ?? -Infinity : a.ventas;
    const vb = ordenTabla.campo === "variacion" ? b.variacion ?? -Infinity : b.ventas;
    return (va - vb) * dir;
  });

  function ordenarPor(campo) {
    setOrdenTabla((prev) => (prev.campo === campo ? { campo, asc: !prev.asc } : { campo, asc: false }));
  }

  const maxTendencia = Math.max(1, ...data.tendencia7dias.map((d) => d.ventas));

  return (
    <div className="fade-in panel-general">
      <h1 style={{ fontWeight: 500 }}>Panel general</h1>
      <p className="pagina-subtitulo">Resumen ejecutivo de tu negocio</p>

      {data.solicitudesNuevas > 0 && (
        <Link
          to="/solicitudes"
          className="panel"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            marginBottom: "1.25rem",
            textDecoration: "none",
            color: "inherit",
            borderColor: "var(--accent)",
          }}
        >
          <span>
            📥 <strong>{data.solicitudesNuevas}</strong> solicitud{data.solicitudesNuevas === 1 ? "" : "es"} nueva
            {data.solicitudesNuevas === 1 ? "" : "s"} del catálogo sin procesar
          </span>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>Revisar &rarr;</span>
        </Link>
      )}

      {/* Top 3 KPIs — tarjetas grandes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
          gap: "1rem",
          margin: "1.25rem 0",
        }}
      >
        <div className="panel-general-kpi destacada">
          <div className="panel-general-kpi-label">Ventas hoy</div>
          <div className="panel-general-kpi-valor">{formatoMoneda(data.ventasHoy)}</div>
          <div className="panel-general-kpi-sub">
            <Variacion valor={data.variacionVentasVsAyer} /> vs ayer
          </div>
        </div>

        <div className="panel-general-kpi">
          <div className="panel-general-kpi-label">Ganancias del mes</div>
          <div className="panel-general-kpi-valor">{formatoMoneda(data.gananciasMes)}</div>
          <div className="panel-general-kpi-sub">
            <Variacion valor={data.variacionGananciasVsMesAnterior} /> vs mes anterior
          </div>
        </div>

        <div className="panel-general-kpi">
          <div className="panel-general-kpi-label">Tasa de cumplimiento</div>
          <div className="panel-general-kpi-valor exito">
            {data.tasaCumplimiento === null ? "—" : `${data.tasaCumplimiento}%`}
          </div>
          <div className="panel-general-barra-progreso">
            <div
              style={{
                width: `${data.tasaCumplimiento ?? 0}%`,
                background: "#10b981",
                height: "100%",
                borderRadius: "999px",
              }}
            />
          </div>
          {data.tasaCumplimiento === null && (
            <div className="panel-general-kpi-sub">Sin entregas registradas todavía</div>
          )}
        </div>
      </div>

      {/* Grid compacto — 3 KPIs operacionales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
          gap: "0.85rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="panel-general-compacta">
          <div className="card-label">En producción</div>
          <div className="panel-general-compacta-valor">{data.ordenesEnProduccion}</div>
          {data.ordenesEnRiesgo > 0 && (
            <div style={{ color: "#f59e0b", fontSize: "0.78rem", fontWeight: 600 }}>
              {data.ordenesEnRiesgo} en riesgo
            </div>
          )}
        </div>
        <div className="panel-general-compacta">
          <div className="card-label">Por vencer (3 días)</div>
          <div
            className="panel-general-compacta-valor"
            style={{ color: data.pedidosPorVencer3Dias > 0 ? "#f59e0b" : "inherit" }}
          >
            {data.pedidosPorVencer3Dias}
          </div>
        </div>
        <div className="panel-general-compacta">
          <div className="card-label">Top producto</div>
          {data.topProducto ? (
            <>
              <div className="panel-general-compacta-valor" style={{ fontSize: "1.1rem" }}>
                {data.topProducto.nombre}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{data.topProducto.unidades} u.</div>
            </>
          ) : (
            <div style={{ color: "var(--text-faint)" }}>Sin datos todavía</div>
          )}
        </div>
      </div>

      {/* Análisis — tabla + tendencia */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.25rem" }} className="panel-general-analisis">
        <div className="panel-general-kpi">
          <div className="panel-titulo" style={{ marginBottom: "0.75rem" }}>
            Desempeño por empresa
          </div>
          <div className="tabla-envoltorio">
            <table className="tabla panel-general-tabla">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th onClick={() => ordenarPor("ventas")}>Ventas {ordenTabla.campo === "ventas" ? (ordenTabla.asc ? "↑" : "↓") : ""}</th>
                  <th onClick={() => ordenarPor("variacion")}>
                    Variación {ordenTabla.campo === "variacion" ? (ordenTabla.asc ? "↑" : "↓") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {empresasOrdenadas.map((e) => (
                  <tr key={e.nombre}>
                    <td>{e.nombre}</td>
                    <td>{formatoMoneda(e.ventas)}</td>
                    <td>
                      <Variacion valor={e.variacion} azul />
                    </td>
                  </tr>
                ))}
                {empresasOrdenadas.length === 0 && (
                  <tr>
                    <td colSpan={3}>Sin empresas registradas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel-general-kpi">
          <div className="panel-titulo" style={{ marginBottom: "0.75rem" }}>
            Tendencia (últimos 7 días)
          </div>
          <div className="panel-general-tendencia">
            {data.tendencia7dias.map((d) => (
              <div key={d.dia} className="panel-general-tendencia-barra">
                <span style={{ fontSize: "0.7rem", color: "var(--pg-texto-secundario)" }}>
                  {d.ventas > 0 ? formatoMoneda(d.ventas) : ""}
                </span>
                <div
                  className="panel-general-tendencia-barra-visual"
                  style={{
                    width: "100%",
                    maxWidth: "1.8rem",
                    height: `${Math.max(4, (d.ventas / maxTendencia) * 100)}%`,
                    borderRadius: "4px 4px 0 0",
                    opacity: d.ventas ? 1 : 0.25,
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "var(--pg-texto-secundario)" }}>
                  {DIAS[new Date(d.dia + "T00:00:00").getDay()]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .panel-general-analisis { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

export function Inicio() {
  const { perfil } = useAuth();
  const permisos = perfil?.rol?.permisos;

  if (permisos?.ver_dashboard_ejecutivo) {
    return <PanelGeneral />;
  }

  const accesos = MODULOS.filter((m) => m.key !== "inicio" && moduloVisible(permisos, m));
  return <LauncherSimple perfil={perfil} accesos={accesos} />;
}
