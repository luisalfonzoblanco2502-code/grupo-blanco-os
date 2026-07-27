// Instrumentación de tiempos — Sprint 11 (piloto). Objetivo: separar "tiempo
// total del backend" de "tiempo que Prisma pasó esperando a Postgres", para
// tener evidencia de causa antes de decidir cualquier optimización real.
// Deliberadamente NO toca la lógica de negocio: es solo observabilidad.
import { AsyncLocalStorage } from "node:async_hooks";

export const contextoRequest = new AsyncLocalStorage();

export function medirTiempos(req, res, next) {
  const inicio = process.hrtime.bigint();
  const contexto = { prismaMs: 0, prismaConsultas: 0 };

  contextoRequest.run(contexto, () => {
    res.on("finish", () => {
      const totalMs = Number(process.hrtime.bigint() - inicio) / 1e6;
      const prismaMs = contexto.prismaMs;
      console.log(
        `[tiempos] ${req.method} ${req.originalUrl} -> ${res.statusCode} | ` +
          `backend=${totalMs.toFixed(0)}ms prisma=${prismaMs.toFixed(0)}ms ` +
          `(${contexto.prismaConsultas} consultas) resto=${(totalMs - prismaMs).toFixed(0)}ms`
      );
    });
    next();
  });
}
