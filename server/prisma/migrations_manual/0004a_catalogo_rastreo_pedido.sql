-- Migración manual — pegar en el SQL Editor de Supabase y presionar Run.
-- Requiere que 0001_catalogo_solicitudes.sql ya se haya corrido (necesita
-- que exista la tabla solicitudes_pedido). Puramente aditiva: agrega 4
-- columnas nuevas con defaults/nullable, no toca ninguna fila ni columna
-- existente.
--
-- Habilita el número de orden público (ej. "PP-2026-000154") y el estado
-- de producción/entrega que el cliente puede consultar en "Rastrea tu
-- pedido" del catálogo — un estado DISTINTO del `estado` interno (que es
-- el flujo de revisión RECIBIDA/EN_REVISION/APROBADA/... de staff).
--
-- Después de correr esto: `npx prisma generate` en server/ (no hace falta
-- migrate dev, las columnas ya existen).

ALTER TABLE solicitudes_pedido
  ADD COLUMN numero_orden   text,
  ADD COLUMN estado_publico text NOT NULL DEFAULT 'RECIBIDO',
  ADD COLUMN tipo_entrega   text,
  ADD COLUMN agencia_envio  text,
  ADD CONSTRAINT uq_solicitud_empresa_numero_orden UNIQUE (empresa_id, numero_orden);
