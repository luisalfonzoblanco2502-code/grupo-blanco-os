import "dotenv/config";
import express from "express";
import cors from "cors";
import { medirTiempos } from "./instrumentacion.js";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { pedidosRouter } from "./routes/pedidos.routes.js";
import { ordenesProduccionRouter } from "./routes/ordenesProduccion.routes.js";
import { etapasRouter } from "./routes/etapas.routes.js";
import { prioridadesRouter } from "./routes/prioridades.routes.js";
import { usuariosRouter } from "./routes/usuarios.routes.js";
import { productosRouter } from "./routes/productos.routes.js";
import { solicitudesRouter } from "./routes/solicitudes.routes.js";
import { publicoRouter } from "./routes/publico.routes.js";

const app = express();

// CORS_ORIGIN admite una lista separada por comas: el ERP y el catálogo
// público viven en subdominios distintos (erp.panaprice.com,
// catalogo.panaprice.com) pero pegan al mismo backend.
const origenesPermitidos = (process.env.CORS_ORIGIN || "*").split(",").map((o) => o.trim());
app.use(cors({ origin: origenesPermitidos.includes("*") ? "*" : origenesPermitidos }));
app.use(express.json());
app.use(medirTiempos);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Sin requireAuth a propósito: es lo único que llama catalogo.panaprice.com.
app.use("/api/publico", publicoRouter);

app.use("/api/auth", requireAuth, authRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/pedidos", requireAuth, pedidosRouter);
app.use("/api/ordenes-produccion", requireAuth, ordenesProduccionRouter);
app.use("/api/etapas", requireAuth, etapasRouter);
app.use("/api/prioridades", requireAuth, prioridadesRouter);
app.use("/api/usuarios", requireAuth, usuariosRouter);
app.use("/api/productos", requireAuth, productosRouter);
app.use("/api/solicitudes", requireAuth, solicitudesRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || "Error interno" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Grupo Blanco OS API escuchando en http://localhost:${PORT}`);
});
