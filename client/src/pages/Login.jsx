import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

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
    <div style={{ maxWidth: "24rem", margin: "4rem auto" }}>
      <h1 style={{ textAlign: "center" }}>Grupo Blanco OS</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
