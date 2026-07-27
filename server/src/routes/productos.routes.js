import { Router } from "express";
import * as productosService from "../services/productos.service.js";

// Administración del catálogo — protegida por requireAuth (montada así en
// index.js), a diferencia de publico.routes.js que expone la versión
// filtrada sin autenticación.
export const productosRouter = Router();

productosRouter.get("/", async (req, res, next) => {
  try {
    res.json(await productosService.listarProductos(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

productosRouter.get("/:id", async (req, res, next) => {
  try {
    res.json(await productosService.obtenerProducto(req.params.id, req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

productosRouter.post("/", async (req, res, next) => {
  try {
    const producto = await productosService.crearProducto({
      empresaId: req.usuario.empresaId,
      ...req.body,
    });
    res.status(201).json(producto);
  } catch (err) {
    next(err);
  }
});

productosRouter.patch("/:id", async (req, res, next) => {
  try {
    const producto = await productosService.editarProducto(req.params.id, req.usuario.empresaId, req.body);
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

productosRouter.delete("/:id", async (req, res, next) => {
  try {
    await productosService.eliminarProducto(req.params.id, req.usuario.empresaId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
