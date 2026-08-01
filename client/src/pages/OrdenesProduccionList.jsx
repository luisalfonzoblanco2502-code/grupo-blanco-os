import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Badge } from "../components/Badge";
import { SituacionBadge } from "../components/SituacionBadge";
import { SkeletonTabla } from "../components/Skeleton";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastContext";

export function OrdenesProduccionList() {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const [searchParams] = useSearchParams();
  const veTodas = !!perfil?.rol?.permisos?.ver_todas_las_ordenes;
  const puedeCambiarEtapa = !!perfil?.rol?.permisos?.cambiar_etapa;

  const [ordenes, setOrdenes] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [prioridades, setPrioridades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  // Iniciales desde la URL: así las tarjetas del Dashboard pueden enlazar
  // directo a "/produccion/ordenes?chip=atrasadas" o "?etapaId=5" y abrir el
  // listado ya filtrado, sin duplicar la lógica de clasificación acá.
  const [filtroEtapa, setFiltroEtapa] = useState(searchParams.get("etapaId") ?? "");
  const [filtroPrioridad, setFiltroPrioridad] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [chip, setChip] = useState(searchParams.get("chip"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avanzandoId, setAvanzandoId] = useState(null);
  // Selección múltiple (hallazgo de fricción real: en un taller textil las
  // órdenes se terminan por lote, no una por una — sin esto, avanzar 8
  // órdenes que salieron juntas de Corte exige 8 clics idénticos en vez de 1).
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [avanzandoLote, setAvanzandoLote] = useState(false);

  useEffect(() => {
    api.getEtapas().then(setEtapas).catch(() => {});
    api.getPrioridades().then(setPrioridades).catch(() => {});
    if (veTodas) api.getUsuarios().then(setUsuarios).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cargarOrdenes() {
    setLoading(true);
    const params = {};
    if (filtroEtapa) params.etapaId = filtroEtapa;
    if (filtroPrioridad) params.prioridadId = filtroPrioridad;
    if (veTodas && filtroResponsable) params.mias = filtroResponsable === "yo" ? "true" : undefined;
    if (busqueda.trim()) params.busqueda = busqueda.trim();
    return api
      .getOrdenesProduccion(params)
      .then((datos) =>
        // El filtro por un responsable específico (no "solo mis órdenes")
        // se aplica en el cliente: el backend ya trae todo lo que este
        // usuario puede ver, y elegir "cualquiera" de un select no amerita
        // otro parámetro de servidor para este volumen de datos.
        veTodas && filtroResponsable && filtroResponsable !== "yo"
          ? datos.filter((o) => o.responsableUsuario?.id === filtroResponsable)
          : datos
      )
      .then(setOrdenes)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // Debounce corto: cada tecla dispara una consulta al servidor (2-4s de
    // latencia conocida) — sin esto, escribir un texto de 6 letras dispararía
    // 6 consultas en cascada.
    const id = setTimeout(cargarOrdenes, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEtapa, filtroPrioridad, filtroResponsable, veTodas, busqueda]);

  // Cambiar de filtro no debe arrastrar una selección de otra vista — evita
  // avanzar por error una orden que ya no se está viendo.
  useEffect(() => {
    setSeleccionadas(new Set());
  }, [filtroEtapa, filtroPrioridad, filtroResponsable, busqueda, chip]);

  async function handleAvanzarRapido(orden, siguienteEtapa) {
    const esCierre = !etapas.find((e) => e.orden === siguienteEtapa.orden + 1);
    if (esCierre && !confirm(`¿Cerrar la producción de ${orden.opId} marcándola como "${siguienteEtapa.nombre}"?`))
      return;
    setAvanzandoId(orden.id);
    try {
      await api.cambiarEtapaOrden(orden.id, siguienteEtapa.id);
      mostrarToast(`${orden.opId} avanzó a ${siguienteEtapa.nombre}`);
      await cargarOrdenes();
    } catch (err) {
      setError(err.message);
    } finally {
      setAvanzandoId(null);
    }
  }

  function toggleSeleccion(ordenId) {
    setSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(ordenId)) siguiente.delete(ordenId);
      else siguiente.add(ordenId);
      return siguiente;
    });
  }

  async function handleAvanzarLote(siguienteEtapa, ids) {
    const esCierre = !etapas.find((e) => e.orden === siguienteEtapa.orden + 1);
    const mensaje = esCierre
      ? `¿Cerrar la producción de ${ids.length} órdenes marcándolas como "${siguienteEtapa.nombre}"?`
      : `¿Avanzar ${ids.length} órdenes a "${siguienteEtapa.nombre}"?`;
    if (!confirm(mensaje)) return;
    setAvanzandoLote(true);
    const fallidas = [];
    for (const id of ids) {
      try {
        await api.cambiarEtapaOrden(id, siguienteEtapa.id);
      } catch (err) {
        fallidas.push(err.message);
      }
    }
    setAvanzandoLote(false);
    setSeleccionadas(new Set());
    await cargarOrdenes();
    if (fallidas.length === 0) {
      mostrarToast(`${ids.length} órdenes avanzaron a ${siguienteEtapa.nombre}`);
    } else {
      setError(`${ids.length - fallidas.length} de ${ids.length} avanzaron. Errores: ${fallidas.join(" · ")}`);
    }
  }

  // Chips de un clic (RC2 prioridad 5): se aplican sobre lo que ya llegó del
  // servidor, sin parámetros nuevos de API — el volumen por empresa no lo
  // justifica todavía.
  function coincideChip(orden) {
    if (chip === "urgentes") return orden.situacion === "Urgente";
    if (chip === "atrasadas") return orden.situacion === "Atrasado";
    if (chip === "proximo_a_vencer") return orden.situacion === "Próximo a vencer";
    if (chip === "a_tiempo") return orden.situacion === "A tiempo";
    if (chip === "mias") return orden.responsableUsuario?.id === perfil?.id;
    if (chip === "vence_hoy") {
      const hoy = new Date().toDateString();
      return new Date(orden.pedido.fechaCompromiso).toDateString() === hoy;
    }
    if (chip === "entregadas_hoy") {
      if (orden.situacion !== "Entregado") return false;
      const hoy = new Date().toDateString();
      return orden.fechaEntregaReal && new Date(orden.fechaEntregaReal).toDateString() === hoy;
    }
    return true;
  }

  const ordenesVisibles = ordenes.filter(coincideChip);

  function toggleChip(valor) {
    setChip((actual) => (actual === valor ? null : valor));
  }

  // Solo se puede seleccionar una orden que todavía tenga a dónde avanzar.
  const seleccionables = ordenesVisibles.filter((o) => etapas.some((e) => e.orden === o.etapa.orden + 1));
  const ordenesSeleccionadas = ordenesVisibles.filter((o) => seleccionadas.has(o.id));
  const etapasDistintas = new Set(ordenesSeleccionadas.map((o) => o.etapaId));
  // El lote solo avanza junto si TODAS las seleccionadas están en la misma
  // etapa — así hay un único "siguiente paso" válido para todo el grupo.
  const siguienteEtapaLote =
    etapasDistintas.size === 1
      ? etapas.find((e) => e.orden === ordenesSeleccionadas[0].etapa.orden + 1)
      : null;
  const todasSeleccionadas = seleccionables.length > 0 && seleccionables.every((o) => seleccionadas.has(o.id));

  function toggleTodas() {
    setSeleccionadas((prev) => {
      if (todasSeleccionadas) return new Set();
      return new Set(seleccionables.map((o) => o.id));
    });
  }

  return (
    <div className="fade-in">
      <div className="pagina-titulo">
        <h1>{veTodas ? "Órdenes de producción" : "Mis órdenes"}</h1>
        <div className="acciones">
          <Link to="/produccion/kanban" className="btn-secundario">
            ▤ Vista Kanban
          </Link>
        </div>
      </div>

      <div className="buscador" style={{ margin: "0.9rem 0" }}>
        <span className="buscador-icono">🔍</span>
        <input
          type="text"
          placeholder="Buscar por OP, pedido, cliente o producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="toolbar">
        <button type="button" className={chip === "urgentes" ? "chip chip-activo" : "chip"} onClick={() => toggleChip("urgentes")}>
          Solo urgentes
        </button>
        <button type="button" className={chip === "atrasadas" ? "chip chip-activo" : "chip"} onClick={() => toggleChip("atrasadas")}>
          Solo atrasadas
        </button>
        <button type="button" className={chip === "mias" ? "chip chip-activo" : "chip"} onClick={() => toggleChip("mias")}>
          Solo mis órdenes
        </button>
        <button type="button" className={chip === "vence_hoy" ? "chip chip-activo" : "chip"} onClick={() => toggleChip("vence_hoy")}>
          Vence hoy
        </button>
      </div>

      <div className="toolbar-filtros">
        <label>
          Etapa
          <select value={filtroEtapa} onChange={(e) => setFiltroEtapa(e.target.value)}>
            <option value="">Todas</option>
            {etapas.map((etapa) => (
              <option key={etapa.id} value={etapa.id}>
                {etapa.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad
          <select value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
            <option value="">Todas</option>
            {prioridades.map((prioridad) => (
              <option key={prioridad.id} value={prioridad.id}>
                {prioridad.nombre}
              </option>
            ))}
          </select>
        </label>
        {veTodas && (
          <label>
            Responsable
            <select value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

      {puedeCambiarEtapa && seleccionadas.size > 0 && (
        <div className="panel fade-in" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", background: "var(--accent-soft)", borderColor: "var(--accent)" }}>
          <span style={{ fontWeight: 650, fontSize: "0.88rem" }}>{seleccionadas.size} orden(es) seleccionada(s)</span>
          {siguienteEtapaLote ? (
            <button type="button" className="btn-primary" disabled={avanzandoLote} onClick={() => handleAvanzarLote(siguienteEtapaLote, [...seleccionadas])}>
              {avanzandoLote && <Spinner />}
              {avanzandoLote ? "Avanzando..." : `→ Avanzar todas a: ${siguienteEtapaLote.nombre}`}
            </button>
          ) : (
            <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Selecciona órdenes de la misma etapa para avanzarlas juntas.
            </span>
          )}
        </div>
      )}

      {loading && <SkeletonTabla filas={7} columnas={puedeCambiarEtapa ? 11 : 9} />}

      {!loading && !error && (
        <div className="tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr>
                {puedeCambiarEtapa && (
                  <th style={{ width: "2rem" }}>
                    <input
                      type="checkbox"
                      checked={todasSeleccionadas}
                      onChange={toggleTodas}
                      disabled={seleccionables.length === 0}
                      aria-label="Seleccionar todas las órdenes avanzables"
                    />
                  </th>
                )}
                <th>OP</th>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Etapa</th>
                <th>Prioridad</th>
                <th>Responsable</th>
                <th>Situación</th>
                {puedeCambiarEtapa && <th>Acción</th>}
              </tr>
            </thead>
            <tbody>
              {ordenesVisibles.map((orden) => {
                const siguienteEtapa = etapas.find((e) => e.orden === orden.etapa.orden + 1);
                return (
                  <tr key={orden.id}>
                    {puedeCambiarEtapa && (
                      <td>
                        {siguienteEtapa && (
                          <input
                            type="checkbox"
                            checked={seleccionadas.has(orden.id)}
                            onChange={() => toggleSeleccion(orden.id)}
                            aria-label={`Seleccionar ${orden.opId}`}
                          />
                        )}
                      </td>
                    )}
                    <td>
                      <Link to={`/produccion/ordenes/${orden.id}`}>{orden.opId}</Link>
                    </td>
                    <td>
                      <Link to={`/pedidos/${orden.pedido.id}`}>{orden.pedido.pedId}</Link>
                    </td>
                    <td>{orden.pedido.clienteNombre}</td>
                    <td>{orden.producto}</td>
                    <td>{orden.cantidad}</td>
                    <td>
                      <Badge>{orden.etapa.nombre}</Badge>
                    </td>
                    <td>
                      <Badge>{orden.prioridad.nombre}</Badge>
                    </td>
                    <td>{orden.responsableUsuario?.nombre ?? orden.responsableExterno ?? "—"}</td>
                    <td>
                      <SituacionBadge situacion={orden.situacion} />
                    </td>
                    {puedeCambiarEtapa && (
                      <td>
                        {siguienteEtapa && (
                          <button
                            type="button"
                            className="btn-touch"
                            disabled={avanzandoId === orden.id}
                            onClick={() => handleAvanzarRapido(orden, siguienteEtapa)}
                          >
                            {avanzandoId === orden.id && <Spinner />}
                            {avanzandoId === orden.id ? "Guardando..." : `→ ${siguienteEtapa.nombre}`}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {ordenesVisibles.length === 0 && (
                <tr>
                  <td colSpan={puedeCambiarEtapa ? 11 : 9}>
                    <EmptyState
                      icono={busqueda || chip ? "🔍" : "🗂️"}
                      titulo={busqueda || chip ? "Sin resultados" : "Sin órdenes todavía"}
                      mensaje={
                        busqueda
                          ? `Nada coincide con "${busqueda}".`
                          : chip
                          ? "Ninguna orden cumple este filtro rápido."
                          : "Cuando se facture un pedido, sus órdenes aparecerán acá."
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
