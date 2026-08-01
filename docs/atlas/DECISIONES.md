# DECISIONES — ATLAS

Registro de decisiones de arquitectura, en el momento en que se tomaron.
Formato: decisión → por qué → alternativa descartada.

## Sprint 0.1.1 — Corrección arquitectónica preventiva (2026-07-31)

Tras revisar el Sprint 0.1, el negocio pidió corregir el modelo ANTES de
aplicar la migración (que nunca llegó a ejecutarse — cero riesgo de
migrar datos). Las decisiones 1–8 de esta sección son esa corrección.

### 1. Persona (`AtlasContacto`) separada de identidad por canal (`AtlasIdentidadCanal`)

**Decisión:** `AtlasContacto` ya no tiene `canalOrigen`/`identificadorCanal`
propios — esos campos se movieron a un modelo nuevo, `AtlasIdentidadCanal`,
con relación muchos-a-uno hacia `AtlasContacto`.

**Por qué:** el diseño original (Sprint 0.1) haría que la misma persona
escribiendo por Instagram, después por WhatsApp y después comprando en el
catálogo generara **tres `AtlasContacto` distintos** — exactamente el
problema que se pidió prevenir. Ahora es un `AtlasContacto` con tres
`AtlasIdentidadCanal`.

**Cómo una persona puede tener varias identidades:** cada vez que llega una
interacción nueva, `resolverOCrearContacto()` (en `contactos.service.js`)
busca primero si esa identidad EXACTA (empresa + canal + identificador
externo) ya existe — si sí, usa el contacto dueño. Si no, y solo si el
teléfono/email que llega coincide con el `telefonoPrincipal`/`emailPrincipal`
YA VALIDADO de un contacto existente, la nueva identidad se cuelga de ESE
contacto en vez de crear uno nuevo. Nunca se compara por nombre o
`nombreUsuario` parecido.

**Estrategia de fusión y separación:** la fusión automática por coincidencia
fuerte (arriba) es la única automática que existe, y solo une una identidad
NUEVA a un contacto EXISTENTE — nunca fusiona dos contactos que ya existían
por separado con su propio historial. Para ese caso (ej. alguien descubre
después que "Juan Pérez" de Instagram y "+58412..." de WhatsApp eran la
misma persona) existe `fusionarContactos()`: mueve todas las
`AtlasIdentidadCanal` del contacto de origen al de destino, marca el origen
con `fusionadoEnId` (nunca se borra — conserva historial completo) y
escribe una entrada en `auditoria_sistema` con el motivo. Es 100% manual,
requiere `usuarioId` y `motivo` obligatorios — nunca corre sola.

**Alternativa descartada:** fusión automática por similitud de nombre
(fuzzy matching). Se descartó explícitamente por instrucción del negocio:
"no fusiones automáticamente dos contactos solo porque tengan nombres
parecidos" — el costo de una fusión incorrecta (mezclar el historial de
dos personas reales) es mayor que el beneficio de menos duplicados.

**Refinamiento (auditoría Subfase 0.2):** se encontró que `fusionarContactos()`
solo rechazaba re-fusionar un `origen` ya fusionado, pero no verificaba si
el `destino` ya estaba (transitivamente) fusionado hacia ese mismo
`origen` — lo que permitiría crear un ciclo de dos nodos (A→B→A). Se
agregó `creariaCiclo()`, que camina la cadena de fusiones del destino
antes de fusionar y rechaza con `ValidacionError` si encuentra al origen
en esa cadena. Además, se agregaron políticas de borrado explícitas
(`onDelete: Restrict` en toda la cadena identidad→conversación→mensaje y
en el token de atribución; `onDelete: SetNull` en los vínculos opcionales
`pedidoId`/`responsableUsuarioId`) — ninguna estaba declarada
explícitamente en la versión original, dependían del default de
Prisma/Postgres.

### 2. Token público opaco de atribución (`AtlasAtribucionToken`)

**Decisión:** los enlaces al catálogo usan `?ref=<token>`, un valor
aleatorio de 32 bytes (`crypto.randomBytes(32).toString("base64url")`,
~43 caracteres) generado y almacenado en `AtlasAtribucionToken.token` —
**nunca** el `id` interno de `AtlasContacto`.

**Por qué:** un UUID de `AtlasContacto` expuesto en una URL pública queda en
logs de servidor, en el header `Referer` de terceros, en capturas de
pantalla compartidas — cualquiera que lo vea podría, en teoría, intentar
usarlo para correlacionar u orquestar peticiones contra ese ID. Un token
separado, sin relación matemática con el ID, no permite deducir ni
enumerar contactos aunque se filtre.

**Estado de esta corrección:** el modelo, `crearTokenAtribucion()` y
`consumirToken()` están implementados y probados (generación de tokens
únicos, opacos, sin colisión). El CONSUMO real desde `catalogo/` (leer
`?ref=` y llamar a un endpoint público que invoque `consumirToken`) **no
está conectado todavía** — es la Subfase 0.8 del ROADMAP, la única que
toca `catalogo/`.

### 3. Idempotencia de webhooks (`AtlasWebhookEvento`)

**Decisión:** antes de procesar cualquier webhook real, se llama a
`registrarEventoWebhook()`, que deduplica por `(proveedor, eventIdExterno)`
cuando el proveedor manda un ID de evento estable, y por `payloadHash`
(sha256 del cuerpo crudo) como respaldo cuando no lo manda.

**Por qué:** Meta y ManyChat reintentan webhooks si no reciben una
respuesta 200 a tiempo — sin una tabla de idempotencia, un reintento
generaría un `AtlasMensaje` duplicado, o peor, un `AtlasContacto` duplicado
si el reintento llega antes de que la primera ejecución termine de
resolver la identidad.

**Por qué la tabla no tiene `empresaId`:** en el momento en que llega el
webhook crudo, todavía no sabemos a qué contacto (y por lo tanto a qué
empresa) pertenece — eso se resuelve recién al parsear el payload con el
adaptador del proveedor. Es una tabla técnica de deduplicación, no una
entidad de negocio.

### 4. Checklist de seguridad OBLIGATORIO antes de montar `atlasWebhooks.routes.js`

**Decisión:** el archivo existe pero permanece **sin importar en `app.js`**
hasta que TODO lo siguiente esté implementado:

- [ ] Verificar firma del proveedor (`X-Hub-Signature-256` de Meta, o el
      mecanismo equivalente de ManyChat) — rechazar con 401 si no coincide.
- [ ] Validar timestamp del evento cuando el proveedor lo incluya (rechazar
      eventos con más de N minutos de antigüedad — mitiga replay).
- [ ] Limitar tamaño del payload (Express `express.json({ limit: ... })`
      específico para esta ruta, no el global).
- [ ] Registrar auditoría de cada webhook recibido (`registrarAuditoria`,
      igual patrón que el resto del sistema).
- [ ] Rate limiting por IP/proveedor.
- [ ] Uso de `idempotencia.service.js` en CADA webhook, sin excepción,
      antes de tocar cualquier otro dato.
- [ ] Responder 200 rápido al proveedor (Meta espera respuesta en
      segundos) — si el procesamiento real es pesado, encolarlo aparte
      (mecanismo concreto a definir en la Subfase 0.5, hoy no existe cola
      en este proyecto).

**Por qué:** un webhook público sin estas protecciones es una superficie de
ataque real — cualquiera que descubra la URL podría inyectar "mensajes"
falsos, saturar el endpoint, o repetir un evento válido capturado
(replay). Ninguna automatización de negocio (Parte 5 del Sprint 0.1)
importa si la puerta de entrada no es segura.

### 5. Permisos propios de ATLAS — requisito bloqueante antes de producción

**Decisión:** durante esta fundación, `atlas.routes.js` y la entrada de
navegación siguen gateadas por `ver_dashboard_ejecutivo` (el mismo
temporal que ya usan CRM/Inventario/Financiero — no se inventó un sistema
paralelo). **Antes de conectar cualquier canal real (Subfase 0.4 en
adelante)** es un requisito bloqueante crear y asignar:

- `ver_atlas` — ver el Inbox/dashboard.
- `gestionar_atlas` — cambiar estado comercial, fusionar contactos,
  configurar automatizaciones.
- `responder_atlas` — enviar respuestas manuales desde el Inbox.
- `configurar_atlas` — credenciales, adaptadores, activar/desactivar
  canales.

**Por qué no se hace ahora:** cambiar permisos/roles reales sin presentar
antes un plan aditivo específico fue una instrucción explícita — esto
queda documentado como deuda reconocida, igual que ya lo está la de
CRM/Inventario/Financiero, no como algo resuelto.

### 6. UTM: dos fotografías (first-touch / last-touch), nunca una sola

**Decisión:** `AtlasContacto` guarda `atribucionPrimerToque` (JSON, se
escribe UNA vez al crear el contacto y nunca se toca de nuevo) y
`atribucionUltimoToque` (JSON, se reemplaza en cada interacción nueva con
UTM/fbclid presentes). Forma de cada snapshot (extendida en Subfase 0.2,
ver `CAMPOS_ATRIBUCION` en `config.js`): `{ utmSource, utmMedium,
utmCampaign, utmContent, utmTerm, campaignId, adsetId, adId, placement,
device, fbclid, gclid, ttclid, landingUrl, referer, fechaAtribucion,
urlEntrada, canal }`.

**Por qué JSON y no 22 columnas planas:** son fotografías, no datos que se
consultan por campo individual con frecuencia — un objeto congelado en el
tiempo se modela mejor como un solo valor que como 11 columnas × 2. Si en
el futuro hace falta filtrar/reportar por `utm_campaign` de primer touch a
gran escala, se puede promover a columna con una migración aditiva sin
romper nada (`ALTER TABLE ... ADD COLUMN`), no antes.

**Por qué nunca se sobreescribe el primer touque:** es la pregunta de
negocio real ("¿qué campaña originó a este cliente?") — si se
sobreescribiera con cada visita, se perdería para siempre la respuesta a
esa pregunta.

### 7. Consentimiento y salida — a nivel de identidad de canal, no de contacto

**Decisión:** `consentimientoCanal`, `consentimientoFecha`,
`consentimientoFuente`, `estadoSuscripcion`, `fechaBaja` y
`motivoBloqueo` viven en `AtlasIdentidadCanal`, no en `AtlasContacto`. Se
agregó además `AtlasContacto.consentimiento` (booleano general, "¿puedo
contactar a esta persona en general?") como resumen de alto nivel — pero
el detalle real y accionable es por canal.

**Por qué (decisión propia, marcada explícitamente):** el pedido original
listaba estos campos sin especificar en qué tabla — se decidió ponerlos en
`AtlasIdentidadCanal` porque alguien puede aceptar mensajes de WhatsApp y
estar bloqueado en Instagram al mismo tiempo; un solo campo a nivel de
persona no podría representar eso.

**Palabras de salida:** `config.js` define `PALABRAS_SALIDA` (regex: stop,
baja, cancelar, "no me escriban", unsubscribe, etc.) y
`intents.service.js#detectarPalabraSalida()` se evalúa **antes** que
cualquier clasificación de intención — es un corte duro, no una intención
más de la lista. Si detecta una, quien orqueste el mensaje debe llamar
`identidades.service.js#registrarBajaCanal()` y `puedeAutomatizarse()`
pasa a devolver `false` para esa identidad puntual — probado con 6/6 casos
reales.

### 8. Documentación actualizada

README.md, ROADMAP.md (este archivo) y CHANGELOG.md se actualizaron el
mismo día para reflejar el modelo corregido — ver CHANGELOG.md para el
diff resumido de archivos.

---

## Subfase 0.2 — correcciones antes de aplicar la migración (2026-07-31)

Tras la auditoría de migraciones (Punto 1-6 de la Subfase 0.2, entregada en
chat ese mismo día), el negocio aprobó la estrategia general y pidió 4
mejoras de arquitectura antes de aplicar nada contra la base real.

### 9. Resolución definitiva de las colisiones de numeración

**Decisión:** se detectaron TRES pares de archivos con el mismo número
(0002, 0004 y — descubierto en esta misma auditoría — 0007, donde
`0007_atlas_fundacion.sql` chocaba con `0007_idempotencia_pedidos.sql`, una
migración ajena a ATLAS ya aplicada). Se resolvió **solo renombrando
archivos, sin tocar SQL ni re-ejecutar nada ya aplicado**: `0002a`/`0002b`,
`0004a`/`0004b`, y `0008_atlas_fundacion.sql` (no `0007b`, porque el número
entero libre siguiente era más simple que introducir un sufijo sobre una
migración ya aplicada).

**Por qué:** ninguna de las tres colisiones fue nunca un conflicto real de
datos — cada par toca tablas disjuntas. El riesgo real no era de SQL, era
de que dos sesiones futuras volvieran a elegir el mismo número sin
coordinarse.

**Registro central creado:** `server/prisma/migrations_manual/MIGRATIONS_INDEX.md`
— tabla de estado real (archivo, aplicada o no, dependencias) + la regla
"consultar este archivo antes de asignar el próximo número". Próximo
número libre documentado ahí: 0009.

### 10. Extensión del modelo de atribución más allá de Meta/UTM

**Decisión:** `AtlasAtribucionToken` (y el snapshot JSON de
`AtlasContacto`) se extienden con `placement`, `device`, `gclid` (Google),
`ttclid` (TikTok), `landingUrl` y `referer` — además de los campos UTM/Meta
ya existentes (`campaignId`/`adsetId`/`adId`/`fbclid`).

**Por qué ahora, aunque casi todos lleguen vacíos:** agregar estas columnas
después de tener contactos/tokens reales requeriría una migración sin
backfill posible — el dato del touch original ya se habría perdido para
siempre en el momento de la interacción. Es más barato nacer con la
columna vacía que no poder recuperarla después.

**Dónde queda documentada la forma esperada:** `CAMPOS_ATRIBUCION` en
`config.js` (lista, no un tipo enforced — sigue siendo JSON/columnas
nullable, mismo criterio que el resto de ATLAS).

### 11. ATLAS deja de ser un módulo independiente — pasa a ser el núcleo de Comercial

**Decisión:** ATLAS se reclasifica como el motor técnico de un futuro
módulo **Comercial**, que integrará Inbox, Leads, Contactos, Clientes,
Campañas, Automatizaciones, Seguimientos, Embudos y Reportes — absorbiendo
al CRM actual sin duplicar funcionalidad. Ver
[ARQUITECTURA_COMERCIAL.md](./ARQUITECTURA_COMERCIAL.md) para el mapeo
completo pilar-por-pilar y qué falta para cada uno.

**Qué NO cambia en esta corrección:** los nombres `Atlas*`/`atlas_*` de
modelos y tablas se mantienen — renombrarlos ahora, antes de que
Campañas/Embudos/Automatizaciones tengan diseño propio, sería un costo
real por un beneficio cosmético. Tampoco se toca `Cliente` ni
`crm.service.js`, ni se reorganiza la navegación del ERP — son decisiones
de una subfase de UI futura, no de esta fundación de datos.

**Por qué se documenta como decisión propia y no como "ya resuelto":** el
puente real entre `AtlasContacto` (lead) y `Cliente` (cliente facturado)
más allá del `pedidoId` opcional que ya existe, y el diseño de Campañas/
Embudos/Automatizaciones como entidades administrables, quedan como
trabajo futuro explícito — no se inventa un diseño para ellos sin
requisitos de negocio.

### 12. Documento de visión no técnico + dos principios permanentes del proyecto

**Decisión:** se creó [VISION.md](./VISION.md) — sin código, sin nombres de
modelo — para que el propósito de Comercial/ATLAS, sus límites y su
relación con Marketing/Clientes/Producción/Inventario/Finanzas quede
legible para alguien que no lee `schema.prisma`. Ahí también quedaron
formalizados dos principios permanentes:

1. **Arquitectura aprobada antes de implementar** — aplica a *todo* el
   proyecto, no solo a ATLAS/Comercial. Referenciado también en
   `CLAUDE.md` por ser una regla de proceso general.
2. **ATLAS nunca toma decisiones operativas ni financieras** — solo
   captar/clasificar/responder/automatizar/registrar/emitir eventos.
   Aprobar pedidos, aprobar pagos, reservar inventario, iniciar producción
   y emitir documentos siguen siendo, para siempre, exclusivos de los
   módulos propietarios (Pedidos, Producción, Inventario, Finanzas).

**Por qué como principio permanente y no como nota de este sprint:** el
negocio pidió explícitamente que quedara registrado como una regla que no
caduca con esta subfase — un límite de diseño, no una preferencia
puntual.

## Subfase 0.3 — auditoría final antes de ejecutar SQL (2026-07-31)

Antes de autorizar la ejecución de `0008_atlas_fundacion.sql`, el negocio
pidió una revisión estructural más profunda del SQL en sí (no solo del
proceso de migración). Se encontraron y corrigieron 4 gaps reales.

### 13. Idempotencia real: índices únicos parciales, no un UNIQUE simple

**Problema encontrado:** `UNIQUE (proveedor, event_id_externo)` no evita
duplicados cuando `event_id_externo` es `NULL` — Postgres permite múltiples
valores `NULL` dentro de una restricción única estándar. El índice de
`payload_hash` tampoco era único, así que el fallback de deduplicación no
estaba realmente garantizado a nivel de base.

**Decisión:** dos índices únicos **parciales**, mutuamente excluyentes:
`uq_atlas_webhook_evento_id_externo ON (proveedor, event_id_externo) WHERE
event_id_externo IS NOT NULL` y `uq_atlas_webhook_evento_hash ON
(proveedor, payload_hash) WHERE event_id_externo IS NULL`.

**Por qué parciales y no un UNIQUE compuesto con COALESCE u otro truco:**
un índice parcial expresa directamente la regla real ("estos dos casos son
mutuamente excluyentes, cada uno con su propia clave de unicidad") sin
inventar un valor sentinela para el `NULL`. Mismo patrón ya usado en este
proyecto para `OrdenProduccion` (soft-delete) — Prisma no soporta índices
parciales en su DSL, así que `schema.prisma` queda con una aproximación
(`@@index` sin el `WHERE`) y un comentario explícito de la limitación.

**Idempotencia bajo concurrencia real:** `registrarEventoWebhook()` ahora
atrapa la violación de unicidad (`P2002`) que Postgres lanza si dos
webhooks duplicados llegan casi al mismo tiempo y ambos pasan el
`findFirst` antes de que el primero termine de insertar — sin esto, el
`findFirst` solo hubiera alcanzado en el caso sin concurrencia real.

### 14. Aislamiento multiempresa: FK compuestas, y por qué NO en todos los casos

**Problema encontrado:** `atlas_identidades_canal` y
`atlas_atribucion_tokens` validaban `empresa_id` y `atlas_contacto_id` por
separado — nada impedía, ni siquiera con SQL directo, que una identidad o
un token declararan una empresa distinta a la de su propio contacto.

**Decisión:** se agrega `UNIQUE (id, empresa_id)` en `atlas_contactos`
(existe solo para poder ser el destino de una FK compuesta) y se
reemplazan las FK simples hacia `atlas_contactos` por FK **compuestas**
`(atlas_contacto_id, empresa_id) → atlas_contactos (id, empresa_id)` en
ambas tablas. Ahora es imposible, a nivel de motor, mezclar contacto e
identidad/token de empresas distintas.

**Por qué NO se hizo lo mismo para `pedido_id` y `responsable_usuario_id`:**
requeriría un `ALTER TABLE` sobre `pedidos` y `usuarios` para agregarles su
propio `UNIQUE(id, empresa_id)` — confirmado por introspección directa que
ninguna de las dos lo tiene hoy. Ambas son tablas **previas a ATLAS** y
tocarlas contradice el límite acordado ("solo la fundación no desplegada
de ATLAS") y la garantía que este mismo archivo de migración hace en su
propia cabecera ("no modifica ninguna tabla existente"). Se optó por
validar esa consistencia en la frontera de la aplicación
(`contactos.service.js`: `vincularContactoAPedido()` y
`actualizarEstadoContacto()` ahora verifican explícitamente que
`pedido.empresaId`/`usuario.empresaId` coincidan con la empresa del
contacto, y rechazan con `ValidacionError` si no). Es una garantía más
débil que una FK (un `UPDATE` directo a la base podría saltarla), pero es
la que no exige tocar tablas ajenas a ATLAS — el mismo criterio ya usado en
este proyecto para reglas de negocio que viven en código, no en la base
(ver `config.js`).

### 15. AtlasAtribucionToken: también cubre tráfico anónimo — el caso de uso más valioso

**Pregunta del negocio:** ¿el token es solo para enlaces a contactos ya
identificados, o también captura clics anónimos de anuncios/catálogo?

**Respuesta:** también cubre tráfico anónimo — es, de hecho, el caso de
uso más importante. El objetivo declarado en
[VISION.md](./VISION.md) ("medir qué campañas realmente generan clientes,
no solo clics") solo es posible si se puede capturar la atribución **en el
momento del clic**, que por definición ocurre ANTES de que exista un
`AtlasContacto` — nadie se identifica en el mismo instante en que hace
clic en un anuncio.

**Flujo completo** (documentado también en la cabecera de
`atribucion.service.js`):

```
Anuncio → clic anónimo → token (sin contacto) → identificación
   → contacto (AtlasContacto real) → atribución (reclamo del token)
```

1. **Anuncio:** Marketing pone `?utm_source=...&fbclid=...` en el destino.
2. **Clic anónimo:** alguien sin `AtlasContacto` todavía llega al catálogo
   (esto NO se conecta en esta subfase — sigue siendo Subfase 0.8, la
   única que toca `catalogo/`).
3. **Token:** cuando se conecte, ese momento llama a
   `crearTokenAtribucion()` **sin** `atlasContactoId` — el token nace
   huérfano, con los datos de campaña del clic.
4. **Identificación:** la misma persona después escribe por WhatsApp/
   Instagram o completa el checkout — ahí existe (o se crea) un
   `AtlasContacto` real.
5. **Contacto → atribución:** se llama a la nueva `vincularTokenAContacto()`
   para reclamar el token huérfano hacia ese contacto — asignación de una
   sola vez, nunca se puede robar un token ya reclamado por otro. Los
   datos de campaña del token reclamado alimentan
   `atribucionPrimerToque`/`atribucionUltimoToque` (Decisión 6).

**Cambio de schema:** `atlasContactoId` pasa de `NOT NULL` a **nullable**
en `AtlasAtribucionToken` — antes era incompatible con este flujo. La FK
compuesta hacia `atlas_contactos` (Decisión 14) solo se activa cuando el
token ya fue reclamado (Postgres MATCH SIMPLE no evalúa una FK compuesta
con una columna `NULL`); mientras es anónimo, la FK directa hacia
`empresas` sigue validando `empresa_id` igual.

**El otro caso de uso (enlace para un contacto YA conocido) sigue
funcionando igual:** se llama a `crearTokenAtribucion()` con
`atlasContactoId` desde el principio, y el token nace ya reclamado.

### 16. Invariantes adicionales resueltos en esta auditoría

- **Autofusión (`fusionado_en_id = id`):** ya se prevenía en
  `fusionarContactos()` (rechaza `contactoOrigenId === contactoDestinoId`)
  y en `creariaCiclo()` (ciclos de cualquier tamaño) — se agrega además un
  `CHECK ck_atlas_contactos_no_autofusion` a nivel de columna, como defensa
  adicional independiente del código de aplicación.
- **`canal` duplicado en `AtlasConversacion`:** se buscó una razón real
  (¿podría ser un snapshot válido si el canal de la identidad cambiara?) y
  no se encontró ninguna — el canal de una `AtlasIdentidadCanal` es fijo
  desde su creación. Se eliminó la columna; `obtenerOCrearConversacion()`
  ya no recibe `canal` como parámetro (lo toma de la identidad), lo que de
  paso elimina la posibilidad de pasar un canal que no coincida con la
  identidad real.
- **Disponibilidad de `gen_random_uuid()`:** confirmada por introspección
  directa contra la base real (Postgres 17.6): existe en `pg_catalog`
  (núcleo desde PG13) y también vía la extensión `pgcrypto`, ya instalada.
  Las migraciones 0001–0007 ya la usan con éxito contra esta misma base —
  no era una suposición, es un hecho verificado dos veces.

### 17. Dirección futura: separar "token de atribución" de "sesión de navegación" (NO implementado ahora)

**Nota de arquitectura, registrada antes de aplicar la migración:** hoy
`AtlasAtribucionToken` cumple dos roles a la vez porque `catalogo/`
todavía no está conectado (Subfase 0.8): (1) el dato de **atribución** en
sí — de qué campaña/anuncio/UTM vino un toque — y (2) un mecanismo técnico
de **correlación de sesión** — "estas várias interacciones anónimas son la
misma visita/persona todavía no identificada", incluso cuando no hay
ningún dato de campaña real detrás (tráfico orgánico, o alguien que
simplemente volvió a entrar al catálogo).

**Por qué probablemente se van a separar más adelante:** una "sesión de
navegación" es un concepto más amplio y más frecuente que un "toque de
atribución" — puede existir sin ningún `utm_*`/`fbclid` (visita directa,
orgánica), puede tener muchas páginas vistas sin que cambie la atribución,
y su ciclo de vida técnico (expiración, renovación) no tiene por qué
coincidir con el de un token de campaña. Forzar ambos conceptos en una
sola tabla para siempre terminaría mezclando una responsabilidad de
"tracking técnico de visitas" con una de "medición de marketing".

**Por qué NO se separa ahora:** todavía no existe ningún tráfico real de
`catalogo/` llegando a ATLAS (Subfase 0.8 sigue sin conectar) — diseñar
"Sesión" como entidad propia sin un solo caso de uso real todavía sería
exactamente el tipo de abstracción prematura que este proyecto evita (ver
Principio 1 en [VISION.md](./VISION.md)). Se deja registrada la dirección
para que, cuando llegue esa subfase, no se intente forzar la separación
retroactivamente sobre datos reales ya guardados.

### 18. `atlas_webhook_eventos` es una cola técnica, no el historial comercial permanente

**Nota de arquitectura, registrada antes de aplicar la migración:**
`atlas_webhook_eventos` existe únicamente para idempotencia y
reprocesamiento de entregas crudas de webhooks (dedup por
proveedor+eventId o por proveedor+payloadHash, reintentos con
`cantidadIntentos`/`ultimoError`) — **no** es, ni debe tratarse nunca como,
el historial funcional de la relación con un cliente.

**Dónde vive de verdad el historial funcional:** hoy, en las propias
entidades de ATLAS (`AtlasContacto`, `AtlasIdentidadCanal`,
`AtlasConversacion`, `AtlasMensaje` — todas con `onDelete: Restrict` en su
cadena, precisamente porque SÍ son historial permanente). A futuro, en las
entidades del ecosistema Comercial (ver
[ARQUITECTURA_COMERCIAL.md](./ARQUITECTURA_COMERCIAL.md)). Por eso
`atlas_webhook_eventos` es la única tabla de esta fundación sin FK hacia
`empresas`/`atlas_contactos` (ver nota ya existente en el propio SQL): es
un registro técnico de "esto ya se procesó", no un registro de negocio.

**Implicación para más adelante (no decidida todavía):** al ser una cola
técnica y no historial de negocio, en el futuro podría tener una política
de retención/archivado propia (purgar eventos viejos ya procesados, por
ejemplo) sin que eso afecte al historial comercial real — algo que jamás
se haría sobre `AtlasConversacion`/`AtlasMensaje`. No se implementa ahora,
solo se deja registrada la distinción para que nadie asuma en el futuro
que esta tabla es "la fuente de verdad" de qué le pasó a un cliente.

---

## Decisiones del Sprint 0.1 original (siguen vigentes)

### Estructura de archivos plana, no el árbol `atlas/inbox/contactos/...`

**Decisión:** el código vive distribuido en `services/atlas/`,
`routes/atlas*.routes.js`, `pages/atlas/` — no en una carpeta `atlas/` con
subcarpetas por concepto.

**Por qué:** ningún módulo existente de Grupo Blanco OS usa una estructura
anidada por concepto — todos son archivos planos con nombre descriptivo.

### ManyChat primero, pero como capa delgada — nunca dueño de la lógica

**Decisión:** el primer canal (Instagram) se conecta vía ManyChat, pero
sus flujos solo detectan "llegó un mensaje" y llaman a un webhook de
Grupo Blanco OS. Toda la clasificación de intención, elección de
respuesta y registro del lead vive en Grupo Blanco OS.

**Alternativa descartada:** ir directo a la API oficial de Meta desde el
día uno — se descartó para el primer canal por el tiempo de App Review.

### Clasificación de intención por reglas, no por IA generativa

**Decisión:** determinista, auditable. Sin confianza suficiente →
`no_comprendida` → revisión humana. Nunca se inventa una respuesta.

### TikTok: Pixel/Ads sí, automatización de mensajes directos no (todavía)

**Decisión:** no se construye ningún adaptador de mensajería para TikTok.
Su API de negocio está enfocada en anuncios/reporting, no mensajería.

### Webhooks públicos: archivo creado, sin montar

Ver Decisión 4 de la corrección 0.1.1 arriba — ahora con checklist
explícito de qué falta antes de montar.
