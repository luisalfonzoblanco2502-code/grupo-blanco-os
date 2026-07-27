import { Router } from "express";
import { prisma } from "../db.js";

export const prioridadesRouter = Router();

prioridadesRouter.get("/", async (req, res, next) => {
  try {
    const prioridades = await prisma.prioridad.findMany({ orderBy: { peso: "asc" } });
    res.json(prioridades);
  } catch (err) {
    next(err);
  }
});
