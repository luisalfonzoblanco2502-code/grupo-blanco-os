// Rutas SIN autenticación — consumidas por catalogo.panaprice.com. Se montan
// en index.js sin requireAuth; a propósito NO importan req.usuario en
// ningún lado de este archivo.
//
// Resolución de empresa: el catálogo público hoy es "una app = una empresa"
// (catalogo.panaprice.com sirve solo productos de Panaprice Custom). No se
// agrega un slug a Empresa para esto todavía — es más cambio de schema del
// necesario para el MVP. Si mañana Punto Ele quiere su propio catálogo, se
// despliega esta misma app con otra CATALOGO_EMPRESA_ID.
import { Router } from "express";
import * as productosService from "../services/productos.service.js";
import * as solicitudesService from "../services/solicitudes.service.js";
import { ValidacionError } from "../services/errors.js";

export const publicoRouter = Router();

function empresaCatalogo() {
  const empresaId = process.env.CATALOGO_EMPRESA_ID;
  if (!empresaId) {
    throw new ValidacionError(
      "El catálogo público no está configurado (falta CATALOGO_EMPRESA_ID en el servidor)"
    );
  }
  return empresaId;
}

publicoRouter.get("/productos", async (req, res, next) => {
  try {
    res.json(await productosService.listarProductosPublicos(empresaCatalogo()));
  } catch (err) {
    next(err);
  }
});

publicoRouter.post("/solicitudes", async (req, res, next) => {
  try {
    const solicitud = await solicitudesService.crearSolicitudPublica(empresaCatalogo(), req.body);
    res.status(201).json({ solId: solicitud.solId, id: solicitud.id });
  } catch (err) {
    next(err);
  }
});
