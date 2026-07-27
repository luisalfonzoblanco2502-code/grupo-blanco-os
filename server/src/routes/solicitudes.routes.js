import { Router } from "express";
import * as solicitudesService from "../services/solicitudes.service.js";

// Bandeja de revisión del ERP — protegida por requireAuth. La creación
// pública vive en publico.routes.js, no acá.
export const solicitudesRouter = Router();

solicitudesRouter.get("/", async (req, res, next) => {
  try {
    res.json(await solicitudesService.listarSolicitudes(req.usuario.empresaId, req.query.estado));
  } catch (err) {
    next(err);
  }
});

solicitudesRouter.get("/:id", async (req, res, next) => {
  try {
    res.json(await solicitudesService.obtenerSolicitud(req.params.id, req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

solicitudesRouter.patch("/:id/estado", async (req, res, next) => {
  try {
    const solicitud = await solicitudesService.cambiarEstadoSolicitud(
      req.params.id,
      req.usuario.empresaId,
      req.usuario.id,
      req.body
    );
    res.json(solicitud);
  } catch (err) {
    next(err);
  }
});

solicitudesRouter.post("/:id/convertir", async (req, res, next) => {
  try {
    const resultado = await solicitudesService.convertirSolicitud(
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
