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

## Logo y foto del hero

- Logo: **`catalogo/public/logo-panaprice.png`** — aparece solo en el encabezado y en el hero, sin tocar código. Mientras no exista, se muestra un wordmark de texto ("PANAPRICE — CUSTOM —") como respaldo automático.
- Foto del hero: **`catalogo/public/hero-produccion.jpg`** — foto grande de producción/planta/proceso (no un producto suelto) que acompaña el titular "FABRICAMOS IDEAS." Mientras no exista, el hero se apoya solo en tipografía (nunca un fondo decorativo de relleno).

Ninguna de las dos requiere redeploy de código para actualizarse *después* del primer despliegue con el archivo — pero si el archivo nunca se subió, sí hace falta un `vercel --prod` para publicarlo la primera vez (los archivos de `public/` se empaquetan en el build).

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

## Estado actual (actualizado 2026-07-29)

- El backend (`server/`, desplegado en `panaprice-server.vercel.app`) SÍ
  está público — `VITE_DATA_SOURCE=api` en producción lee productos reales
  de Supabase, administrados desde `/productos` en el ERP. `codigo` es una
  columna real del modelo `Producto` (ya no se inventa cortando el UUID).
- **`ubicacion` sigue sin ser un campo propio de `SolicitudPedido`** — el
  intento best-effort de registrar la solicitud en el ERP la manda dentro
  de `notasPersonalizacion` (ver `handleEnviarPedido` en `src/App.jsx`).
- Tarifa por volumen: para productos de la categoría "Pañoletas" el precio
  se calcula por una escala única definida en `src/pricing.js`
  (`ESCALAS_POR_CATEGORIA`), acumulada sobre el total del carrito — no por
  producto individual. Ver comentarios en ese archivo antes de tocar precios.
- Identidad visual (2026-07-29): paleta blanco/negro/azul institucional
  (`#1146FF`) + azul oscuro/gris claro, naranja reservado únicamente para
  botones de acción de venta (Agregar al pedido / Cotizar / Enviar
  pedido). Tipografía Montserrat (cargada por Google Fonts en
  `index.html`). Ver variables en `src/index.css` (`:root`).
