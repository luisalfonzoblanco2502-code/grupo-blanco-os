# ATLAS como núcleo del futuro módulo COMERCIAL

**Decisión del negocio (Subfase 0.2, 2026-07-31):** ATLAS deja de pensarse
como un módulo aislado de Grupo Blanco OS. Pasa a ser el **motor técnico**
de un ecosistema más amplio, **Comercial**, que absorberá también al CRM
actual (`client/src/pages/crm/`, modelo `Cliente`). Objetivo explícito del
negocio: *"no quiero duplicar funcionalidades, quiero un único ecosistema
comercial."*

Este documento existe para dejar registrado **qué pieza de código cubre
cada parte de ese ecosistema hoy**, y cuáles todavía no existen — sin
inventar modelos nuevos para las que faltan hasta que haya requisitos
reales. Fabricar tablas para "Campañas" o "Embudos" ahora mismo, sin saber
sus campos ni sus reglas de negocio, sería exactamente el tipo de
abstracción prematura que este proyecto evita.

## Mapa: pilar de Comercial → estado real hoy

| Pilar (pedido del negocio) | Qué cubre hoy | Estado |
|---|---|---|
| **Inbox** | `AtlasConversacion` + `AtlasMensaje`, colgados de `AtlasIdentidadCanal` | Modelo listo, sin UI todavía (Subfase 0.3) |
| **Leads** | `AtlasContacto.estadoComercial` (`nuevo` → ... → `convertido`/`perdido`) | Modelo listo, ya captura el ciclo de vida completo de un lead |
| **Contactos** | `AtlasContacto` (persona unificada) + `AtlasIdentidadCanal` (identidad por canal) | Modelo listo — es la pieza más madura de esta fundación |
| **Clientes** | `Cliente` (existente, `clientes.service.js`, identidad post-facturación) | Ya existe, **no se toca ni se fusiona ahora**. El puente `AtlasContacto ←→ Cliente` (más allá del `pedidoId` opcional que ya existe) queda como diseño futuro explícito de Comercial |
| **Campañas** | `AtlasAtribucionToken` (token opaco por enlace + UTM/click-IDs/placement/device) | Es la semilla de una futura entidad "Campaña" — hoy modela el *enlace*, no la *campaña* como objeto administrable. No se crea `Campaña` como modelo propio todavía |
| **Automatizaciones** | `intents.service.js` (clasificador por reglas) + `respuestas.service.js` (plantillas fijas) | Lógica real ya escrita, sin ningún canal conectado (stubs en `integraciones/`) |
| **Seguimientos** | `seguimientos.service.js` + `AtlasContacto.proximaAccion`/`ultimoContacto` | Modelo mínimo ya existe, sin UI de recordatorios todavía |
| **Embudos** | `ESTADOS_COMERCIALES` en `config.js` — ya está ordenado deliberadamente para poder alimentar columnas de un Kanban/embudo futuro | Datos listos, sin visualización de embudo todavía |
| **Reportes** | `metricas.service.js` (`resumenGeneral`, primera respuesta, identidades por canal) | Lógica de agregados ya existe, sin dashboard visual unificado (hoy expone JSON vía `GET /api/atlas/metricas/*`) |

## Qué NO se hace en esta corrección

- No se crean modelos Prisma nuevos para Campaña/Automatización/Embudo/
  Reporte como entidades propias — no hay todavía requisitos de negocio
  (campos, reglas, permisos) para diseñarlos bien. Se documentan como
  huecos conocidos, no como deuda técnica escondida.
- No se toca `Cliente` ni `crm.service.js` — siguen funcionando exactamente
  igual que hoy.
- No se renombran los modelos `Atlas*`/tablas `atlas_*` a `Comercial*`. Ver
  razón abajo.
- No se reorganiza la navegación del ERP (`client/src/nav/modules.js`,
  hoy "ATLAS" y "CRM" son dos entradas separadas) — eso implica una
  decisión de UX (¿siguen separados en el menú? ¿se funden en un solo
  "Comercial" con submenú?) que corresponde a una subfase de UI futura, no
  a esta fundación de datos.

## Por qué los nombres `Atlas*` no cambian todavía

Renombrar ahora (`AtlasContacto` → `ComercialContacto`, etc.) tocaría
schema.prisma, las 10 migraciones/servicios de ATLAS, las rutas, el
frontend y toda esta documentación — un costo real y disruptivo — a
cambio de un beneficio puramente cosmético, porque el resto del ecosistema
Comercial (Campañas, Embudos, Automatizaciones como entidades propias)
todavía no existe ni tiene diseño. Si más adelante se decide que el
"núcleo" necesita un nombre distinto al del canal de captación original,
ese rename se hace una vez, cuando el resto de las piezas ya estén
definidas — no dos veces.

## Próximo paso natural (no autorizado todavía)

Cuando el negocio defina requisitos concretos para Campañas/Embudos/
Automatizaciones como entidades administrables (no solo lógica de código),
esta misma auditoría se repite para esas piezas: modelo Prisma, migración
aditiva, servicios, y actualización de este documento — mismo patrón ya
probado en ATLAS 0.1/0.1.1/0.2.
