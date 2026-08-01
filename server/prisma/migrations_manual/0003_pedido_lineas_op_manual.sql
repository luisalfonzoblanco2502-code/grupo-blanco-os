-- Eliminar la Orden de Producción manual: captura estructurada de líneas de
-- pedido + archivos adjuntos reales + snapshot técnico en la OP al facturar.
-- Aprobado (2026-07-28), con checklist de verificación en el mensaje de
-- entrega. NO ejecutar hasta confirmar una vez más.
--
-- 100% aditivo: 2 tablas nuevas + columnas NULLABLE en 2 tablas existentes
-- (pedidos, ordenes_produccion). Ninguna tabla/columna existente se
-- renombra, elimina ni se vuelve NOT NULL. Compatible con pedidos e
-- históricos (todo columna nueva es NULL para filas ya existentes,
-- incluidos PED-0013/0014/0015 y los PED-TEST-*, que no se tocan).
--
-- Rollback: DROP TABLE archivos_adjuntos, pedido_lineas (en ese orden, por
-- FKs) + ALTER TABLE ... DROP COLUMN de las 8 columnas nuevas. Nada de esto
-- toca FacturacionService (server/src/services/facturacion.service.js no se
-- modifica) ni el Event Bus (se sigue reaccionando sobre PEDIDO_FACTURADO /
-- ORDEN_ETAPA_CAMBIADA, eventos ya existentes).

-- ----------------------------------------------------------------------------
-- 1. PEDIDO_LINEAS — captura estructurada de la vendedora, antes de facturar.
-- ----------------------------------------------------------------------------

CREATE TABLE pedido_lineas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              uuid NOT NULL REFERENCES empresas(id),
  pedido_id               uuid NOT NULL REFERENCES pedidos(id),
  orden_visualizacion     integer NOT NULL DEFAULT 0,
  producto_interno_id     uuid REFERENCES productos_internos(id),
  producto                text NOT NULL,
  descripcion             text,
  talla                   text,
  cantidad                integer NOT NULL,
  precio_unitario         numeric(12, 2),
  subtotal                numeric(12, 2),
  tela                    text,
  color                   text,
  tipo_impresion          text,
  forro                   text,
  tiras                   text,
  insumos                 text,
  medidas                 text,
  observaciones_produccion text,
  prioridad_id            integer REFERENCES prioridades(id),
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pedido_linea_cantidad CHECK (cantidad > 0)
);

CREATE INDEX idx_pedido_lineas_pedido ON pedido_lineas (pedido_id, orden_visualizacion);
CREATE INDEX idx_pedido_lineas_empresa ON pedido_lineas (empresa_id);

-- ----------------------------------------------------------------------------
-- 2. ARCHIVOS_ADJUNTOS — una tabla para imagen principal + adjuntos, tanto
--    de la línea (antes de facturar) como de la OP (snapshot al facturar,
--    "copiar imagen y archivos relacionados" sin volver a subir el archivo:
--    se duplica la fila de metadata apuntando al mismo `ubicacion` en Storage).
-- ----------------------------------------------------------------------------

CREATE TABLE archivos_adjuntos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES empresas(id),
  pedido_linea_id      uuid REFERENCES pedido_lineas(id),
  orden_produccion_id  uuid REFERENCES ordenes_produccion(id),
  es_principal         boolean NOT NULL DEFAULT false,
  nombre               text NOT NULL,
  tipo                 text NOT NULL,
  tamano               integer NOT NULL,
  ubicacion            text NOT NULL,
  usuario_id           uuid REFERENCES usuarios(id),
  creado_en            timestamptz NOT NULL DEFAULT now(),
  -- Debe pertenecer a una línea o a una orden, nunca a ninguna o a ambas a
  -- la vez (evita archivos huérfanos y evita ambigüedad de a quién pertenece).
  CONSTRAINT ck_archivo_un_dueno CHECK (
    (pedido_linea_id IS NOT NULL AND orden_produccion_id IS NULL) OR
    (pedido_linea_id IS NULL AND orden_produccion_id IS NOT NULL)
  )
);

CREATE INDEX idx_archivos_pedido_linea ON archivos_adjuntos (pedido_linea_id);
CREATE INDEX idx_archivos_orden ON archivos_adjuntos (orden_produccion_id);
CREATE INDEX idx_archivos_empresa ON archivos_adjuntos (empresa_id);

-- ----------------------------------------------------------------------------
-- 3. Columnas aditivas en PEDIDOS (cabecera comercial capturada por la
--    vendedora; cantidadTotal existente se recalcula desde las líneas en la
--    app, no requiere columna nueva).
-- ----------------------------------------------------------------------------

ALTER TABLE pedidos ADD COLUMN tipo_entrega text;
ALTER TABLE pedidos ADD COLUMN direccion_agencia text;
ALTER TABLE pedidos ADD COLUMN prioridad_id integer REFERENCES prioridades(id);

-- ----------------------------------------------------------------------------
-- 4. Columnas aditivas en ORDENES_PRODUCCION — snapshot técnico copiado de
--    la línea al facturar (medida/observaciones YA existían, se reutilizan).
--    pedido_linea_id es el ancla de idempotencia: una OP nace de EXACTAMENTE
--    una línea, una sola vez — reprocesar PEDIDO_FACTURADO no puede duplicar
--    la OP porque el segundo intento de create() choca con este UNIQUE.
-- ----------------------------------------------------------------------------

ALTER TABLE ordenes_produccion ADD COLUMN descripcion text;
ALTER TABLE ordenes_produccion ADD COLUMN talla text;
ALTER TABLE ordenes_produccion ADD COLUMN tela text;
ALTER TABLE ordenes_produccion ADD COLUMN color text;
ALTER TABLE ordenes_produccion ADD COLUMN tipo_impresion text;
ALTER TABLE ordenes_produccion ADD COLUMN forro text;
ALTER TABLE ordenes_produccion ADD COLUMN tiras text;
ALTER TABLE ordenes_produccion ADD COLUMN insumos text;
ALTER TABLE ordenes_produccion ADD COLUMN pedido_linea_id uuid UNIQUE REFERENCES pedido_lineas(id);

-- ----------------------------------------------------------------------------
-- 5. Storage: bucket para imágenes/archivos de líneas de pedido y OP. Mismo
--    patrón que el bucket público del catálogo (0001) — público para no
--    necesitar URLs firmadas, pero rutas con UUID (no enumerable) y
--    escritura restringida a usuarios autenticados del ERP.
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('pedidos-adjuntos', 'pedidos-adjuntos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "pedidos_adjuntos_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pedidos-adjuntos');

CREATE POLICY "pedidos_adjuntos_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'pedidos-adjuntos')
  WITH CHECK (bucket_id = 'pedidos-adjuntos');

CREATE POLICY "pedidos_adjuntos_delete_auth" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pedidos-adjuntos');

CREATE POLICY "pedidos_adjuntos_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'pedidos-adjuntos');
