// Identidad comercial UNIFICADA del lead — corrección arquitectónica 0.1.1:
// separada de la identidad POR CANAL (ver identidades.service.js). Este
// archivo decide CUÁNDO una interacción nueva pertenece a un AtlasContacto
// ya existente y cuándo merece uno nuevo — la parte más delicada de ATLAS,
// porque una fusión equivocada mezcla el historial de dos personas
// distintas para siempre (bueno, no "para siempre": fusionarContactos()
// deja todo reversible/auditado, pero igual hay que evitarlo).
import { prisma } from "../../db.js";
import { ValidacionError } from "../errors.js";
import { registrarAuditoria } from "../auditoria.service.js";
import { emit } from "../../events/eventBus.js";
import { ATLAS_CONTACTO_CREADO } from "../../events/eventos.js";
import { CANALES, TIPOS_CLIENTE, ESTADOS_COMERCIALES } from "./config.js";

function validarCanal(canal) {
  if (!CANALES.includes(canal)) {
    throw new ValidacionError(`Canal inválido: "${canal}". Debe ser uno de: ${CANALES.join(", ")}`);
  }
}

// Busca un AtlasContacto existente por COINCIDENCIA FUERTE únicamente:
// telefonoPrincipal o emailPrincipal YA VALIDADOS e idénticos. Nunca por
// nombre/nombreUsuario parecido (regla explícita de la corrección 0.1.1:
// "no fusiones automáticamente dos contactos solo porque tengan nombres
// parecidos"). Si no hay coincidencia exacta de un dato ya marcado como
// principal, esta función devuelve null — y eso es lo correcto, no un caso
// a "mejorar" con fuzzy matching.
async function buscarContactoPorCoincidenciaFuerte(tx, empresaId, { telefono, email }) {
  if (!telefono && !email) return null;
  return tx.atlasContacto.findFirst({
    where: {
      empresaId,
      fusionadoEnId: null,
      OR: [
        ...(telefono ? [{ telefonoPrincipal: telefono }] : []),
        ...(email ? [{ emailPrincipal: email }] : []),
      ],
    },
  });
}

// Punto de entrada único cuando llega una interacción nueva de cualquier
// canal. Algoritmo (ver docs/atlas/DECISIONES.md para la versión narrada):
//   1. ¿Ya existe esta AtlasIdentidadCanal exacta (empresa+canal+id externo)?
//      → sí: devolver su AtlasContacto (o el contacto al que fue fusionada).
//   2. ¿No existe esa identidad puntual, pero el teléfono/email que llega
//      coincide con el principal YA VALIDADO de un AtlasContacto existente?
//      → sí: crear la identidad nueva colgada de ESE contacto (misma
//        persona, canal nuevo).
//   3. Si no hay ninguna coincidencia fuerte → AtlasContacto nuevo +
//      su primera identidad.
// Nunca fusiona por nombre parecido — eso es fusionarContactos(), manual.
export async function resolverOCrearContacto(empresaId, { canal, identificadorExterno, nombreUsuario, telefono, email, verificado = false, identificadorProveedor, atribucion }) {
  validarCanal(canal);
  if (!identificadorExterno?.trim()) {
    throw new ValidacionError("identificadorExterno es obligatorio (ID de Instagram, número de WhatsApp, etc.)");
  }

  return prisma.$transaction(async (tx) => {
    const identidadExistente = await tx.atlasIdentidadCanal.findUnique({
      where: { empresaId_canal_identificadorExterno: { empresaId, canal, identificadorExterno } },
      include: { atlasContacto: true },
    });

    if (identidadExistente) {
      await tx.atlasIdentidadCanal.update({
        where: { id: identidadExistente.id },
        data: { ultimaInteraccion: new Date() },
      });
      // Si el contacto dueño de esta identidad ya fue fusionado a otro,
      // seguimos la cadena hasta el sobreviviente — nunca operamos sobre
      // un AtlasContacto "perdedor".
      let contacto = identidadExistente.atlasContacto;
      while (contacto.fusionadoEnId) {
        contacto = await tx.atlasContacto.findUniqueOrThrow({ where: { id: contacto.fusionadoEnId } });
      }
      return { contacto, identidad: identidadExistente, esNuevoContacto: false };
    }

    // Solo se intenta coincidencia fuerte con datos VERIFICADOS de esta
    // interacción — un teléfono que el proveedor manda sin confirmar no
    // alcanza para fusionar automáticamente.
    const contactoCoincidente = verificado
      ? await buscarContactoPorCoincidenciaFuerte(tx, empresaId, { telefono, email })
      : null;

    const contacto = contactoCoincidente ?? (await tx.atlasContacto.create({
      data: {
        empresaId,
        telefonoPrincipal: verificado ? telefono || null : null,
        emailPrincipal: verificado ? email || null : null,
        ...(atribucion ? { atribucionPrimerToque: atribucion, atribucionUltimoToque: atribucion } : {}),
      },
    }));

    if (contactoCoincidente && atribucion) {
      // Último toque SÍ se actualiza en un contacto ya existente (nunca el
      // primero, que queda congelado desde su creación — Parte 6).
      await tx.atlasContacto.update({ where: { id: contacto.id }, data: { atribucionUltimoToque: atribucion } });
    }

    const identidad = await tx.atlasIdentidadCanal.create({
      data: {
        empresaId,
        atlasContactoId: contacto.id,
        canal,
        identificadorExterno,
        identificadorProveedor: identificadorProveedor || null,
        nombreUsuario: nombreUsuario || null,
        telefono: telefono || null,
        email: email || null,
        verificado,
      },
    });

    if (!contactoCoincidente) {
      try {
        await emit(ATLAS_CONTACTO_CREADO, { contacto, empresaId });
      } catch (err) {
        console.error("[atlas] error notificando ATLAS_CONTACTO_CREADO (no bloquea):", err);
      }
    }

    return { contacto, identidad, esNuevoContacto: !contactoCoincidente };
  });
}

// ¿Fusionar origen→destino crearía un ciclo? Camina la cadena de fusiones
// del DESTINO (destino → destino.fusionadoEnId → ...); si en algún punto
// llega al ORIGEN, fusionarlos formaría un loop (A fusionado a B y B,
// directa o transitivamente, fusionado a A). Postgres no puede expresar
// "sin ciclos" en un FK autorreferenciado — por eso esta validación vive
// acá, no en el schema.
async function creariaCiclo(tx, empresaId, origenId, destinoId) {
  let actualId = destinoId;
  const visitados = new Set();
  while (actualId) {
    if (actualId === origenId) return true;
    if (visitados.has(actualId)) return false; // ciclo preexistente ajeno — no es lo que esta fusión crearía
    visitados.add(actualId);
    const actual = await tx.atlasContacto.findFirst({ where: { id: actualId, empresaId }, select: { fusionadoEnId: true } });
    actualId = actual?.fusionadoEnId ?? null;
  }
  return false;
}

// Fusión MANUAL y auditada — la única forma de unir dos AtlasContacto que
// resultaron ser la misma persona (ej. un agente humano lo confirma
// leyendo la conversación). Nunca se llama automáticamente. Mueve todas
// las identidades del origen al destino, marca el origen como fusionado
// (nunca lo borra — "ningún contacto se elimina al fusionar") y dejar
// rastro en auditoria_sistema.
export async function fusionarContactos(empresaId, { contactoOrigenId, contactoDestinoId, motivo, usuarioId }) {
  if (contactoOrigenId === contactoDestinoId) {
    throw new ValidacionError("No se puede fusionar un contacto consigo mismo");
  }
  if (!motivo?.trim()) {
    throw new ValidacionError("Toda fusión debe indicar un motivo (queda en el historial de auditoría)");
  }

  return prisma.$transaction(async (tx) => {
    const [origen, destino] = await Promise.all([
      tx.atlasContacto.findFirst({ where: { id: contactoOrigenId, empresaId } }),
      tx.atlasContacto.findFirst({ where: { id: contactoDestinoId, empresaId } }),
    ]);
    if (!origen) throw new ValidacionError("Contacto de origen no encontrado");
    if (!destino) throw new ValidacionError("Contacto de destino no encontrado");
    if (origen.fusionadoEnId) throw new ValidacionError("El contacto de origen ya estaba fusionado a otro");
    if (await creariaCiclo(tx, empresaId, origen.id, destino.id)) {
      throw new ValidacionError("Esta fusión crearía un ciclo: el destino ya está fusionado (directa o indirectamente) al origen");
    }

    await tx.atlasIdentidadCanal.updateMany({
      where: { atlasContactoId: origen.id },
      data: { atlasContactoId: destino.id },
    });

    const origenActualizado = await tx.atlasContacto.update({
      where: { id: origen.id },
      data: { fusionadoEnId: destino.id, actualizadoEn: new Date() },
    });

    await registrarAuditoria(tx, {
      empresaId,
      usuarioId,
      accion: "atlas_contacto.fusionado",
      detalle: { contactoOrigenId: origen.id, contactoDestinoId: destino.id, motivo },
    });

    return { origen: origenActualizado, destino };
  });
}

export async function listarContactos(empresaId, { estadoComercial, canal } = {}) {
  return prisma.atlasContacto.findMany({
    where: {
      empresaId,
      fusionadoEnId: null,
      ...(estadoComercial ? { estadoComercial } : {}),
      ...(canal ? { identidadesCanal: { some: { canal } } } : {}),
    },
    include: { identidadesCanal: true },
    orderBy: { actualizadoEn: "desc" },
  });
}

export async function obtenerContacto(contactoId, empresaId) {
  return prisma.atlasContacto.findFirst({
    where: { id: contactoId, empresaId },
    include: {
      identidadesCanal: {
        include: { conversaciones: { include: { mensajes: { orderBy: { creadoEn: "asc" } } } } },
      },
    },
  });
}

export async function actualizarEstadoContacto(contactoId, empresaId, { estadoComercial, tipoCliente, proximaAccion, responsableUsuarioId }) {
  if (estadoComercial && !ESTADOS_COMERCIALES.includes(estadoComercial)) {
    throw new ValidacionError(`Estado comercial inválido: "${estadoComercial}"`);
  }
  if (tipoCliente && !TIPOS_CLIENTE.includes(tipoCliente)) {
    throw new ValidacionError(`Tipo de cliente inválido: "${tipoCliente}"`);
  }
  const actual = await prisma.atlasContacto.findFirst({ where: { id: contactoId, empresaId } });
  if (!actual) throw new ValidacionError("Contacto no encontrado");

  // Auditoría Subfase 0.3 (Punto 4d): un responsable debe poder operar en
  // ESTA empresa. No es una FK compuesta en la base — `usuarios` es una
  // tabla previa a ATLAS y agregarle un UNIQUE(id, empresa_id) para poder
  // apuntarle con una FK compuesta está fuera del alcance de "solo tocar
  // la fundación no desplegada de ATLAS" (ver DECISIONES.md, Decisión 14).
  // Se valida acá, en la frontera de la aplicación.
  if (responsableUsuarioId) {
    const usuario = await prisma.usuario.findUnique({ where: { id: responsableUsuarioId } });
    if (!usuario) throw new ValidacionError("Usuario responsable no encontrado");
    if (usuario.empresaId !== empresaId) {
      throw new ValidacionError("El usuario responsable no pertenece a esta empresa");
    }
  }

  return prisma.atlasContacto.update({
    where: { id: contactoId },
    data: {
      estadoComercial: estadoComercial ?? actual.estadoComercial,
      tipoCliente: tipoCliente ?? actual.tipoCliente,
      proximaAccion: proximaAccion !== undefined ? proximaAccion : actual.proximaAccion,
      responsableUsuarioId: responsableUsuarioId !== undefined ? responsableUsuarioId : actual.responsableUsuarioId,
      ultimoContacto: new Date(),
      actualizadoEn: new Date(),
    },
  });
}

// Vínculo explícito y opcional hacia un Pedido real — nunca se llama sola,
// siempre desde un listener de SOLICITUD_CONVERTIDA/PEDIDO_FACTURADO
// (todavía no conectado, ver DECISIONES.md).
export async function vincularContactoAPedido(contactoId, empresaId, pedidoId) {
  const actual = await prisma.atlasContacto.findFirst({ where: { id: contactoId, empresaId } });
  if (!actual) throw new ValidacionError("Contacto no encontrado");

  // Auditoría Subfase 0.3 (Punto 4c): el pedido vinculado debe pertenecer
  // a la MISMA empresa que el contacto — mismo criterio que el responsable
  // (ver actualizarEstadoContacto arriba): no es una FK compuesta en la
  // base porque `pedidos` es previa a ATLAS (ver DECISIONES.md, Decisión
  // 14), se valida en la frontera de la aplicación.
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) throw new ValidacionError("Pedido no encontrado");
  if (pedido.empresaId !== empresaId) {
    throw new ValidacionError("El pedido no pertenece a esta empresa");
  }

  return prisma.atlasContacto.update({
    where: { id: contactoId },
    data: { pedidoId, estadoComercial: "convertido", actualizadoEn: new Date() },
  });
}
