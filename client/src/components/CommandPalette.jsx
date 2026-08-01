import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { puedeVer } from "../nav/permisos";
import { useAuth } from "../auth/AuthContext";

const ACCIONES = [
  { icono: "➕", label: "Nuevo pedido", path: "/pedidos/nuevo", permiso: "crear_pedido" },
  { icono: "📦", label: "Pedidos", path: "/pedidos", permiso: "ver_pedidos" },
  { icono: "🏭", label: "Producción — Órdenes", path: "/produccion/ordenes", permiso: null },
  { icono: "▤", label: "Producción — Kanban", path: "/produccion/kanban", permiso: null },
  { icono: "📋", label: "Centro de Control", path: "/centro-control", permiso: "ver_dashboard_ejecutivo" },
];

// Búsqueda rápida global (Ctrl/Cmd+K) + atajos de un solo carácter (N/P) —
// reutiliza el mismo endpoint de búsqueda de Órdenes (que ya cubre OP,
// pedido, cliente, producto y responsable) en vez de crear un buscador
// paralelo nuevo.
export function CommandPalette() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const permisos = perfil?.rol?.permisos;
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef(null);

  function cerrar() {
    setAbierto(false);
    setQuery("");
    setResultados([]);
  }

  useEffect(() => {
    function esCampoDeTexto(el) {
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    }
    function onKeyDown(e) {
      const enCampo = esCampoDeTexto(document.activeElement);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((v) => !v);
        return;
      }
      if (abierto) {
        if (e.key === "Escape") {
          e.preventDefault();
          cerrar();
        }
        return;
      }
      if (enCampo) return;
      if (e.key.toLowerCase() === "n" && puedeVer(permisos, "crear_pedido")) {
        e.preventDefault();
        navigate("/pedidos/nuevo");
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        navigate("/produccion/ordenes");
      }
    }
    function onAbrirExterno() {
      setAbierto(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("gbos:abrir-buscador", onAbrirExterno);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("gbos:abrir-buscador", onAbrirExterno);
    };
  }, [abierto, permisos, navigate]);

  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 10);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const texto = query.trim();
    if (texto.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const id = setTimeout(() => {
      api
        .getOrdenesProduccion({ busqueda: texto })
        .then((ordenes) =>
          setResultados(
            ordenes.slice(0, 8).map((o) => ({
              icono: "🏭",
              label: `${o.opId} — ${o.producto}`,
              meta: `${o.pedido.clienteNombre} · ${o.pedido.pedId}`,
              path: `/produccion/ordenes/${o.id}`,
            }))
          )
        )
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(id);
  }, [query, abierto]);

  const acciones = ACCIONES.filter(
    (a) => puedeVer(permisos, a.permiso) && a.label.toLowerCase().includes(query.trim().toLowerCase())
  );
  const items = [...acciones, ...resultados];

  useEffect(() => setActivo(0), [query, abierto]);

  function ir(item) {
    navigate(item.path);
    cerrar();
  }

  function onKeyDownLista(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((v) => Math.min(v + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((v) => Math.max(v - 1, 0));
    } else if (e.key === "Enter" && items[activo]) {
      e.preventDefault();
      ir(items[activo]);
    }
  }

  if (!abierto) return null;

  return (
    <div className="cmdk-overlay" onClick={cerrar}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Buscar pedido, cliente, producto, N° OP o responsable..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDownLista}
        />
        <div className="cmdk-lista">
          {acciones.length > 0 && <div className="cmdk-grupo-titulo">Ir a</div>}
          {acciones.map((item, i) => (
            <div
              key={item.path}
              className={`cmdk-item${items.indexOf(item) === activo ? " cmdk-item-activo" : ""}`}
              onMouseEnter={() => setActivo(items.indexOf(item))}
              onClick={() => ir(item)}
            >
              <span className="cmdk-item-icono">{item.icono}</span>
              {item.label}
            </div>
          ))}
          {query.trim().length >= 2 && (
            <>
              <div className="cmdk-grupo-titulo">Resultados{buscando ? " — buscando..." : ""}</div>
              {resultados.map((item) => (
                <div
                  key={item.path}
                  className={`cmdk-item${items.indexOf(item) === activo ? " cmdk-item-activo" : ""}`}
                  onMouseEnter={() => setActivo(items.indexOf(item))}
                  onClick={() => ir(item)}
                >
                  <span className="cmdk-item-icono">{item.icono}</span>
                  {item.label}
                  <span className="cmdk-item-meta">{item.meta}</span>
                </div>
              ))}
              {!buscando && resultados.length === 0 && <div className="cmdk-vacio">Sin resultados para "{query}"</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
