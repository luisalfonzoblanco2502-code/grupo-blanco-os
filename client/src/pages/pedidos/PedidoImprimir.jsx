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
          {pedido.ordenesProduccion.length === 0 && (
            <p>Este pedido no tiene órdenes de producción todavía.</p>
          )}
          {pedido.ordenesProduccion.map((orden) => {
            // "Una sola OP por Pedido" (2026-08-02): lo normal es que haya
            // UNA orden con todos los productos del pedido adentro — el
            // detalle real de cada producto vive en pedido.lineas (nunca en
            // orden.producto, que acá es solo un resumen tipo "13 productos").
            // Se sigue iterando ordenesProduccion (no asumir longitud 1) por
            // el único caso real que separa en más de una: responsables
            // distintos por línea (ver claveDeGrupo, ordenesProduccion.service.js).
            const lineasDeEstaOrden = (pedido.lineas || []).filter((l) => l.ordenProduccionId === orden.id);
            return (
              <div key={orden.id} style={{ marginBottom: "1.25rem", pageBreakInside: "avoid" }}>
                <div className="op-grid" style={{ marginBottom: "0.5rem" }}>
                  <div className="op-campo">
                    <span className="op-campo-label">Orden de Producción</span>
                    <span className="op-campo-valor">{orden.opId}</span>
                  </div>
                  <div className="op-campo">
                    <span className="op-campo-label">Etapa</span>
                    <span className="op-campo-valor">
                      <Badge>{orden.etapa.nombre}</Badge>
                    </span>
                  </div>
                  <div className="op-campo">
                    <span className="op-campo-label">Prioridad</span>
                    <span className="op-campo-valor">
                      <Badge>{orden.prioridad.nombre}</Badge>
                    </span>
                  </div>
                  <div className="op-campo">
                    <span className="op-campo-label">Responsable</span>
                    <span className="op-campo-valor">{orden.responsableUsuario?.nombre ?? orden.responsableExterno ?? "—"}</span>
                  </div>
                </div>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Imagen</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lineasDeEstaOrden.length > 0 ? lineasDeEstaOrden : [null]).map((linea, i) =>
                      linea ? (
                        <tr key={linea.id} style={{ pageBreakInside: "avoid" }}>
                          <td>
                            <ImagenProducto linea={linea} />
                          </td>
                          <td>{linea.producto}</td>
                          <td>{linea.cantidad}</td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td colSpan={3}>{orden.producto}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
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

// Miniatura por producto (Cambio 3, 2026-08-02): foto de referencia del
// catálogo (o del personalizado) si existe; si no, la foto que subió el
// cliente para un producto personalizado (archivosAdjuntos, principal
// primero). Sin ninguna de las dos, un placeholder vacío del mismo tamaño
// para que la tabla no se descuadre.
function ImagenProducto({ linea }) {
  const principal = linea.archivosAdjuntos?.find((a) => a.esPrincipal);
  const url = linea.imagenReferenciaProduccionUrl || principal?.ubicacion || linea.archivosAdjuntos?.[0]?.ubicacion;
  if (!url) {
    return <div style={{ width: "40px", height: "40px", borderRadius: "6px", background: "var(--surface-sunken)" }} />;
  }
  return (
    <img
      src={url}
      alt=""
      style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "6px" }}
    />
  );
}
