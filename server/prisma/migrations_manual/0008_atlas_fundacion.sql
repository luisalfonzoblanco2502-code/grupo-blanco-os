-- Migración manual — pegar en el SQL Editor de Supabase y presionar Run
-- CUANDO se apruebe la aplicación controlada de la Subfase 0.3 de ATLAS.
-- Puramente aditiva: crea 6 tablas nuevas, no modifica ninguna tabla
-- existente (ni Cliente, ni Pedido, ni ninguna de Finanzas/Producción/
-- Inventario/Compras). Sin DROP, sin DELETE, sin UPDATE, sin migración de
-- datos. Envuelta en una transacción explícita: si algo falla a mitad de
-- camino, no queda ninguna tabla a medio crear.
--
-- Reemplaza por completo la versión anterior de este mismo archivo
-- (Sprint 0.1 original) tras la corrección arquitectónica 0.1.1: se separó
-- identidad de PERSONA (atlas_contactos) de identidad POR CANAL
-- (atlas_identidades_canal), se agregaron tokens públicos de atribución y
-- una tabla de idempotencia de webhooks. Como la versión anterior NUNCA se
-- aplicó contra la base real, no hace falta ninguna migración de
-- transición — esta es la única versión que debe correr.
--
-- Auditoría de migraciones (Subfase 0.2, 2026-07-31): confirmado por
-- introspección DIRECTA de la base real que 0001–0006 ya están aplicadas
-- — incluidas AMBAS "0004" (tocan tablas disjuntas, nunca colisionaron en
-- los hechos, solo en el nombre). Este archivo se renombró de 0007 a 0008
-- porque 0007_idempotencia_pedidos.sql (ajena a ATLAS) ya estaba aplicada
-- con ese número. Ver MIGRATIONS_INDEX.md.
--
-- Políticas de borrado (Subfase 0.2): RESTRICT en toda la cadena
-- identidad→conversación→mensaje y en el token de atribución — el
-- historial comercial NUNCA debe poder perderse por un borrado en
-- cascada. SET NULL en pedido_id/responsable_usuario_id — perder ESE
-- vínculo puntual es aceptable, perder el contacto entero no. Ningún FK
-- de este archivo usa ON DELETE CASCADE.
--
-- Reclasificación (Subfase 0.2): ATLAS es el núcleo técnico del futuro
-- módulo COMERCIAL — ver docs/atlas/ARQUITECTURA_COMERCIAL.md.
--
-- ============================================================================
-- Auditoría de correcciones — Subfase 0.3 (2026-07-31), antes de ejecutar:
-- ============================================================================
--
-- Punto 1 — Idempotencia real por hash: UNIQUE(proveedor, event_id_externo)
-- simple NO alcanza porque Postgres permite múltiples NULL en un UNIQUE, así
-- que dos webhooks sin event_id_externo nunca chocarían ahí, y el índice de
-- payload_hash tampoco era único. Se reemplaza por DOS ÍNDICES ÚNICOS
-- PARCIALES (ver atlas_webhook_eventos abajo): uno activo cuando existe
-- event_id_externo, otro activo cuando no existe (dedup por payload_hash en
-- ese caso). Documentado también en idempotencia.service.js, que ahora
-- atrapa la violación de unicidad (P2002) como última línea de defensa bajo
-- concurrencia real.
--
-- Punto 2 — Aislamiento multiempresa: antes, atlas_identidades_canal y
-- atlas_atribucion_tokens validaban empresa_id y atlas_contacto_id por
-- separado, sin garantizar que fueran de la MISMA empresa — en teoría (o
-- con un bug de aplicación, o con SQL directo) una identidad podía apuntar a
-- un contacto de otra empresa. Se agrega UNIQUE(id, empresa_id) en
-- atlas_contactos y se reemplazan las FK simples hacia atlas_contactos por
-- FK COMPUESTAS (atlas_contacto_id, empresa_id) → atlas_contactos(id,
-- empresa_id) — Postgres rechaza ahora, a nivel de motor, cualquier fila que
-- mezcle contacto e identidad/token de empresas distintas.
--
-- Punto 3 — AtlasAtribucionToken: SÍ debe cubrir tráfico anónimo (clics de
-- anuncios/catálogo antes de que exista un contacto identificado), no solo
-- enlaces para contactos ya conocidos — es el caso de uso más valioso para
-- medir qué campaña genera clientes reales (ver VISION.md). Por eso
-- atlas_contacto_id pasa a ser NULLABLE. Flujo completo (Anuncio → clic
-- anónimo → token → identificación → contacto → atribución) documentado en
-- la cabecera de atribucion.service.js y en DECISIONES.md, Decisión 13.
-- Mientras el token es anónimo, la FK directa hacia empresas es la ÚNICA que
-- valida empresa_id (Postgres no evalúa una FK compuesta si alguna columna
-- referenciante es NULL — MATCH SIMPLE, el default). Por eso NO se elimina
-- esa FK directa aunque exista también la compuesta.
--
-- Punto 4a — CHECK ck_atlas_contactos_no_autofusion: defensa adicional a
-- nivel de columna contra fusionado_en_id = id (el caso más simple de
-- ciclo). Ciclos de más de un nodo (A→B→A) siguen sin poder expresarse en
-- un CHECK — eso lo sigue resolviendo creariaCiclo() en
-- contactos.service.js, sin cambios.
--
-- Punto 4b — Se elimina la columna `canal` de atlas_conversaciones:
-- duplicaba atlas_identidades_canal.canal sin ninguna razón real (el canal
-- de una identidad no cambia nunca después de creada).
--
-- Punto 4c/4d — Validar que pedido_id/responsable_usuario_id pertenecen a
-- la MISMA empresa del contacto: se decidió NO implementarlo como FK
-- compuesta en la base, porque requeriría un ALTER TABLE sobre `pedidos` y
-- `usuarios` (agregarles UNIQUE(id, empresa_id)) — ambas son tablas previas
-- a ATLAS, y tocarlas está fuera del límite acordado ("solo la fundación no
-- desplegada de ATLAS"; este mismo archivo garantiza en su propia cabecera
-- "no modifica ninguna tabla existente"). Se valida en su lugar en la
-- frontera de la aplicación (contactos.service.js:
-- vincularContactoAPedido/actualizarEstadoContacto). Ver DECISIONES.md,
-- Decisión 14, para el detalle completo de este trade-off.
--
-- Punto 4e — Disponibilidad de gen_random_uuid(): confirmada por
-- introspección DIRECTA contra la base real (no asumida): Postgres 17.6,
-- función presente tanto en pg_catalog (núcleo desde PG13) como en el
-- schema `extensions` vía la extensión `pgcrypto` (ya instalada). Además,
-- las migraciones 0001–0007 ya la usan con éxito contra esta misma base.
--
-- NO incluye el UPDATE pendiente de PA-001 (0002b_liberar_pa001.sql) — es
-- un asunto de `productos`/catálogo, sin relación con ATLAS, y se resuelve
-- por separado (ver MIGRATIONS_INDEX.md). Cero referencias a `productos`
-- en este archivo.
--
-- Después de correr esto: `npx prisma generate` en server/.

BEGIN;

CREATE TABLE atlas_contactos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid NOT NULL,
  nombre_preferido         text,
  telefono_principal       text,
  email_principal          text,
  intencion_actual         text,
  tipo_cliente             text NOT NULL DEFAULT 'no_clasificado',
  estado_comercial         text NOT NULL DEFAULT 'nuevo',
  ultimo_contacto          timestamptz,
  proxima_accion           text,
  consentimiento           boolean NOT NULL DEFAULT false,
  atribucion_primer_toque  jsonb,
  atribucion_ultimo_toque  jsonb,
  pedido_id                uuid,
  responsable_usuario_id   uuid,
  etiquetas                text[] NOT NULL DEFAULT '{}',
  fusionado_en_id          uuid,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_atlas_contactos_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_atlas_contactos_pedido
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL,
  CONSTRAINT fk_atlas_contactos_responsable_usuario
    FOREIGN KEY (responsable_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_atlas_contactos_fusionado_en
    FOREIGN KEY (fusionado_en_id) REFERENCES atlas_contactos(id) ON DELETE RESTRICT,
  -- Punto 4a (Subfase 0.3): defensa adicional a nivel de columna contra el
  -- caso más simple de ciclo (un contacto "fusionado a sí mismo"). Ciclos de
  -- más de un nodo los sigue resolviendo creariaCiclo() en la aplicación.
  CONSTRAINT ck_atlas_contactos_no_autofusion
    CHECK (fusionado_en_id IS NULL OR fusionado_en_id <> id),
  -- Punto 2 (Subfase 0.3): existe solo para poder ser el destino de las FK
  -- compuestas de atlas_identidades_canal/atlas_atribucion_tokens.
  CONSTRAINT uq_atlas_contactos_id_empresa
    UNIQUE (id, empresa_id)
);

CREATE INDEX idx_atlas_contactos_empresa_estado ON atlas_contactos (empresa_id, estado_comercial);

CREATE TABLE atlas_identidades_canal (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid NOT NULL,
  atlas_contacto_id        uuid NOT NULL,
  canal                    text NOT NULL,
  identificador_externo    text NOT NULL,
  identificador_proveedor  text,
  nombre_usuario           text,
  telefono                 text,
  email                    text,
  verificado               boolean NOT NULL DEFAULT false,
  datos_adicionales        jsonb,
  estado                   text NOT NULL DEFAULT 'activo',
  consentimiento_canal     boolean NOT NULL DEFAULT false,
  consentimiento_fecha     timestamptz,
  consentimiento_fuente    text,
  estado_suscripcion       text NOT NULL DEFAULT 'activo',
  fecha_baja               timestamptz,
  motivo_bloqueo           text,
  primera_interaccion      timestamptz NOT NULL DEFAULT now(),
  ultima_interaccion       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_atlas_identidades_canal_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  -- Punto 2 (Subfase 0.3): FK COMPUESTA — impide que esta identidad declare
  -- una empresa distinta a la de su propio contacto. atlas_contacto_id
  -- nunca es NULL acá, así que esta constraint siempre está activa (a
  -- diferencia de atlas_atribucion_tokens, ver más abajo).
  CONSTRAINT fk_atlas_identidades_canal_contacto_empresa
    FOREIGN KEY (atlas_contacto_id, empresa_id) REFERENCES atlas_contactos (id, empresa_id) ON DELETE RESTRICT,
  CONSTRAINT uq_atlas_identidad_canal UNIQUE (empresa_id, canal, identificador_externo)
);

CREATE INDEX idx_atlas_identidades_contacto ON atlas_identidades_canal (atlas_contacto_id);

CREATE TABLE atlas_atribucion_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  -- Punto 3 (Subfase 0.3): NULLABLE — un token nace SIN contacto cuando
  -- representa un clic anónimo de un anuncio o del catálogo, antes de que
  -- exista un AtlasContacto identificado. Se "reclama" después
  -- (vincularTokenAContacto() en atribucion.service.js). Ver cabecera de
  -- este archivo para el flujo completo.
  atlas_contacto_id  uuid,
  token              text NOT NULL,
  canal              text,
  campana            text,
  anuncio            text,
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  utm_content        text,
  utm_term           text,
  campaign_id        text,
  adset_id           text,
  ad_id              text,
  fbclid             text,
  placement          text,
  device             text,
  gclid              text,
  ttclid             text,
  landing_url        text,
  referer            text,
  fecha_expiracion   timestamptz,
  fecha_primer_uso   timestamptz,
  cantidad_usos      integer NOT NULL DEFAULT 0,
  estado             text NOT NULL DEFAULT 'activo',
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_atlas_atribucion_tokens_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  -- Punto 2 (Subfase 0.3): FK COMPUESTA — solo se evalúa cuando
  -- atlas_contacto_id NO es NULL (Postgres MATCH SIMPLE, el default: una FK
  -- compuesta se considera satisfecha si CUALQUIERA de sus columnas
  -- referenciantes es NULL). Mientras el token es anónimo, la FK directa de
  -- arriba (hacia empresas) es la única que valida empresa_id — por eso NO
  -- se elimina, a diferencia de atlas_identidades_canal donde sería
  -- redundante.
  CONSTRAINT fk_atlas_atribucion_tokens_contacto_empresa
    FOREIGN KEY (atlas_contacto_id, empresa_id) REFERENCES atlas_contactos (id, empresa_id) ON DELETE RESTRICT,
  CONSTRAINT uq_atlas_atribucion_tokens_token UNIQUE (token)
);

CREATE INDEX idx_atlas_tokens_contacto ON atlas_atribucion_tokens (atlas_contacto_id);

-- Sin FK a empresa/contacto a propósito: todavía no sabemos a quién
-- pertenece un evento crudo hasta procesarlo (ver nota en schema.prisma).
CREATE TABLE atlas_webhook_eventos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor             text NOT NULL,
  canal                 text,
  event_id_externo      text,
  payload_hash          text NOT NULL,
  fecha_recibida        timestamptz NOT NULL DEFAULT now(),
  estado_procesamiento  text NOT NULL DEFAULT 'pendiente',
  cantidad_intentos     integer NOT NULL DEFAULT 1,
  ultimo_error          text
);

-- Punto 1 (Subfase 0.3): DOS índices únicos PARCIALES en vez de un único
-- UNIQUE(proveedor, event_id_externo) — ese UNIQUE simple no bloquea
-- duplicados cuando event_id_externo es NULL (Postgres permite múltiples
-- NULL en un UNIQUE). Cada evento cae en EXACTAMENTE uno de los dos índices
-- (son mutuamente excluyentes por el WHERE), así que juntos cubren el 100%
-- de las filas sin superponerse.
CREATE UNIQUE INDEX uq_atlas_webhook_evento_id_externo
  ON atlas_webhook_eventos (proveedor, event_id_externo)
  WHERE event_id_externo IS NOT NULL;

CREATE UNIQUE INDEX uq_atlas_webhook_evento_hash
  ON atlas_webhook_eventos (proveedor, payload_hash)
  WHERE event_id_externo IS NULL;

CREATE TABLE atlas_conversaciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_canal_id uuid NOT NULL,
  -- Punto 4b (Subfase 0.3): ya NO tiene columna `canal` propia — duplicaba
  -- atlas_identidades_canal.canal sin razón real (el canal de una identidad
  -- no cambia nunca después de creada). Leer el canal de una conversación
  -- es un JOIN a su identidad.
  creado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_atlas_conversaciones_identidad
    FOREIGN KEY (identidad_canal_id) REFERENCES atlas_identidades_canal(id) ON DELETE RESTRICT
);

CREATE INDEX idx_atlas_conversaciones_identidad ON atlas_conversaciones (identidad_canal_id);

CREATE TABLE atlas_mensajes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id      uuid NOT NULL,
  direccion            text NOT NULL, -- entrante | saliente
  origen               text NOT NULL, -- cliente | automatico | humano
  contenido            text NOT NULL,
  intencion_detectada  text,
  id_proveedor         text,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_atlas_mensajes_conversacion
    FOREIGN KEY (conversacion_id) REFERENCES atlas_conversaciones(id) ON DELETE RESTRICT
);

CREATE INDEX idx_atlas_mensajes_conversacion ON atlas_mensajes (conversacion_id);

COMMIT;
