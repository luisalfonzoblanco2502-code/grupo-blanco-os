import { Router } from "express";
import { listarUsuariosActivos } from "../services/usuarios.service.js";

export const usuariosRouter = Router();

usuariosRouter.get("/", async (req, res, next) => {
  try {
    res.json(await listarUsuariosActivos(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});
