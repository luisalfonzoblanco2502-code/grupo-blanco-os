import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Puerto propio (5174) para poder correr el ERP (5173) y el catálogo al
// mismo tiempo en desarrollo sin que Vite tenga que reasignar puertos.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
