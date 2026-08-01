import { NavLink, useLocation } from "react-router-dom";
import { puedeVer } from "../nav/permisos";
import { encontrarModuloActivo } from "../nav/activo";
import { useAuth } from "../auth/AuthContext";

// Panel de nivel 2: el submenú propio del módulo activo. Aparece solo si el
// módulo actual declara `submenu` en el registro — Pedidos, Centro de
// Control, Compras, Reportes y Configuración no lo tienen todavía, así que
// para esas rutas este panel no se renderiza y el contenido ocupa todo el ancho.
export function SubSidebar() {
  const { pathname } = useLocation();
  const { perfil } = useAuth();
  const permisos = perfil?.rol?.permisos;

  const moduloActivo = encontrarModuloActivo(pathname);
  if (!moduloActivo?.submenu) return null;

  const items = moduloActivo.submenu.filter((item) => puedeVer(permisos, item.permiso));
  if (items.length === 0) return null;

  return (
    <nav className="subsidebar">
      <div className="subsidebar-titulo">{moduloActivo.label}</div>
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          className={({ isActive }) => `subsidebar-item${isActive ? " subsidebar-item-activo" : ""}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
