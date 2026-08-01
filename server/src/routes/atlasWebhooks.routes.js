// Receptores públicos de webhooks — Instagram/WhatsApp llaman a esto desde
// internet, SIN sesión de usuario (mismo espíritu que publico.routes.js),
// pero autenticados por verificación de firma del proveedor, no por login.
//
// IMPORTANTE — este archivo existe pero NO está montado en app.js todavía
// (ver docs/atlas/ROADMAP.md, subfase 0.4/0.5). Montarlo antes de tener los
// adaptadores reales implementados (manychat.adapter.js/metaGraph.adapter.js)
// expondría un endpoint que no puede verificar de verdad quién le escribe —
// ver el 501 explícito de abajo, que es intencional mientras tanto.
import { Router } from "express";

export const atlasWebhooksRouter = Router();

function pendienteDeImplementar(nombreCanal) {
  return (req, res) => {
    res.status(501).json({
      error: `Webhook de ${nombreCanal} todavía no implementado — fundación técnica únicamente (Sprint ATLAS 0.1).`,
    });
  };
}

// Meta exige un GET de verificación (hub.challenge) antes de aceptar
// webhooks reales — se deja el mismo 501 a propósito: no hay nada real
// para verificar todavía.
atlasWebhooksRouter.get("/instagram", pendienteDeImplementar("Instagram"));
atlasWebhooksRouter.post("/instagram", pendienteDeImplementar("Instagram"));
atlasWebhooksRouter.get("/whatsapp", pendienteDeImplementar("WhatsApp"));
atlasWebhooksRouter.post("/whatsapp", pendienteDeImplementar("WhatsApp"));
atlasWebhooksRouter.post("/manychat", pendienteDeImplementar("ManyChat"));
