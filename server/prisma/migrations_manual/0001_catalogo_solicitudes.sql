-- Migración manual — pegar TODO este archivo en el SQL Editor de Supabase
-- y presionar Run. Puramente aditiva: crea 4 tablas nuevas + 1 bucket de
-- Storage, no modifica ninguna tabla existente.
--
-- Después de correr esto: `npx prisma generate` en server/ (no hace falta
-- `migrate dev`, las tablas ya existen).

CREATE TABLE productos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES empresas(id),
  codigo              text NOT NULL,
  nombre              text NOT NULL,
  categoria           text NOT NULL,
  descripcion         text,
  imagen_url          text,
  precio_base         numeric(10, 2) NOT NULL,
  activo              boolean NOT NULL DEFAULT true,
  publicado_catalogo  boolean NOT NULL DEFAULT false,
  disponible          boolean NOT NULL DEFAULT true,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  eliminado_en        timestamptz,
  CONSTRAINT uq_producto_empresa_codigo UNIQUE (empresa_id, codigo)
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

-- Storage: bucket público para las imágenes del catálogo. Público = las
-- fotos se sirven por URL directa sin necesitar el JWT del cliente (así
-- catalogo.panaprice.com, que no tiene sesión, puede mostrarlas).
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos-catalogo', 'productos-catalogo', true)
ON CONFLICT (id) DO NOTHING;

-- Cualquier usuario autenticado del ERP (de cualquier empresa del grupo,
-- ver nota de deuda técnica) puede subir/reemplazar/borrar imágenes en este
-- bucket. No se separa por empresa todavía — alcance mínimo para hoy.
CREATE POLICY "productos_catalogo_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'productos-catalogo');

CREATE POLICY "productos_catalogo_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'productos-catalogo')
  WITH CHECK (bucket_id = 'productos-catalogo');

CREATE POLICY "productos_catalogo_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'productos-catalogo');

CREATE POLICY "productos_catalogo_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'productos-catalogo');

-- Corré esto último (o Supabase ya lo muestra al ejecutar todo el bloque):
-- copiá el "id" de la fila de tu empresa, es el valor de CATALOGO_EMPRESA_ID
-- en server/.env.
SELECT id, nombre FROM empresas;
