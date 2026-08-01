import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/Badge";
import { SituacionBadge } from "../../components/SituacionBadge";
import { Avatar } from "../../components/Avatar";
import { SkeletonKanban } from "../../components/Skeleton";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ToastContext";

// Vista Kanban del pipeline de Producción — mismo dato que la lista/tabla,
// otra forma de verlo. El arrastre solo puede soltar en la columna
// inmediatamente siguiente: cambiarEtapaOrden ya rechaza saltos/retrocesos
// en el backend (pipeline secuencial, ver ordenesProduccion.service.js), acá
// se anticipa esa regla en el cliente para no ofrecer un drop que el
// servidor va a rechazar de todas formas.
export function OrdenesKanban() {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const puedeCambiarEtapa = !!perfil?.rol?.permisos?.cambiar_etapa;

  const [etapas, setEtapas] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [arrastrando, setArrastrando] = useState(null);
  const [columnaSobre, setColumnaSobre] = useState(null);

  function cargar() {
    setLoading(true);
    return Promise.all([api.getEtapas(), api.getOrdenesProduccion()])
      .then(([etapasRes, ordenesRes]) => {
        setEtapas(etapasRes);
        setOrdenes(ordenesRes);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  const columnas = useMemo(
    () => etapas.map((etapa) => ({ etapa, ordenes: ordenes.filter((o) => o.etapaId === etapa.id) })),
    [etapas, ordenes]
  );

  async function soltarEn(etapaDestino) {
    setColumnaSobre(null);
    const orden = arrastrando;
    setArrastrando(null);
    if (!orden) return;
    if (etapaDestino.orden !== orden.etapa.orden + 1) {
      mostrarToast(`Solo se puede avanzar a la siguiente etapa: "${etapas.find((e) => e.orden === orden.etapa.orden + 1)?.nombre ?? "—"}"`);
      return;
    }
    const esCierre = !etapas.find((e) => e.orden === etapaDestino.orden + 1);
    if (esCierre && !confirm(`¿Cerrar la producción de ${orden.opId} marcándola como "${etapaDestino.nombre}"?`)) return;
    try {
      await api.cambiarEtapaOrden(orden.id, etapaDestino.id);
      mostrarToast(`${orden.opId} avanzó a ${etapaDestino.nombre}`);
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;

  return (
    <div className="fade-in">
      <div className="pagina-titulo">
        <h1>Kanban de producción</h1>
        <Link to="/produccion/ordenes" className="btn-secundario">
          ☰ Vista de tabla
        </Link>
      </div>
      <p className="pagina-subtitulo">Arrastra una tarjeta a la siguiente columna para avanzar su etapa.</p>

      {loading && <SkeletonKanban columnas={5} />}

      {!loading && (
      <div className="kanban-board">
        {columnas.map(({ etapa, ordenes: ordenesCol }) => (
          <div
            key={etapa.id}
            className={`kanban-columna${columnaSobre === etapa.id ? " kanban-columna-dragover" : ""}`}
            onDragOver={(e) => {
              if (!arrastrando) return;
              e.preventDefault();
              setColumnaSobre(etapa.id);
            }}
            onDragLeave={() => setColumnaSobre((v) => (v === etapa.id ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              soltarEn(etapa);
            }}
          >
            <div className="kanban-columna-header">
              <span>{etapa.nombre}</span>
              <span className="kanban-columna-contador">{ordenesCol.length}</span>
            </div>
            <div className="kanban-columna-body">
              {ordenesCol.map((orden) => (
                <div
                  key={orden.id}
                  className={`kanban-tarjeta${arrastrando?.id === orden.id ? " kanban-tarjeta-arrastrando" : ""}`}
                  draggable={puedeCambiarEtapa}
                  onDragStart={() => setArrastrando(orden)}
                  onDragEnd={() => {
                    setArrastrando(null);
                    setColumnaSobre(null);
                  }}
                >
                  <Link to={`/produccion/ordenes/${orden.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ color: "var(--text-faint)", fontSize: "0.72rem", fontWeight: 700 }}>{orden.opId}</div>
                    <div className="kanban-tarjeta-titulo">{orden.producto}</div>
                    <div className="kanban-tarjeta-meta">
                      {orden.pedido.clienteNombre} · {orden.cantidad} u.
                    </div>
                  </Link>
                  <div className="kanban-tarjeta-pie">
                    <Badge>{orden.prioridad.nombre}</Badge>
                    <SituacionBadge situacion={orden.situacion} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.5rem" }}>
                    <Avatar nombre={orden.responsableUsuario?.nombre ?? orden.responsableExterno} tamano={1.5} />
                    <span style={{ fontSize: "0.72rem", color: "var(--text-faint)" }}>
                      {new Date(orden.pedido.fechaCompromiso).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {ordenesCol.length === 0 && (
                <div style={{ color: "var(--text-faint)", fontSize: "0.78rem", textAlign: "center", padding: "1.5rem 0" }}>
                  <div style={{ fontSize: "1.3rem", marginBottom: "0.2rem", opacity: 0.6 }}>🗂️</div>
                  Sin órdenes acá
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
