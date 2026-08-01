-- 0004_op_agrupada_variantes.sql
-- Orden de Producción agrupada por lote (variantes) — 2026-07-29.
--
-- 100% aditiva. No renombra, no elimina, no fusiona ni borra ninguna
-- OrdenProduccion ni PedidoLinea existente. PED-0001-01 y PED-0001-02
-- quedan exactamente como están, solo ganan un valor en la columna nueva
-- orden_produccion_id (backfill, ver abajo).

-- 1) Columnas nuevas en pedido_lineas.
ALTER TABLE pedido_lineas
  ADD COLUMN orden_produccion_id UUID NULL REFERENCES ordenes_produccion(id),
  ADD COLUMN separar_en_otra_op BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_pedido_lineas_orden_produccion
  ON pedido_lineas (orden_produccion_id);

-- 2) Backfill: toda OrdenProduccion histórica que ya tiene pedido_linea_id
--    (el ancla 1:1 legacy) vincula esa misma línea hacia la orden vía la
--    columna nueva. No toca ninguna fila de ordenes_produccion.
UPDATE pedido_lineas pl
SET orden_produccion_id = op.id
FROM ordenes_produccion op
WHERE op.pedido_linea_id = pl.id
  AND pl.orden_produccion_id IS NULL;
