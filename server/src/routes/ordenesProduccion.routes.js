import { Router } from "express";
import * as ordenesService from "../services/ordenesProduccion.service.js";
import { requirePermiso, tienePermiso } from "../middleware/permisos.js";

export const ordenesProduccionRouter = Router();

ordenesProduccionRouter.get("/", async (req, res, next) => {
  try {
    const { etapaId, prioridadId, mias } = req.query;
    // Sin ver_todas_las_ordenes (OPERADOR), la visibilidad queda SIEMPRE
    // forzada a lo propio — no es una opción que el cliente pueda pedir o no.
    const soloPropias = !tienePermiso(req, "ver_todas_las_ordenes");
    const ordenes = await ordenesService.listarOrdenesProduccion(req.usuario.empresaId, {
      etapaId,
      prioridadId,
      responsableUsuarioId: soloPropias ? req.usuario.id : mias === "true" ? req.usuario.id : undefined,
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
