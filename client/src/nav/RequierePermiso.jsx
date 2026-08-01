import { useAuth } from "../auth/AuthContext";
import { puedeVer } from "./permisos";

// Complemento de ProtectedRoute (esa exige sesión; esta exige el permiso
// puntual del módulo/submódulo). Se usa por ruta, no solo por módulo top-level,
// porque algunos submenús (ej. "Centro de Control" dentro de Producción)
// tienen un permiso más estricto que el módulo que los contiene.
export function RequierePermiso({ clave, children }) {
  const { perfil } = useAuth();
  if (!puedeVer(perfil?.rol?.permisos, clave)) {
    return (
      <div className="card" style={{ maxWidth: "32rem" }}>
        <h2>Acceso restringido</h2>
        <p style={{ color: "var(--text-muted)" }}>Tu rol no tiene permiso para ver esta sección.</p>
      </div>
    );
  }
  return children;
}
