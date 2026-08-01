-- Facturador Administrativo Inteligente — persistencia real.
-- Aprobado conceptualmente + 2 ajustes de arquitectura (2026-07-28):
--   1. Catálogo Interno de Productos como base del BOM (Inventario depende
--      de la composición del producto, no solo del pedido).
--   2. Flujo: Facturar -> Reservar materiales -> Corte -> Consumir ->
--      (Cancelar antes de Corte -> Liberar reserva). Nunca se consume al
--      facturar, solo se reserva.
-- Decisiones ya tomadas: consumo real en etapa "Corte"; sobreventa permitida
-- con alerta visible (sin bloquear facturación); sin backfill de PED-0013/
-- 0014/0015; Egresos sin flujo automático (estructura lista, fuera del Go
-- Live); pagos parciales soportados desde el inicio (N pagos por documento).
--
-- 100% aditivo: 10 tablas nuevas + 2 columnas NULLABLE en tablas existentes
-- (pedidos.cliente_id, ordenes_produccion.producto_interno_id). Ninguna
-- tabla/columna existente se renombra, elimina ni se vuelve NOT NULL.
--
-- Nota de diseño: los pares RESERVA/LIBERACION y CONSUMO usan restricciones
-- UNIQUE simples (no índices parciales) — cada tipo de movimiento solo puebla
-- las columnas FK que le corresponden (RESERVA/LIBERACION llenan pedido_id y
-- dejan NULL orden_produccion_id/etapa_id; CONSUMO al revés). Postgres no
-- aplica UNIQUE entre filas con NULL en alguna columna de la restricción, así
-- que ambos conjuntos de filas conviven sin pisarse. Esto es 100% expresable
-- en Prisma DSL (a diferencia de los índices parciales ya documentados en
-- ordenes_produccion).

-- ----------------------------------------------------------------------------
-- 0. CATÁLOGO INTERNO DE PRODUCTOS (base del BOM)
-- ----------------------------------------------------------------------------

CREATE TABLE productos_internos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id),
  codigo            text NOT NULL,
  nombre            text NOT NULL,
  categoria         text,
  precio_referencia numeric(12, 2),
  activo            boolean NOT NULL DEFAULT true,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_producto_interno_empresa_codigo UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_productos_internos_empresa_activo ON productos_internos (empresa_id, activo);

-- Enlace aditivo: qué producto interno corresponde a esta orden — necesario
-- para saber qué BOM consumir en la etapa Corte. NULL en órdenes existentes
-- y en líneas facturadas sin seleccionar un producto del catálogo.
ALTER TABLE ordenes_produccion ADD COLUMN producto_interno_id uuid REFERENCES productos_internos(id);

-- ----------------------------------------------------------------------------
-- 1. CRM: clientes (identidad únicamente — los totales/ticket/clasificación
--    se calculan agregando documentos_venta, nunca se guardan como contador
--    mutable: así reprocesar un evento no puede duplicar ni desalinear nada).
-- ----------------------------------------------------------------------------

CREATE TABLE clientes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id),
  nombre         text NOT NULL,
  telefono       text,
  email          text,
  direccion      text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cliente_empresa_nombre UNIQUE (empresa_id, nombre)
);

-- Enlace aditivo: NULL en todos los pedidos existentes (incluidos los de
-- prueba PED-0013/0014/0015, que quedan sin backfill por decisión explícita).
ALTER TABLE pedidos ADD COLUMN cliente_id uuid REFERENCES clientes(id);

-- ----------------------------------------------------------------------------
-- 2. DOCUMENTOS DE VENTA
-- ----------------------------------------------------------------------------

CREATE TABLE documentos_venta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES empresas(id),
  pedido_id         uuid NOT NULL REFERENCES pedidos(id),
  cliente_id        uuid REFERENCES clientes(id),
  numero            text NOT NULL,
  cliente_nombre    text NOT NULL, -- snapshot al emitir
  subtotal          numeric(12, 2) NOT NULL,
  descuentos        numeric(12, 2) NOT NULL DEFAULT 0,
  impuestos         numeric(12, 2) NOT NULL DEFAULT 0,
  total             numeric(12, 2) NOT NULL,
  moneda            text NOT NULL DEFAULT 'USD',
  tasa_cambio       numeric(12, 6) NOT NULL DEFAULT 1,
  estado            text NOT NULL DEFAULT 'EMITIDO', -- EMITIDO | ANULADO
  saldo_pendiente   numeric(12, 2) NOT NULL,
  fecha_emision     timestamptz NOT NULL DEFAULT now(),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_documento_pedido UNIQUE (pedido_id),
  CONSTRAINT uq_documento_empresa_numero UNIQUE (empresa_id, numero),
  CONSTRAINT ck_documento_total CHECK (total >= 0),
  CONSTRAINT ck_documento_saldo CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= total)
);

CREATE INDEX idx_documentos_empresa_estado ON documentos_venta (empresa_id, estado);
CREATE INDEX idx_documentos_empresa_cliente ON documentos_venta (empresa_id, cliente_id);
CREATE INDEX idx_documentos_empresa_fecha ON documentos_venta (empresa_id, fecha_emision);

-- ----------------------------------------------------------------------------
-- 3. PAGOS E INGRESOS (soporta pagos parciales: N filas por documento_venta;
--    saldo_pendiente se decrementa una vez por pago, nunca se recalcula por
--    reprocesamiento porque cada pago es una acción explícita del usuario,
--    no un evento reintentable como PEDIDO_FACTURADO).
-- ----------------------------------------------------------------------------

CREATE TABLE cajas_cuentas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  nombre     text NOT NULL,
  tipo       text NOT NULL DEFAULT 'CAJA', -- CAJA | BANCO
  activa     boolean NOT NULL DEFAULT true,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_caja_empresa_nombre UNIQUE (empresa_id, nombre)
);

CREATE TABLE pagos_ingresos (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL REFERENCES empresas(id),
  documento_venta_id        uuid NOT NULL REFERENCES documentos_venta(id),
  monto                     numeric(12, 2) NOT NULL,
  moneda                    text NOT NULL DEFAULT 'USD',
  tasa_cambio               numeric(12, 6) NOT NULL DEFAULT 1,
  metodo_pago               text NOT NULL,
  caja_cuenta_id            uuid NOT NULL REFERENCES cajas_cuentas(id),
  fecha                     timestamptz NOT NULL DEFAULT now(),
  referencia                text,
  referencia_idempotencia   text,
  estado                    text NOT NULL DEFAULT 'CONFIRMADO', -- CONFIRMADO | ANULADO
  registrado_por_usuario_id uuid REFERENCES usuarios(id),
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pago_monto CHECK (monto > 0)
);

CREATE UNIQUE INDEX uq_pago_idempotencia ON pagos_ingresos (empresa_id, referencia_idempotencia)
  WHERE referencia_idempotencia IS NOT NULL;
CREATE INDEX idx_pagos_empresa_documento ON pagos_ingresos (empresa_id, documento_venta_id);
CREATE INDEX idx_pagos_empresa_fecha ON pagos_ingresos (empresa_id, fecha);

-- ----------------------------------------------------------------------------
-- 4. EGRESOS (estructura lista; sin flujo automático — fuera del Go Live)
-- ----------------------------------------------------------------------------

CREATE TABLE egresos (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL REFERENCES empresas(id),
  categoria                 text NOT NULL,
  proveedor_beneficiario    text NOT NULL,
  monto                     numeric(12, 2) NOT NULL,
  moneda                    text NOT NULL DEFAULT 'USD',
  tasa_cambio               numeric(12, 6) NOT NULL DEFAULT 1,
  metodo_pago               text NOT NULL,
  caja_cuenta_id            uuid NOT NULL REFERENCES cajas_cuentas(id),
  fecha                     timestamptz NOT NULL DEFAULT now(),
  descripcion               text,
  referencia                text,
  estado                    text NOT NULL DEFAULT 'CONFIRMADO',
  registrado_por_usuario_id uuid REFERENCES usuarios(id),
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_egreso_monto CHECK (monto > 0)
);

CREATE INDEX idx_egresos_empresa_fecha ON egresos (empresa_id, fecha);

-- ----------------------------------------------------------------------------
-- 5. INVENTARIO
-- ----------------------------------------------------------------------------

CREATE TABLE items_inventario (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES empresas(id),
  codigo                text NOT NULL,
  nombre                text NOT NULL,
  categoria             text,
  unidad_medida         text NOT NULL DEFAULT 'unidad',
  existencia            numeric(12, 3) NOT NULL DEFAULT 0,
  existencia_reservada  numeric(12, 3) NOT NULL DEFAULT 0,
  stock_minimo          numeric(12, 3) NOT NULL DEFAULT 0,
  costo_unitario        numeric(12, 4) NOT NULL DEFAULT 0,
  activo                boolean NOT NULL DEFAULT true,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_item_empresa_codigo UNIQUE (empresa_id, codigo),
  CONSTRAINT ck_item_reservada CHECK (existencia_reservada >= 0)
  -- Sin CHECK de existencia >= 0 a propósito: sobreventa permitida y
  -- visible (decisión aprobada), no bloqueada a nivel de base de datos.
);

CREATE INDEX idx_items_empresa_activo ON items_inventario (empresa_id, activo);

-- Puente real (ya no por texto): BOM = qué ítems de inventario y en qué
-- cantidad requiere una unidad de un producto interno.
CREATE TABLE producto_insumos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES empresas(id),
  producto_interno_id   uuid NOT NULL REFERENCES productos_internos(id),
  item_inventario_id    uuid NOT NULL REFERENCES items_inventario(id),
  cantidad_por_unidad   numeric(12, 4) NOT NULL,
  CONSTRAINT uq_producto_insumo UNIQUE (producto_interno_id, item_inventario_id),
  CONSTRAINT ck_insumo_cantidad CHECK (cantidad_por_unidad > 0)
);

CREATE TABLE movimientos_inventario (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES empresas(id),
  item_inventario_id    uuid NOT NULL REFERENCES items_inventario(id),
  -- ENTRADA | RESERVA | CONSUMO | LIBERACION | AJUSTE
  tipo                  text NOT NULL,
  cantidad              numeric(12, 3) NOT NULL,
  -- RESERVA/LIBERACION pueblan pedido_id y dejan NULL orden/etapa.
  pedido_id             uuid REFERENCES pedidos(id),
  -- CONSUMO puebla orden_produccion_id + etapa_id y deja NULL pedido_id.
  orden_produccion_id   uuid REFERENCES ordenes_produccion(id),
  etapa_id              integer REFERENCES etapas(id),
  referencia            text, -- motivo de ENTRADA/AJUSTE manual
  usuario_id            uuid REFERENCES usuarios(id), -- NULL si lo generó el Event Bus
  fecha                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_movimiento_cantidad CHECK (cantidad > 0),
  -- Idempotencia: una sola RESERVA y una sola LIBERACION por pedido+ítem.
  CONSTRAINT uq_movimiento_reserva_liberacion UNIQUE (empresa_id, pedido_id, item_inventario_id, tipo),
  -- Idempotencia: un solo CONSUMO por orden+etapa+ítem.
  CONSTRAINT uq_movimiento_consumo UNIQUE (empresa_id, orden_produccion_id, etapa_id, item_inventario_id, tipo)
);

CREATE INDEX idx_movimientos_empresa_item_fecha ON movimientos_inventario (empresa_id, item_inventario_id, fecha);
CREATE INDEX idx_movimientos_empresa_pedido ON movimientos_inventario (empresa_id, pedido_id);
CREATE INDEX idx_movimientos_empresa_orden ON movimientos_inventario (empresa_id, orden_produccion_id);

-- ----------------------------------------------------------------------------
-- 6. COSTOS
-- ----------------------------------------------------------------------------

CREATE TABLE costos_pedido (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES empresas(id),
  pedido_id          uuid NOT NULL REFERENCES pedidos(id),
  costo_estimado     numeric(12, 2) NOT NULL,
  costo_real         numeric(12, 2),
  utilidad_estimada  numeric(12, 2) NOT NULL,
  utilidad_real      numeric(12, 2),
  margen_estimado    numeric(6, 4),
  margen_real        numeric(6, 4),
  desglose           jsonb NOT NULL DEFAULT '{}', -- {"material":x,"produccion":y,"otros":z}
  fuente             text NOT NULL DEFAULT 'estimado_temporal',
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_costo_pedido UNIQUE (pedido_id)
);

CREATE INDEX idx_costos_empresa ON costos_pedido (empresa_id);

-- ----------------------------------------------------------------------------
-- 7. Semilla mínima para poder probar el recorrido de punta a punta.
-- ----------------------------------------------------------------------------

INSERT INTO cajas_cuentas (empresa_id, nombre, tipo)
VALUES ('00000000-0000-0000-0000-000000000001', 'Caja principal', 'CAJA')
ON CONFLICT (empresa_id, nombre) DO NOTHING;
