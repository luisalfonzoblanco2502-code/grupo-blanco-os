# Índice central de migraciones manuales

Registro de verdad para saber qué número de migración usar a continuación y
qué existe ya, en dos capas: **archivo** (lo que hay en este repo) y
**estado real en la base** (confirmado por introspección directa, nunca
asumido por el nombre del archivo — ver auditoría de Subfase ATLAS 0.2,
2026-07-31).

**Regla obligatoria a partir de ahora:** antes de crear una migración
nueva, abrir este archivo y usar el siguiente número entero libre. Si dos
personas/sesiones crean una migración con el mismo número en paralelo (ya
pasó tres veces — ver "Colisiones históricas" abajo), **no se renumera la
que ya fue aplicada**; se le agrega un sufijo de letra (`a`, `b`, `c`...) a
las involucradas según el orden real en que se aplicaron, y la seudo
duplicada más reciente pasa al siguiente número entero libre. Nunca se
reutiliza un número ya usado por otra migración, esté o no aplicada.

## Estado actual

| # | Archivo | Aplicada en BD | Descripción | Depende de |
|---|---|---|---|---|
| 0001 | `0001_catalogo_solicitudes.sql` | ✅ | Catálogo público + solicitudes de pedido (`Producto`, `SolicitudPedido`) | `empresas` |
| 0002a | `0002a_facturador_administrativo.sql` | ✅ | Facturador administrativo: `productos_internos`, `documentos_venta`, `pagos_ingresos`, `egresos`, `cajas_cuentas` + 2 columnas nullable | 0001 |
| 0002b | `0002b_liberar_pa001.sql` | ⚠️ **Parcial** — los `DELETE` corrieron, el `UPDATE` de renombre de código nunca se ejecutó (confirmado 2026-07-31) | Liberar el código `PA-001` atascado por un soft-delete | 0001 |
| 0003 | `0003_pedido_lineas_op_manual.sql` | ✅ | `pedido_lineas`, `archivos_adjuntos` | 0002a |
| 0004a | `0004a_catalogo_rastreo_pedido.sql` | ✅ | Rastreo público de pedido (`numero_orden`, `estado_publico`, etc. en `solicitudes_pedido`) | 0001 |
| 0004b | `0004b_op_agrupada_variantes.sql` | ✅ | Agrupar variantes en una sola OP (`orden_produccion_id`, `separar_en_otra_op` en `pedido_lineas`) | 0003 |
| 0005 | `0005_puente_producto_interno.sql` | ✅ | Puente `productos.producto_interno_id` | 0001, 0002a |
| 0006 | `0006_producto_maestro.sql` | ✅ | Especificación técnica del producto maestro (`productos`/`pedido_lineas`) | 0001, 0003 |
| 0007 | `0007_idempotencia_pedidos.sql` | ✅ | Idempotencia de `POST /api/pedidos` (`clave_idempotencia`) | base (`pedidos`) |
| 0008 | `0008_atlas_fundacion.sql` | ❌ Pendiente de aprobación final | Fundación de ATLAS (núcleo técnico del futuro módulo Comercial) — 6 tablas nuevas | `empresas`, `pedidos`, `usuarios` |

**Próximo número libre: 0009.**

## Colisiones históricas (ya resueltas, solo de nombre — nunca de datos)

Las tres colisiones detectadas surgieron de frentes de trabajo distintos
tocando tablas disjuntas al mismo tiempo, nunca de un conflicto real de SQL
o de datos. En los tres casos se resolvió **solo renombrando el archivo**,
sin re-ejecutar ni modificar ninguna migración ya aplicada:

- **0002** → `0002_facturador_administrativo.sql` y `0002_liberar_pa001.sql`
  coexistían con el mismo número. Pasaron a `0002a`/`0002b` en el orden en
  que se crearon.
- **0004** → mismo caso con `0004_catalogo_rastreo_pedido.sql` y
  `0004_op_agrupada_variantes.sql` → `0004a`/`0004b`.
- **0007** → `0007_atlas_fundacion.sql` (fundación de ATLAS, nunca
  aplicada) chocó con `0007_idempotencia_pedidos.sql` (idempotencia de
  pedidos, sí aplicada, creada por un frente de trabajo distinto y
  aplicada primero). Como una de las dos ya estaba aplicada contra la base
  real, no se le podía tocar el número — la de ATLAS pasó a **0008**, el
  siguiente entero libre, en vez de a un sufijo de letra.

## Por qué no existe una tabla de tracking automática

Este proyecto no usa `prisma migrate` (el `schema.prisma` es introspección
escrita a mano de una base que ya existe, ver cabecera del propio
`schema.prisma` y `CLAUDE.md`) — las migraciones se escriben acá para
revisión humana y se pegan a mano en el SQL Editor de Supabase. Este
archivo es, por ahora, el único mecanismo de coordinación entre sesiones/
frentes de trabajo para evitar colisiones de número. Si el equipo crece o
las migraciones se vuelven más frecuentes, vale la pena reconsiderar una
tabla real de tracking — no se implementa ahora por no ser necesaria
todavía.
