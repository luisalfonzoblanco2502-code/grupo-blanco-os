import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { PedidosList } from "./pages/PedidosList";
import { PedidoDetail } from "./pages/PedidoDetail";
import { PedidoNew } from "./pages/PedidoNew";
import { PedidoEdit } from "./pages/PedidoEdit";
import { OrdenesProduccionList } from "./pages/OrdenesProduccionList";
import { OrdenProduccionDetail } from "./pages/OrdenProduccionDetail";
import { ProductosList } from "./pages/ProductosList";
import { ProductoNew } from "./pages/ProductoNew";
import { SolicitudesList } from "./pages/SolicitudesList";
import { SolicitudDetail } from "./pages/SolicitudDetail";
import { Login } from "./pages/Login";
import { useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";

function Cabecera() {
  const { session, perfil, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <header className="app-header">
      <h2>Grupo Blanco OS</h2>
      {session && (
        <nav style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link to="/">Dashboard</Link>
          <Link to="/pedidos">Pedidos</Link>
          <Link to="/ordenes">Órdenes de producción</Link>
          <Link to="/solicitudes">Solicitudes</Link>
          <Link to="/productos">Productos</Link>
          <span style={{ color: "var(--text-muted)" }}>{perfil?.nombre ?? session.user.email}</span>
          <button onClick={handleSignOut}>Cerrar sesión</button>
        </nav>
      )}
    </header>
  );
}

export default function App() {
  return (
    <div className="app">
      <Cabecera />
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos"
            element={
              <ProtectedRoute>
                <PedidosList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/nuevo"
            element={
              <ProtectedRoute>
                <PedidoNew />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/:id"
            element={
              <ProtectedRoute>
                <PedidoDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pedidos/:id/editar"
            element={
              <ProtectedRoute>
                <PedidoEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ordenes"
            element={
              <ProtectedRoute>
                <OrdenesProduccionList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ordenes/:id"
            element={
              <ProtectedRoute>
                <OrdenProduccionDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/solicitudes"
            element={
              <ProtectedRoute>
                <SolicitudesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/solicitudes/:id"
            element={
              <ProtectedRoute>
                <SolicitudDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/productos"
            element={
              <ProtectedRoute>
                <ProductosList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/productos/nuevo"
            element={
              <ProtectedRoute>
                <ProductoNew />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
