// API autenticada de ATLAS — consumida por client/ (staff del ERP). Nada
// de esto recibe tráfico de Instagram/WhatsApp directamente: eso es
// atlasWebhooks.routes.js (público, sin montar todavía, ver ese archivo).
//
// permiso temporal: "ver_dashboard_ejecutivo", igual que CRM/Inventario/
// Financiero — ver la nota en client/src/nav/modules.js sobre por qué
// (ningún módulo de negocio nuevo tiene todavía una clave de permiso
// propia en la base real).
import { Router } from "express";
import { requirePermiso } from "../middleware/permisos.js";
import { ValidacionError } from "../services/errors.js";
import { listarContactos, obtenerContacto, actualizarEstadoContacto, fusionarContactos } from "../services/atlas/contactos.service.js";
import { listarIdentidadesDeContacto, verificarIdentidad, registrarConsentimientoCanal, registrarBajaCanal } from "../services/atlas/identidades.service.js";
import { crearTokenAtribucion, revocarToken } from "../services/atlas/atribucion.service.js";
import { listarSeguimientosPendientes } from "../services/atlas/seguimientos.service.js";
import { resumenGeneral, tiempoPromedioPrimeraRespuesta } from "../services/atlas/metricas.service.js";

export const atlasRouter = Router();

atlasRouter.get("/contactos", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await listarContactos(req.usuario.empresaId, req.query));
  } catch (err) {
    next(err);
  }
});

atlasRouter.get("/contactos/:id", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    const contacto = await obtenerContacto(req.params.id, req.usuario.empresaId);
    if (!contacto) return res.status(404).json({ error: "Contacto no encontrado" });
    res.json(contacto);
  } catch (err) {
    next(err);
  }
});

atlasRouter.patch("/contactos/:id", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await actualizarEstadoContacto(req.params.id, req.usuario.empresaId, req.body));
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Fusión manual auditada (corrección 0.1.1, Parte 1) — nunca automática.
// requirePermiso a propósito el mismo temporal que el resto: cuando existan
// permisos propios de ATLAS (ver docs/atlas/DECISIONES.md), esto debería
// requerir "gestionar_atlas" específicamente, no cualquiera con acceso de
// solo lectura al dashboard.
atlasRouter.post("/contactos/fusionar", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    const { contactoOrigenId, contactoDestinoId, motivo } = req.body;
    res.json(await fusionarContactos(req.usuario.empresaId, { contactoOrigenId, contactoDestinoId, motivo, usuarioId: req.usuario.id }));
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

atlasRouter.get("/contactos/:id/identidades", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await listarIdentidadesDeContacto(req.params.id, req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

atlasRouter.patch("/identidades/:id/verificar", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await verificarIdentidad(req.params.id, req.usuario.empresaId, req.body));
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

atlasRouter.patch("/identidades/:id/consentimiento", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await registrarConsentimientoCanal(req.params.id, req.usuario.empresaId, req.body));
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

atlasRouter.patch("/identidades/:id/baja", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await registrarBajaCanal(req.params.id, req.usuario.empresaId, req.body));
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

// Genera un token para un enlace de atribución (Parte 2) — el CONSUMO
// público (?ref=<token> desde el catálogo) todavía no tiene endpoint; esto
// solo permite a staff generar el token desde el ERP.
atlasRouter.post("/contactos/:id/tokens", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await crearTokenAtribucion(req.usuario.empresaId, req.params.id, req.body));
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

atlasRouter.patch("/tokens/:id/revocar", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await revocarToken(req.params.id, req.usuario.empresaId));
  } catch (err) {
    if (err instanceof ValidacionError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

atlasRouter.get("/seguimientos", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await listarSeguimientosPendientes(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

atlasRouter.get("/metricas/resumen", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await resumenGeneral(req.usuario.empresaId));
  } catch (err) {
    next(err);
  }
});

atlasRouter.get("/metricas/primera-respuesta", requirePermiso("ver_dashboard_ejecutivo"), async (req, res, next) => {
  try {
    res.json(await tiempoPromedioPrimeraRespuesta(req.usuario.empresaId, req.query));
  } catch (err) {
    next(err);
  }
});
