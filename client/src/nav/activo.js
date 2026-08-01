import { MODULOS } from "./modules";

export function esRutaActiva(pathname, path) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}

// Módulo dueño de la ruta actual — el primero del registro cuyo `path` es
// prefijo del pathname. Se usa para Sidebar (resaltar), SubSidebar (decidir
// qué submenú mostrar) y Breadcrumb (primer nivel).
export function encontrarModuloActivo(pathname) {
  return MODULOS.find((m) => esRutaActiva(pathname, m.path));
}

// Item de submenú activo dentro de un módulo — segundo nivel del breadcrumb.
export function encontrarSubitemActivo(pathname, modulo) {
  if (!modulo?.submenu) return null;
  return modulo.submenu.find((item) => esRutaActiva(pathname, item.path)) ?? null;
}
