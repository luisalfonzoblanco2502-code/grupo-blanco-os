-- Migración manual — Bandeja de Solicitudes: soporta diseños 100%
-- personalizados (sin producto de catálogo) y el log de subidas del
-- endpoint público de fotos (2026-08-02). Puramente aditiva: producto_id
-- se vuelve nullable (los 100 items existentes ya lo tienen, así que el
-- CHECK nuevo pasa sin tocarlos), se agregan 2 columnas nullable, y se crea
-- una tabla nueva sin relación con datos existentes.
ALTER TABLE solicitud_pedido_items
  ALTER COLUMN producto_id DROP NOT NULL,
  ADD COLUMN producto_nombre_personalizado TEXT NULL,
  ADD COLUMN diseno_foto_url TEXT NULL;

ALTER TABLE solicitud_pedido_items
  ADD CONSTRAINT chk_solicitud_item_producto_o_personalizado
  CHECK (producto_id IS NOT NULL OR producto_nombre_personalizado IS NOT NULL);

CREATE TABLE solicitud_foto_uploads_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  tamano_bytes INTEGER NOT NULL,
  exitoso BOOLEAN NOT NULL,
  motivo_rechazo TEXT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_solicitud_foto_uploads_log_ip_fecha ON solicitud_foto_uploads_log (ip, creado_en);
