import { Router } from "express";
import * as pedidosService from "../services/pedidos.service.js";
import { facturarPedido } from "../services/facturacion.service.js";
import * as pedidoLineasService from "../services/pedidoLineas.service.js";
import { listarPedidosKanban, avanzarPedido } from "../services/ordenesProduccion.service.js";
import { requirePermiso, tienePermiso } from "../middleware/permisos.js";

export const pedidosRouter = Router();

pedidosRouter.get("/", requirePermiso("ver_pedidos"), async (req, res, next) => {
  try {
    res.json(await pedidosService.listarPedidos(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

// Kanban de Producción POR PEDIDO — DEBE ir antes de "/:id" (mismo motivo
// que "sugerencias-tecnicas" abajo: Express matchea por orden de registro).
// Sin requirePermiso acá a propósito: la visibilidad ya la resuelve
// listarPedidosKanban internamente (mismo criterio de alcance que
// GET /api/ordenes-produccion — vendedora ve lo suyo, operador ve lo
// asignado, ver_todas_las_ordenes ve todo).
pedidosRouter.get("/kanban", async (req, res, next) => {
  try {
    res.json(await listarPedidosKanban(req.usuario.empresaId, req.usuario));
  } catch (err) {
    next(err);
  }
});

// Sugerencias por historial + reporte de calidad de dato — ver
// pedidoLineas.service.js (principio "primero sugerir, nunca obligar").
// DEBEN ir antes de "/:id": Express matchea por orden de registro, y
// "sugerencias-tecnicas" calzaría con el parámetro ":id" si esta ruta
// quedara después (un bug real que se atrapó revisando esto, no en runtime).
pedidosRouter.get("/sugerencias-tecnicas", requirePermiso("crear_pedido"), async (req, res, next) => {
  try {
    res.json(await pedidoLineasService.listarSugerenciasTecnicas(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

pedidosRouter.get("/calidad-datos", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await pedidoLineasService.obtenerCalidadDatosTecnicos(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

pedidosRouter.get("/:id", requirePermiso("ver_pedidos"), async (req, res, next) => {
  try {
    res.json(await pedidosService.obtenerPedido(req.params.id, req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

pedidosRouter.post("/", requirePermiso("crear_pedido"), async (req, res, next) => {
  try {
    // Producto Maestro (Paso 4): el override de precio solo se honra si el
    // ROL actual ya tiene editar_pedido — se calcula acá (único lugar con
    // req.usuario) y viaja como bandera interna, nunca decidida por el payload.
    const permiteOverridePrecio = tienePermiso(req, "editar_pedido");
    const lineas = Array.isArray(req.body.lineas)
      ? req.body.lineas.map((linea) => ({ ...linea, permiteOverridePrecio }))
      : req.body.lineas;
    const resultado = await pedidosService.crearPedido({
      empresaId: req.usuario.empresaId,
      usuarioId: req.usuario.id,
      ...req.body,
      lineas,
    });
    // 200 en reenvío idempotente (nada nuevo se creó) vs. 201 en creación real
    // — el cuerpo siempre trae { pedido, idempotentReplay } en ambos casos.
    res.status(resultado.idempotentReplay ? 200 : 201).json(resultado);
  } catch (err) {
    next(err);
  }
});

pedidosRouter.patch("/:id", requirePermiso("editar_pedido"), async (req, res, next) => {
  try {
    const pedido = await pedidosService.editarPedido(
      req.params.id,
      req.usuario.empresaId,
      req.usuario.id,
      req.body
    );
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

pedidosRouter.patch("/:id/cancelar", requirePermiso("eliminar_pedido"), async (req, res, next) => {
  try {
    const pedido = await pedidosService.cancelarPedido(
      req.params.id,
      req.usuario.empresaId,
      req.usuario.id
    );
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

// "Eliminar pedido" (solo Administrador) — distinto de /cancelar arriba:
// funciona en cualquier estado, incluso ya facturado. Permiso propio
// (eliminar_pedido_definitivo), otorgado SOLO a ADMINISTRADOR vía dato,
// nunca a Supervisor (que sí tiene eliminar_pedido para /cancelar).
pedidosRouter.delete("/:id", requirePermiso("eliminar_pedido_definitivo"), async (req, res, next) => {
  try {
    const pedido = await pedidosService.eliminarPedidoDefinitivo(
      req.params.id,
      req.usuario.empresaId,
      req.usuario.id
    );
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});

// "Capturar una sola vez": el cuerpo ya NO trae los datos técnicos de cada
// línea (eso lo capturó la vendedora en pedido_lineas) — solo la asignación
// de responsable/prioridad que le corresponde decidir al Administrador en
// el momento de facturar. construirLineasParaFacturar arma el `lineas` que
// espera facturacion.service.js (sin modificar ese archivo).
pedidosRouter.post("/:id/facturar", requirePermiso("facturar_pedido"), async (req, res, next) => {
  try {
    const lineas = await pedidoLineasService.construirLineasParaFacturar(
      req.params.id,
      req.usuario.empresaId,
      req.body.asignaciones
    );
    const resultado = await facturarPedido(req.params.id, req.usuario.empresaId, req.usuario.id, { lineas });
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
});

// --- Líneas de pedido (Producción Operativa) ---
pedidosRouter.get("/:id/lineas", requirePermiso("ver_pedidos"), async (req, res, next) => {
  try {
    res.json(await pedidoLineasService.listarLineas(req.params.id, req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

pedidosRouter.post("/:id/lineas", requirePermiso("crear_pedido"), async (req, res, next) => {
  try {
    const datos = { ...req.body, permiteOverridePrecio: tienePermiso(req, "editar_pedido") };
    const linea = await pedidoLineasService.crearLinea(
      req.params.id,
      req.usuario.empresaId,
      req.usuario.id,
      datos
    );
    res.status(201).json(linea);
  } catch (err) {
    next(err);
  }
});

// "Caso excepcional / modificación avanzada" (Paso 4, Producto Maestro): la
// ÚNICA vía para tocar los 12 campos técnicos del snapshot después de creada
// la línea — deliberadamente separada de PATCH /lineas/:lineaId (arriba),
// que sigue gobernando cantidad/precio/observaciones/prioridad sin tocar
// nunca especificacionModificadaManualmente. Permiso propio, hoy solo
// otorgado a ADMINISTRADOR.
pedidosRouter.patch(
  "/lineas/:lineaId/especificacion-avanzada",
  requirePermiso("editar_especificacion_avanzada"),
  async (req, res, next) => {
    try {
      const linea = await pedidoLineasService.actualizarEspecificacionAvanzada(
        req.params.lineaId,
        req.usuario.empresaId,
        req.usuario.id,
        req.body
      );
      res.json(linea);
    } catch (err) {
      next(err);
    }
  }
);

pedidosRouter.patch("/lineas/:lineaId", requirePermiso("editar_pedido"), async (req, res, next) => {
  try {
    res.json(await pedidoLineasService.actualizarLinea(req.params.lineaId, req.usuario.empresaId, req.body));
  } catch (err) {
    next(err);
  }
});

pedidosRouter.post("/lineas/:lineaId/duplicar", requirePermiso("crear_pedido"), async (req, res, next) => {
  try {
    res.status(201).json(await pedidoLineasService.duplicarLinea(req.params.lineaId, req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

pedidosRouter.delete("/lineas/:lineaId", requirePermiso("editar_pedido"), async (req, res, next) => {
  try {
    await pedidoLineasService.eliminarLinea(req.params.lineaId, req.usuario.empresaId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Kanban por pedido: avanza TODAS las OPs activas del pedido juntas, con
// el mismo responsable (decisión explícita — ver nota en
// ordenesProduccion.service.js/avanzarPedido). Mismo permiso que el avance
// de una OP individual.
pedidosRouter.patch("/:id/avanzar", requirePermiso("cambiar_etapa"), async (req, res, next) => {
  try {
    const ordenes = await avanzarPedido(req.params.id, req.usuario.empresaId, req.usuario, {
      etapaId: req.body.etapaId,
      responsableUsuarioId: req.body.responsableUsuarioId,
      responsableExterno: req.body.responsableExterno,
    });
    res.json({ ordenes });
  } catch (err) {
    next(err);
  }
});

// Transición manual de estado — cubre los pasos sin señal automática
// (ej. marcar DESPACHADO, o CERRAR un pedido ya ENTREGADO). La validez de
// la transición la decide siempre pedidoEstado.service.js, nunca el cliente.
// Mismo permiso que facturar: es la misma capacidad de "gestionar el
// avance comercial/logístico del pedido", reservada a Admin/Supervisor.
pedidosRouter.patch("/:id/estado", requirePermiso("facturar_pedido"), async (req, res, next) => {
  try {
    const pedido = await pedidosService.cambiarEstadoPedidoManual(
      req.params.id,
      req.usuario.empresaId,
      req.usuario.id,
      req.body.estadoNuevo
    );
    res.json(pedido);
  } catch (err) {
    next(err);
  }
});
