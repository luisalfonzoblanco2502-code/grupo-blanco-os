import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AlertaError } from "../components/AlertaError";
import { Spinner } from "../components/Spinner";

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await signIn(email, password);
      const destino = location.state?.from ?? "/";
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err.message === "Invalid login credentials" ? "Correo o contraseña incorrectos" : err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, var(--bg) 0%, var(--surface-sunken) 100%)",
        padding: "1.5rem",
      }}
    >
      <div className="fade-in" style={{ width: "100%", maxWidth: "23rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", marginBottom: "1.75rem" }}>
          <span className="sidebar-marca-icono" style={{ width: "2.1rem", height: "2.1rem", fontSize: "0.8rem" }}>GB</span>
          <span style={{ fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.01em" }}>Grupo Blanco OS</span>
        </div>

        <div className="panel" style={{ boxShadow: "var(--shadow-lg)" }}>
          <h1 style={{ fontSize: "1.15rem", marginBottom: "0.2rem" }}>Iniciar sesión</h1>
          <p className="pagina-subtitulo" style={{ marginBottom: "1.4rem" }}>Ingresa con tu cuenta de Panaprice.</p>

          <form onSubmit={handleSubmit} className="form" style={{ maxWidth: "none" }}>
            <label style={{ margin: 0 }}>
              Correo
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@panaprice.com"
                required
                autoFocus
              />
            </label>
            <label style={{ margin: 0 }}>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </label>
            <AlertaError>{error}</AlertaError>
            <button type="submit" className="btn-primary" disabled={enviando} style={{ justifyContent: "center", marginTop: "0.3rem" }}>
              {enviando && <Spinner />}
              {enviando ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
