import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { Inicio } from "./pages/Inicio";
import { Dashboard } from "./pages/Dashboard";
import { PedidosDashboard } from "./pages/pedidos/PedidosDashboard";
import { PedidosList } from "./pages/PedidosList";
import { PedidoDetail } from "./pages/PedidoDetail";
import { PedidoNew } from "./pages/PedidoNew";
import { PedidoEdit } from "./pages/PedidoEdit";
import { ProduccionDashboard } from "./pages/produccion/ProduccionDashboard";
import { OrdenesProduccionList } from "./pages/OrdenesProduccionList";
import { PedidosKanban } from "./pages/produccion/PedidosKanban";
import { OrdenProduccionDetail } from "./pages/OrdenProduccionDetail";
import { OrdenProduccionImprimir } from "./pages/produccion/OrdenProduccionImprimir";
import { PedidoImprimir } from "./pages/pedidos/PedidoImprimir";
import { PedidoRecibo } from "./pages/pedidos/PedidoRecibo";
import { CalidadDatos } from "./pages/pedidos/CalidadDatos";
import { InventarioDashboard } from "./pages/inventario/InventarioDashboard";
import { MateriaPrimaList } from "./pages/inventario/MateriaPrimaList";
import { ProductosInternosList } from "./pages/inventario/ProductosInternosList";
import { AtlasDashboard } from "./pages/atlas/AtlasDashboard";
import { CrmDashboard } from "./pages/crm/CrmDashboard";
import { FinancieroDashboard } from "./pages/financiero/FinancieroDashboard";
import { ProductosList } from "./pages/ProductosList";
import { ProductoNew } from "./pages/ProductoNew";
import { ProductoEdit } from "./pages/ProductoEdit";
import { SolicitudesList } from "./pages/SolicitudesList";
import { SolicitudDetail } from "./pages/SolicitudDetail";
import { Login } from "./pages/Login";
import { ProximamentePanel } from "./components/ProximamentePanel";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { RequierePermiso } from "./nav/RequierePermiso";

// La sesión ya está garantizada por el ProtectedRoute que envuelve <AppShell>
// más abajo (todo esto vive dentro de su <Outlet>) — acá solo hace falta
// resolver el permiso puntual de cada página, si tiene uno.
function pagina(elemento, permiso) {
  return permiso ? <RequierePermiso clave={permiso}>{elemento}</RequierePermiso> : elemento;
}

export default function App() {
  return (
    <>
      <div className="bg-blobs" aria-hidden="true">
        <span className="blob blob-azul" />
        <span className="blob blob-violeta" />
        <span className="blob blob-rosa" />
      </div>
      <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route index element={<Inicio />} />

        <Route path="centro-control" element={pagina(<Dashboard />, "ver_dashboard_ejecutivo")} />

        <Route path="pedidos">
          <Route index element={pagina(<PedidosDashboard />, "ver_pedidos")} />
          <Route path="lista" element={pagina(<PedidosList />, "ver_pedidos")} />
          <Route path="calidad-datos" element={pagina(<CalidadDatos />, "ver_dashboard_ejecutivo")} />
          <Route path="nuevo" element={pagina(<PedidoNew />, "ver_pedidos")} />
          <Route path=":id" element={pagina(<PedidoDetail />, "ver_pedidos")} />
          <Route path=":id/editar" element={pagina(<PedidoEdit />, "ver_pedidos")} />
          <Route path=":id/imprimir" element={pagina(<PedidoImprimir />, "imprimir_orden")} />
          <Route path=":id/recibo" element={pagina(<PedidoRecibo />, "ver_pedidos")} />
        </Route>

        <Route path="produccion">
          <Route index element={pagina(<ProduccionDashboard />)} />
          <Route path="ordenes" element={pagina(<OrdenesProduccionList />)} />
          <Route path="kanban" element={pagina(<PedidosKanban />)} />
          <Route path="ordenes/:id" element={pagina(<OrdenProduccionDetail />)} />
          <Route path="ordenes/:id/imprimir" element={pagina(<OrdenProduccionImprimir />, "imprimir_orden")} />
          <Route
            path="responsables"
            element={pagina(<ProximamentePanel titulo="Responsables" />, "ver_dashboard_ejecutivo")}
          />
          <Route
            path="bitacora"
            element={pagina(<ProximamentePanel titulo="Bitácora" />, "ver_dashboard_ejecutivo")}
          />
          <Route
            path="rendimiento"
            element={pagina(<ProximamentePanel titulo="Rendimiento" />, "ver_dashboard_ejecutivo")}
          />
          <Route
            path="reportes"
            element={pagina(<ProximamentePanel titulo="Reportes de Producción" />, "ver_dashboard_ejecutivo")}
          />
        </Route>
        {/* Compatibilidad con la URL anterior (/ordenes) mientras se propaga el cambio. */}
        <Route path="ordenes" element={<Navigate to="/produccion/ordenes" replace />} />
        <Route path="ordenes/:id" element={<RedirigirOrden />} />

        <Route path="inventario" element={pagina(<InventarioDashboard />, "ver_dashboard_ejecutivo")} />
        <Route
          path="inventario/materia-prima"
          element={pagina(<MateriaPrimaList />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/productos-terminados"
          element={pagina(<ProductosInternosList />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/entradas"
          element={pagina(<ProximamentePanel titulo="Entradas" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/salidas"
          element={pagina(<ProximamentePanel titulo="Salidas" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/movimientos"
          element={pagina(<ProximamentePanel titulo="Movimientos" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/ajustes"
          element={pagina(<ProximamentePanel titulo="Ajustes" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/stock-minimo"
          element={pagina(<ProximamentePanel titulo="Stock mínimo" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/valor"
          element={pagina(<ProximamentePanel titulo="Valor del inventario" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="inventario/reportes"
          element={pagina(<ProximamentePanel titulo="Reportes de Inventario" />, "ver_dashboard_ejecutivo")}
        />

        <Route path="atlas" element={pagina(<AtlasDashboard />, "ver_dashboard_ejecutivo")} />

        <Route path="crm" element={pagina(<CrmDashboard />, "ver_dashboard_ejecutivo")} />
        <Route
          path="crm/clientes"
          element={pagina(<ProximamentePanel titulo="Clientes" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="crm/prospectos"
          element={pagina(<ProximamentePanel titulo="Prospectos" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="crm/historial"
          element={pagina(<ProximamentePanel titulo="Historial" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="crm/seguimiento"
          element={pagina(<ProximamentePanel titulo="Seguimiento" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="crm/clasificacion"
          element={pagina(<ProximamentePanel titulo="Clasificación" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="crm/reportes"
          element={pagina(<ProximamentePanel titulo="Reportes de CRM" />, "ver_dashboard_ejecutivo")}
        />

        <Route path="financiero" element={pagina(<FinancieroDashboard />, "ver_dashboard_ejecutivo")} />
        <Route
          path="financiero/ingresos"
          element={pagina(<ProximamentePanel titulo="Ingresos" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/egresos"
          element={pagina(<ProximamentePanel titulo="Egresos" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/caja"
          element={pagina(<ProximamentePanel titulo="Caja" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/bancos"
          element={pagina(<ProximamentePanel titulo="Bancos" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/costos"
          element={pagina(<ProximamentePanel titulo="Costos" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/utilidad"
          element={pagina(<ProximamentePanel titulo="Utilidad" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/cuentas-por-cobrar"
          element={pagina(<ProximamentePanel titulo="Cuentas por cobrar" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/cuentas-por-pagar"
          element={pagina(<ProximamentePanel titulo="Cuentas por pagar" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/movimientos"
          element={pagina(<ProximamentePanel titulo="Movimientos" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="financiero/reportes"
          element={pagina(<ProximamentePanel titulo="Reportes Financieros" />, "ver_dashboard_ejecutivo")}
        />

        <Route
          path="compras"
          element={pagina(<ProximamentePanel titulo="Compras" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="reportes"
          element={pagina(<ProximamentePanel titulo="Reportes" />, "ver_dashboard_ejecutivo")}
        />
        <Route
          path="configuracion"
          element={pagina(<ProximamentePanel titulo="Configuración" />, "gestionar_usuarios")}
        />

        {/* Solicitudes: sin entrada en el sidebar todavía (no pedida) —
            la ruta ya funciona, se accede por URL directa. Productos SÍ
            tiene entrada de menú (ver nav/modules.js) desde 2026-07-28. */}
        <Route path="solicitudes" element={pagina(<SolicitudesList />)} />
        <Route path="solicitudes/:id" element={pagina(<SolicitudDetail />)} />
        <Route path="productos" element={pagina(<ProductosList />)} />
        <Route path="productos/nuevo" element={pagina(<ProductoNew />)} />
        <Route path="productos/:id/editar" element={pagina(<ProductoEdit />)} />
      </Route>
      </Routes>
    </>
  );
}

function RedirigirOrden() {
  const { id } = useParams();
  return <Navigate to={`/produccion/ordenes/${id}`} replace />;
}
