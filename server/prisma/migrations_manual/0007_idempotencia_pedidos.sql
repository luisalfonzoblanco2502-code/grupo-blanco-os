-- Migración manual — idempotencia mínima de POST /api/pedidos (Paso 6.1).
-- Puramente aditiva: una columna nullable + un UNIQUE nuevo (Postgres
-- permite múltiples NULL en un UNIQUE estándar, así que pedidos históricos
-- y cualquier vía que no mande clave no se ven afectados).
ALTER TABLE pedidos
  ADD COLUMN clave_idempotencia UUID NULL;

ALTER TABLE pedidos
  ADD CONSTRAINT uq_pedidos_empresa_clave_idempotencia
  UNIQUE (empresa_id, clave_idempotencia);
