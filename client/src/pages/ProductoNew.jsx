import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ImagenProductoUpload } from "../components/ImagenProductoUpload";

const ESCALON_VACIO = { cantidadMinima: "", precioUnitario: "" };
const CATEGORIAS = ["Pañoletas", "Pareos", "T-shirts", "Jerseys", "Otra"];

export function ProductoNew() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [descripcion, setDescripcion] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [precioBase, setPrecioBase] = useState("");
  const [publicadoCatalogo, setPublicadoCatalogo] = useState(true);
  const [disponible, setDisponible] = useState(true);
  const [escalones, setEscalones] = useState([{ ...ESCALON_VACIO }]);
  const [productoInternoId, setProductoInternoId] = useState("");
  const [productosInternos, setProductosInternos] = useState([]);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.getProductosInternos().then(setProductosInternos).catch(() => {});
  }, []);

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
        codigo,
        nombre,
        categoria,
        descripcion: descripcion || undefined,
        imagenUrl: imagenUrl || undefined,
        precioBase: Number(precioBase),
        publicadoCatalogo,
        disponible,
        preciosVolumen,
        productoInternoId: productoInternoId || undefined,
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
          Código (ej. PAN-001)
          <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        </label>
        <label>
          Nombre
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Categoría
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Descripción (opcional)
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
        </label>
        <label>
          Imagen
          <ImagenProductoUpload empresaId={perfil.empresa.id} imagenUrl={imagenUrl} onChange={setImagenUrl} />
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
          Visible en catálogo público
        </label>
        <label>
          <input type="checkbox" checked={disponible} onChange={(e) => setDisponible(e.target.checked)} />{" "}
          Disponible (desmarcar si está agotado)
        </label>
        <label>
          Producto interno vinculado (opcional)
          <select value={productoInternoId} onChange={(e) => setProductoInternoId(e.target.value)}>
            <option value="">— Sin vincular —</option>
            {productosInternos.map((pi) => (
              <option key={pi.id} value={pi.id}>
                {pi.codigo} — {pi.nombre}
              </option>
            ))}
          </select>
        </label>
        <p className="card-label" style={{ marginTop: "-0.5rem" }}>
          Solo necesario si este producto debe reservar/consumir inventario real al facturarse. Sin vincular, se
          vende exactamente igual que hoy.
        </p>

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
          {enviando ? "Guardando..." : "Guardar y publicar"}
        </button>
      </form>
    </div>
  );
}
