import { Router } from "express";
import * as pedidosService from "../services/pedidos.service.js";
import { facturarPedido } from "../services/facturacion.service.js";
import { requirePermiso } from "../middleware/permisos.js";

export const pedidosRouter = Router();

pedidosRouter.get("/", requirePermiso("ver_pedidos"), async (req, res, next) => {
  try {
    res.json(await pedidosService.listarPedidos(req.usuario.empresaId));
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
    const pedido = await pedidosService.crearPedido({
      empresaId: req.usuario.empresaId,
      usuarioId: req.usuario.id,
      ...req.body,
    });
    res.status(201).json(pedido);
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

pedidosRouter.post("/:id/facturar", requirePermiso("facturar_pedido"), async (req, res, next) => {
  try {
    const resultado = await facturarPedido(
      req.params.id,
      req.usuario.empresaId,
      req.usuario.id,
      req.body
    );
    res.status(201).json(resultado);
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
