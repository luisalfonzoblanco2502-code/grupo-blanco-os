// Enforcement mínimo de permisos: cada ruta que lo necesite declara qué
// clave de `rol.permisos` requiere. requireAuth ya corrió antes (siempre
// montado primero) y dejó req.usuario con rol.permisos cargado.
export function requirePermiso(clave) {
  return (req, res, next) => {
    const permisos = req.usuario?.rol?.permisos || {};
    if (!permisos[clave]) {
      return res.status(403).json({ error: `No tienes permiso para esta acción (${clave})` });
    }
    next();
  };
}

// Para saber en el propio handler si el usuario tiene o no un permiso
// (ej. para decidir el alcance de una consulta), sin cortar la request.
export function tienePermiso(req, clave) {
  return !!req.usuario?.rol?.permisos?.[clave];
}
