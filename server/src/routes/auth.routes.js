import { Router } from "express";
import { registrarLogin, registrarLogout } from "../services/sesion.service.js";

export const authRouter = Router();

// req.usuario ya viene cargado por el middleware requireAuth (montado antes de esta ruta).
authRouter.get("/me", (req, res) => {
  const { id, nombre, email, activo, empresa, rol, puesto } = req.usuario;
  res.json({
    id,
    nombre,
    email,
    activo,
    empresa: empresa ? { id: empresa.id, nombre: empresa.nombre } : null,
    rol: rol ? { id: rol.id, nombre: rol.nombre, permisos: rol.permisos } : null,
    puesto: puesto ? { id: puesto.id, nombre: puesto.nombre } : null,
  });
});

authRouter.post("/login-evento", async (req, res, next) => {
  try {
    await registrarLogin(req.usuario);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Se llama ANTES de invalidar la sesión en el cliente (con el token todavía
// válido) — ver AuthContext.jsx en el frontend.
authRouter.post("/logout-evento", async (req, res, next) => {
  try {
    await registrarLogout(req.usuario);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
