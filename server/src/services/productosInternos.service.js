// Catálogo Interno de Productos — base del BOM (ajuste de arquitectura
// aprobado 2026-07-28, previo al Facturador Administrativo: "Inventario no
// debe depender únicamente del pedido, sino de la composición del
// producto"). Independiente del catálogo público (Producto, para
// catalogo.panaprice.com) — este es de uso interno para costear/reservar.
import { prisma } from "../db.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";

export function listarProductosInternos(empresaId) {
  return prisma.productoInterno.findMany({
    where: { empresaId },
    orderBy: { nombre: "asc" },
    include: { insumos: { include: { itemInventario: true } } },
  });
}

export async function obtenerProductoInterno(id, empresaId) {
  const producto = await prisma.productoInterno.findFirst({
    where: { id, empresaId },
    include: { insumos: { include: { itemInventario: true } } },
  });
  if (!producto) throw new NoEncontradoError("Producto interno no encontrado");
  return producto;
}

export function crearProductoInterno(empresaId, { codigo, nombre, categoria, precioReferencia }) {
  if (!codigo?.trim() || !nombre?.trim()) {
    throw new ValidacionError("Código y nombre son obligatorios");
  }
  return prisma.productoInterno.create({
    data: {
      empresaId,
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      categoria: categoria?.trim() || null,
      precioReferencia: precioReferencia != null ? Number(precioReferencia) : null,
    },
  });
}

export async function actualizarProductoInterno(id, empresaId, data) {
  const producto = await prisma.productoInterno.findFirst({ where: { id, empresaId } });
  if (!producto) throw new NoEncontradoError("Producto interno no encontrado");
  return prisma.productoInterno.update({
    where: { id },
    data: {
      nombre: data.nombre?.trim(),
      categoria: data.categoria?.trim() || null,
      precioReferencia: data.precioReferencia != null ? Number(data.precioReferencia) : null,
      activo: data.activo,
      actualizadoEn: new Date(),
    },
  });
}

// BOM: agregar/quitar insumos de un producto interno.
export async function agregarInsumo(productoInternoId, empresaId, { itemInventarioId, cantidadPorUnidad }) {
  const producto = await prisma.productoInterno.findFirst({ where: { id: productoInternoId, empresaId } });
  if (!producto) throw new NoEncontradoError("Producto interno no encontrado");
  const item = await prisma.itemInventario.findFirst({ where: { id: itemInventarioId, empresaId } });
  if (!item) throw new NoEncontradoError("Ítem de inventario no encontrado");
  if (!(Number(cantidadPorUnidad) > 0)) {
    throw new ValidacionError("La cantidad por unidad debe ser mayor a 0");
  }
  return prisma.productoInsumo.upsert({
    where: { productoInternoId_itemInventarioId: { productoInternoId, itemInventarioId } },
    create: { empresaId, productoInternoId, itemInventarioId, cantidadPorUnidad: Number(cantidadPorUnidad) },
    update: { cantidadPorUnidad: Number(cantidadPorUnidad) },
  });
}

export async function quitarInsumo(insumoId, empresaId) {
  const insumo = await prisma.productoInsumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) throw new NoEncontradoError("Insumo no encontrado");
  await prisma.productoInsumo.delete({ where: { id: insumoId } });
}
