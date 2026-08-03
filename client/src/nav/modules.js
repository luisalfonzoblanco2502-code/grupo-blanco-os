// Registro único de navegación: de acá sale el sidebar, el submenú
// contextual y el breadcrumb. Agregar un módulo nuevo en el futuro debería
// ser, en el caso ideal, solo agregar una entrada acá + las rutas en
// App.jsx — nada más tiene que tocarse.
//
// `permiso`: clave de rol.permisos que controla visibilidad. `null` =
// visible para cualquier usuario autenticado. Los módulos de negocio nuevos
// (Inventario/CRM/Centro Financiero/Compras/Reportes) todavía no tienen
// permiso propio en la base real — se gatean temporalmente con
// "ver_dashboard_ejecutivo" (el mismo que ya usa Centro de Control) hasta
// que se decidan y se den de alta claves propias — esto es explícitamente
// TEMPORAL, no la solución definitiva (confirmado en la fase de ajustes).
//
// Regla de diseño aprobada: ningún módulo abre una tabla directamente. La
// ruta raíz de cada módulo (el ítem "Dashboard" del submenú, o `path` si no
// tiene submenú) es siempre un panel de indicadores — el acceso a
// listados/tablas vive en un submenú aparte (ver "Todos los pedidos" abajo).
export const MODULOS = [
  {
    key: "inicio",
    label: "Inicio",
    icon: "🏠",
    path: "/",
    permiso: null,
  },
  {
    key: "centro-control",
    label: "Centro de Control",
    icon: "📋",
    path: "/centro-control",
    permiso: "ver_dashboard_ejecutivo",
  },
  {
    key: "pedidos",
    label: "Pedidos",
    icon: "📦",
    path: "/pedidos",
    permiso: "ver_pedidos",
    submenu: [
      { label: "Dashboard", path: "/pedidos", end: true },
      { label: "Todos los pedidos", path: "/pedidos/lista" },
      { label: "Calidad de datos", path: "/pedidos/calidad-datos", permiso: "ver_dashboard_ejecutivo" },
    ],
  },
  {
    key: "solicitudes",
    label: "Solicitudes",
    icon: "📥",
    path: "/solicitudes",
    permiso: "ver_pedidos",
  },
  {
    key: "productos",
    label: "Productos",
    icon: "🏷",
    path: "/productos",
    permiso: "ver_dashboard_ejecutivo",
    submenu: [
      { label: "Catálogo", path: "/productos", end: true },
      { label: "Agregar producto", path: "/productos/nuevo" },
    ],
  },
  {
    key: "produccion",
    label: "Producción",
    icon: "🏭",
    path: "/produccion",
    permiso: null, // Operador entra igual, ve una versión reducida (Mis órdenes)
    submenu: [
      { label: "Dashboard", path: "/produccion", end: true },
      { label: "Centro de Control", path: "/centro-control", permiso: "ver_dashboard_ejecutivo" },
      { label: "Órdenes", path: "/produccion/ordenes" },
      { label: "Kanban", path: "/produccion/kanban" },
      { label: "Responsables", path: "/produccion/responsables", permiso: "ver_dashboard_ejecutivo" },
      { label: "Bitácora", path: "/produccion/bitacora", permiso: "ver_dashboard_ejecutivo" },
      { label: "Rendimiento", path: "/produccion/rendimiento", permiso: "ver_dashboard_ejecutivo" },
      { label: "Reportes", path: "/produccion/reportes", permiso: "ver_dashboard_ejecutivo" },
    ],
  },
  // Inventario, ATLAS, CRM y Centro Financiero (2026-07-31): las pantallas
  // existen (client/src/pages/{inventario,atlas,crm,financiero}/) pero su
  // backend todavía no está desplegado en producción — mostrarlas en el
  // menú llevaría a una pantalla que parece rota. Ocultas del sidebar hasta
  // que cada una tenga su API real conectada; no se borró ningún archivo,
  // solo se sacó la entrada de navegación.
  /*
  {
    key: "inventario",
    label: "Inventario",
    icon: "📦",
    path: "/inventario",
    permiso: "ver_dashboard_ejecutivo",
    submenu: [
      { label: "Dashboard", path: "/inventario", end: true },
      { label: "Materia Prima", path: "/inventario/materia-prima" },
      { label: "Productos Terminados", path: "/inventario/productos-terminados" },
      { label: "Entradas", path: "/inventario/entradas" },
      { label: "Salidas", path: "/inventario/salidas" },
      { label: "Movimientos", path: "/inventario/movimientos" },
      { label: "Ajustes", path: "/inventario/ajustes" },
      { label: "Stock mínimo", path: "/inventario/stock-minimo" },
      { label: "Valor del inventario", path: "/inventario/valor" },
      { label: "Reportes", path: "/inventario/reportes" },
    ],
  },
  {
    key: "atlas",
    label: "ATLAS",
    icon: "🧭",
    path: "/atlas",
    permiso: "ver_dashboard_ejecutivo",
  },
  {
    key: "crm",
    label: "CRM",
    icon: "👥",
    path: "/crm",
    permiso: "ver_dashboard_ejecutivo",
    submenu: [
      { label: "Dashboard", path: "/crm", end: true },
      { label: "Clientes", path: "/crm/clientes" },
      { label: "Prospectos", path: "/crm/prospectos" },
      { label: "Historial", path: "/crm/historial" },
      { label: "Seguimiento", path: "/crm/seguimiento" },
      { label: "Clasificación", path: "/crm/clasificacion" },
      { label: "Reportes", path: "/crm/reportes" },
    ],
  },
  {
    key: "financiero",
    label: "Centro Financiero",
    icon: "💰",
    path: "/financiero",
    permiso: "ver_dashboard_ejecutivo",
    submenu: [
      { label: "Dashboard", path: "/financiero", end: true },
      { label: "Ingresos", path: "/financiero/ingresos" },
      { label: "Egresos", path: "/financiero/egresos" },
      { label: "Caja", path: "/financiero/caja" },
      { label: "Bancos", path: "/financiero/bancos" },
      { label: "Costos", path: "/financiero/costos" },
      { label: "Utilidad", path: "/financiero/utilidad" },
      { label: "Cuentas por cobrar", path: "/financiero/cuentas-por-cobrar" },
      { label: "Cuentas por pagar", path: "/financiero/cuentas-por-pagar" },
      { label: "Movimientos", path: "/financiero/movimientos" },
      { label: "Reportes", path: "/financiero/reportes" },
    ],
  },
  */
  {
    key: "compras",
    label: "Compras",
    icon: "🛒",
    path: "/compras",
    permiso: "ver_dashboard_ejecutivo",
  },
  {
    key: "reportes",
    label: "Reportes",
    icon: "📊",
    path: "/reportes",
    permiso: "ver_dashboard_ejecutivo",
  },
  {
    key: "configuracion",
    label: "Configuración",
    icon: "⚙",
    path: "/configuracion",
    permiso: "gestionar_usuarios",
  },
];
