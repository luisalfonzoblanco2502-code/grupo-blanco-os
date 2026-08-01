import { Link, useLocation } from "react-router-dom";
import { encontrarModuloActivo, encontrarSubitemActivo } from "../nav/activo";

// Breadcrumb derivado puramente del registro de módulos — no sabe nada de
// rutas de detalle (ej. el pedId de un pedido puntual); esas páginas ya
// muestran su propio <h1> con el identificador, así que no hace falta
// repetirlo acá. Si en el futuro hace falta un tercer nivel dinámico, el
// lugar natural es agregar un contexto que las páginas de detalle alimenten.
export function Breadcrumb() {
  const { pathname } = useLocation();
  const modulo = encontrarModuloActivo(pathname);
  if (!modulo) return null;

  const subitem = encontrarSubitemActivo(pathname, modulo);

  return (
    <div className="breadcrumb">
      <Link to={modulo.path}>{modulo.label}</Link>
      {subitem && subitem.path !== modulo.path && (
        <>
          <span className="breadcrumb-separador">/</span>
          <span>{subitem.label}</span>
        </>
      )}
    </div>
  );
}
