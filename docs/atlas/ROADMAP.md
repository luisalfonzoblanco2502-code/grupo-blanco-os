# ROADMAP — ATLAS

| Subfase | Qué se hace | Requiere aprobación explícita porque... |
|---|---|---|
| **0.1** ✅ | Auditoría + fundación técnica | — |
| **0.1.1** ✅ | Corrección arquitectónica: persona vs. identidad por canal, tokens de atribución, idempotencia de webhooks, consentimiento por canal (este documento) | — |
| **0.2** 🔎 en revisión final | Auditoría de migraciones (resuelta: ver `migrations_manual/MIGRATIONS_INDEX.md`), extensión del modelo de atribución, reclasificación de ATLAS como núcleo de Comercial (ver [ARQUITECTURA_COMERCIAL.md](./ARQUITECTURA_COMERCIAL.md)). Falta: aplicar `migrations_manual/0008_atlas_fundacion.sql` en Supabase + `npx prisma generate` | Toca la base de datos real — pendiente de aprobación explícita final |
| 0.3 | Vista de Inbox real (solo lectura) sobre contactos creados a mano/por prueba | Ninguna — es solo UI sobre datos ya modelados |
| 0.3.5 | Definir permisos propios de ATLAS (`ver_atlas`, `gestionar_atlas`, `responder_atlas`, `configurar_atlas`) y migrarlos desde el temporal `ver_dashboard_ejecutivo` | **Bloqueante antes de producción** (ver DECISIONES.md) — requiere tocar roles reales, se presenta como su propio plan aditivo primero |
| 0.4 | Configurar ManyChat + implementar `manychat.adapter.js` de verdad, para Instagram | Requiere credenciales del negocio (token de ManyChat, acceso a la cuenta de Instagram) |
| 0.5 | Endurecer y montar `atlasWebhooks.routes.js` (ver checklist de seguridad obligatorio en DECISIONES.md, Parte 4) | Primera vez que el sistema responde a clientes reales sin supervisión manual |
| 0.6 | WhatsApp Cloud API directa (implementar `whatsappCloud.adapter.js`) | Requiere verificación de negocio de Meta + número de WhatsApp |
| 0.7 | Vínculo automático Contacto → SolicitudPedido → Pedido facturado (listeners sobre `SOLICITUD_CREADA`/`SOLICITUD_CONVERTIDA`/`PEDIDO_FACTURADO`) | Ninguna — aditivo, defensivo, mismo patrón que `crm.service.js` |
| 0.8 | Conectar `catalogo/` para leer `?ref=<token>` y llamar `consumirToken` vía un nuevo endpoint público (`/api/publico/atlas-ref/:token`) | Primera vez que se toca `catalogo/` desde ATLAS |
| 0.9 | Facebook (reutiliza en gran parte el adaptador de Meta Graph ya hecho para Instagram) | — |
| 1.0 | Reevaluar TikTok (Pixel/Ads, no automatización de DMs — ver DECISIONES.md) | — |

## Qué desbloquea cada subfase

- **0.2** es el único paso puramente técnico sin dependencias externas — se
  puede hacer en cualquier momento después de revisar el SQL.
- **0.3.5** es nueva en esta corrección: se documenta como bloqueante antes
  de producción para que no se olvide, pero no se ejecuta ahora (no se
  tocan roles/permisos reales sin su propio plan presentado primero, según
  instrucción explícita del negocio).
- **0.4** es donde arranca el primer canal real. No se hace sin que el
  negocio entregue las credenciales/accesos de ManyChat e Instagram.
- **0.5** exige que el checklist de seguridad de webhooks (DECISIONES.md,
  Parte 4) esté implementado por completo — no es opcional, es la
  condición para montar `atlasWebhooks.routes.js`.
- **0.6** típicamente es la subfase más lenta por los tiempos de
  verificación de Meta, no por el código en sí.
- **0.8** es la única subfase que toca `catalogo/` — todo lo anterior es
  exclusivamente `server/`/`client/`.
