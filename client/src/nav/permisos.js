// Un único criterio de visibilidad, usado tanto por el Sidebar (ocultar
// enlaces) como por RequierePermiso (bloquear la ruta en sí) — ocultar un
// link sin bloquear la ruta no es seguridad, solo cosmética.
export function puedeVer(permisos, clave) {
  if (!clave) return true;
  return !!permisos?.[clave];
}

export function moduloVisible(permisos, modulo) {
  return puedeVer(permisos, modulo.permiso);
}
