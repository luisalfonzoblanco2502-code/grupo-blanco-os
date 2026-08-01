import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { SituacionBadge } from "../components/SituacionBadge";
import { Avatar } from "../components/Avatar";
import { StepperProduccion } from "../components/StepperProduccion";
import { SkeletonPanel } from "../components/Skeleton";
import { Spinner } from "../components/Spinner";
import { AlertaError } from "../components/AlertaError";
import { esImagen, formatoTamano, iconoArchivo } from "../utils/storage";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastContext";

function Campo({ label, valor }) {
  return (
    <div className="op-campo">
      <span className="op-campo-label">{label}</span>
      <span className="op-campo-valor">{valor ?? "—"}</span>
    </div>
  );
}

export function OrdenProduccionDetail() {
  const { id } = useParams();
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const puedeAsignar = !!perfil?.rol?.permisos?.asignar_responsable;
  const puedeImprimir = !!perfil?.rol?.permisos?.imprimir_orden;

  const [orden, setOrden] = useState(null);
  const [etapas, setEtapas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState(null);
  const [avanzando, setAvanzando] = useState(false);
  const [reasignando, setReasignando] = useState(false);
  const [mostrarReasignar, setMostrarReasignar] = useState(false);
  const [tipoResponsable, setTipoResponsable] = useState("interno");
  const [nuevoResponsableUsuarioId, setNuevoResponsableUsuarioId] = useState("");
  const [nuevoResponsableExterno, setNuevoResponsableExterno] = useState("");

  function recargar() {
    return api.getOrdenProduccion(id).then(setOrden).catch((err) => setError(err.message));
  }

  useEffect(() => {
    recargar();
    api.getEtapas().then(setEtapas).catch(() => {});
    if (puedeAsignar) api.getUsuarios().then(setUsuarios).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAvanzar(siguienteEtapa, esCierre) {
    if (
      esCierre &&
      !confirm(`¿Cerrar la producción de ${orden.opId} marcándola como "${siguienteEtapa.nombre}"?`)
    )
      return;
    setError(null);
    setAvanzando(true);
    try {
      await api.cambiarEtapaOrden(id, siguienteEtapa.id);
      mostrarToast(`${orden.opId} avanzó a ${siguienteEtapa.nombre}`);
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setAvanzando(false);
    }
  }

  async function handleReasignar(e) {
    e.preventDefault();
    setReasignando(true);
    setError(null);
    try {
      await api.reasignarResponsableOrden(id, {
        responsableUsuarioId: tipoResponsable === "interno" ? nuevoResponsableUsuarioId : undefined,
        responsableExterno: tipoResponsable === "externo" ? nuevoResponsableExterno : undefined,
      });
      setMostrarReasignar(false);
      mostrarToast("Responsable reasignado correctamente");
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setReasignando(false);
    }
  }

  if (error && !orden) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!orden) {
    return (
      <div className="fade-in">
        <SkeletonPanel lineas={2} />
        <div className="grid-2" style={{ marginTop: "1.25rem" }}>
          <SkeletonPanel />
          <SkeletonPanel />
        </div>
      </div>
    );
  }

  const siguienteEtapa = etapas.find((e) => e.orden === orden.etapa.orden + 1);
  // Camino de lectura real ("OP agrupada por lote"): cada variante es una
  // PedidoLinea con su propia imagen. `archivosAdjuntos` (snapshot legacy en
  // la OP) solo se muestra si esta orden no tiene ninguna variante vinculada
  // (nació antes de la migración de agrupación).
  const variantes = orden.variantes ?? [];
  const imagenPrincipal = orden.archivosAdjuntos?.find((a) => a.esPrincipal);
  const otrosArchivos = orden.archivosAdjuntos?.filter((a) => !a.esPrincipal) ?? [];

  return (
    <div className="fade-in">
      <p style={{ marginTop: 0 }}>
        <Link to="/produccion/ordenes">&larr; Volver a órdenes de producción</Link>
      </p>
      <div className="pagina-titulo">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h1 style={{ margin: 0 }}>{orden.opId}</h1>
          <Badge>{orden.etapa.nombre}</Badge>
          <SituacionBadge situacion={orden.situacion} />
        </div>
        {puedeImprimir && (
          <Link to={`/produccion/ordenes/${id}/imprimir`} className="btn-primary">
            🖨 Imprimir OP
          </Link>
        )}
      </div>

      {etapas.length > 0 && (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <StepperProduccion etapas={etapas} etapaActualOrden={orden.etapa.orden} tiemposPorEtapa={orden.tiemposPorEtapa} />
        </div>
      )}

      {variantes.length > 0 && (
        <div className="panel" style={{ marginTop: "1rem" }}>
          <div className="panel-titulo">
            🧩 Variantes ({variantes.length})
          </div>
          <div className="variantes-lista">
            {variantes.map((v, i) => {
              const img = v.archivosAdjuntos?.find((a) => a.esPrincipal);
              const adjuntos = v.archivosAdjuntos?.filter((a) => !a.esPrincipal) ?? [];
              return (
                <div className="variante-item" key={v.id}>
                  <div className="variante-miniatura">
                    {img ? (
                      <img src={img.ubicacion} alt="" style={{ width: "3rem", height: "3rem", borderRadius: "6px", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "3rem", height: "3rem", borderRadius: "6px", background: "var(--surface-sunken)" }} />
                    )}
                  </div>
                  <div className="variante-datos">
                    <span className="card-label">Variante {i + 1}</span>
                    <div className="op-grid">
                      <Campo label="Cantidad" valor={v.cantidad} />
                      <Campo label="Talla" valor={v.talla} />
                      <Campo label="Medida" valor={v.medidas} />
                      <Campo label="Color" valor={v.color} />
                    </div>
                    {v.descripcion && (
                      <p style={{ margin: "0.3rem 0 0" }}>
                        <strong>Descripción:</strong> {v.descripcion}
                      </p>
                    )}
                    {v.observacionesProduccion && (
                      <p style={{ margin: "0.3rem 0 0" }}>
                        <strong>Obs. técnicas:</strong> {v.observacionesProduccion}
                      </p>
                    )}
                    {adjuntos.length > 0 && (
                      <div className="archivo-lista" style={{ marginTop: "0.4rem" }}>
                        {adjuntos.map((a) => (
                          <div className="archivo-item" key={a.id}>
                            <span className="archivo-icono">{iconoArchivo(a.nombre, a.tipo)}</span>
                            <a href={a.ubicacion} target="_blank" rel="noreferrer" className="archivo-nombre">
                              {a.nombre}
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid-2" style={{ marginTop: "1.25rem" }}>
        <div>
          <div className="panel">
            <div className="panel-titulo">📦 Detalle</div>
            <div className="op-grid">
              <Campo label="Pedido" valor={<Link to={`/pedidos/${orden.pedido.id}`}>{orden.pedido.pedId}</Link>} />
              <Campo label="Cliente" valor={orden.pedido.clienteNombre} />
              <Campo label="Producto" valor={orden.producto} />
              <Campo label="Cantidad" valor={orden.cantidad} />
              <Campo label="Prioridad" valor={<Badge>{orden.prioridad.nombre}</Badge>} />
              <Campo label="Fecha de compromiso" valor={orden.pedido.fechaCompromiso ? new Date(orden.pedido.fechaCompromiso).toLocaleDateString() : null} />
              <Campo label="Fecha de entrega real" valor={orden.fechaEntregaReal ? new Date(orden.fechaEntregaReal).toLocaleDateString() : null} />
              <Campo label="Variantes en este lote" valor={variantes.length || 1} />
            </div>
            {orden.observaciones && (
              <p style={{ marginBottom: 0 }}>
                <strong>Observaciones:</strong> {orden.observaciones}
              </p>
            )}
          </div>

          <div className="panel" style={{ marginTop: "1rem" }}>
            <div className="panel-titulo">👤 Responsable</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Avatar nombre={orden.responsableUsuario?.nombre ?? orden.responsableExterno} conNombre cargo={orden.responsableUsuario?.puesto?.nombre ?? (orden.responsableExterno ? "Externo" : null)} />
              {puedeAsignar && (
                <button type="button" className="btn-sm" onClick={() => setMostrarReasignar((v) => !v)}>
                  Reasignar
                </button>
              )}
            </div>
            {mostrarReasignar && (
              <form onSubmit={handleReasignar} className="form" style={{ marginTop: "1rem" }}>
                <div className="item-row">
                  <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <input type="radio" checked={tipoResponsable === "interno"} onChange={() => setTipoResponsable("interno")} />
                    Interno
                  </label>
                  <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <input type="radio" checked={tipoResponsable === "externo"} onChange={() => setTipoResponsable("externo")} />
                    Externo
                  </label>
                </div>
                {tipoResponsable === "interno" ? (
                  <select value={nuevoResponsableUsuarioId} onChange={(e) => setNuevoResponsableUsuarioId(e.target.value)} required>
                    <option value="">-- Usuario --</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Nombre del taller/proveedor externo"
                    value={nuevoResponsableExterno}
                    onChange={(e) => setNuevoResponsableExterno(e.target.value)}
                    required
                  />
                )}
                <button type="submit" className="btn-primary" disabled={reasignando}>
                  {reasignando ? "Guardando..." : "Guardar responsable"}
                </button>
              </form>
            )}
          </div>

          {variantes.length === 0 && (imagenPrincipal || otrosArchivos.length > 0) && (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <div className="panel-titulo">📎 Archivos</div>
              <div className="archivo-lista">
                {imagenPrincipal && (
                  <div className="archivo-item">
                    <img src={imagenPrincipal.ubicacion} alt="" style={{ width: "2.2rem", height: "2.2rem", borderRadius: "6px", objectFit: "cover" }} />
                    <span className="archivo-nombre">{imagenPrincipal.nombre} · imagen principal</span>
                    <span className="archivo-tamano">{formatoTamano(imagenPrincipal.tamano)}</span>
                    <a href={imagenPrincipal.ubicacion} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Ver</a>
                  </div>
                )}
                {otrosArchivos.map((a) => (
                  <div className="archivo-item" key={a.id}>
                    <span className="archivo-icono">{iconoArchivo(a.nombre, a.tipo)}</span>
                    <span className="archivo-nombre">{a.nombre}</span>
                    <span className="archivo-tamano">{formatoTamano(a.tamano)}</span>
                    {esImagen(a.tipo) && (
                      <a href={a.ubicacion} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Ver</a>
                    )}
                    <a href={a.ubicacion} target="_blank" rel="noreferrer" download className="btn-ghost btn-sm">Descargar</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel" style={{ marginTop: "1rem" }}>
            <div className="panel-titulo">➡️ Avanzar etapa</div>
            {siguienteEtapa ? (
              <button
                onClick={() => handleAvanzar(siguienteEtapa, !etapas.find((e) => e.orden === siguienteEtapa.orden + 1))}
                disabled={avanzando}
                className="btn-primary btn-touch"
              >
                {avanzando ? <Spinner /> : null}
                {avanzando ? "Avanzando..." : `Avanzar a: ${siguienteEtapa.nombre}`}
              </button>
            ) : (
              <p style={{ margin: 0, color: "var(--text-muted)" }}>Esta orden ya llegó a la etapa final del pipeline.</p>
            )}
            <AlertaError>{error}</AlertaError>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-titulo">⏱ Tiempo por etapa</div>
            <div className="tabla-envoltorio">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Etapa</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {orden.tiemposPorEtapa.map((tramo, i) => (
                    <tr key={i}>
                      <td>{tramo.etapa}</td>
                      <td>{new Date(tramo.desde).toLocaleString()}</td>
                      <td>{tramo.hasta ? new Date(tramo.hasta).toLocaleString() : "En curso"}</td>
                      <td>
                        {tramo.duracionMinutos < 60 ? `${tramo.duracionMinutos} min` : `${(tramo.duracionMinutos / 60).toFixed(1)} h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: "1rem" }}>
            <div className="panel-titulo">🗒 Bitácora</div>
            <ul className="lista-limpia">
              {orden.bitacoraEventos.map((evento) => (
                <li key={evento.id}>
                  <span style={{ color: "var(--text-faint)", fontSize: "0.8rem" }}>
                    {new Date(evento.ocurridoEn).toLocaleString()}
                  </span>
                  <br />
                  {evento.usuario?.nombre ?? "Sistema"}: {evento.campoAfectado ?? evento.tipoEvento}
                  {evento.valorAnterior || evento.valorNuevo ? ` (${evento.valorAnterior ?? "—"} → ${evento.valorNuevo ?? "—"})` : ""}
                </li>
              ))}
              {orden.bitacoraEventos.length === 0 && <li>Sin eventos registrados.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
