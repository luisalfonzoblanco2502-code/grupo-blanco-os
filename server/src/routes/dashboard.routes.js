import { Router } from "express";
import { obtenerResumenDashboard } from "../services/dashboard.service.js";
import { requirePermiso } from "../middleware/permisos.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await obtenerResumenDashboard(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});
