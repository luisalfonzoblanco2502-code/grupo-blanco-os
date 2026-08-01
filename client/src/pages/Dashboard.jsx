import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Avatar } from "../components/Avatar";
import { SkeletonKPIs, SkeletonPanel } from "../components/Skeleton";
import { KpiTendencia } from "../components/KpiTendencia";
import { useAuth } from "../auth/AuthContext";

// Tarjeta clickeable: TODA alerta del Centro de Control abre el listado de
// Órdenes ya filtrado (vía querystring que OrdenesProduccionList ya sabe
// leer) — nunca solo un número suelto sin poder actuar sobre él.
function TarjetaClic({ to, valor, label, icono, color, tendencia }) {
  return (
    <Link to={to} className="card">
      <span className="card-icono" style={{ background: `${color}1a`, color }}>
        {icono}
      </span>
      <div className="card-valor">{valor}</div>
      <div className="card-label">{label}</div>
      {tendencia}
    </Link>
  );
}

const COLOR_SITUACION = {
  Atrasado: "#d92d20",
  Urgente: "#c2410c",
  "Próximo a vencer": "#ca8a04",
  "A tiempo": "#15803d",
};

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function Dashboard() {
  const { perfil } = useAuth();
  const puedeCrearPedido = !!perfil?.rol?.permisos?.crear_pedido;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getDashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!data) {
    return (
      <div className="fade-in">
        <h1>Centro de Control Diario</h1>
        <p className="pagina-subtitulo">Cargando indicadores...</p>
        <SkeletonKPIs cantidad={8} />
        <div className="grid-2">
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <SkeletonPanel />
            <SkeletonPanel lineas={3} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <SkeletonPanel />
            <SkeletonPanel />
          </div>
        </div>
      </div>
    );
  }

  const alertas = [...data.centroControl.Atrasado, ...data.centroControl.Urgente].slice(0, 6);
  const maxEtapa = Math.max(1, ...data.ordenesPorEtapa.map((e) => e.cantidad));
  const maxSemana = Math.max(1, ...data.produccionSemanal.map((d) => d.cantidad));

  return (
    <div className="fade-in">
      <div className="pagina-titulo">
        <div>
          <h1>Centro de Control Diario</h1>
          <p className="pagina-subtitulo">
            {data.pedidosActivos} pedidos activos · {data.ordenesActivas} órdenes de producción activas
          </p>
        </div>
        <div className="acciones">
          {puedeCrearPedido && (
            <Link to="/pedidos/nuevo" className="btn-primary">
              + Nuevo pedido
            </Link>
          )}
          <Link to="/produccion/ordenes" className="btn-secundario">
            Ver todas las órdenes
          </Link>
        </div>
      </div>

      <div className="grid-dashboard" style={{ margin: "1rem 0 1.5rem" }}>
        <TarjetaClic to="/produccion/ordenes" valor={data.pedidosActivos} label="Pedidos activos" icono="📦" color="#2554c7" />
        <TarjetaClic to="/produccion/ordenes" valor={data.ordenesActivas} label="Órdenes activas" icono="🏭" color="#2554c7" />
        <TarjetaClic
          to="/produccion/ordenes?chip=entregadas_hoy"
          valor={data.entregadasHoy}
          label="Entregadas hoy"
          icono="✅"
          color="#0284c7"
          tendencia={<KpiTendencia actual={data.entregadasHoy} anterior={data.entregadasAyer} />}
        />
        <TarjetaClic
          to="/produccion/ordenes?chip=atrasadas"
          valor={data.ordenesPorSituacion.Atrasado ?? 0}
          label="Atrasadas"
          icono="⚠️"
          color={COLOR_SITUACION.Atrasado}
        />
        <TarjetaClic
          to="/produccion/ordenes?chip=urgentes"
          valor={data.ordenesPorSituacion.Urgente ?? 0}
          label="Urgentes"
          icono="🔥"
          color={COLOR_SITUACION.Urgente}
        />
        <TarjetaClic to="/produccion/ordenes?chip=vence_hoy" valor={data.vencenHoy} label="Vencen hoy" icono="📅" color="#0284c7" />
        <TarjetaClic
          to="/produccion/ordenes?chip=proximo_a_vencer"
          valor={data.ordenesPorSituacion["Próximo a vencer"] ?? 0}
          label="Próximas a vencer"
          icono="⏳"
          color={COLOR_SITUACION["Próximo a vencer"]}
        />
        <TarjetaClic
          to="/produccion/ordenes?chip=a_tiempo"
          valor={data.ordenesPorSituacion["A tiempo"] ?? 0}
          label="A tiempo"
          icono="👍"
          color={COLOR_SITUACION["A tiempo"]}
        />
      </div>

      {alertas.length > 0 && (
        <div className="panel" style={{ marginBottom: "1.25rem", borderColor: "var(--danger-soft)" }}>
          <div className="panel-titulo">🚨 Alertas críticas — qué debe hacerse ahora</div>
          <ul className="lista-limpia">
            {alertas.map((o) => (
              <li key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
                <span>
                  <Link to={`/produccion/ordenes/${o.id}`}>{o.opId}</Link> — {o.producto} · {o.pedido.clienteNombre}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{o.responsable ?? "Sin asignar"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid-2">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="panel">
            <div className="panel-titulo">📊 Órdenes por etapa</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {data.ordenesPorEtapa.map((e) => (
                <Link
                  key={e.etapaId}
                  to={`/produccion/ordenes?etapaId=${e.etapaId}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: "0.15rem" }}>
                    <span>{e.etapa}</span>
                    <span style={{ color: "var(--text-muted)" }}>{e.cantidad}</span>
                  </div>
                  <div style={{ background: "var(--surface-sunken)", borderRadius: "999px", height: "0.5rem", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(e.cantidad / maxEtapa) * 100}%`,
                        background: "var(--accent)",
                        height: "100%",
                        borderRadius: "999px",
                        transition: "width 0.3s var(--ease)",
                      }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-titulo">📈 Producción semanal (entregas por día)</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "0.6rem", height: "6rem" }}>
              {data.produccionSemanal.map((d) => (
                <div key={d.fecha} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem", height: "100%", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{d.cantidad || ""}</span>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "1.8rem",
                      height: `${Math.max(4, (d.cantidad / maxSemana) * 100)}%`,
                      background: "var(--accent)",
                      borderRadius: "4px 4px 0 0",
                      opacity: d.cantidad ? 1 : 0.25,
                      transition: "height 0.3s var(--ease)",
                    }}
                  />
                  <span style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>{DIAS[new Date(d.fecha + "T00:00:00").getDay()]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-titulo">👥 Carga por responsable</div>
            {data.cargaResponsables.length === 0 && <p style={{ color: "var(--text-muted)", margin: 0 }}>Sin órdenes activas.</p>}
            <ul className="lista-limpia">
              {data.cargaResponsables.map((c) => (
                <li key={c.responsable} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Avatar nombre={c.responsable === "Sin asignar" ? null : c.responsable} conNombre tamano={1.6} />
                  <span className="badge-suave" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                    {c.cantidad}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="panel">
            <div className="panel-titulo">📅 Próximas entregas</div>
            <ul className="lista-limpia">
              {data.proximasEntregas.map((o) => (
                <li key={o.id}>
                  <Link to={`/produccion/ordenes/${o.id}`}>{o.opId}</Link> — {o.producto} · {o.cliente}
                  <br />
                  <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                    compromiso {new Date(o.fechaCompromiso).toLocaleDateString()} ·{" "}
                    <span style={{ color: COLOR_SITUACION[o.situacion] }}>{o.situacion}</span>
                  </span>
                </li>
              ))}
              {data.proximasEntregas.length === 0 && <li>Sin órdenes pendientes de entrega.</li>}
            </ul>
          </div>

          <div className="panel">
            <div className="panel-titulo">🕘 Actividad reciente</div>
            <ul className="lista-limpia">
              {data.actividadReciente.map((e) => (
                <li key={e.id}>
                  <span style={{ color: "var(--text-faint)", fontSize: "0.8rem" }}>{new Date(e.ocurridoEn).toLocaleString()}</span>
                  <br />
                  {e.usuario} avanzó <Link to={`/produccion/ordenes/${e.ordenId}`}>{e.opId}</Link> ({e.producto} · {e.cliente}) de{" "}
                  {e.etapaAnterior} a {e.etapaNueva}
                </li>
              ))}
              {data.actividadReciente.length === 0 && <li>Sin actividad todavía.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
