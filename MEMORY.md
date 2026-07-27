# MEMORY.md

Bitácora del proyecto: decisiones tomadas, contexto y pendientes. A diferencia de `CLAUDE.md` (que documenta cómo está construido el proyecto), este archivo registra el *porqué* de las decisiones y el estado de avance, para no perder contexto entre sesiones.

## Estado actual

- **Fecha de inicio:** 2026-07-26
- **Fase:** Módulo de Producción implementado y funcionando end-to-end (backend + frontend probados en navegador).
- **Empresa:** Grupo Blanco Textil (tiene varios proyectos; este repo es específicamente para PanaPrice).
- **Proyecto:** PanaPrice — negocio de personalización de productos de sublimación (pañoletas, pareos, t-shirts, jerseys).
- **Objetivo:** Construir un ERP con módulos de Producción, Facturación, Inventario, Contabilidad, Finanzas, Marketing y CRM.
- Stack elegido: React + Vite (frontend) + Node/Express + Prisma (backend), SQLite en desarrollo.
- Skill `skill-creator` instalada localmente en `.claude/skills/` para crear/mejorar skills propias del proyecto más adelante.

## Decisiones

| Fecha | Decisión | Por qué |
|-------|----------|---------|
| 2026-07-26 | Proyecto = ERP para PanaPrice (Grupo Blanco Textil) | Personalización de productos de sublimación necesita gestión integrada de producción, ventas e inventario |
| 2026-07-26 | Módulos: Producción, Facturación, Inventario, Contabilidad, Finanzas, Marketing, CRM | Alcance definido por el usuario para cubrir toda la operación del negocio |
| 2026-07-26 | Stack: React + Node/Express | Elección inicial del usuario para la app web |
| 2026-07-26 | Skill instalada a nivel de proyecto (`.claude/skills/`) en vez de plugin global | Para que quede versionada junto con el repo, no solo disponible en esta máquina |
| 2026-07-26 | Empezar por el módulo de Producción | Elección explícita del usuario |
| 2026-07-26 | ORM: Prisma; DB de desarrollo: SQLite (no PostgreSQL) | Cero setup para arrancar ya mismo (no había Docker/Postgres instalado); Prisma no soporta `enum` nativo en SQLite, así que estados y tipos de producto se modelaron como `String` validado contra constantes en `server/src/constants/`. Al migrar a PostgreSQL (recomendado antes de construir Contabilidad/Finanzas), esos campos pueden pasar a `enum` real. |
| 2026-07-26 | `Cliente` existe ya en el schema de Producción, con solo nombre/teléfono/email | Una orden necesita asociarse a alguien, pero el modelo completo de cliente es responsabilidad del futuro módulo CRM — evitar construirlo dos veces cuando llegue ese módulo, solo extender este `Cliente`. |
| 2026-07-26 | Máquina de estados de la orden con transiciones fijas (ver CLAUDE.md) validada en el backend (409 si es inválida) | Evita que el frontend (o cualquier otro cliente futuro de la API) salte etapas del proceso de producción real. |

## Pendientes / próximas decisiones

- Migrar de SQLite a PostgreSQL antes de construir Contabilidad/Finanzas (reportes y consistencia transaccional lo van a necesitar).
- Definir precio/costeo real de los items de la orden (`precioUnitario` existe en el modelo pero no se usa todavía — lo consumirá Facturación).
- Construir el siguiente módulo: candidatos naturales son Inventario (para descontar materia prima al iniciar producción) o Facturación (para facturar órdenes en estado ENTREGADO).
- Definir convenciones de testing (todavía no hay tests automatizados, solo se verificó manualmente con Playwright en esta sesión) y despliegue.
- Autenticación / usuarios — el sistema hoy no tiene login, cualquiera con acceso a la red puede usar la API.

## Notas de sesión

**2026-07-26** — Se construyó el módulo de Producción completo: backend (Express + Prisma + SQLite) con CRUD de productos/clientes/órdenes y máquina de estados con historial; frontend (React + Vite) con listado de órdenes, alta de orden, detalle con avance de estado, y catálogo de productos. Se verificó el flujo completo en un navegador headless (Playwright) sin errores de consola: crear orden → ver detalle → avanzar de Pendiente a Diseño → historial actualizado correctamente. Ambos servidores (backend :4000, frontend :5173) quedaron corriendo en background al cierre de la sesión.
