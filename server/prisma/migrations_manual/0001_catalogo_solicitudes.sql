-- Migración manual — REVISAR antes de correr en Supabase (SQL editor del
-- proyecto, o `psql`). NO se ejecutó automáticamente: este schema es la
-- fuente de verdad compartida por varias empresas del grupo (ver cabecera
-- de schema.prisma), así que cualquier cambio estructural se aplica a mano
-- y con revisión, nunca con `prisma migrate dev` / `db push` directo.
--
-- Después de correr esto, actualizar Prisma Client localmente con:
--   npx prisma generate
-- (no hace falta `migrate dev`: las tablas ya existirán en la BD real).
--
-- Agrega 4 tablas nuevas para el catálogo público + solicitudes de pedido.
-- No modifica ni una sola tabla existente.

CREATE TABLE productos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES empresas(id),
  nombre              text NOT NULL,
  categoria           text NOT NULL,
  descripcion         text,
  imagen_url          text,
  precio_base         numeric(10, 2) NOT NULL,
  activo              boolean NOT NULL DEFAULT true,
  publicado_catalogo  boolean NOT NULL DEFAULT false,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  eliminado_en        timestamptz
);

CREATE INDEX idx_productos_empresa_publicado ON productos (empresa_id, publicado_catalogo, activo);

CREATE TABLE producto_precios_volumen (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id      uuid NOT NULL REFERENCES productos(id),
  cantidad_minima  integer NOT NULL,
  precio_unitario  numeric(10, 2) NOT NULL
);

CREATE INDEX idx_ppv_producto ON producto_precios_volumen (producto_id);

CREATE TABLE solicitudes_pedido (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             uuid NOT NULL REFERENCES empresas(id),
  sol_id                 text NOT NULL,
  cliente_nombre         text NOT NULL,
  cliente_telefono       text NOT NULL,
  cliente_email          text,
  notas_personalizacion  text,
  estado                 text NOT NULL DEFAULT 'RECIBIDA',
  motivo_rechazo         text,
  pedido_id              uuid REFERENCES pedidos(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_solicitud_empresa_solid UNIQUE (empresa_id, sol_id)
);

CREATE INDEX idx_solicitudes_empresa_estado ON solicitudes_pedido (empresa_id, estado);

CREATE TABLE solicitud_pedido_items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id              uuid NOT NULL REFERENCES solicitudes_pedido(id),
  producto_id               uuid NOT NULL REFERENCES productos(id),
  cantidad                  integer NOT NULL,
  diseno_notas              text,
  precio_unitario_estimado  numeric(10, 2)
);

CREATE INDEX idx_spi_solicitud ON solicitud_pedido_items (solicitud_id);
