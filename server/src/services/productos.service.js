// Catálogo de productos. `listarProductosPublicos` es lo único que ve
// catalogo.panaprice.com (sin autenticación) — filtra por activo+publicado
// a nivel de query, no de UI, para no depender de que el frontend público
// se comporte bien. El resto son operaciones de administración, usadas
// desde el ERP (protegidas por requireAuth como cualquier otra ruta).
import { prisma } from "../db.js";
import { ValidacionError, NoEncontradoError } from "./errors.js";

const INCLUDE_PRECIOS = {
  preciosVolumen: { orderBy: { cantidadMinima: "asc" } },
};

function validarDatosProducto({ nombre, categoria, precioBase }) {
  if (!nombre || !String(nombre).trim()) {
    throw new ValidacionError("El nombre del producto es obligatorio");
  }
  if (!categoria || !String(categoria).trim()) {
    throw new ValidacionError("La categoría es obligatoria");
  }
  if (!(Number(precioBase) > 0)) {
    throw new ValidacionError("El precio base debe ser un número mayor a 0");
  }
}

function validarPreciosVolumen(preciosVolumen = []) {
  for (const escalon of preciosVolumen) {
    if (!Number.isInteger(escalon.cantidadMinima) || escalon.cantidadMinima <= 0) {
      throw new ValidacionError("La cantidad mínima de cada escalón debe ser un entero mayor a 0");
    }
    if (!(Number(escalon.precioUnitario) > 0)) {
      throw new ValidacionError("El precio unitario de cada escalón debe ser mayor a 0");
    }
  }
}

// Único punto que consulta el catálogo público — sin req.usuario, la
// empresa llega resuelta por quien llama (ver publico.routes.js).
export async function listarProductosPublicos(empresaId) {
  return prisma.producto.findMany({
    where: { empresaId, activo: true, publicadoCatalogo: true, eliminadoEn: null },
    include: INCLUDE_PRECIOS,
    orderBy: { nombre: "asc" },
  });
}

export async function listarProductos(empresaId) {
  return prisma.producto.findMany({
    where: { empresaId, eliminadoEn: null },
    include: INCLUDE_PRECIOS,
    orderBy: { nombre: "asc" },
  });
}

export async function obtenerProducto(productoId, empresaId) {
  const producto = await prisma.producto.findFirst({
    where: { id: productoId, empresaId, eliminadoEn: null },
    include: INCLUDE_PRECIOS,
  });
  if (!producto) throw new NoEncontradoError("Producto no encontrado");
  return producto;
}

export async function crearProducto({
  empresaId,
  nombre,
  categoria,
  descripcion,
  imagenUrl,
  precioBase,
  activo,
  publicadoCatalogo,
  preciosVolumen,
}) {
  validarDatosProducto({ nombre, categoria, precioBase });
  validarPreciosVolumen(preciosVolumen);

  return prisma.producto.create({
    data: {
      empresaId,
      nombre: nombre.trim(),
      categoria: categoria.trim(),
      descripcion: descripcion?.trim() || null,
      imagenUrl: imagenUrl?.trim() || null,
      precioBase,
      activo: activo ?? true,
      publicadoCatalogo: publicadoCatalogo ?? false,
      preciosVolumen: {
        create: (preciosVolumen ?? []).map((e) => ({
          cantidadMinima: e.cantidadMinima,
          precioUnitario: e.precioUnitario,
        })),
      },
    },
    include: INCLUDE_PRECIOS,
  });
}

export async function editarProducto(productoId, empresaId, cambios) {
  await obtenerProducto(productoId, empresaId);

  const datos = {
    nombre: cambios.nombre?.trim(),
    categoria: cambios.categoria?.trim(),
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion?.trim() || null : undefined,
    imagenUrl: cambios.imagenUrl !== undefined ? cambios.imagenUrl?.trim() || null : undefined,
    precioBase: cambios.precioBase,
    activo: cambios.activo,
    publicadoCatalogo: cambios.publicadoCatalogo,
  };
  Object.keys(datos).forEach((k) => datos[k] === undefined && delete datos[k]);

  if (datos.nombre !== undefined || datos.categoria !== undefined || datos.precioBase !== undefined) {
    const actual = await prisma.producto.findUnique({ where: { id: productoId } });
    validarDatosProducto({
      nombre: datos.nombre ?? actual.nombre,
      categoria: datos.categoria ?? actual.categoria,
      precioBase: datos.precioBase ?? actual.precioBase,
    });
  }
  if (cambios.preciosVolumen !== undefined) {
    validarPreciosVolumen(cambios.preciosVolumen);
  }

  return prisma.$transaction(async (tx) => {
    if (cambios.preciosVolumen !== undefined) {
      // Estrategia "reemplazar todo": más simple que hacer diff línea a
      // línea y suficiente para el volumen de escalones de un producto.
      await tx.productoPrecioVolumen.deleteMany({ where: { productoId } });
    }

    return tx.producto.update({
      where: { id: productoId },
      data: {
        ...datos,
        actualizadoEn: new Date(),
        ...(cambios.preciosVolumen !== undefined
          ? {
              preciosVolumen: {
                create: cambios.preciosVolumen.map((e) => ({
                  cantidadMinima: e.cantidadMinima,
                  precioUnitario: e.precioUnitario,
                })),
              },
            }
          : {}),
      },
      include: INCLUDE_PRECIOS,
    });
  });
}

export async function eliminarProducto(productoId, empresaId) {
  await obtenerProducto(productoId, empresaId);
  return prisma.producto.update({
    where: { id: productoId },
    data: { eliminadoEn: new Date(), publicadoCatalogo: false },
  });
}

// Resuelve el precio unitario aplicable para una cantidad dada: el escalón
// de mayor cantidadMinima que no supere `cantidad`, o precioBase si ninguno
// aplica (ej. cantidad menor al primer escalón).
export function precioUnitarioParaCantidad(producto, cantidad) {
  const aplicable = producto.preciosVolumen
    .filter((e) => cantidad >= e.cantidadMinima)
    .sort((a, b) => b.cantidadMinima - a.cantidadMinima)[0];
  return aplicable ? Number(aplicable.precioUnitario) : Number(producto.precioBase);
}
