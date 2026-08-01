import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SubSidebar } from "./SubSidebar";
import { Topbar } from "./Topbar";
import { Breadcrumb } from "./Breadcrumb";
import { CommandPalette } from "../components/CommandPalette";

const CLAVE_COLAPSADO = "gbos-sidebar-colapsado";

// Cascarón de toda la app autenticada: rail (Sidebar) + panel contextual
// (SubSidebar, puede no renderizar nada) + columna principal (Topbar +
// Breadcrumb + contenido de la ruta activa vía Outlet). Cada página de
// contenido no sabe nada de este layout — solo se monta dentro del <main>.
export function AppShell() {
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(CLAVE_COLAPSADO) === "1");

  function toggleColapsado() {
    setColapsado((actual) => {
      const nuevo = !actual;
      localStorage.setItem(CLAVE_COLAPSADO, nuevo ? "1" : "0");
      return nuevo;
    });
  }

  return (
    <div className="app-shell">
      <CommandPalette />
      <Sidebar colapsado={colapsado} />
      <SubSidebar />
      <div className="app-shell-principal">
        <Topbar colapsado={colapsado} onToggleColapsado={toggleColapsado} />
        <main className="app-shell-contenido">
          <Breadcrumb />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
