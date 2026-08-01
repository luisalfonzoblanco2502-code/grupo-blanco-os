import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { MODULOS } from "../nav/modules";
import { moduloVisible } from "../nav/permisos";

// Landing simple: antes esta ruta ERA el Centro de Control y redirigía al
// Operador a "/ordenes" según su permiso — con Centro de Control como
// módulo propio en el sidebar, ese hack ya no hace falta. Cualquier usuario
// autenticado ve esto y elige a dónde ir.
export function Inicio() {
  const { perfil } = useAuth();
  const permisos = perfil?.rol?.permisos;
  const accesos = MODULOS.filter((m) => m.key !== "inicio" && moduloVisible(permisos, m));

  return (
    <div>
      <h1>Hola, {perfil?.nombre ?? "de nuevo"}</h1>
      <p style={{ color: "var(--text-muted)" }}>
        {perfil?.empresa?.nombre} · {perfil?.rol?.nombre}
      </p>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
        {accesos.map((m) => (
          <Link key={m.key} to={m.path} className="card" style={{ textDecoration: "none", minWidth: "10rem" }}>
            <div style={{ fontSize: "1.5rem" }}>{m.icon}</div>
            <div className="card-label">{m.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
