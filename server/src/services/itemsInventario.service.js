// Materia prima / insumos — CRUD mínimo del Catálogo Interno. Todo ítem
// arranca en existencia 0: cargar stock real es un movimiento ENTRADA
// explícito y auditable, no un valor que se escribe a mano al crear el ítem.
import { prisma } from "../db.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";

export function listarItemsInventario(empresaId) {
  return prisma.itemInventario.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } });
}

export function crearItemInventario(empresaId, { codigo, nombre, categoria, unidadMedida, stockMinimo, costoUnitario }) {
  if (!codigo?.trim() || !nombre?.trim()) {
    throw new ValidacionError("Código y nombre son obligatorios");
  }
  return prisma.itemInventario.create({
    data: {
      empresaId,
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      categoria: categoria?.trim() || null,
      unidadMedida: unidadMedida?.trim() || "unidad",
      stockMinimo: stockMinimo != null ? Number(stockMinimo) : 0,
      costoUnitario: costoUnitario != null ? Number(costoUnitario) : 0,
    },
  });
}

export async function actualizarItemInventario(id, empresaId, data) {
  const item = await prisma.itemInventario.findFirst({ where: { id, empresaId } });
  if (!item) throw new NoEncontradoError("Ítem de inventario no encontrado");
  return prisma.itemInventario.update({
    where: { id },
    data: {
      nombre: data.nombre?.trim(),
      categoria: data.categoria?.trim() || null,
      unidadMedida: data.unidadMedida?.trim(),
      stockMinimo: data.stockMinimo != null ? Number(data.stockMinimo) : undefined,
      costoUnitario: data.costoUnitario != null ? Number(data.costoUnitario) : undefined,
      activo: data.activo,
      actualizadoEn: new Date(),
    },
  });
}

// Única forma de subir existencia: movimiento ENTRADA explícito y auditable.
export async function registrarEntrada(itemId, empresaId, { cantidad, referencia, usuarioId }) {
  if (!(Number(cantidad) > 0)) throw new ValidacionError("La cantidad debe ser mayor a 0");
  return prisma.$transaction(async (tx) => {
    const item = await tx.itemInventario.findFirst({ where: { id: itemId, empresaId } });
    if (!item) throw new NoEncontradoError("Ítem de inventario no encontrado");

    const actualizado = await tx.itemInventario.update({
      where: { id: itemId },
      data: { existencia: { increment: Number(cantidad) }, actualizadoEn: new Date() },
    });
    await tx.movimientoInventario.create({
      data: {
        empresaId,
        itemInventarioId: itemId,
        tipo: "ENTRADA",
        cantidad: Number(cantidad),
        referencia: referencia || null,
        usuarioId: usuarioId || null,
      },
    });
    return actualizado;
  });
}

export function listarMovimientos(empresaId, itemId) {
  return prisma.movimientoInventario.findMany({
    where: { empresaId, ...(itemId ? { itemInventarioId: itemId } : {}) },
    include: { itemInventario: true },
    orderBy: { fecha: "desc" },
    take: 100,
  });
}

// Sobreventa permitida y visible (decisión aprobada): un ítem está en alerta
// si lo reservado supera lo disponible, o si el disponible cae bajo el
// mínimo — ninguna de las dos bloquea la facturación, solo se muestran.
export function calcularAlertas(items) {
  return items
    .map((item) => {
      const disponible = Number(item.existencia) - Number(item.existenciaReservada);
      const alertas = [];
      if (disponible < 0) alertas.push("SOBREVENTA");
      if (disponible < Number(item.stockMinimo)) alertas.push("STOCK_CRITICO");
      return { ...item, disponible, alertas };
    })
    .filter((item) => item.alertas.length > 0);
}
