-- Migración manual — puente Producto comercial -> ProductoInterno (Fase 1,
-- sprint Catálogo -> Solicitud -> Pedido). Puramente aditiva: una columna
-- nullable + un índice, no toca ninguna fila ni columna existente.
ALTER TABLE productos
  ADD COLUMN producto_interno_id UUID NULL REFERENCES productos_internos(id);

CREATE INDEX idx_productos_producto_interno
  ON productos (producto_interno_id);
