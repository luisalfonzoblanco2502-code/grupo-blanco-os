// Catálogo mínimo de cajas/cuentas — soporte de Pagos e Ingresos (y, más
// adelante, Egresos). Sin CRUD completo todavía: alcanza con listar lo
// sembrado en la migración ("Caja principal") + poder agregar cuentas
// nuevas si hace falta.
import { prisma } from "../db.js";
import { ValidacionError } from "./errors.js";

export function listarCajasCuentas(empresaId) {
  return prisma.cajaCuenta.findMany({ where: { empresaId, activa: true }, orderBy: { nombre: "asc" } });
}

export function crearCajaCuenta(empresaId, { nombre, tipo }) {
  if (!nombre?.trim()) throw new ValidacionError("El nombre es obligatorio");
  return prisma.cajaCuenta.create({
    data: { empresaId, nombre: nombre.trim(), tipo: tipo === "BANCO" ? "BANCO" : "CAJA" },
  });
}
