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

Editar `src/data/productos.js` — es un array plano, cada producto es un objeto:

```js
{
  id: "local-5",
  codigo: "PAN-005",
  nombre: "Pañoleta Nuevo Diseño",
  categoria: "panoleta",
  descripcion: "...",
  imagenUrl: "/productos/panoleta-005.jpg", // o null
  precioBase: 8.5,
  activo: true,
  publicadoCatalogo: true,
  preciosVolumen: [{ id: "v1", cantidadMinima: 12, precioUnitario: 7.5 }],
}
```

Guardar, `git add`/`commit`, y volver a desplegar (`vercel --prod` desde esta
carpeta, o `git push` si el proyecto está conectado a Vercel/Netlify por
Git). **El enlace público no cambia** — cada redeploy actualiza el mismo
dominio.

## Cómo agregar / cambiar imágenes

1. Poner el archivo en `public/productos/` (ej. `public/productos/panoleta-005.jpg`).
2. En `src/data/productos.js`, poner `imagenUrl: "/productos/panoleta-005.jpg"`.
3. Si se deja `imagenUrl: null`, se muestra un recuadro vacío en vez de un ícono roto.

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

## Deuda técnica conocida (MVP de emergencia, 2026-07-27)

- **`codigo` no existe en el modelo `Producto` de Supabase todavía.** En
  modo local vive directamente en `data/productos.js`; en modo API se
  genera cortando el UUID (`src/api.js`, función `conCodigo`). Cuando se
  migre el catálogo a Supabase en serio, agregar la columna real.
- **`ubicacion` no es un campo de `SolicitudPedido` en el backend.** El
  intento best-effort de registrar la solicitud en el ERP la manda dentro
  de `notasPersonalizacion` (ver `handleEnviarPedido` en `src/App.jsx`).
  Si se decide que ubicación merece su propio campo, agregarlo al modelo.
- **El registro en el ERP es best-effort y no bloqueante a propósito.**
  Mientras las tablas nuevas no estén migradas en Supabase (ver
  `server/prisma/migrations_manual/0001_catalogo_solicitudes.sql`), ese
  intento siempre va a fallar en silencio — el pedido por WhatsApp es la
  única vía garantizada hasta que se aplique esa migración y se configure
  `CATALOGO_EMPRESA_ID` en el backend.
- **No se corrió QA visual automatizada** (no había Chromium/Playwright
  disponible en el entorno de desarrollo al momento de este lanzamiento).
  Se verificó build de producción limpio y smoke test del dev server;
  falta abrir el link real desde un celular para confirmar visualmente.
