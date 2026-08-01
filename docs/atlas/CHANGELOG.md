# CHANGELOG — ATLAS

## 2026-07-31 (f) — Subfase 0.3: notas de dirección futura + migración autorizada

Arquitectura de la Subfase 0.3 aprobada en firme. Antes de cerrar, se
registraron 2 notas de dirección futura (sin tocar SQL/schema — puramente
documentales, ver Decisiones 17–18 en [DECISIONES.md](./DECISIONES.md) y
la sección de evolución en [VISION.md](./VISION.md)):

- "Token de atribución" y "sesión de navegación" probablemente se separen
  en el futuro — no implementado ahora, sin caso de uso real todavía.
- `atlas_webhook_eventos` es una cola técnica de idempotencia/
  reprocesamiento, nunca el historial comercial permanente — ese
  historial vive en las entidades de ATLAS/Comercial.

**`0008_atlas_fundacion.sql` queda autorizada para su aplicación manual en
Supabase** (el negocio la ejecuta directamente en el SQL Editor — este
archivo no se corrió desde acá). Pendiente: confirmación expresa de que se
ejecutó, y solo después de eso — verificación estructural por
introspección, `npx prisma generate`, pruebas CRUD con datos ficticios.

---

## 2026-07-31 (e) — Subfase 0.3: auditoría estructural final antes de ejecutar SQL

Última revisión antes de correr `0008_atlas_fundacion.sql` en Supabase.
4 gaps reales encontrados y corregidos — ver Decisiones 13–16 en
[DECISIONES.md](./DECISIONES.md).

| Cambio | Archivos |
|---|---|
| Idempotencia de webhooks: 2 índices únicos parciales en vez de 1 UNIQUE simple + manejo de P2002 bajo concurrencia | `0008_atlas_fundacion.sql`, `schema.prisma`, `idempotencia.service.js` |
| Aislamiento multiempresa: `UNIQUE(id, empresa_id)` en `atlas_contactos` + FK compuestas en `atlas_identidades_canal`/`atlas_atribucion_tokens` | `0008_atlas_fundacion.sql`, `schema.prisma` |
| `AtlasAtribucionToken.atlasContactoId` pasa a nullable (soporta clics anónimos, no solo contactos ya identificados) + nueva `vincularTokenAContacto()` | `0008_atlas_fundacion.sql`, `schema.prisma`, `atribucion.service.js` |
| `CHECK` contra autofusión (`fusionado_en_id <> id`) | `0008_atlas_fundacion.sql`, `schema.prisma` |
| Se elimina `canal` (duplicado) de `AtlasConversacion`; `obtenerOCrearConversacion()` ya no lo recibe como parámetro | `0008_atlas_fundacion.sql`, `schema.prisma`, `conversaciones.service.js` |
| Validación de empresa de `pedido_id`/`responsable_usuario_id` — a nivel de aplicación, no de FK compuesta (no se altera `pedidos`/`usuarios`, tablas previas a ATLAS) | `contactos.service.js` |
| Confirmada disponibilidad de `gen_random_uuid()` por introspección directa (Postgres 17.6) | — (verificación, sin cambios de código) |

Sin cambios en `Cliente`/CRM/nav/`catalogo/`. **La migración sigue SIN
aplicarse** contra la base real — pendiente de la confirmación manual del
negocio tras correrla en el SQL Editor de Supabase.

---

## 2026-07-31 (d) — Subfase 0.2: documento de visión + principios permanentes

Última pieza documental antes de aplicar `0008_atlas_fundacion.sql`.
Agregado: [VISION.md](./VISION.md) (no técnico — propósito de Comercial/
ATLAS, límites, relación con Marketing/Clientes, integración por eventos
con Producción/Inventario/Finanzas, visión a largo plazo) + 2 principios
permanentes del proyecto (arquitectura aprobada antes de implementar;
ATLAS nunca decide operativa ni financieramente — ver Decisión 12 en
[DECISIONES.md](./DECISIONES.md)). `CLAUDE.md` referencia el Principio 1
por ser una regla de proceso general del proyecto, no solo de ATLAS.

Sin cambios de código ni de schema en esta entrada — puramente documental.

---

## 2026-07-31 (c) — Subfase 0.2: correcciones antes de aplicar la migración

Auditoría de migraciones aprobada. El negocio pidió 4 mejoras antes de
aplicar `0008_atlas_fundacion.sql` en Supabase. Ver
[DECISIONES.md](./DECISIONES.md) (decisiones 9–11) para el detalle
completo.

### Resumen de cambios

| Cambio | Archivos |
|---|---|
| Renumeración de migraciones (3 colisiones resueltas, solo nombre) | `migrations_manual/0002a_*.sql`, `0002b_*.sql`, `0004a_*.sql`, `0004b_*.sql`, `0007_atlas_fundacion.sql` → `0008_atlas_fundacion.sql` |
| Registro central de migraciones (nuevo) | `migrations_manual/MIGRATIONS_INDEX.md` |
| Extensión del modelo de atribución (`AtlasAtribucionToken`): `placement`, `device`, `gclid`, `ttclid`, `landingUrl`, `referer` | `schema.prisma`, `0008_atlas_fundacion.sql`, `atribucion.service.js`, `config.js` (+`CAMPOS_ATRIBUCION`) |
| ATLAS reclasificado como núcleo del futuro módulo Comercial (Inbox/Leads/Contactos/Clientes/Campañas/Automatizaciones/Seguimientos/Embudos/Reportes) | `ARQUITECTURA_COMERCIAL.md` (nuevo), `README.md`, `schema.prisma` (comentario de cabecera de la sección ATLAS) |
| Prevención de ciclos en `fusionarContactos()` (gap encontrado en la auditoría) + políticas de borrado explícitas (`Restrict`/`SetNull`) en toda la fundación | `contactos.service.js`, `schema.prisma`, `0008_atlas_fundacion.sql` |

### No tocado en esta corrección

`Cliente`/`crm.service.js`/`CrmDashboard.jsx` (sin cambios — la
consolidación con Comercial queda documentada como trabajo futuro, no
ejecutada), los modelos/tablas `Atlas*`/`atlas_*` no se renombraron,
`client/src/nav/modules.js` sin cambios, ningún adaptador de
`integraciones/`, `atlasWebhooks.routes.js` sigue sin montar.

### Verificado

- `npx prisma validate` — schema válido tras la extensión del modelo de
  atribución y el nuevo comentario de cabecera.
- Confirmado por introspección directa (no por nombre de archivo) que
  `0007_idempotencia_pedidos.sql` ya estaba aplicada contra la base real
  antes de renombrar `0007_atlas_fundacion.sql` a `0008`.
- **La migración `0008_atlas_fundacion.sql` sigue SIN aplicarse** contra la
  base real — pendiente de aprobación final explícita.

---

## 2026-07-31 (b) — Sprint 0.1.1: corrección arquitectónica preventiva

El negocio aprobó la auditoría/dirección del Sprint 0.1 pero pidió corregir
el modelo de datos **antes** de aplicar la migración (que nunca se ejecutó
contra la base real — cero riesgo de migración de datos). Ver
[DECISIONES.md](./DECISIONES.md) para el detalle de cada decisión.

### Diff resumido de modelos

| Modelo | Cambio |
|---|---|
| `AtlasContacto` | Se le QUITAN `canalOrigen`, `identificadorCanal`, `instagramUsuario`, `telefono`, `email`, `utm*`, `fbclid`, `enlaceCatalogoEnviado`. Se renombran `nombre`→`nombrePreferido`, `intencion`→`intencionActual`. Se AGREGAN `telefonoPrincipal`/`emailPrincipal` (solo validados), `atribucionPrimerToque`/`atribucionUltimoToque` (JSON), `fusionadoEnId` (auto-relación) |
| `AtlasIdentidadCanal` | **Nuevo.** Contiene todo lo que salió de AtlasContacto + `identificadorProveedor`, `verificado`, `datosAdicionales`, `estado`, campos de consentimiento/suscripción por canal |
| `AtlasAtribucionToken` | **Nuevo.** Token opaco (`?ref=`) + campos de campaña/UTM/expiración/uso |
| `AtlasWebhookEvento` | **Nuevo.** Idempotencia: proveedor + eventId externo + payloadHash |
| `AtlasConversacion` | `contactoId` → `identidadCanalId` (una conversación cuelga de una identidad de canal, no del contacto unificado) |
| `AtlasMensaje` | Sin cambios de forma, solo de contexto (ahora relacionado transitivamente a una identidad, no a un contacto) |

### Archivos creados en esta corrección

- `server/src/services/atlas/identidades.service.js`
- `server/src/services/atlas/atribucion.service.js`
- `server/src/services/atlas/idempotencia.service.js`

### Archivos reescritos (siguen siendo la misma fundación no desplegada)

- `server/prisma/schema.prisma` (sección ATLAS completa)
- `server/prisma/migrations_manual/0007_atlas_fundacion.sql` (reemplaza por
  completo la versión anterior — nunca se aplicó, no hace falta migración
  de transición)
- `server/src/services/atlas/config.js` (+ `ESTADOS_SUSCRIPCION`,
  `ESTADOS_IDENTIDAD_CANAL`, `PALABRAS_SALIDA`, `ESTADOS_WEBHOOK_EVENTO`,
  `ESTADOS_TOKEN_ATRIBUCION`)
- `server/src/services/atlas/contactos.service.js` (resolución de
  identidad + `fusionarContactos`)
- `server/src/services/atlas/conversaciones.service.js` (cuelga de
  identidad de canal, no de contacto)
- `server/src/services/atlas/intents.service.js` (+ `detectarPalabraSalida`)
- `server/src/services/atlas/metricas.service.js` (agregados ajustados al
  nuevo modelo — "identidades por canal", no "contactos por canal")
- `server/src/routes/atlas.routes.js` (+ rutas de fusión, identidades,
  tokens de atribución)
- `docs/atlas/README.md`, `ROADMAP.md`, `DECISIONES.md` (este changelog)

### No tocado en esta corrección

`server/src/services/atlas/respuestas.service.js`,
`seguimientos.service.js`, los 3 adaptadores de `integraciones/` (siguen
siendo stubs vacíos), `server/src/routes/atlasWebhooks.routes.js` (sigue
sin montar), `client/` (AtlasDashboard.jsx, nav, App.jsx — sin cambios),
`catalogo/` (cero cambios, como en el Sprint 0.1).

### Verificado

- `npx prisma validate` — schema válido tras el rediseño completo.
- `node --check` en los 11 archivos de servicios/rutas de ATLAS — sin
  errores de sintaxis.
- `detectarPalabraSalida` probado con 6/6 casos reales (stop, baja,
  cancelar, frases negativas vs. mensajes normales).
- `calcularPayloadHash` (idempotencia): determinista para el mismo
  payload, distinto para payloads distintos.
- Generación de token opaco: 43 caracteres, URL-safe, sin colisión en
  pruebas repetidas.
- Confirmado (`git status`) cero cambios en Finanzas, Producción,
  Inventario o Compras.

---

## 2026-07-31 (a) — Sprint 0.1: fundación técnica original

Ver historial de este archivo antes de la corrección — auditoría completa,
comparación ManyChat vs. API oficial de Meta, y primera versión de la
fundación técnica (luego corregida el mismo día, ver arriba).
