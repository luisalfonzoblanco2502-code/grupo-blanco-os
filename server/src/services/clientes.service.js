// Ficha de Cliente — identidad únicamente. Los totales (monto acumulado,
// ticket promedio, última compra, clasificación, saldo por cobrar) se
// calculan agregando DocumentoVenta en tiempo de lectura, nunca se guardan
// como contador mutable: así reprocesar PEDIDO_FACTURADO no puede duplicar
// ni desalinear nada (no hay contador que incrementar dos veces).
import { prisma } from "../db.js";
import { ValidacionError } from "./errors.js";

function normalizar(nombre) {
  return nombre.trim();
}

// Búsqueda simple para el autocompletar de "Nuevo Pedido" — identidad
// solamente, no calcula agregados (eso es listarFichasClientes, para CRM).
export function buscarClientes(empresaId, texto) {
  const where = { empresaId };
  if (texto?.trim()) {
    where.nombre = { contains: texto.trim(), mode: "insensitive" };
  }
  return prisma.cliente.findMany({
    where,
    orderBy: { nombre: "asc" },
    take: 20,
  });
}

// Alta manual desde "Nuevo Pedido" ("crear cliente sin abandonar el
// formulario") — a diferencia de obtenerOCrearCliente (que solo tiene
// nombre, disponible al facturar), acá la vendedora sí puede cargar
// teléfono/email/dirección de una vez.
export async function crearClienteManual(empresaId, { nombre, telefono, email, direccion }) {
  if (!nombre?.trim()) throw new ValidacionError("El nombre del cliente es obligatorio");
  const existente = await prisma.cliente.findUnique({
    where: { empresaId_nombre: { empresaId, nombre: nombre.trim() } },
  });
  if (existente) {
    throw new ValidacionError(`Ya existe un cliente con el nombre "${nombre.trim()}"`);
  }
  return prisma.cliente.create({
    data: {
      empresaId,
      nombre: nombre.trim(),
      telefono: telefono?.trim() || null,
      email: email?.trim() || null,
      direccion: direccion?.trim() || null,
    },
  });
}

// find-or-create, naturalmente idempotente por la unique (empresaId, nombre)
// — puede llamarse tantas veces como haga falta para el mismo pedido sin
// crear fichas duplicadas ni pisar datos ya cargados (telefono/email).
export async function obtenerOCrearCliente(tx, empresaId, nombreCliente) {
  const nombre = normalizar(nombreCliente);
  const existente = await tx.cliente.findUnique({
    where: { empresaId_nombre: { empresaId, nombre } },
  });
  if (existente) return existente;
  try {
    return await tx.cliente.create({ data: { empresaId, nombre } });
  } catch (err) {
    // Carrera rarísima (dos líneas del mismo cliente en el mismo instante):
    // si otro create ganó la unique constraint, usamos ese.
    if (err.code === "P2002") {
      return tx.cliente.findUniqueOrThrow({ where: { empresaId_nombre: { empresaId, nombre } } });
    }
    throw err;
  }
}

function clasificar(totalComprado) {
  if (totalComprado >= 1000) return "VIP";
  if (totalComprado >= 300) return "Frecuente";
  return "Nuevo";
}

// Ficha completa de un cliente con sus agregados, para el detalle/CRM.
export async function obtenerFichaCliente(clienteId, empresaId) {
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
  if (!cliente) return null;
  return construirFicha(cliente, await documentosDelCliente(cliente.id, empresaId));
}

async function documentosDelCliente(clienteId, empresaId) {
  return prisma.documentoVenta.findMany({
    where: { clienteId, empresaId, estado: "EMITIDO" },
    include: { pagos: { where: { estado: "CONFIRMADO" } } },
  });
}

function construirFicha(cliente, documentos) {
  const cantidadPedidos = documentos.length;
  const totalComprado = documentos.reduce((s, d) => s + Number(d.total), 0);
  const saldoPorCobrar = documentos.reduce((s, d) => s + Number(d.saldoPendiente), 0);
  const ultimaCompra = documentos.reduce(
    (max, d) => (!max || d.fechaEmision > max ? d.fechaEmision : max),
    null
  );
  return {
    ...cliente,
    cantidadPedidos,
    totalComprado,
    ticketPromedio: cantidadPedidos > 0 ? totalComprado / cantidadPedidos : 0,
    saldoPorCobrar,
    ultimaCompra,
    clasificacion: clasificar(totalComprado),
  };
}

// Todas las fichas de la empresa con sus agregados — para el dashboard/lista
// de CRM. Volumen esperado bajo (una empresa, decenas/cientos de clientes),
// no amerita paginar todavía.
export async function listarFichasClientes(empresaId) {
  const clientes = await prisma.cliente.findMany({ where: { empresaId } });
  const documentos = await prisma.documentoVenta.findMany({
    where: { empresaId, estado: "EMITIDO", clienteId: { not: null } },
    include: { pagos: { where: { estado: "CONFIRMADO" } } },
  });
  const porCliente = new Map();
  for (const doc of documentos) {
    const lista = porCliente.get(doc.clienteId) ?? [];
    lista.push(doc);
    porCliente.set(doc.clienteId, lista);
  }
  return clientes
    .map((cliente) => construirFicha(cliente, porCliente.get(cliente.id) ?? []))
    .sort((a, b) => b.totalComprado - a.totalComprado);
}
