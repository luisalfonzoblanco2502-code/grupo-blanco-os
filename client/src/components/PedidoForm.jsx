import { useState } from "react";

const VACIO = {
  clienteNombre: "",
  fechaIngreso: new Date().toISOString().slice(0, 10),
  fechaCompromiso: "",
  cantidadTotal: 1,
  observaciones: "",
};

// Reutilizado por "Nuevo pedido" y "Editar pedido" — misma forma, mismas
// validaciones de UI (las validaciones de negocio reales viven en el
// backend, en pedidos.service.js; esto es solo para dar feedback rápido).
export function PedidoForm({ valoresIniciales, onSubmit, enviando, error, textoBoton }) {
  const [valores, setValores] = useState({ ...VACIO, ...valoresIniciales });

  function actualizar(campo, valor) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit({ ...valores, cantidadTotal: Number(valores.cantidadTotal) });
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        Cliente
        <input
          type="text"
          value={valores.clienteNombre}
          onChange={(e) => actualizar("clienteNombre", e.target.value)}
          required
        />
      </label>
      <label>
        Fecha de ingreso
        <input
          type="date"
          value={valores.fechaIngreso?.slice(0, 10)}
          onChange={(e) => actualizar("fechaIngreso", e.target.value)}
          required
        />
      </label>
      <label>
        Fecha de compromiso
        <input
          type="date"
          value={valores.fechaCompromiso?.slice(0, 10)}
          onChange={(e) => actualizar("fechaCompromiso", e.target.value)}
          required
        />
      </label>
      <label>
        Cantidad total
        <input
          type="number"
          min={1}
          value={valores.cantidadTotal}
          onChange={(e) => actualizar("cantidadTotal", e.target.value)}
          required
        />
      </label>
      <label>
        Observaciones
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
