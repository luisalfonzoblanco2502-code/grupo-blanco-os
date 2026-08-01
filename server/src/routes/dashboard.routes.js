import { Router } from "express";
import { obtenerResumenDashboard, obtenerPanelGeneral } from "../services/dashboard.service.js";
import { requirePermiso } from "../middleware/permisos.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await obtenerResumenDashboard(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

// Panel General (Home ejecutivo) — distinto de "/" arriba (Centro de
// Control Diario, operativo de Producción, sin tocar).
dashboardRouter.get("/panel-general", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await obtenerPanelGeneral(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});
