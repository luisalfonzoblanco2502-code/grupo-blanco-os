import { useEffect, useState } from "react";
import { api } from "../api/client";
import { SkeletonPanel } from "./Skeleton";
import { Spinner } from "./Spinner";
import { AlertaError } from "./AlertaError";

// Producción Operativa (2026-07-28): esto YA NO es una segunda captura. Las
// líneas (producto/cantidad/tela/color/imagen/etc.) las capturó la vendedora
// en Nuevo Pedido / PedidoLineasEditor — acá el Administrador solo REVISA
// esas líneas y asigna responsable (+ prioridad si ni la línea ni la
// cabecera del pedido la tienen ya), que es explícitamente su decisión, no
// de la vendedora.
//
// Fricción real eliminada (auditoría "eliminar fricción", 2026-07-28): antes
// se exigía elegir Prioridad línea por línea aunque el pedido ya tuviera una
// a nivel de cabecera — el backend (construirLineasParaFacturar) ahora usa
// esa cabecera como último fallback, así que acá solo se pide explícitamente
// cuando de verdad no hay ninguna prioridad definida en ningún lado.
export function FacturarPedido({ pedidoId, pedidoPrioridadNombre, onFacturado }) {
  const [lineas, setLineas] = useState(null);
  const [prioridades, setPrioridades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getLineasPedido(pedidoId).then(setLineas).catch((err) => setError(err.message));
    api.getPrioridades().then(setPrioridades).catch(() => {});
    api.getUsuarios().then(setUsuarios).catch(() => {});
  }, [pedidoId]);

  function actualizarAsignacion(lineaId, cambios) {
    setAsignaciones((prev) => ({
      ...prev,
      [lineaId]: { tipoResponsable: "interno", ...prev[lineaId], ...cambios },
    }));
  }

  // Copiar la asignación de la primera línea al resto — el caso más común es
  // un pedido donde todas las líneas las hace la misma persona; sigue siendo
  // editable línea por línea después de copiar.
  function copiarPrimeraATodas() {
    const primera = lineas[0];
    const base = asignaciones[primera.id] || {};
    setAsignaciones((prev) => {
      const siguiente = { ...prev };
      for (const linea of lineas.slice(1)) {
        siguiente[linea.id] = { ...siguiente[linea.id], ...base };
      }
      return siguiente;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (
      !confirm(
        `¿Facturar este pedido con ${lineas.length} línea(s)? Se crearán las Órdenes de Producción y no se puede volver atrás.`
      )
    )
      return;
    setError(null);
    setEnviando(true);
    try {
      const listaAsignaciones = lineas.map((linea) => {
        const a = asignaciones[linea.id] || {};
        return {
          lineaId: linea.id,
          prioridadId: linea.prioridadId || (a.prioridadId ? Number(a.prioridadId) : undefined),
          responsableUsuarioId: a.tipoResponsable !== "externo" ? a.responsableUsuarioId : undefined,
          responsableExterno: a.tipoResponsable === "externo" ? a.responsableExterno : undefined,
        };
      });
      await api.facturarPedido(pedidoId, { asignaciones: listaAsignaciones });
      onFacturado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!lineas) return <SkeletonPanel lineas={2} />;
  if (lineas.length === 0) {
    return <AlertaError>Este pedido no tiene líneas todavía — agrega al menos una antes de facturar.</AlertaError>;
  }

  return (
    <form onSubmit={handleSubmit} className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {lineas.length > 1 && (
        <div className="acciones" style={{ marginBottom: "-0.25rem" }}>
          <button type="button" className="btn-ghost btn-sm" onClick={copiarPrimeraATodas}>
            ⧉ Copiar responsable de la línea 1 a todas
          </button>
        </div>
      )}
      <div className="lineas-lista">
        {lineas.map((linea) => {
          const a = asignaciones[linea.id] || { tipoResponsable: "interno" };
          const meta = [linea.talla && `Talla: ${linea.talla}`, linea.tela && `Tela: ${linea.tela}`, linea.color && `Color: ${linea.color}`]
            .filter(Boolean)
            .join(" · ");
          const prioridadHeredada = !linea.prioridadId && pedidoPrioridadNombre;
          const necesitaPrioridad = !linea.prioridadId && !pedidoPrioridadNombre;
          return (
            <div key={linea.id} className="panel">
              <div className="linea-card-resumen" style={{ marginBottom: "0.85rem" }}>
                <span className="linea-card-resumen-titulo" style={{ fontSize: "0.95rem" }}>
                  {linea.producto} — {linea.cantidad} u.
                  {linea.precioUnitario != null && ` · $${linea.precioUnitario} c/u`}
                </span>
                <span className="linea-card-resumen-meta">
                  {meta || "Sin datos técnicos adicionales"}
                  {prioridadHeredada && ` · Prioridad: ${pedidoPrioridadNombre} (del pedido)`}
                </span>
              </div>

              <div className="form-grid">
                {necesitaPrioridad && (
                  <select
                    value={a.prioridadId || ""}
                    onChange={(e) => actualizarAsignacion(linea.id, { prioridadId: e.target.value })}
                    required
                  >
                    <option value="">Prioridad</option>
                    {prioridades.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                )}

                {a.tipoResponsable === "interno" ? (
                  <select
                    value={a.responsableUsuarioId || ""}
                    onChange={(e) => actualizarAsignacion(linea.id, { responsableUsuarioId: e.target.value })}
                    required
                  >
                    <option value="">-- Responsable interno --</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} {u.puesto ? `(${u.puesto.nombre})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Nombre del taller/proveedor externo"
                    value={a.responsableExterno || ""}
                    onChange={(e) => actualizarAsignacion(linea.id, { responsableExterno: e.target.value })}
                    required
                  />
                )}
              </div>
              <div className="item-row" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem" }}>
                  <input
                    type="radio"
                    checked={a.tipoResponsable === "interno"}
                    onChange={() => actualizarAsignacion(linea.id, { tipoResponsable: "interno" })}
                  />
                  Interno
                </label>
                <label style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem" }}>
                  <input
                    type="radio"
                    checked={a.tipoResponsable === "externo"}
                    onChange={() => actualizarAsignacion(linea.id, { tipoResponsable: "externo" })}
                  />
                  Externo
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <AlertaError>{error}</AlertaError>

      <div>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando && <Spinner />}
          {enviando ? "Facturando..." : "Facturar pedido"}
        </button>
      </div>
    </form>
  );
}
