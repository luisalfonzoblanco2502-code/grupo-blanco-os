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

  registrarLogin: () => request("/auth/login-evento", { method: "POST" }),
  registrarLogout: () => request("/auth/logout-evento", { method: "POST" }),

  getUsuarios: () => request("/usuarios"),

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
};
