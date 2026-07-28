# Catálogo público PanaPrice

App pública sin autenticación (carrito + pedido por WhatsApp). Pensada para
`catalogo.panaprice.com`, comparte backend/DB con el ERP (`../server`,
`../client`) pero se despliega por separado.

## Correr en local

```bash
npm install
npm run dev   # http://localhost:5173 (o el siguiente puerto libre)
```

## Variables de entorno (`.env`, ver `.env.example`)

| Variable | Uso |
|---|---|
| `VITE_DATA_SOURCE` | `local` (usa `src/data/productos.js`, sin backend) o `api` (pide a `VITE_API_URL/publico/productos`, con fallback automático a local si falla). |
| `VITE_API_URL` | Base de la API del ERP. Solo importa si `VITE_DATA_SOURCE=api`, o para el intento best-effort de registrar la solicitud en el ERP al enviar un pedido. |
| `VITE_WHATSAPP_NUMERO` | Número de WhatsApp Business de PanaPrice, **solo dígitos con código de país** (ej. `584121234567`, sin `+` ni espacios). **Obligatorio** para que el botón de enviar pedido funcione. |

## Cómo agregar / editar productos (modo local, sin tocar Supabase)

Editar `src/data/productos.js` — un array plano, 4 datos por producto, nada de código:

```js
{ codigo: "PAN-007", nombre: "Pañoleta Flores", precio: 9.5, imagen: "pan-007.jpg" }
```

- `precio`: número sin símbolo (ej. `8.5`).
- `imagen`: nombre EXACTO del archivo dentro de `catalogo/public/productos/`, o `null` si todavía no hay foto (se ve un recuadro vacío, nunca un ícono roto).

Para agregar un diseño: copiar un bloque, pegarlo antes del `];` y completar los 4 datos. Para sacar uno: borrar su bloque. Guardar, `git add`/`commit`, y volver a desplegar (`vercel --prod` desde esta carpeta). **El enlace público no cambia** — cada redeploy actualiza el mismo dominio.

## Cómo agregar / cambiar imágenes

Carpeta exacta: **`catalogo/public/productos/`**. El nombre del archivo tiene que ser idéntico al que pusiste en el campo `imagen` de ese producto en `productos.js` (mayúsculas/minúsculas incluidas). Si usás `.png` en vez de `.jpg`, el nombre en `imagen` tiene que terminar en `.png` también.

## Logo de marca

Poner el archivo del logo en **`catalogo/public/logo-panaprice.png`** — aparece solo en el encabezado, sin tocar código. Mientras no exista ese archivo, se muestra un wordmark de texto ("PANAPRICE — CUSTOM —") como respaldo automático.

## Desplegar (Vercel, sin repositorio Git remoto)

Desde esta carpeta (`catalogo/`):

```bash
npx vercel login        # una sola vez, abre el navegador/email para autenticar
npx vercel --prod        # sube esta carpeta y publica; en el primer run pregunta
                          # nombre de proyecto y confirma "Settings correctos" (sí)
```

Después de crear el proyecto una vez, agregar las variables de entorno
(en el dashboard de Vercel → el proyecto → Settings → Environment Variables,
o por CLI):

```bash
npx vercel env add VITE_WHATSAPP_NUMERO production
npx vercel env add VITE_DATA_SOURCE production   # valor: local
npx vercel --prod   # redeploy para que tome las variables nuevas
```

Para conectar `catalogo.panaprice.com`: dashboard del proyecto → Settings →
Domains → agregar el dominio y seguir las instrucciones de DNS (registro
CNAME) que da Vercel.

## Checklist de publicación y prueba desde el celular

1. `npx vercel login` → `npx vercel --prod` (desde esta carpeta).
2. En el dashboard de Vercel del proyecto: Settings → Environment Variables →
   agregar `VITE_WHATSAPP_NUMERO=584220180173` y `VITE_DATA_SOURCE=local` →
   `npx vercel --prod` de nuevo para que tomen efecto.
3. Abrir el link público en el celular (no en la compu).
4. Agregar 1 diseño al carrito, cambiar la cantidad, tocar "Enviar pedido por WhatsApp".
5. Confirmar que WhatsApp abre con el número correcto y el mensaje trae
   cliente, teléfono, ubicación, código, nombre, cantidad, precio y total.
6. Confirmar que se ve bien sin hacer zoom ni scroll horizontal.

## Deuda técnica conocida (MVP de emergencia, 2026-07-27)

- **`codigo` no existe en el modelo `Producto` de Supabase todavía.** En
  modo local vive directamente en `data/productos.js`; en modo API se
  genera cortando el UUID (`src/api.js`, función `conCodigo`). Cuando se
  migre el catálogo a Supabase en serio, agregar la columna real.
- **`ubicacion` no es un campo de `SolicitudPedido` en el backend.** El
  intento best-effort de registrar la solicitud en el ERP la manda dentro
  de `notasPersonalizacion` (ver `handleEnviarPedido` en `src/App.jsx`).
  Si se decide que ubicación merece su propio campo, agregarlo al modelo.
- **El registro en el ERP es best-effort y no bloqueante a propósito.** Las
  tablas de Supabase ya están migradas y `CATALOGO_EMPRESA_ID` configurado,
  pero el backend (`server/`) todavía no está desplegado públicamente
  (pausado a propósito el 2026-07-27 para no bloquear el lanzamiento del
  catálogo) — hasta que se despliegue, ese intento siempre falla en
  silencio y el pedido por WhatsApp sigue siendo la única vía real.
- **Verificado visualmente** (Playwright, desktop 1280px + mobile 390px,
  sin errores de consola) el 2026-07-27 tras el pulido de diseño — grilla,
  carrito, checkout y botón flotante de WhatsApp se ven y funcionan bien en
  ambos tamaños.
