import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../../api/client";
import { SituacionBadge } from "../../components/SituacionBadge";
import { formatoTamano, iconoArchivo } from "../../utils/storage";

const ESTADO_ETAPA = {
  completada: "Completada",
  enCurso: "En curso",
};

function Campo({ label, valor }) {
  return (
    <div className="op-campo">
      <span className="op-campo-label">{label}</span>
      <span className="op-campo-valor">{valor ?? "—"}</span>
    </div>
  );
}

// Orden de Producción digital e imprimible. Prioridad: HTML + @media print
// estable hoy, no un generador de PDF nuevo — ver index.css para las reglas
// de impresión (oculta sidebar/topbar, formato A4, evita cortar filas).
// Campos técnicos (tela, color, forro, tiras, insumos, talla, imagen) son un
// snapshot copiado de la línea al facturar — si la línea no los tenía,
// muestran "—" a propósito, nunca un dato inventado.
export function OrdenProduccionImprimir() {
  const { id } = useParams();
  const [orden, setOrden] = useState(null);
  const [error, setError] = useState(null);
  const [qr, setQr] = useState(null);

  useEffect(() => {
    api.getOrdenProduccion(id).then(setOrden).catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!orden) return;
    const url = `${window.location.origin}/produccion/ordenes/${orden.id}`;
    QRCode.toDataURL(url, { margin: 1, width: 120 }).then(setQr).catch(() => {});
  }, [orden]);

  if (error) return <p style={{ color: "#f87171" }}>{error}</p>;
  if (!orden) return <p>Cargando...</p>;

  // Camino de lectura real ("OP agrupada por lote", 2026-07-29): cada
  // variante es una PedidoLinea con su propia imagen/talla/medida/color. Si
  // la orden no tiene ninguna vinculada (nació antes de la migración), se
  // cae al snapshot legacy singular de la propia OrdenProduccion.
  const variantes = orden.variantes ?? [];
  const imagenPrincipal = orden.archivosAdjuntos?.find((a) => a.esPrincipal);
  const otrosArchivos = orden.archivosAdjuntos?.filter((a) => !a.esPrincipal) ?? [];

  return (
    <div>
      <div className="no-imprimir" style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
        <Link to={`/produccion/ordenes/${id}`}>&larr; Volver a la orden</Link>
        <button className="btn-primary" onClick={() => window.print()}>
          Imprimir OP
        </button>
      </div>

      <div className="hoja-impresion">
        <header className="op-encabezado">
          <div className="op-marca">
            <span className="op-marca-icono">GB</span>
            <div>
              <div style={{ fontWeight: 800 }}>Grupo Blanco OS</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{orden.empresa?.nombre}</div>
            </div>
          </div>
          <h1 style={{ margin: "0.5rem 0" }}>ORDEN DE PRODUCCIÓN</h1>
          <div className="op-grid">
            <Campo label="N.° de OP" valor={orden.opId} />
            <Campo label="N.° de pedido" valor={orden.pedido.pedId} />
            <Campo label="Fecha de creación" valor={new Date(orden.creadoEn).toLocaleDateString()} />
            <Campo label="Fecha de compromiso" valor={new Date(orden.pedido.fechaCompromiso).toLocaleDateString()} />
            <Campo label="Prioridad" valor={orden.prioridad?.nombre} />
            <Campo label="Cantidad de variantes" valor={variantes.length || 1} />
            <div className="op-campo">
              <span className="op-campo-label">Situación</span>
              <SituacionBadge situacion={orden.situacion} />
            </div>
          </div>
          {qr && (
            <div className="op-qr no-imprimir-mover">
              <img src={qr} alt="QR de la orden" width={100} height={100} />
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Escanear para ver en línea</span>
            </div>
          )}
        </header>

        <section>
          <h2>Cliente</h2>
          <div className="op-grid">
            <Campo label="Nombre" valor={orden.pedido.clienteNombre} />
            <Campo label="Teléfono" valor={orden.pedido.cliente?.telefono} />
            <Campo label="Vendedor" valor={orden.pedido.creadoPor?.nombre} />
            <Campo label="Tipo de entrega" valor={orden.pedido.tipoEntrega} />
            <Campo label="Dirección / agencia" valor={orden.pedido.direccionAgencia} />
          </div>
          {orden.pedido.observaciones && (
            <p>
              <strong>Observaciones:</strong> {orden.pedido.observaciones}
            </p>
          )}
        </section>

        <section className="op-seccion-producto">
          <h2>Producto</h2>
          <div className="op-grid">
            <Campo label="Referencia / nombre" valor={orden.producto} />
            <Campo label="Cantidad total" valor={orden.cantidad} />
            <Campo label="Tela / material" valor={orden.tela} />
            <Campo label="Tipo de impresión" valor={orden.tipoImpresion ?? orden.tipoTrabajo} />
            <Campo label="Forro" valor={orden.forro} />
            <Campo label="Tiras" valor={orden.tiras} />
            <Campo label="Insumos" valor={orden.insumos} />
          </div>
          {orden.observaciones && (
            <p>
              <strong>Observaciones:</strong> {orden.observaciones}
            </p>
          )}

          {variantes.length > 0 ? (
            <div className="op-variantes-impresion">
              {variantes.map((v) => {
                const archivoPrincipal = v.archivosAdjuntos?.find((a) => a.esPrincipal);
                const adjuntos = v.archivosAdjuntos?.filter((a) => !a.esPrincipal) ?? [];
                // Catálogo regular: la foto real vive en imagenReferenciaProduccionUrl
                // (snapshot del Producto Maestro al facturar). Personalizado: vive
                // en archivosAdjuntos (la foto que subió el cliente). Nunca las
                // dos a la vez en la práctica — se prueban en ese orden.
                const imagenMostrar = v.imagenReferenciaProduccionUrl || archivoPrincipal?.ubicacion;
                return (
                  <div className="op-variante-impresion" key={v.id} style={{ pageBreakInside: "avoid" }}>
                    <div className="op-variante-impresion-imagen">
                      {imagenMostrar ? (
                        <img src={imagenMostrar} alt="Arte aprobado" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Sin imagen —</span>
                      )}
                    </div>
                    <div className="op-variante-impresion-datos">
                      <strong>{v.producto}</strong>
                      <div className="op-grid">
                        <Campo label="Cantidad" valor={v.cantidad} />
                        <Campo label="Talla" valor={v.talla} />
                        <Campo label="Medidas" valor={v.medidas} />
                        <Campo label="Color" valor={v.color} />
                      </div>
                      {v.descripcion && (
                        <p style={{ margin: "0.3rem 0 0" }}>
                          <strong>Descripción:</strong> {v.descripcion}
                        </p>
                      )}
                      {v.observacionesProduccion && (
                        <p style={{ margin: "0.3rem 0 0" }}>
                          <strong>Obs. técnicas:</strong> {v.observacionesProduccion}
                        </p>
                      )}
                      {adjuntos.length > 0 && (
                        <div className="archivo-lista no-imprimir-mover" style={{ marginTop: "0.4rem" }}>
                          {adjuntos.map((a) => (
                            <div className="archivo-item" key={a.id}>
                              <span className="archivo-icono">{iconoArchivo(a.nombre, a.tipo)}</span>
                              <a href={a.ubicacion} target="_blank" rel="noreferrer" className="archivo-nombre">
                                {a.nombre}
                              </a>
                              <span className="archivo-tamano">{formatoTamano(a.tamano)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* Fallback legacy: OP creadas antes de la agrupación por lote, sin ninguna PedidoLinea vinculada. */}
              <div className="op-grid">
                <Campo label="Talla" valor={orden.talla} />
                <Campo label="Color" valor={orden.color} />
                <Campo label="Medidas" valor={orden.medida} />
              </div>
              {orden.descripcion && (
                <p>
                  <strong>Descripción:</strong> {orden.descripcion}
                </p>
              )}
              <div className="op-imagen">
                {imagenPrincipal ? (
                  <div style={{ width: "12rem", height: "12rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img
                      src={imagenPrincipal.ubicacion}
                      alt="Arte aprobado"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  </div>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>Sin imagen de arte adjunta —</span>
                )}
              </div>
              {otrosArchivos.length > 0 && (
                <div className="no-imprimir-mover" style={{ marginTop: "0.75rem" }}>
                  <strong style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
                    Archivos adjuntos
                  </strong>
                  <div className="archivo-lista" style={{ marginTop: "0.4rem" }}>
                    {otrosArchivos.map((a) => (
                      <div className="archivo-item" key={a.id}>
                        <span className="archivo-icono">{iconoArchivo(a.nombre, a.tipo)}</span>
                        <a href={a.ubicacion} target="_blank" rel="noreferrer" className="archivo-nombre">
                          {a.nombre}
                        </a>
                        <span className="archivo-tamano">{formatoTamano(a.tamano)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section style={{ pageBreakInside: "avoid" }}>
          <h2>Producción</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Responsable</th>
                <th>Estado</th>
                <th>Inicio</th>
                <th>Fin</th>
              </tr>
            </thead>
            <tbody>
              {orden.tiemposPorEtapa.map((t, i) => (
                <tr key={i} style={{ pageBreakInside: "avoid" }}>
                  <td>{t.etapa}</td>
                  <td>{t.responsable ?? "—"}</td>
                  <td>{t.hasta ? ESTADO_ETAPA.completada : ESTADO_ETAPA.enCurso}</td>
                  <td>{new Date(t.desde).toLocaleString()}</td>
                  <td>{t.hasta ? new Date(t.hasta).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="op-pie">
          <div className="op-grid">
            <Campo label="Control de calidad" valor={null} />
            <Campo label="Despacho" valor={null} />
            <Campo label="Responsable de revisión" valor={null} />
          </div>
          <div className="op-firma">
            <span>Firma de entrega: _______________________________</span>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
            Impreso el {new Date().toLocaleString()}
          </p>
        </footer>
      </div>
    </div>
  );
}
