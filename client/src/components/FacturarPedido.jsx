import { useEffect, useState } from "react";
import { api } from "../api/client";

const LINEA_VACIA = {
  producto: "",
  cantidad: 1,
  tipoTrabajo: "",
  medida: "",
  prioridadId: "",
  tipoResponsable: "interno",
  responsableUsuarioId: "",
  responsableExterno: "",
};

// El paso de negocio que convierte un Pedido en Orden(es) de Producción real.
// Vive en su propio componente porque probablemente se reutilice donde sea
// que en el futuro se quiera facturar (ej. desde el listado de pedidos).
export function FacturarPedido({ pedidoId, onFacturado }) {
  const [prioridades, setPrioridades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [lineas, setLineas] = useState([{ ...LINEA_VACIA }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getPrioridades().then(setPrioridades).catch(() => {});
    api.getUsuarios().then(setUsuarios).catch(() => {});
  }, []);

  function actualizarLinea(index, cambios) {
    setLineas((prev) => prev.map((linea, i) => (i === index ? { ...linea, ...cambios } : linea)));
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, { ...LINEA_VACIA }]);
  }

  function quitarLinea(index) {
    setLineas((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const payload = {
        lineas: lineas.map((linea) => ({
          producto: linea.producto,
          cantidad: Number(linea.cantidad),
          tipoTrabajo: linea.tipoTrabajo || undefined,
          medida: linea.medida || undefined,
          prioridadId: Number(linea.prioridadId),
          responsableUsuarioId: linea.tipoResponsable === "interno" ? linea.responsableUsuarioId : undefined,
          responsableExterno: linea.tipoResponsable === "externo" ? linea.responsableExterno : undefined,
        })),
      };
      await api.facturarPedido(pedidoId, payload);
      onFacturado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      {lineas.map((linea, index) => (
        <fieldset key={index}>
          <legend>Línea {index + 1}</legend>
          <div className="item-row">
            <input
              type="text"
              placeholder="Producto"
              value={linea.producto}
              onChange={(e) => actualizarLinea(index, { producto: e.target.value })}
              required
            />
            <input
              type="number"
              min={1}
              placeholder="Cantidad"
              value={linea.cantidad}
              onChange={(e) => actualizarLinea(index, { cantidad: e.target.value })}
              style={{ width: "6rem" }}
              required
            />
            <select
              value={linea.prioridadId}
              onChange={(e) => actualizarLinea(index, { prioridadId: e.target.value })}
              required
            >
              <option value="">Prioridad</option>
              {prioridades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="item-row">
            <input
              type="text"
              placeholder="Tipo de trabajo (opcional)"
              value={linea.tipoTrabajo}
              onChange={(e) => actualizarLinea(index, { tipoTrabajo: e.target.value })}
            />
            <input
              type="text"
              placeholder="Medida (opcional)"
              value={linea.medida}
              onChange={(e) => actualizarLinea(index, { medida: e.target.value })}
            />
          </div>
          <div className="item-row">
            <label>
              <input
                type="radio"
                checked={linea.tipoResponsable === "interno"}
                onChange={() => actualizarLinea(index, { tipoResponsable: "interno" })}
              />{" "}
              Responsable interno
            </label>
            <label>
              <input
                type="radio"
                checked={linea.tipoResponsable === "externo"}
                onChange={() => actualizarLinea(index, { tipoResponsable: "externo" })}
              />{" "}
              Responsable externo
            </label>
          </div>
          {linea.tipoResponsable === "interno" ? (
            <select
              value={linea.responsableUsuarioId}
              onChange={(e) => actualizarLinea(index, { responsableUsuarioId: e.target.value })}
              required
            >
              <option value="">-- Usuario --</option>
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
              value={linea.responsableExterno}
              onChange={(e) => actualizarLinea(index, { responsableExterno: e.target.value })}
              required
            />
          )}
          {lineas.length > 1 && (
            <button type="button" onClick={() => quitarLinea(index)}>
              Quitar línea
            </button>
          )}
        </fieldset>
      ))}

      <button type="button" onClick={agregarLinea}>
        + Agregar línea
      </button>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      <button type="submit" className="btn-primary" disabled={enviando}>
        {enviando ? "Facturando..." : "Facturar pedido"}
      </button>
    </form>
  );
}
