import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Topbar({ colapsado, onToggleColapsado }) {
  const { session, perfil, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-toggle"
        onClick={onToggleColapsado}
        aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
        title={colapsado ? "Expandir menú" : "Colapsar menú"}
      >
        ☰
      </button>
      <button
        type="button"
        className="topbar-buscar"
        onClick={() => window.dispatchEvent(new Event("gbos:abrir-buscador"))}
      >
        🔍 Buscar pedido, OP, cliente...
        <kbd>Ctrl K</kbd>
      </button>
      <div style={{ flex: 1 }} />
      {session && (
        <div className="topbar-usuario">
          <span style={{ color: "var(--text-muted)" }}>
            {perfil?.nombre ?? session.user.email}
            {perfil?.rol?.nombre ? ` (${perfil.rol.nombre})` : ""}
          </span>
          <button onClick={handleSignOut}>Cerrar sesión</button>
        </div>
      )}
    </header>
  );
}
