import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const ESCALON_VACIO = { cantidadMinima: "", precioUnitario: "" };

export function ProductoNew() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [publicadoCatalogo, setPublicadoCatalogo] = useState(false);
  const [escalones, setEscalones] = useState([{ ...ESCALON_VACIO }]);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  function actualizarEscalon(index, cambios) {
    setEscalones((prev) => prev.map((e, i) => (i === index ? { ...e, ...cambios } : e)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const preciosVolumen = escalones
        .filter((esc) => esc.cantidadMinima && esc.precioUnitario)
        .map((esc) => ({
          cantidadMinima: Number(esc.cantidadMinima),
          precioUnitario: Number(esc.precioUnitario),
        }));

      const producto = await api.createProducto({
        nombre,
        categoria,
        descripcion: descripcion || undefined,
        imagenUrl: imagenUrl || undefined,
        precioBase: Number(precioBase),
        publicadoCatalogo,
        preciosVolumen,
      });
      navigate(`/productos`, { state: { creado: producto.id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h1>Nuevo producto</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Nombre
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Categoría (ej. pañoleta, pareo)
          <input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} required />
        </label>
        <label>
          Descripción (opcional)
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
        </label>
        <label>
          URL de imagen (opcional)
          <input type="text" value={imagenUrl} onChange={(e) => setImagenUrl(e.target.value)} />
        </label>
        <label>
          Precio base
          <input
            type="number"
            min={0}
            step="0.01"
            value={precioBase}
            onChange={(e) => setPrecioBase(e.target.value)}
            required
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={publicadoCatalogo}
            onChange={(e) => setPublicadoCatalogo(e.target.checked)}
          />{" "}
          Publicar en catálogo público
        </label>

        <fieldset>
          <legend>Precios por volumen (opcional)</legend>
          {escalones.map((esc, index) => (
            <div className="item-row" key={index}>
              <input
                type="number"
                min={1}
                placeholder="Cantidad mínima"
                value={esc.cantidadMinima}
                onChange={(e) => actualizarEscalon(index, { cantidadMinima: e.target.value })}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="Precio unitario"
                value={esc.precioUnitario}
                onChange={(e) => actualizarEscalon(index, { precioUnitario: e.target.value })}
              />
            </div>
          ))}
          <button type="button" onClick={() => setEscalones((prev) => [...prev, { ...ESCALON_VACIO }])}>
            + Agregar escalón
          </button>
        </fieldset>

        {error && <p style={{ color: "#f87171" }}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? "Guardando..." : "Crear producto"}
        </button>
      </form>
    </div>
  );
}
