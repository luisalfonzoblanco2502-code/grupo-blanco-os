// Barrel de registro para el Núcleo de Facturación Administrativa: cada
// módulo se registra a sí mismo con on(...) al importarse (efecto de carga,
// mismo patrón que ordenesProduccion.service.js). Este archivo solo
// garantiza que TODOS se importen, y en un orden explícito: Producción ya
// se registró antes (ver app.js, se importa primero), así que siempre corre
// primero dentro del mismo emit(PEDIDO_FACTURADO) — los módulos de acá abajo
// nunca deben poder bloquear la creación real de la Orden de Producción.
//
// indicadoresFacturacion.service.js no aparece acá: es una consulta
// agregada pura (sin listener, ver ese archivo) — no tiene efecto de carga
// que registrar.
import "./services/administracion.service.js";
import "./services/inventarioReserva.service.js";
import "./services/inventarioConsumo.service.js";
import "./services/crm.service.js";
import "./services/costos.service.js";
