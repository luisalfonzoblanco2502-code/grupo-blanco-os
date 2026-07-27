import { Router } from "express";
import { prisma } from "../db.js";

export const etapasRouter = Router();

etapasRouter.get("/", async (req, res, next) => {
  try {
    const etapas = await prisma.etapa.findMany({
      include: { puestoRequerido: true },
      orderBy: { orden: "asc" },
    });
    res.json(etapas);
  } catch (err) {
    next(err);
  }
});
