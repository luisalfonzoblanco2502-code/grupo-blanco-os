# CLAUDE.md

Este archivo guía a Claude Code al trabajar en este repositorio.

## Proyecto

**Grupo:** Grupo Blanco Textil — el sistema se llama internamente **"Grupo Blanco OS"** y es
multi-empresa: hoy modela **Panaprice Custom**, **Punto Ele** y **Grupo Blanco** compartiendo
la misma base de datos (tabla `empresas`, todo lo demás scoped por `empresaId`).
**PanaPrice** es el foco de trabajo actual dentro de ese sistema (personalización de productos
de sublimación: pañoletas, pareos, t-shirts, jerseys), pero las decisiones de este ERP pueden
afectar a las otras empresas del grupo — no asumir que un cambio es "solo de PanaPrice".

**Módulos activos en producción hoy** (backend + frontend desplegados y en uso real):
**Pedidos** (cabecera comercial, con captura compacta desde Producto Maestro e idempotencia
contra doble envío), **Producción** (órdenes de producción con pipeline de etapas), **Productos
/ Producto Maestro** (ficha técnica permanente + precio por volumen), **Catálogo público +
Solicitudes de pedido** (ver abajo). "Facturar" hoy es solo una transición de estado de
`Pedido` (`FACTURADO`), no una entidad `Factura` separada.

**Módulos en construcción, NO activos en producción** (código existe pero su backend no está
desplegado — por eso están ocultos del menú del ERP en `client/src/nav/modules.js`):
**Registrar Pago** (backend listo, bloqueado porque su única vía de creación de
`DocumentoVenta` depende del listener de Núcleo de Facturación, que a su vez activaría
Inventario/CRM/Costos de una sola vez — pendiente de separar); **Inventario, ATLAS (Centro de
Atención), CRM y Centro Financiero** (pantallas de frontend ya escritas en
`client/src/pages/{inventario,atlas,crm,financiero}/`, sin API real conectada — ATLAS además
tiene su fundación de base de datos diseñada pero sin migrar a la base real). No asumir que
estos módulos funcionan solo porque el archivo existe.

## Stack técnico (real, verificado en código — no asumir por nombres de carpeta)

- **Backend:** Node.js (ESM) + Express + Prisma (`server/`), un único backend compartido por
  todas las apps de frontend.
- **Base de datos:** **PostgreSQL en Supabase**, compartida entre empresas del grupo. El
  `schema.prisma` fue escrito a mano a partir de introspección de una BD que YA EXISTE — no es
  la fuente de verdad canónica, la BD real lo es. **No correr `prisma migrate dev` / `db push`
  sin revisar el SQL generado primero** (ver cabecera de `schema.prisma` y
  `server/prisma/migrations_manual/`, donde se dejan migraciones escritas a mano para revisión
  humana antes de aplicarlas en el SQL editor de Supabase).
- **Autenticación:** Supabase Auth. El backend valida el JWT contra Supabase (no localmente,
  `server/src/middleware/auth.js`) y cuelga el perfil de negocio (`usuarios`, con su `empresa`,
  `rol` y `puesto`) en `req.usuario`.
- **Arquitectura de dominio:** por eventos. `server/src/events/eventBus.js` es un wrapper fino
  sobre `EventEmitter`; los servicios emiten hechos de negocio (`PEDIDO_FACTURADO`,
  `SOLICITUD_CONVERTIDA`, etc. — catálogo completo en `server/src/events/eventos.js`) sin
  conocer quién reacciona. Nuevos módulos (Inventario, CRM, Finanzas) se conectan agregando su
  propio `on(...)`, sin tocar el emisor.
- **Estado de `Pedido`:** NO es una columna — es event-sourced sobre `auditoria_sistema`
  (ver `server/src/services/pedidoEstado.service.js`). El estado "actual" es el `estadoNuevo`
  del evento más reciente para ese pedido. Las tablas nuevas (`solicitudes_pedido`) SÍ pueden
  tener columna `estado` propia si conviene — esa restricción es histórica y específica de
  `pedidos`, no una regla general del proyecto.
- **Frontend:** dos apps Vite + React 19 independientes, mismo backend:
  - `client/` — el ERP, protegido con Supabase Auth (react-router-dom, `AuthContext`,
    `ProtectedRoute`). Pensado para desplegarse en un subdominio tipo `erp.panaprice.com`.
  - `catalogo/` — tienda pública sin autenticación, sin dependencia de Supabase ni
    react-router. Pensado para `catalogo.panaprice.com`. Habla únicamente con
    `/api/publico/*` (montado en `index.js` **sin** `requireAuth`).
- **Testing:** (pendiente de definir)
- **Despliegue:** (pendiente de definir formalmente) — el diseño ya asume 2 subdominios de
  frontend + 1 backend compartido; falta elegir proveedor (Vercel/Render/Railway, etc.) y
  documentar el proceso acá cuando se decida.

## Estructura del proyecto

```
/
├── client/                 # ERP (Vite), protegido con Supabase Auth
│   └── src/
│       ├── api/client.js
│       ├── auth/            # AuthContext, ProtectedRoute
│       └── pages/            # Pedidos, OrdenesProduccion, Productos, Solicitudes
├── catalogo/                # Tienda pública (Vite), SIN autenticación
│   └── src/                 # App.jsx (catálogo + carrito + checkout), api.js
├── server/                  # Backend Express + Prisma (compartido por ambos frontends)
│   ├── prisma/
│   │   ├── schema.prisma            # modelo real, escrito a mano desde introspección
│   │   └── migrations_manual/       # SQL para revisar y aplicar a mano en Supabase
│   └── src/
│       ├── index.js                 # entrypoint Express — acá se ve qué rutas llevan requireAuth
│       ├── db.js                    # cliente Prisma singleton + TRANSACTION_OPTIONS
│       ├── middleware/auth.js       # valida JWT de Supabase, carga req.usuario
│       ├── events/                  # eventBus.js + catálogo de eventos (eventos.js)
│       ├── routes/                  # una ruta por recurso; publico.routes.js es la única sin auth
│       └── services/                # lógica de negocio; ver notas de Pedido/Solicitud abajo
├── CLAUDE.md
└── MEMORY.md
```

## Pedido → Producción (flujo existente)

`Pedido` (cabecera: cliente texto libre, cantidad total, fechas) → al facturar
(`facturacion.service.js`, llama a `cambiarEstadoPedido` + emite `PEDIDO_FACTURADO`) → se
crean `OrdenProduccion` (una por línea, con `producto` en texto libre — no hay FK a un
catálogo real acá) → cada una avanza por `Etapa` (pipeline configurable en BD) con
`Prioridad` y responsable (usuario interno o texto libre externo).

## Catálogo público + Solicitudes de pedido (Sprint 10)

Objetivo: que un cliente arme un pedido desde `catalogo.panaprice.com` sin login, y que eso
entre al ERP como una solicitud revisable — sin copiar pedidos de WhatsApp a mano.

- `Producto` (nuevo): catálogo real, con `activo` + `publicadoCatalogo` independientes y
  `ProductoPrecioVolumen` (escalones de precio por cantidad). Administrado desde
  `client/` (`/productos`, protegido); leído sin auth desde `/api/publico/productos`
  (`productos.service.js` → `listarProductosPublicos`, único punto que filtra por
  `activo && publicadoCatalogo`).
- `SolicitudPedido` / `SolicitudPedidoItem` (nuevo): lo que el cliente envía desde el
  carrito (`POST /api/publico/solicitudes`, sin auth). Vive en `solicitudes.service.js`.
  Estados propios: `RECIBIDA → EN_REVISION → APROBADA/RECHAZADA/CORRECCION_SOLICITADA`
  (ver `ESTADOS_SOLICITUD` y `TRANSICIONES_SOLICITUD` en ese archivo).
- **La conversión "solicitud aprobada → pedido formal" reutiliza `crearPedido()`** de
  `pedidos.service.js` tal cual — no hay lógica de creación de pedido duplicada. A partir de
  ahí el flujo es el de siempre (facturar → órdenes de producción).
- La "notificación interna" del MVP es la bandeja `/solicitudes` en el ERP filtrando por
  estado; no hay todavía un canal real (email/WhatsApp Business API/Slack) — se agregaría
  como un `on(SOLICITUD_CREADA, ...)` nuevo, sin tocar `solicitudes.service.js`.
- WhatsApp sigue siendo el canal de confirmación humana (precio final, envío, pago) antes de
  convertir — el sistema no automatiza esa parte todavía.
- Resolución de empresa del catálogo público: variable de entorno `CATALOGO_EMPRESA_ID` en
  `server/.env` (una empresa por despliegue de `catalogo/`; no hay slug en `Empresa` todavía).

### Cómo correr el sistema completo en local

Backend (compartido por ambos frontends):
```bash
cd server
npm install
npm run prisma:generate   # tras cualquier cambio de schema.prisma
npm run dev                # http://localhost:4000
```
Requiere `server/.env` con `DATABASE_URL` (pooler de Supabase), `CORS_ORIGIN` (lista separada
por comas — incluir los orígenes de `client/` y `catalogo/`) y `CATALOGO_EMPRESA_ID`.

ERP:
```bash
cd client
npm install
npm run dev   # http://localhost:5173
```

Catálogo público:
```bash
cd catalogo
npm install
npm run dev   # http://localhost:5174
```

## Convenciones (a definir conforme avance el proyecto)

- Estilo de código: comentarios explican el *por qué* de una decisión no obvia (ver el propio
  `schema.prisma` y los `*.service.js` como referencia de tono), no el *qué* hace el código.
- **Principio de UX permanente, en todos los módulos: "Primero sugerir, nunca obligar".**
  El sistema ayuda reutilizando información que YA existe (autocompletar por historial,
  valores frecuentes sugeridos) en vez de imponer catálogos cerrados o campos obligatorios
  nuevos. Un campo de texto libre puede sugerir sin restringir — nunca convertirse en un
  dropdown rígido solo por prolijidad. Precedente: sugerencias técnicas de `pedido_lineas`
  (tela/color/tipo de impresión/etc., Sprint de calidad de datos) — sigue siendo texto libre,
  el sistema solo sugiere lo ya usado.
- **Principio permanente de proceso, en todo el proyecto: "Arquitectura aprobada antes de
  implementar".** Toda funcionalidad nueva se presenta y se aprueba primero como diseño
  (qué datos guarda, qué límites tiene, cómo se conecta con lo existente) antes de escribir
  código — corregir un documento cuesta minutos, corregir datos reales ya guardados cuesta
  mucho más. Formalizado por primera vez en `docs/atlas/VISION.md` (Sprint ATLAS 0.2,
  2026-07-31), pero no es exclusivo de ATLAS/Comercial.
- Gestión de dependencias:
- Estrategia de ramas / commits:
- Cómo correr tests:

## Notas

Este archivo debe mantenerse actualizado a medida que se tomen decisiones de arquitectura y
convenciones — la versión anterior de este archivo describía un stack (SQLite, modelos
`Cliente`/cliente-simple, sin autenticación) que ya no existe en el código; si algo acá vuelve
a divergir del código real, confiar en el código.

Grupo Blanco Textil puede tener otros proyectos además de PanaPrice — si en el futuro se
agrega otro proyecto en esta misma carpeta o en una carpeta hermana, no asumir que las
decisiones de este ERP aplican a los demás.
