import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../api/client";
import { Badge } from "../../components/Badge";

// "Imprimir pedido completo": documento consolidado con el encabezado
// comercial + una fila por Orden de Producción. El detalle completo por
// etapa/responsable de cada OP vive en su propia impresión
// (/produccion/ordenes/:id/imprimir) — acá es la vista de conjunto.
export function PedidoImprimir() {
  const { id } = useParams();
  const [pedido, setPedido] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getPedido(id).then(setPedido).catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!pedido) return <p>Cargando...</p>;

  return (
    <div>
      <div className="no-imprimir" style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <Link to={`/pedidos/${id}`}>&larr; Volver al pedido</Link>
        <button className="btn-primary" onClick={() => window.print()}>
          Imprimir pedido completo
        </button>
      </div>

      <div className="hoja-impresion">
        <header className="op-encabezado">
          <div className="op-marca">
            <span className="op-marca-icono">GB</span>
            <div>
              <div style={{ fontWeight: 800 }}>Grupo Blanco OS</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{pedido.empresa?.nombre}</div>
            </div>
          </div>
          <h1 style={{ margin: "0.5rem 0" }}>PEDIDO {pedido.pedId}</h1>
          <div className="op-grid">
            <div className="op-campo">
              <span className="op-campo-label">Cliente</span>
              <span className="op-campo-valor">{pedido.clienteNombre}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Vendedor</span>
              <span className="op-campo-valor">{pedido.creadoPor?.nombre ?? "—"}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Fecha de ingreso</span>
              <span className="op-campo-valor">{new Date(pedido.fechaIngreso).toLocaleDateString()}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Fecha de compromiso</span>
              <span className="op-campo-valor">{new Date(pedido.fechaCompromiso).toLocaleDateString()}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Cantidad total</span>
              <span className="op-campo-valor">{pedido.cantidadTotal}</span>
            </div>
            <div className="op-campo">
              <span className="op-campo-label">Estado</span>
              <span className="op-campo-valor">{pedido.estado}</span>
            </div>
          </div>
          {pedido.observaciones && (
            <p>
              <strong>Observaciones generales:</strong> {pedido.observaciones}
            </p>
          )}
        </header>

        <section>
          <h2>Órdenes de producción</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>OP</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Etapa</th>
                <th>Prioridad</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {pedido.ordenesProduccion.map((orden) => (
                <tr key={orden.id} style={{ pageBreakInside: "avoid" }}>
                  <td>{orden.opId}</td>
                  <td>{orden.producto}</td>
                  <td>{orden.cantidad}</td>
                  <td>
                    <Badge>{orden.etapa.nombre}</Badge>
                  </td>
                  <td>
                    <Badge>{orden.prioridad.nombre}</Badge>
                  </td>
                  <td>{orden.responsableUsuario?.nombre ?? orden.responsableExterno ?? "—"}</td>
                </tr>
              ))}
              {pedido.ordenesProduccion.length === 0 && (
                <tr>
                  <td colSpan={6}>Este pedido no tiene órdenes de producción todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
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
