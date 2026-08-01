-- Migración manual — Producto Maestro (arquitectura aprobada, Paso 2/3).
-- Puramente aditiva: nuevas columnas nullable/con default seguro, un FK con
-- ON DELETE SET NULL, dos CHECK, un índice. No modifica ninguna fila ni
-- columna existente.

-- Producto Maestro: campos técnicos permanentes.
ALTER TABLE productos
  ADD COLUMN requiere_personalizacion        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN imagen_referencia_produccion_url TEXT,
  ADD COLUMN talla                           TEXT,
  ADD COLUMN medidas                         TEXT,
  ADD COLUMN tela                            TEXT,
  ADD COLUMN tipo_impresion                  TEXT,
  ADD COLUMN forro                           TEXT,
  ADD COLUMN tiras                           TEXT,
  ADD COLUMN insumos_descripcion             TEXT,
  ADD COLUMN molde_url                       TEXT,
  ADD COLUMN tiempo_produccion_minutos       INTEGER,
  ADD COLUMN instrucciones_produccion        TEXT,
  ADD CONSTRAINT chk_productos_tiempo_produccion_positivo
    CHECK (tiempo_produccion_minutos IS NULL OR tiempo_produccion_minutos > 0);

-- PedidoLinea: referencia a Producto Maestro + snapshot histórico completo.
ALTER TABLE pedido_lineas
  ADD COLUMN producto_id                          UUID NULL REFERENCES productos(id) ON DELETE SET NULL,
  ADD COLUMN producto_codigo                      TEXT NULL,
  ADD COLUMN imagen_referencia_produccion_url      TEXT NULL,
  ADD COLUMN molde_url_snapshot                    TEXT NULL,
  ADD COLUMN tiempo_produccion_minutos_snapshot    INTEGER NULL,
  ADD COLUMN instrucciones_produccion_snapshot     TEXT NULL,
  ADD COLUMN especificacion_modificada_manualmente BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT chk_pedido_lineas_tiempo_produccion_positivo
    CHECK (tiempo_produccion_minutos_snapshot IS NULL OR tiempo_produccion_minutos_snapshot > 0);

CREATE INDEX idx_pedido_lineas_producto ON pedido_lineas (producto_id);
