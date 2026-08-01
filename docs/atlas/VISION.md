# VISIÓN — Comercial y ATLAS

Este documento no es técnico. Está escrito para responder una pregunta de
negocio: *¿para qué existe esto, y qué no va a hacer nunca?* Para el
detalle de implementación, ver [README.md](./README.md),
[DECISIONES.md](./DECISIONES.md) y
[ARQUITECTURA_COMERCIAL.md](./ARQUITECTURA_COMERCIAL.md).

## Propósito de Comercial

Comercial es el futuro sistema nervioso comercial de Grupo Blanco OS: el
lugar único donde vive todo lo relacionado con atraer, entender, atender y
dar seguimiento a las personas interesadas en comprar — desde el primer
mensaje hasta que se convierten en clientes recurrentes. Hoy esas piezas
están dispersas (un CRM básico que solo ve a quien ya compró, un catálogo
público, mensajes que se atienden a mano por WhatsApp/Instagram).
Comercial es la decisión de unificarlas en un solo ecosistema, para que
nunca existan dos versiones distintas de "quién es este cliente" según
qué pantalla se mire.

## Propósito de ATLAS

ATLAS es el motor que hace que Comercial funcione en la práctica: escucha
lo que llega por Instagram, WhatsApp, Facebook, TikTok y el catálogo,
entiende qué está buscando la persona, responde lo que un flujo ya
aprobado le permite responder, y deja todo registrado y ordenado para que
un humano tome las decisiones que de verdad importan. Su razón de ser es
simple: que ningún cliente potencial se quede sin respuesta por falta de
manos disponibles — sin que eso signifique automatizar decisiones que
deben seguir siendo humanas.

## Límites del módulo

ATLAS no vende, no factura, no fabrica, no fija precios especiales y no
aprueba nada. Es la puerta de entrada y el expediente ordenado de cada
lead. El trabajo real de vender, producir y cobrar sigue siendo, siempre,
de las personas y de los módulos que ya existen para eso.

## Relación con Marketing

Marketing (campañas pagadas, redes sociales, contenido) es quien trae a la
gente. ATLAS es quien la recibe y la atiende una vez que ya llegó.
Marketing decide **qué** campaña correr y **a quién** mostrarla; ATLAS
registra **de dónde** vino cada persona (qué anuncio, qué campaña, qué
enlace) para que, con el tiempo, se pueda medir qué campañas realmente
generan clientes — no solo clics.

## Relación con Clientes

"Clientes" (el CRM que ya existe hoy) es la ficha de alguien que **ya
compró**. ATLAS cubre la etapa **anterior**: alguien que preguntó, mostró
interés, y todavía puede no comprar nunca. Con el tiempo, ambos mundos se
van a unir bajo Comercial, para que exista una sola historia continua de
cada persona —desde el primer mensaje hasta la décima compra— en vez de
dos sistemas separados que no se hablan entre sí.

## Integración con Producción, Inventario y Finanzas

ATLAS nunca le va a indicar a Producción qué fabricar, a Inventario qué
reservar, ni a Finanzas qué cobrar. Cuando algo relevante ocurre —por
ejemplo, un lead se convierte en un pedido real— ATLAS simplemente
**avisa** que pasó. Ese aviso lo pueden escuchar los módulos
correspondientes y usarlo si quieren, sin que ATLAS necesite saber qué
hicieron con esa información después. Es como un mensajero: entrega la
noticia, nunca decide qué hacer con ella. Esto protege a
Producción/Inventario/Finanzas de cualquier error o cambio futuro dentro
de ATLAS — esos módulos nunca dependen de él para poder funcionar.

## Visión de evolución a largo plazo

A futuro, Comercial va a crecer para incluir Campañas (administrar y medir
inversión publicitaria), Automatizaciones (respuestas y flujos más
sofisticados), Embudos (ver visualmente en qué etapa está cada lead) y
Reportes (qué tan bien está funcionando todo el proceso comercial, de
punta a punta). ATLAS es el cimiento sobre el que se construye todo eso —
no un experimento aislado que se descarta más adelante.

Dos direcciones ya identificadas para esa evolución, registradas ahora
para no perderlas de vista (detalle técnico completo en Decisiones 17 y 18
de [DECISIONES.md](./DECISIONES.md)):

- **"Token de atribución" y "sesión de navegación" probablemente se
  separen** en algún momento — hoy son la misma tabla porque todavía no
  hay tráfico real del catálogo llegando a ATLAS; forzar esa separación
  antes de tener un caso de uso real sería adelantarse sin necesidad.
- **La cola técnica de webhooks nunca será el historial comercial** —
  sirve para no procesar dos veces el mismo mensaje entrante, no para
  guardar la relación con un cliente. Ese historial vive, y seguirá
  viviendo, en las entidades pensadas para eso (Contactos, Inbox, y lo que
  venga con Comercial).

---

## Principios permanentes del proyecto

### Principio 1 — Toda funcionalidad nueva comienza con arquitectura aprobada

Antes de escribir código para una funcionalidad nueva, primero se
presenta y se aprueba **cómo** va a estar construida: qué información
guarda, qué límites tiene, cómo se conecta con lo que ya existe. Esto
aplica a **todo el proyecto**, no solo a ATLAS/Comercial.

**Por qué:** corregir un diseño en un documento cuesta minutos; corregirlo
después de que ya hay datos reales guardados cuesta mucho más — y en
algunos casos ya no se puede corregir del todo sin perder información.

### Principio 2 — ATLAS nunca toma decisiones operativas ni financieras

ATLAS **solo** puede:

- captar contactos;
- clasificar su intención;
- responder, dentro de lo que un flujo aprobado le permite responder;
- automatizar tareas repetitivas;
- registrar lo que pasa;
- emitir eventos (avisar que algo pasó).

ATLAS **nunca** podrá:

- aprobar pedidos;
- aprobar pagos;
- reservar inventario;
- iniciar producción;
- emitir documentos (facturas, comprobantes, etc.).

Esas cinco decisiones siguen siendo, para siempre, responsabilidad
exclusiva de los módulos propietarios que ya existen para eso —
Pedidos, Producción, Inventario, Finanzas. ATLAS puede sugerir y agilizar
el trabajo alrededor de esas decisiones; nunca puede tomarlas por ellos.
