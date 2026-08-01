-- Liberar el código PA-001 — pegar en el SQL Editor de Supabase y Run.
--
-- Causa raíz (investigada 2026-07-29): @@unique([empresaId, codigo]) en
-- `productos` no filtra por eliminadoEn, así que un soft-delete (lo que
-- hace eliminarProducto()) deja la fila viva "dueña" del código para
-- siempre — por eso no se podía volver a crear PA-001. Esto ya se
-- corrigió para el futuro en server/src/services/productos.service.js
-- (eliminarProducto ahora renombra el código al borrar). Este script es
-- el arreglo único para el registro que ya quedó atascado.
--
-- Se investigaron los registros que referencian a ese producto:
--   - 2 filas en producto_precios_volumen (propias del producto, se
--     pueden borrar sin problema).
--   - 4 filas en solicitud_pedido_items. De esas, 3 son solicitudes de
--     PRUEBA que generaron mis propias verificaciones (SOL-0002, SOL-0003,
--     SOL-0004 — "Cliente de Prueba" / "Cliente Badge Test"): se borran
--     acá. La cuarta (SOL-0001, cliente "Luis") es una solicitud REAL —
--     por eso este script NO borra la fila de `productos`, la renombra
--     (mismo criterio que el fix de eliminarProducto) para no perder esa
--     referencia histórica real.

-- 1) Borrar las 3 solicitudes de prueba (no tocan la solicitud real SOL-0001).
DELETE FROM solicitud_pedido_items WHERE solicitud_id IN (
  '6717c737-dcf0-46ea-9aa4-332061c6d561',
  'dd76ed5f-b1e2-49e7-913f-c6d44d3e7920',
  '21a7d669-46f4-4586-815c-782903192060'
);
DELETE FROM solicitudes_pedido WHERE id IN (
  '6717c737-dcf0-46ea-9aa4-332061c6d561',
  'dd76ed5f-b1e2-49e7-913f-c6d44d3e7920',
  '21a7d669-46f4-4586-815c-782903192060'
);

-- 2) Liberar el código: renombrar la fila borrada de PA-001 en vez de
--    eliminarla — preserva la solicitud real SOL-0001 que todavía la
--    referencia. Después de esto, crear un producto nuevo con código
--    "PA-001" funciona sin choque de unicidad.
UPDATE productos
SET codigo = 'PA-001__eliminado_' || extract(epoch from now())::bigint
WHERE codigo = 'PA-001';

-- Verificación (debería devolver 0 filas):
SELECT id, codigo, eliminado_en FROM productos WHERE codigo = 'PA-001';
