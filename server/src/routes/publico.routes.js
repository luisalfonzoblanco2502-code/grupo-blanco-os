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
import * as subidaPublicaService from "../services/subidaPublica.service.js";
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
    res.status(201).json({ solId: solicitud.solId, id: solicitud.id, numeroOrden: solicitud.numeroOrden });
  } catch (err) {
    next(err);
  }
});

// Foto de un diseño 100% personalizado (Bandeja de Solicitudes, 2026-08-02)
// — endpoint público separado de POST /solicitudes: el catálogo primero
// sube la foto y recibe su URL, después la manda como disenoFotoUrl al
// crear la solicitud. Body JSON con archivoBase64 (no multipart) — mismo
// estilo que el resto de este router. Toda la validación real (magic
// bytes, tamaño, rate limit) vive en subidaPublica.service.js; acá solo se
// decodifica el base64 y se resuelve la IP real detrás del proxy de Vercel.
publicoRouter.post("/solicitudes/foto", async (req, res, next) => {
  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "desconocida";
    const { archivoBase64 } = req.body || {};
    if (!archivoBase64 || typeof archivoBase64 !== "string") {
      throw new ValidacionError("Debe enviar archivoBase64");
    }
    const base64Limpio = archivoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Limpio, "base64");
    const resultado = await subidaPublicaService.subirFotoPublica({ ip, buffer });
    res.status(201).json(resultado);
  } catch (err) {
    next(err);
  }
});

publicoRouter.get("/rastreo/:numeroOrden", async (req, res, next) => {
  try {
    res.json(await solicitudesService.obtenerRastreoPublico(empresaCatalogo(), req.params.numeroOrden));
  } catch (err) {
    next(err);
  }
});
