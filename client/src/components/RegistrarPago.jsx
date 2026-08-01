import { useEffect, useState } from "react";
import { api } from "../api/client";

const formatoMonto = new Intl.NumberFormat("es", { style: "currency", currency: "USD" });

// "Facturar no equivale a cobrar": este es el paso explícito y separado
// para registrar un pago contra el saldo pendiente del documento de venta.
// Soporta pagos parciales de forma natural — no exige monto == saldo.
export function RegistrarPago({ documento, onPagoRegistrado }) {
  const [cajas, setCajas] = useState([]);
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState("EFECTIVO");
  const [cajaCuentaId, setCajaCuentaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getCajasCuentas().then((datos) => {
      setCajas(datos);
      if (datos.length > 0) setCajaCuentaId(datos[0].id);
    }).catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!confirm(`¿Registrar un pago de ${formatoMonto.format(Number(monto) || 0)}?`)) return;
    setError(null);
    setEnviando(true);
    try {
      await api.registrarPago(documento.pedidoId, { monto: Number(monto), metodoPago, cajaCuentaId, referencia });
      setMonto("");
      setReferencia("");
      onPagoRegistrado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h2>Documento de venta {documento.numero}</h2>
      <p>
        Total: {formatoMonto.format(Number(documento.total))} · Saldo pendiente:{" "}
        <strong>{formatoMonto.format(Number(documento.saldoPendiente))}</strong>
      </p>

      {documento.pagos.length > 0 && (
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Monto</th>
              <th>Método</th>
              <th>Referencia</th>
            </tr>
          </thead>
          <tbody>
            {documento.pagos.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.fecha).toLocaleString()}</td>
                <td>{formatoMonto.format(Number(p.monto))}</td>
                <td>{p.metodoPago}</td>
                <td>{p.referencia ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {Number(documento.saldoPendiente) > 0 && (
        <form onSubmit={handleSubmit} className="form" style={{ maxWidth: "24rem" }}>
          <div className="item-row">
            <input
              type="number"
              min={0.01}
              max={Number(documento.saldoPendiente)}
              step="0.01"
              placeholder="Monto"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              required
            />
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="PAGO_MOVIL">Pago móvil</option>
              <option value="ZELLE">Zelle</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
          <div className="item-row">
            <select value={cajaCuentaId} onChange={(e) => setCajaCuentaId(e.target.value)} required>
              <option value="">-- Caja/cuenta --</option>
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Referencia (opcional)"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>
          {error && <p style={{ color: "#f87171" }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? "Registrando..." : "Registrar pago"}
          </button>
        </form>
      )}
    </div>
  );
}
