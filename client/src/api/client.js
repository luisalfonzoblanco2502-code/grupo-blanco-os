import { supabase } from "../supabaseClient";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  const inicio = performance.now();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  // Instrumentación Sprint 11 (piloto): tiempo total percibido por el
  // cliente, para comparar contra el log "[tiempos]" del backend y ver
  // cuánto es red/navegador vs. procesamiento del servidor.
  const totalMs = performance.now() - inicio;
  console.log(`[tiempos-cliente] ${options.method || "GET"} ${path} -> ${totalMs.toFixed(0)}ms`);
  if (!res.ok) {
    throw new Error(data?.error || `Error ${res.status}`);
  }
  return data;
}

export const api = {
  getDashboard: () => request("/dashboard"),

  getPedidos: () => request("/pedidos"),
  getPedido: (id) => request(`/pedidos/${id}`),
  createPedido: (data) => request("/pedidos", { method: "POST", body: JSON.stringify(data) }),
  updatePedido: (id, data) =>
    request(`/pedidos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  cancelarPedido: (id) => request(`/pedidos/${id}/cancelar`, { method: "PATCH" }),
  facturarPedido: (id, data) =>
    request(`/pedidos/${id}/facturar`, { method: "POST", body: JSON.stringify(data) }),
  cambiarEstadoPedido: (id, estadoNuevo) =>
    request(`/pedidos/${id}/estado`, { method: "PATCH", body: JSON.stringify({ estadoNuevo }) }),
  registrarPago: (id, data) => request(`/pedidos/${id}/pagos`, { method: "POST", body: JSON.stringify(data) }),
  getPagos: (id) => request(`/pedidos/${id}/pagos`),

  getLineasPedido: (pedidoId) => request(`/pedidos/${pedidoId}/lineas`),
  crearLineaPedido: (pedidoId, data) =>
    request(`/pedidos/${pedidoId}/lineas`, { method: "POST", body: JSON.stringify(data) }),
  actualizarLineaPedido: (lineaId, data) =>
    request(`/pedidos/lineas/${lineaId}`, { method: "PATCH", body: JSON.stringify(data) }),
  duplicarLineaPedido: (lineaId) => request(`/pedidos/lineas/${lineaId}/duplicar`, { method: "POST" }),
  eliminarLineaPedido: (lineaId) => request(`/pedidos/lineas/${lineaId}`, { method: "DELETE" }),

  getSugerenciasTecnicas: () => request("/pedidos/sugerencias-tecnicas"),
  getCalidadDatosTecnicos: () => request("/pedidos/calidad-datos"),

  registrarLogin: () => request("/auth/login-evento", { method: "POST" }),
  registrarLogout: () => request("/auth/logout-evento", { method: "POST" }),

  getUsuarios: () => request("/usuarios"),

  buscarClientes: (q) => request(`/clientes${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  crearCliente: (data) => request("/clientes", { method: "POST", body: JSON.stringify(data) }),

  getOrdenesProduccion: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/ordenes-produccion${qs ? `?${qs}` : ""}`);
  },
  getOrdenProduccion: (id) => request(`/ordenes-produccion/${id}`),
  cambiarEtapaOrden: (id, etapaId) =>
    request(`/ordenes-produccion/${id}/etapa`, { method: "PATCH", body: JSON.stringify({ etapaId }) }),
  reasignarResponsableOrden: (id, data) =>
    request(`/ordenes-produccion/${id}/responsable`, { method: "PATCH", body: JSON.stringify(data) }),

  getEtapas: () => request("/etapas"),
  getPrioridades: () => request("/prioridades"),

  getProductos: () => request("/productos"),
  getProducto: (id) => request(`/productos/${id}`),
  createProducto: (data) => request("/productos", { method: "POST", body: JSON.stringify(data) }),
  updateProducto: (id, data) =>
    request(`/productos/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  eliminarProducto: (id) => request(`/productos/${id}`, { method: "DELETE" }),

  getSolicitudes: (estado) => request(`/solicitudes${estado ? `?estado=${estado}` : ""}`),
  getSolicitud: (id) => request(`/solicitudes/${id}`),
  cambiarEstadoSolicitud: (id, data) =>
    request(`/solicitudes/${id}/estado`, { method: "PATCH", body: JSON.stringify(data) }),
  convertirSolicitud: (id, data) =>
    request(`/solicitudes/${id}/convertir`, { method: "POST", body: JSON.stringify(data) }),

  // Núcleo de Facturación Administrativa: ahora sobre tablas reales (ver
  // server/prisma/migrations_manual/0002_facturador_administrativo.sql).
  getDocumentosVenta: () => request("/nucleo-facturacion/documentos"),
  getDocumentoPorPedido: (pedidoId) => request(`/nucleo-facturacion/documentos/${pedidoId}`),

  getItemsInventario: () => request("/nucleo-facturacion/inventario/items"),
  getInventarioAlertas: () => request("/nucleo-facturacion/inventario/alertas"),
  getInventarioMovimientos: () => request("/nucleo-facturacion/inventario/movimientos"),
  crearItemInventario: (data) =>
    request("/nucleo-facturacion/inventario/items", { method: "POST", body: JSON.stringify(data) }),
  registrarEntradaInventario: (id, data) =>
    request(`/nucleo-facturacion/inventario/items/${id}/entrada`, { method: "POST", body: JSON.stringify(data) }),

  getProductosInternos: () => request("/nucleo-facturacion/productos-internos"),
  getProductoInterno: (id) => request(`/nucleo-facturacion/productos-internos/${id}`),
  crearProductoInterno: (data) =>
    request("/nucleo-facturacion/productos-internos", { method: "POST", body: JSON.stringify(data) }),
  agregarInsumoProducto: (id, data) =>
    request(`/nucleo-facturacion/productos-internos/${id}/insumos`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  quitarInsumoProducto: (insumoId) =>
    request(`/nucleo-facturacion/productos-internos/insumos/${insumoId}`, { method: "DELETE" }),

  getCrmClientes: () => request("/nucleo-facturacion/crm/clientes"),
  getCostos: () => request("/nucleo-facturacion/costos"),
  getIndicadoresFacturacion: () => request("/nucleo-facturacion/indicadores"),
  getCajasCuentas: () => request("/nucleo-facturacion/cajas-cuentas"),

  // ATLAS — Centro de Atención Inteligente (Sprint 0.1, 2026-07-31)
  getAtlasResumen: () => request("/atlas/metricas/resumen"),
  getAtlasContactos: () => request("/atlas/contactos"),
};
