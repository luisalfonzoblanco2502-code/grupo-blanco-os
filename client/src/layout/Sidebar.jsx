import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { MODULOS } from "../nav/modules";
import { moduloVisible } from "../nav/permisos";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";

// Rail de nivel 1: siempre visible, se puede colapsar a solo íconos.
// Colapsar es una preferencia puramente visual (ancho), nunca de permisos —
// eso lo decide moduloVisible().
export function Sidebar({ colapsado }) {
  const { perfil } = useAuth();
  const permisos = perfil?.rol?.permisos;

  // Bandeja de Solicitudes (2026-08-02): "Solicitudes (N)" para que nadie
  // se olvide de revisar lo que llega del catálogo. Se pide una sola vez al
  // montar el sidebar (no hay socket/push todavía) — suficiente para el
  // caso de uso real: alguien abre el ERP y ve si hay algo nuevo.
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  useEffect(() => {
    if (!permisos?.ver_pedidos) return;
    api
      .getSolicitudes("RECIBIDA")
      .then((lista) => setSolicitudesPendientes(lista.length))
      .catch(() => {});
  }, [permisos]);

  return (
    <aside className={`sidebar${colapsado ? " sidebar-colapsado" : ""}`}>
      <div className="sidebar-marca">
        <span className="sidebar-marca-icono">GB</span>
        {!colapsado && (
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
            {/* Wordmark de texto (identidad Panaprice Custom) como marca
                principal — placeholder hasta tener el logo real; reemplazar
                acá cuando llegue el archivo (una línea de código). */}
            <span className="sidebar-marca-panaprice">Panaprice Custom</span>
            <span className="sidebar-marca-texto">Grupo Blanco OS</span>
          </span>
        )}
      </div>
      <nav className="sidebar-nav">
        {MODULOS.filter((m) => moduloVisible(permisos, m)).map((m) => (
          <NavLink
            key={m.key}
            to={m.path}
            end={m.path === "/"}
            className={({ isActive }) => `sidebar-item${isActive ? " sidebar-item-activo" : ""}`}
            title={m.label}
          >
            <span className="sidebar-item-icono">{m.icon}</span>
            {!colapsado && (
              <span className="sidebar-item-label">
                {m.label}
                {m.key === "solicitudes" && solicitudesPendientes > 0 && ` (${solicitudesPendientes})`}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
