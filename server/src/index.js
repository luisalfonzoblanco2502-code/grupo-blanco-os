// Entrypoint para desarrollo local (`npm run dev`). En Vercel el handler es
// api/index.js, que importa `app` de app.js directamente y no pasa por acá.
import { app } from "./app.js";

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Grupo Blanco OS API escuchando en http://localhost:${PORT}`);
});
