import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const CLIENTE_NUEVO_VACIO = { nombre: "", telefono: "", email: "", direccion: "" };

// "Buscar cliente existente" + "crear cliente sin abandonar el formulario",
// en un solo campo. Sigue guardando clienteNombre como texto libre (nunca
// deja de funcionar aunque no se elija/cree una ficha) y opcionalmente
// clienteId cuando corresponde a un Cliente real ya existente.
export function SelectorCliente({ clienteNombre, clienteId, onChange }) {
  const { perfil } = useAuth();
  const permisos = perfil?.rol?.permisos || {};
  const [texto, setTexto] = useState(clienteNombre ?? "");
  const [resultados, setResultados] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevo, setNuevo] = useState({ ...CLIENTE_NUEVO_VACIO });
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);
  const contenedorRef = useRef(null);

  useEffect(() => {
    setTexto(clienteNombre ?? "");
  }, [clienteNombre]);

  useEffect(() => {
    if (!permisos.ver_clientes || !texto.trim()) {
      setResultados([]);
      return;
    }
    const id = setTimeout(() => {
      api.buscarClientes(texto.trim()).then(setResultados).catch(() => {});
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  useEffect(() => {
    function alHacerClicFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  function elegir(cliente) {
    setTexto(cliente.nombre);
    onChange({ clienteNombre: cliente.nombre, clienteId: cliente.id });
    setAbierto(false);
  }

  function escribir(valor) {
    setTexto(valor);
    // Escribir a mano desvincula la ficha elegida antes — el nombre libre
    // sigue siendo válido, solo que ya no apunta a un Cliente real.
    onChange({ clienteNombre: valor, clienteId: null });
    setAbierto(true);
  }

  // Botón normal (no <form>): SelectorCliente ya vive dentro del <form> de
  // PedidoForm, y HTML no permite anidar <form> — un <form> interno acá
  // rompía el submit (bug real, encontrado probando en navegador).
  async function handleCrearCliente() {
    if (!nuevo.nombre.trim()) {
      setError("El nombre del cliente es obligatorio");
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const cliente = await api.crearCliente(nuevo);
      elegir(cliente);
      setMostrarNuevo(false);
      setNuevo({ ...CLIENTE_NUEVO_VACIO });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreando(false);
    }
  }

  return (
    <div ref={contenedorRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onFocus={() => setAbierto(true)}
        placeholder="Nombre o razón social"
        required
      />
      {clienteId && (
        <span style={{ color: "var(--good, #22c55e)", fontSize: "0.78rem", marginLeft: "0.4rem" }}>
          ✓ vinculado a ficha de cliente
        </span>
      )}

      {abierto && permisos.ver_clientes && (resultados.length > 0 || (texto.trim() && permisos.crear_cliente)) && (
        <div
          className="card"
          style={{
            position: "absolute",
            zIndex: 20,
            marginTop: "0.25rem",
            width: "100%",
            minWidth: "20rem",
            maxHeight: "16rem",
            overflowY: "auto",
            padding: "0.5rem",
          }}
        >
          {resultados.map((c) => (
            <div
              key={c.id}
              onClick={() => elegir(c)}
              style={{ padding: "0.4rem 0.5rem", borderRadius: "6px", cursor: "pointer" }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <strong>{c.nombre}</strong>
              {c.telefono && <span style={{ color: "var(--text-muted)" }}> · {c.telefono}</span>}
            </div>
          ))}
          {permisos.crear_cliente && (
            <button
              type="button"
              onClick={() => {
                setNuevo((p) => ({ ...p, nombre: texto.trim() }));
                setMostrarNuevo(true);
                setAbierto(false);
              }}
              style={{ width: "100%", marginTop: "0.25rem" }}
            >
              + Crear cliente nuevo{texto.trim() ? `: "${texto.trim()}"` : ""}
            </button>
          )}
        </div>
      )}

      {mostrarNuevo && (
        <div className="card" style={{ marginTop: "0.5rem" }}>
          <div className="form" style={{ gap: "0.5rem" }}>
            <div className="item-row">
              <input
                type="text"
                placeholder="Nombre o razón social"
                value={nuevo.nombre}
                onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Teléfono"
                value={nuevo.telefono}
                onChange={(e) => setNuevo((p) => ({ ...p, telefono: e.target.value }))}
              />
            </div>
            <div className="item-row">
              <input
                type="email"
                placeholder="Correo (opcional)"
                value={nuevo.email}
                onChange={(e) => setNuevo((p) => ({ ...p, email: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Dirección (opcional)"
                value={nuevo.direccion}
                onChange={(e) => setNuevo((p) => ({ ...p, direccion: e.target.value }))}
              />
            </div>
            {error && <p style={{ color: "#f87171" }}>{error}</p>}
            <div className="item-row">
              <button type="button" className="btn-primary" onClick={handleCrearCliente} disabled={creando}>
                {creando ? "Creando..." : "Guardar cliente"}
              </button>
              <button type="button" onClick={() => setMostrarNuevo(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
