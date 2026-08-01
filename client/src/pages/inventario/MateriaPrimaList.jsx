import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../components/ToastContext";

const ITEM_VACIO = { codigo: "", nombre: "", categoria: "", unidadMedida: "unidad", stockMinimo: 0, costoUnitario: 0 };

// Catálogo Interno de Productos, mitad "materia prima". CRUD mínimo: crear
// ítems y cargarles stock real vía "Registrar entrada" (todo movimiento
// queda en el ledger — no se edita existencia a mano).
export function MateriaPrimaList() {
  const { mostrarToast } = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [nuevo, setNuevo] = useState({ ...ITEM_VACIO });
  const [entradas, setEntradas] = useState({});
  const [enviando, setEnviando] = useState(false);

  function cargar() {
    return api.getItemsInventario().then(setItems).catch((err) => setError(err.message));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleCrear(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.crearItemInventario({
        ...nuevo,
        stockMinimo: Number(nuevo.stockMinimo) || 0,
        costoUnitario: Number(nuevo.costoUnitario) || 0,
      });
      mostrarToast(`Ítem "${nuevo.nombre}" creado`);
      setNuevo({ ...ITEM_VACIO });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function handleEntrada(itemId, nombre) {
    const cantidad = Number(entradas[itemId]);
    if (!(cantidad > 0)) return;
    try {
      await api.registrarEntradaInventario(itemId, { cantidad });
      mostrarToast(`Entrada registrada para "${nombre}"`);
      setEntradas((prev) => ({ ...prev, [itemId]: "" }));
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!items) return <p>Cargando...</p>;

  return (
    <div>
      <h1>Materia Prima</h1>

      <table className="tabla">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Unidad</th>
            <th>Existencia</th>
            <th>Reservado</th>
            <th>Disponible</th>
            <th>Mínimo</th>
            <th>Costo unit.</th>
            <th>Registrar entrada</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const disponible = Number(item.existencia) - Number(item.existenciaReservada);
            return (
              <tr key={item.id}>
                <td>{item.codigo}</td>
                <td>{item.nombre}</td>
                <td>{item.unidadMedida}</td>
                <td>{item.existencia}</td>
                <td>{item.existenciaReservada}</td>
                <td style={{ color: disponible < 0 ? "#f87171" : disponible < item.stockMinimo ? "#d97706" : undefined }}>
                  {disponible}
                </td>
                <td>{item.stockMinimo}</td>
                <td>{item.costoUnitario}</td>
                <td>
                  <div className="item-row" style={{ marginBottom: 0 }}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      style={{ width: "6rem" }}
                      value={entradas[item.id] ?? ""}
                      onChange={(e) => setEntradas((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                    <button type="button" onClick={() => handleEntrada(item.id, item.nombre)}>
                      + Entrada
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={9}>Sin ítems todavía.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Nuevo ítem</h2>
      <form onSubmit={handleCrear} className="form" style={{ maxWidth: "28rem" }}>
        <div className="item-row">
          <input
            type="text"
            placeholder="Código"
            value={nuevo.codigo}
            onChange={(e) => setNuevo((p) => ({ ...p, codigo: e.target.value }))}
            required
          />
          <input
            type="text"
            placeholder="Nombre"
            value={nuevo.nombre}
            onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
            required
          />
        </div>
        <div className="item-row">
          <input
            type="text"
            placeholder="Categoría (opcional)"
            value={nuevo.categoria}
            onChange={(e) => setNuevo((p) => ({ ...p, categoria: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Unidad de medida"
            value={nuevo.unidadMedida}
            onChange={(e) => setNuevo((p) => ({ ...p, unidadMedida: e.target.value }))}
          />
        </div>
        <div className="item-row">
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Stock mínimo"
            value={nuevo.stockMinimo}
            onChange={(e) => setNuevo((p) => ({ ...p, stockMinimo: e.target.value }))}
          />
          <input
            type="number"
            min={0}
            step="0.0001"
            placeholder="Costo unitario"
            value={nuevo.costoUnitario}
            onChange={(e) => setNuevo((p) => ({ ...p, costoUnitario: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? "Creando..." : "Crear ítem"}
        </button>
      </form>
    </div>
  );
}
