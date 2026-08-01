import { Router } from "express";
import * as ordenesService from "../services/ordenesProduccion.service.js";
import { requirePermiso, tienePermiso } from "../middleware/permisos.js";

export const ordenesProduccionRouter = Router();

ordenesProduccionRouter.get("/", async (req, res, next) => {
  try {
    const { etapaId, prioridadId, mias, busqueda } = req.query;
    const veTodas = tienePermiso(req, "ver_todas_las_ordenes");
    // Vendedora ve las órdenes de SUS pedidos (creadoPorId), no las que
    // tiene asignadas como responsable — nunca elige, es forzado igual que
    // el alcance de OPERADOR.
    const esVendedora = !veTodas && tienePermiso(req, "ver_estado_produccion_de_sus_pedidos");
    const ordenes = await ordenesService.listarOrdenesProduccion(req.usuario.empresaId, {
      etapaId,
      prioridadId,
      busqueda,
      pedidoCreadoPorId: esVendedora ? req.usuario.id : undefined,
      // Sin ver_todas_las_ordenes ni ver_estado_produccion_de_sus_pedidos
      // (OPERADOR), la visibilidad queda SIEMPRE forzada a lo propio.
      responsableUsuarioId:
        !veTodas && !esVendedora ? req.usuario.id : veTodas && mias === "true" ? req.usuario.id : undefined,
    });
    res.json(ordenes);
  } catch (err) {
    next(err);
  }
});

ordenesProduccionRouter.get("/:id", async (req, res, next) => {
  try {
    const orden = await ordenesService.obtenerOrdenProduccion(
      req.params.id,
      req.usuario.empresaId,
      req.usuario
    );
    res.json(orden);
  } catch (err) {
    next(err);
  }
});

ordenesProduccionRouter.patch("/:id/etapa", requirePermiso("cambiar_etapa"), async (req, res, next) => {
  try {
    const orden = await ordenesService.cambiarEtapaOrden(
      req.params.id,
      req.usuario.empresaId,
      req.usuario,
      req.body.etapaId
    );
    res.json(orden);
  } catch (err) {
    next(err);
  }
});

ordenesProduccionRouter.patch(
  "/:id/responsable",
  requirePermiso("asignar_responsable"),
  async (req, res, next) => {
    try {
      const orden = await ordenesService.reasignarResponsableOrden(
        req.params.id,
        req.usuario.empresaId,
        req.usuario,
        req.body
      );
      res.json(orden);
    } catch (err) {
      next(err);
    }
  }
);
