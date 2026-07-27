// Entrypoint de Vercel: cada archivo bajo api/ se despliega como función
// serverless. Vercel envuelve este handler Express (req, res) => {...} con
// su propio runtime — no hace falta app.listen() acá (ver src/index.js
// para el entrypoint de desarrollo local, que sí lo llama).
import { app } from "../src/app.js";

export default app;
