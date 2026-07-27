// Punto único para registrar en auditoria_sistema. Cualquier servicio que
// necesite dejar rastro de una acción (crear/editar/cancelar/facturar, etc.)
// pasa por aquí en vez de armar el insert a mano — así el formato de
// `accion`/`detalle` queda consistente en todo el sistema.
export function registrarAuditoria(tx, { empresaId, usuarioId, accion, detalle, ip }) {
  return tx.auditoriaSistema.create({
    data: {
      empresaId: empresaId ?? null,
      usuarioId: usuarioId ?? null,
      accion,
      detalle: detalle ?? undefined,
      ip: ip ?? null,
    },
  });
}
