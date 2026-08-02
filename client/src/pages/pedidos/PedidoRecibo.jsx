import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../../api/client";

// Recibo del Pedido (Paso 3) — a diferencia de PedidoImprimir (que lista
// las Órdenes de Producción, solo existen tras facturar), este documento
// sirve DESDE el momento de crear el pedido: cliente, entrega, ítems con
// su foto de referencia y la del personalizado, y el estado de pago.
// "Descargar PDF" es el print-to-PDF del navegador (mismo patrón que ya
// usa PedidoImprimir) — sin librería de generación de PDF nueva.
const METODOS_PAGO = ["Pago Móvil", "Zelle", "Transferencia", "Efectivo"];

const ETIQUETA_ENTREGA = {
  ENCOMIENDA: "Encomienda",
  RETIRO: "Retiro en tienda",
  DELIVERY: "Delivery",
};

export function PedidoRecibo() {
  const { id } = useParams();
  const [pedido, setPedido] = useState(null);
  const [qrUrl, setQrUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getPedido(id).then(setPedido).catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!pedido) return;
    QRCode.toDataURL(`${window.location.origin}/pedidos/${pedido.id}`, { margin: 1, width: 120 })
      .then(setQrUrl)
      .catch(() => {});
  }, [pedido]);

  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!pedido) return <p>Cargando...</p>;

  const subtotal = pedido.lineas.reduce((s, l) => s + Number(l.subtotal || 0), 0);

  return (
    <div>
      <div className="no-imprimir" style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <Link to={`/pedidos/${id}`}>&larr; Volver al pedido</Link>
        <button className="btn-primary" onClick={() => window.print()}>
          Descargar PDF
        </button>
      </div>

      <div className="hoja-impresion">
        <header className="op-encabezado">
          <div className="op-marca">
            <span className="op-marca-icono">PP</span>
            <div>
              <div style={{ fontWeight: 800 }}>PanaPrice</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>PEDIDO DE ORDEN DE PRODUCCIÓN</div>
            </div>
          </div>
          <h1 style={{ margin: "0.5rem 0" }}>{pedido.pedId}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Fecha de creación: {new Date(pedido.creadoEn).toLocaleDateString()}
          </p>
        </header>

        <section>
          <h2>Datos del cliente</h2>
          <div className="op-grid">
            <div className="op-campo">
              <span className="op-campo-label">Nombre</span>
              <span className="op-campo-valor">{pedido.clienteNombre}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Cédula</span>
              <span className="op-campo-valor">{pedido.cliente?.cedula ?? "—"}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Teléfono</span>
              <span className="op-campo-valor">{pedido.cliente?.telefono ?? "—"}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Email</span>
              <span className="op-campo-valor">{pedido.cliente?.email ?? "—"}</span>
            </div>
            <div className="op-campo" style={{ gridColumn: "1 / -1" }}>
              <span className="op-campo-label">Dirección</span>
              <span className="op-campo-valor">{pedido.cliente?.direccion ?? "—"}</span>
            </div>
          </div>
        </section>

        <section>
          <h2>Entrega</h2>
          <div className="op-grid">
            <div className="op-campo">
              <span className="op-campo-label">Tipo</span>
              <span className="op-campo-valor">{ETIQUETA_ENTREGA[pedido.tipoEntrega] ?? "Sin definir"}</span>
            </div>
            {pedido.tipoEntrega === "ENCOMIENDA" && (
              <div className="op-campo">
                <span className="op-campo-label">Empresa</span>
                <span className="op-campo-valor">{pedido.direccionAgencia || "—"}</span>
              </div>
            )}
            <div className="op-campo">
              <span className="op-campo-label">Fecha de compromiso</span>
              <span className="op-campo-valor">{new Date(pedido.fechaCompromiso).toLocaleDateString()}</span>
            </div>
          </div>
        </section>

        <section>
          <h2>Ítems</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Item</th>
                <th>Foto personal.</th>
                <th>Tela</th>
                <th>Cantidad</th>
                <th>Precio unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pedido.lineas.map((l) => {
                const fotoPersonal = l.archivosAdjuntos?.[0];
                return (
                  <tr key={l.id} style={{ pageBreakInside: "avoid" }}>
                    <td style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {l.imagenReferenciaProduccionUrl && (
                        <img
                          src={l.imagenReferenciaProduccionUrl}
                          alt=""
                          style={{ width: "1.8rem", height: "1.8rem", objectFit: "cover", borderRadius: "4px" }}
                        />
                      )}
                      {l.producto}
                    </td>
                    <td>
                      {fotoPersonal ? (
                        <img
                          src={fotoPersonal.ubicacion}
                          alt=""
                          style={{ width: "1.8rem", height: "1.8rem", objectFit: "cover", borderRadius: "4px" }}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{l.tela || "—"}</td>
                    <td>{l.cantidad}</td>
                    <td>{l.precioUnitario != null ? Number(l.precioUnitario).toFixed(2) : "—"}</td>
                    <td>{l.subtotal != null ? Number(l.subtotal).toFixed(2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="op-grid" style={{ alignItems: "start" }}>
          <div>
            <h2>Resumen financiero</h2>
            <p>
              <strong>Subtotal:</strong> {subtotal.toFixed(2)}
            </p>
            <p>
              <strong>Total:</strong> {subtotal.toFixed(2)}
            </p>
            <p>
              <strong>Estado:</strong> PENDIENTE DE PAGO
            </p>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Métodos de pago aceptados: {METODOS_PAGO.join(", ")}
            </p>
            {pedido.observaciones && (
              <p>
                <strong>Observaciones:</strong> {pedido.observaciones}
              </p>
            )}
          </div>
          {qrUrl && (
            <div style={{ textAlign: "center" }}>
              <img src={qrUrl} alt={`Código QR del pedido ${pedido.pedId}`} width={120} height={120} />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{pedido.pedId}</p>
            </div>
          )}
        </section>

        <footer className="op-pie">
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Impreso el {new Date().toLocaleString()}
          </p>
        </footer>
      </div>
    </div>
  );
}
