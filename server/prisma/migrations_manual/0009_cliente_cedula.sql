-- Migración manual — agrega cédula al cliente (Nuevo Pedido rediseñado,
-- Paso 2 revisión). Puramente aditiva: columna nullable, ningún cliente
-- existente se ve afectado. "Obligatorio para empresas de envío" se exige
-- a nivel de aplicación (alta de cliente NUEVO), no como NOT NULL en la
-- base — los 1 cliente ya existente no tiene cédula y no debe romperse.
ALTER TABLE clientes
  ADD COLUMN cedula TEXT NULL;
