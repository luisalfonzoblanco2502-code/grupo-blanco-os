import { NavLink } from "react-router-dom";
import { MODULOS } from "../nav/modules";
import { moduloVisible } from "../nav/permisos";
import { useAuth } from "../auth/AuthContext";

// Rail de nivel 1: siempre visible, se puede colapsar a solo íconos.
// Colapsar es una preferencia puramente visual (ancho), nunca de permisos —
// eso lo decide moduloVisible().
export function Sidebar({ colapsado }) {
  const { perfil } = useAuth();
  const permisos = perfil?.rol?.permisos;

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
            {!colapsado && <span className="sidebar-item-label">{m.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
