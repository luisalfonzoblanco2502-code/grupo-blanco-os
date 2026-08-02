import { useEffect, useState } from "react";
import { api } from "../api/client";
import { SelectorCliente } from "./SelectorCliente";

const VACIO = {
  clienteNombre: "",
  clienteId: null,
  fechaIngreso: new Date().toISOString().slice(0, 10),
  fechaCompromiso: "",
  prioridadId: "",
  tipoEntrega: "",
  direccionAgencia: "",
  observaciones: "",
};

// Edición de la CABECERA de un pedido ya creado (Editar pedido). Las líneas
// (producto/cantidad/precio/etc.) se agregan/editan aparte, en
// PedidoLineasEditor — cantidadTotal ya no se edita acá, se deriva de ellas.
export function PedidoForm({ valoresIniciales, onSubmit, enviando, error, textoBoton }) {
  const [valores, setValores] = useState({ ...VACIO, ...valoresIniciales });
  const [prioridades, setPrioridades] = useState([]);

  useEffect(() => {
    api.getPrioridades().then(setPrioridades).catch(() => {});
  }, []);

  function actualizar(campo, valor) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit(valores);
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        Cliente
        <SelectorCliente
          clienteNombre={valores.clienteNombre}
          clienteId={valores.clienteId}
          cedulaObligatoria={valores.tipoEntrega === "ENCOMIENDA"}
          onChange={({ clienteNombre, clienteId }) => setValores((prev) => ({ ...prev, clienteNombre, clienteId }))}
        />
      </label>
      <div className="item-row">
        <label style={{ flex: 1 }}>
          Fecha de ingreso
          <input
            type="date"
            value={valores.fechaIngreso?.slice(0, 10)}
            onChange={(e) => actualizar("fechaIngreso", e.target.value)}
            required
          />
        </label>
        <label style={{ flex: 1 }}>
          Fecha de compromiso
          <input
            type="date"
            value={valores.fechaCompromiso?.slice(0, 10)}
            onChange={(e) => actualizar("fechaCompromiso", e.target.value)}
            required
          />
        </label>
      </div>
      <div className="item-row">
        <label style={{ flex: 1 }}>
          Prioridad
          <select value={valores.prioridadId || ""} onChange={(e) => actualizar("prioridadId", e.target.value)}>
            <option value="">Sin definir</option>
            {prioridades.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Tipo de entrega
          <select value={valores.tipoEntrega || ""} onChange={(e) => actualizar("tipoEntrega", e.target.value)}>
            <option value="">Sin definir</option>
            <option value="RETIRO">Retiro en tienda</option>
            <option value="ENVIO">Envío</option>
            <option value="AGENCIA">Agencia</option>
          </select>
        </label>
      </div>
      <label>
        Dirección / agencia
        <input
          type="text"
          value={valores.direccionAgencia || ""}
          onChange={(e) => actualizar("direccionAgencia", e.target.value)}
        />
      </label>
      <label>
        Observaciones generales
        <textarea
          value={valores.observaciones ?? ""}
          onChange={(e) => actualizar("observaciones", e.target.value)}
        />
      </label>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      <button type="submit" className="btn-primary" disabled={enviando}>
        {enviando ? "Guardando..." : textoBoton}
      </button>
    </form>
  );
}
