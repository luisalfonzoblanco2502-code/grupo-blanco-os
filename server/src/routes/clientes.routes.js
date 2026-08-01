import { Router } from "express";
import { requirePermiso } from "../middleware/permisos.js";
import { buscarClientes, buscarClientePorTelefonoOCedula, crearClienteManual } from "../services/clientes.service.js";
import { ValidacionError } from "../services/errors.js";

export const clientesRouter = Router();

// DEBE ir antes de rutas con :id (no las hay hoy en este router, pero
// mismo cuidado que en pedidos.routes.js) — verifica coincidencia exacta
// de teléfono/cédula mientras la vendedora escribe, antes de intentar crear.
clientesRouter.get("/verificar-duplicado", requirePermiso("ver_clientes"), async (req, res, next) => {
  try {
    const cliente = await buscarClientePorTelefonoOCedula(req.usuario.empresaId, {
      telefono: req.query.telefono,
      cedula: req.query.cedula,
    });
    res.json({ cliente: cliente || null });
  } catch (err) {
    next(err);
  }
});

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
