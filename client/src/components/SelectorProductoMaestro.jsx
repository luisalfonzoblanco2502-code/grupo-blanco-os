import { forwardRef, useMemo, useState } from "react";

// Buscador de Producto Maestro — dropdown filtrado en vivo, NUNCA un modal
// (Paso 5, corrección 4). Filtra en memoria sobre la lista de productos ya
// traída una vez (api.getProductos()) — sin llamada al backend por letra
// tipeada, "debe ser rápido" se resuelve así, no con un endpoint de búsqueda.
export const SelectorProductoMaestro = forwardRef(function SelectorProductoMaestro(
  { productos, onSeleccionar },
  ref
) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);

  const resultados = useMemo(() => {
    const texto = query.trim().toLowerCase();
    const base = !texto
      ? productos
      : productos.filter(
          (p) => p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto)
        );
    return base.slice(0, 8);
  }, [productos, query]);

  function elegir(producto) {
    onSeleccionar(producto);
    setQuery("");
    setAbierto(false);
    setIndiceActivo(0);
  }

  function manejarTeclado(e) {
    if (!abierto && (e.key === "ArrowDown" || e.key === "Enter")) {
      setAbierto(true);
      return;
    }
    if (!abierto) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceActivo((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (resultados[indiceActivo]) elegir(resultados[indiceActivo]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  return (
    <div className="selector-producto-maestro">
      <input
        ref={ref}
        type="text"
        placeholder="Buscar producto por nombre o código..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setAbierto(true);
          setIndiceActivo(0);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={manejarTeclado}
        aria-label="Buscar producto"
        autoComplete="off"
      />
      {abierto && resultados.length > 0 && (
        <ul className="selector-producto-maestro-dropdown" role="listbox">
          {resultados.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === indiceActivo}
              className={i === indiceActivo ? "activo" : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(p)}
              onMouseEnter={() => setIndiceActivo(i)}
            >
              {p.imagenReferenciaProduccionUrl || p.imagenUrl ? (
                <img src={p.imagenReferenciaProduccionUrl || p.imagenUrl} alt="" />
              ) : (
                <span className="selector-producto-maestro-sinimagen" aria-hidden="true" />
              )}
              <span className="selector-producto-maestro-nombre">{p.nombre}</span>
              {p.requierePersonalizacion && (
                <span className="selector-producto-maestro-personalizable" title="Requiere foto del cliente">
                  📌 PERSONALIZABLE
                </span>
              )}
              <span className="selector-producto-maestro-codigo">{p.codigo}</span>
            </li>
          ))}
        </ul>
      )}
      {abierto && query.trim() && resultados.length === 0 && (
        <ul className="selector-producto-maestro-dropdown">
          <li className="selector-producto-maestro-vacio">Sin resultados para "{query}"</li>
        </ul>
      )}
    </div>
  );
});
