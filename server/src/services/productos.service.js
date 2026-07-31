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

function validarDatosProducto({ codigo, nombre, categoria, precioBase }) {
  if (!codigo || !String(codigo).trim()) {
    throw new ValidacionError("El código del producto es obligatorio");
  }
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

// Producto Maestro (Paso 4): mismo criterio que el CHECK real de la base
// (chk_productos_tiempo_produccion_positivo) — nulo permitido, cero/negativo no.
function validarTiempoProduccion(tiempoProduccionMinutos) {
  if (tiempoProduccionMinutos == null) return;
  if (!Number.isInteger(Number(tiempoProduccionMinutos)) || Number(tiempoProduccionMinutos) <= 0) {
    throw new ValidacionError("El tiempo de producción debe ser un número entero mayor a 0");
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
// `select` explícito (no `include`): productoInternoId es un dato interno
// del Facturador Administrativo (BOM/inventario) — el cliente del catálogo
// nunca debe recibirlo, ni siquiera sin querer por un `findMany` sin recortar.
export async function listarProductosPublicos(empresaId) {
  return prisma.producto.findMany({
    where: { empresaId, activo: true, publicadoCatalogo: true, eliminadoEn: null },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      categoria: true,
      descripcion: true,
      imagenUrl: true,
      precioBase: true,
      activo: true,
      publicadoCatalogo: true,
      disponible: true,
      preciosVolumen: { orderBy: { cantidadMinima: "asc" } },
    },
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
  codigo,
  nombre,
  categoria,
  descripcion,
  imagenUrl,
  precioBase,
  activo,
  publicadoCatalogo,
  disponible,
  preciosVolumen,
  productoInternoId,
  requierePersonalizacion,
  imagenReferenciaProduccionUrl,
  talla,
  medidas,
  tela,
  tipoImpresion,
  forro,
  tiras,
  insumosDescripcion,
  moldeUrl,
  tiempoProduccionMinutos,
  instruccionesProduccion,
}) {
  validarDatosProducto({ codigo, nombre, categoria, precioBase });
  validarPreciosVolumen(preciosVolumen);
  validarTiempoProduccion(tiempoProduccionMinutos);

  try {
    return await prisma.producto.create({
      data: {
        empresaId,
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        categoria: categoria.trim(),
        descripcion: descripcion?.trim() || null,
        imagenUrl: imagenUrl?.trim() || null,
        precioBase,
        activo: activo ?? true,
        publicadoCatalogo: publicadoCatalogo ?? false,
        disponible: disponible ?? true,
        // Puente al Catálogo Interno (Fase 1) — opcional, nunca obligatorio.
        productoInternoId: productoInternoId || null,
        // Producto Maestro (Paso 2/4) — especificación técnica permanente,
        // opcional a propósito ("primero sugerir, nunca obligar").
        requierePersonalizacion: !!requierePersonalizacion,
        imagenReferenciaProduccionUrl: imagenReferenciaProduccionUrl?.trim() || null,
        talla: talla?.trim() || null,
        medidas: medidas?.trim() || null,
        tela: tela?.trim() || null,
        tipoImpresion: tipoImpresion?.trim() || null,
        forro: forro?.trim() || null,
        tiras: tiras?.trim() || null,
        insumosDescripcion: insumosDescripcion?.trim() || null,
        moldeUrl: moldeUrl?.trim() || null,
        tiempoProduccionMinutos: tiempoProduccionMinutos ?? null,
        instruccionesProduccion: instruccionesProduccion?.trim() || null,
        preciosVolumen: {
          create: (preciosVolumen ?? []).map((e) => ({
            cantidadMinima: e.cantidadMinima,
            precioUnitario: e.precioUnitario,
          })),
        },
      },
      include: INCLUDE_PRECIOS,
    });
  } catch (err) {
    // P2002: choca con @@unique([empresaId, codigo]) — mensaje claro en vez
    // del error crudo de Prisma.
    if (err.code === "P2002") {
      throw new ValidacionError(`Ya existe un producto con el código "${codigo}"`);
    }
    throw err;
  }
}

export async function editarProducto(productoId, empresaId, cambios) {
  await obtenerProducto(productoId, empresaId);

  const datos = {
    codigo: cambios.codigo?.trim(),
    nombre: cambios.nombre?.trim(),
    categoria: cambios.categoria?.trim(),
    descripcion: cambios.descripcion !== undefined ? cambios.descripcion?.trim() || null : undefined,
    imagenUrl: cambios.imagenUrl !== undefined ? cambios.imagenUrl?.trim() || null : undefined,
    precioBase: cambios.precioBase,
    activo: cambios.activo,
    publicadoCatalogo: cambios.publicadoCatalogo,
    disponible: cambios.disponible,
    // Puente al Catálogo Interno (Fase 1): `undefined` = no tocar el vínculo;
    // `null`/"" = desvincular explícitamente; string real = vincular/cambiar.
    productoInternoId: cambios.productoInternoId !== undefined ? cambios.productoInternoId || null : undefined,
    // Producto Maestro (Paso 2/4): mismo criterio `undefined` = no tocar.
    requierePersonalizacion: cambios.requierePersonalizacion,
    imagenReferenciaProduccionUrl:
      cambios.imagenReferenciaProduccionUrl !== undefined ? cambios.imagenReferenciaProduccionUrl?.trim() || null : undefined,
    talla: cambios.talla !== undefined ? cambios.talla?.trim() || null : undefined,
    medidas: cambios.medidas !== undefined ? cambios.medidas?.trim() || null : undefined,
    tela: cambios.tela !== undefined ? cambios.tela?.trim() || null : undefined,
    tipoImpresion: cambios.tipoImpresion !== undefined ? cambios.tipoImpresion?.trim() || null : undefined,
    forro: cambios.forro !== undefined ? cambios.forro?.trim() || null : undefined,
    tiras: cambios.tiras !== undefined ? cambios.tiras?.trim() || null : undefined,
    insumosDescripcion: cambios.insumosDescripcion !== undefined ? cambios.insumosDescripcion?.trim() || null : undefined,
    moldeUrl: cambios.moldeUrl !== undefined ? cambios.moldeUrl?.trim() || null : undefined,
    tiempoProduccionMinutos: cambios.tiempoProduccionMinutos !== undefined ? cambios.tiempoProduccionMinutos ?? null : undefined,
    instruccionesProduccion:
      cambios.instruccionesProduccion !== undefined ? cambios.instruccionesProduccion?.trim() || null : undefined,
  };
  Object.keys(datos).forEach((k) => datos[k] === undefined && delete datos[k]);

  if (datos.codigo !== undefined || datos.nombre !== undefined || datos.categoria !== undefined || datos.precioBase !== undefined) {
    const actual = await prisma.producto.findUnique({ where: { id: productoId } });
    validarDatosProducto({
      codigo: datos.codigo ?? actual.codigo,
      nombre: datos.nombre ?? actual.nombre,
      categoria: datos.categoria ?? actual.categoria,
      precioBase: datos.precioBase ?? actual.precioBase,
    });
  }
  if (cambios.preciosVolumen !== undefined) {
    validarPreciosVolumen(cambios.preciosVolumen);
  }
  if (cambios.tiempoProduccionMinutos !== undefined) {
    validarTiempoProduccion(cambios.tiempoProduccionMinutos);
  }

  try {
    return await prisma.$transaction(async (tx) => {
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
  } catch (err) {
    if (err.code === "P2002") {
      throw new ValidacionError(`Ya existe un producto con el código "${datos.codigo}"`);
    }
    throw err;
  }
}

export async function eliminarProducto(productoId, empresaId) {
  const actual = await obtenerProducto(productoId, empresaId);
  return prisma.producto.update({
    where: { id: productoId },
    data: {
      eliminadoEn: new Date(),
      publicadoCatalogo: false,
      // @@unique([empresaId, codigo]) no filtra por eliminadoEn, así que un
      // soft-delete por sí solo dejaba el código "atrapado" para siempre
      // (bug real: PA-001, 2026-07-29) — se libera acá renombrándolo, sin
      // perder la fila ni las referencias históricas que ya apunten a ella.
      codigo: `${actual.codigo}__eliminado_${Date.now()}`,
    },
  });
}

// El escalón de mayor cantidadMinima que no supere `cantidad`, o null si
// ninguno aplica (ej. cantidad menor al primer escalón — se cae a precioBase).
// Expuesto aparte de precioUnitarioParaCantidad para que quien necesite
// AUDITAR "qué escala se usó" (ej. al registrar un override de precio en
// pedidoLineas.service.js) no tenga que reimplementar el mismo filtro/sort.
export function escalonAplicableProducto(producto, cantidad) {
  return (
    producto.preciosVolumen
      .filter((e) => cantidad >= e.cantidadMinima)
      .sort((a, b) => b.cantidadMinima - a.cantidadMinima)[0] || null
  );
}

// Resuelve el precio unitario aplicable para una cantidad dada: el escalón
// de mayor cantidadMinima que no supere `cantidad`, o precioBase si ninguno
// aplica (ej. cantidad menor al primer escalón).
export function precioUnitarioParaCantidad(producto, cantidad) {
  const aplicable = escalonAplicableProducto(producto, cantidad);
  return aplicable ? Number(aplicable.precioUnitario) : Number(producto.precioBase);
}
