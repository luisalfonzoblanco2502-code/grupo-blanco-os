import { Router } from "express";
import { requirePermiso } from "../middleware/permisos.js";
import { buscarClientes, crearClienteManual } from "../services/clientes.service.js";
import { ValidacionError } from "../services/errors.js";

export const clientesRouter = Router();

clientesRouter.get("/", requirePermiso("ver_clientes"), async (req, res, next) => {
  try {
    res.json(await buscarClientes(req.usuario.empresaId, req.query.q));
  } catch (err) {
    next(err);
  }
});

clientesRouter.post("/", requirePermiso("crear_cliente"), async (req, res, next) => {
  try {
    const cliente = await crearClienteManual(req.usuario.empresaId, req.body);
    res.status(201).json(cliente);
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
