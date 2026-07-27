// Catálogo oficial de eventos de dominio de Grupo Blanco OS. Un solo lugar
// para evitar strings mágicos repetidos entre quien emite y quien escucha.
// Todo evento nuevo (Inventario, CRM, Finanzas...) se agrega aquí primero.

// Pedido
export const PEDIDO_CREADO = "PEDIDO_CREADO";
export const PEDIDO_EDITADO = "PEDIDO_EDITADO";
export const PEDIDO_CANCELADO = "PEDIDO_CANCELADO";
export const PEDIDO_FACTURADO = "PEDIDO_FACTURADO";
// Se emite en CUALQUIER transición de estado del pedido (incluye las de
// arriba, que además se emiten con su nombre específico por claridad de
// lectura en el código — un mismo cambio puede disparar ambos eventos).
export const PEDIDO_ESTADO_CAMBIADO = "PEDIDO_ESTADO_CAMBIADO";

// Orden de Producción
export const ORDEN_CREADA = "ORDEN_CREADA";
export const ORDEN_ETAPA_CAMBIADA = "ORDEN_ETAPA_CAMBIADA";
export const ORDEN_CERRADA = "ORDEN_CERRADA";

// Usuario
export const USUARIO_LOGIN = "USUARIO_LOGIN";
export const USUARIO_LOGOUT = "USUARIO_LOGOUT";

// Solicitud de Pedido (catálogo público, sin autenticación)
export const SOLICITUD_CREADA = "SOLICITUD_CREADA";
export const SOLICITUD_ESTADO_CAMBIADO = "SOLICITUD_ESTADO_CAMBIADO";
export const SOLICITUD_CONVERTIDA = "SOLICITUD_CONVERTIDA";
