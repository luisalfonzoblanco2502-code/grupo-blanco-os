// Generación de PDF 100% client-side (jsPDF) — no hay backend propio para
// esto todavía. El PDF se descarga al dispositivo del cliente como
// "BORRADOR DE PRODUCCIÓN"; no queda guardado en ningún servidor (eso
// requeriría subirlo a Supabase Storage desde el backend y asociarlo a la
// SolicitudPedido — trabajo de otro sprint, fuera de catalogo/).
//
// Los navegadores no permiten adjuntar un archivo a un mensaje de WhatsApp
// abierto por URL (wa.me) — es una restricción de seguridad del navegador,
// no algo que dependa de cómo esté armado este código. Por eso el flujo
// real es: 1) descargar el PDF, 2) abrir WhatsApp con el número de orden
// ya incluido en el texto, para que el cliente adjunte el PDF a mano en la
// conversación (un toque: clip → Documento → el que se acaba de descargar).
import { jsPDF } from "jspdf";

// Descarga la imagen y la convierte a data URL para poder incrustarla en el
// PDF (jsPDF no puede referenciar URLs remotas directamente). Si falla por
// lo que sea (CORS, red, imagen inexistente) se resuelve a null y el PDF
// sigue generándose sin esa miniatura — nunca bloquea el documento entero.
async function imagenComoDataUrl(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const ANCHO_PAGINA = 210;
const MARGEN = 15;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

export async function generarPdfPedido({ cliente, lineas, resumenCategorias, total, numeroOrden }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEN;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 17, 17);
  doc.text("PANAPRICE", MARGEN, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(91, 100, 114);
  doc.text("Fábrica de personalización textil", MARGEN, y + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 70, 255);
  doc.text("BORRADOR DE PRODUCCIÓN", ANCHO_PAGINA - MARGEN, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(91, 100, 114);
  doc.text(`N.º de orden: ${numeroOrden}`, ANCHO_PAGINA - MARGEN, y + 5, { align: "right" });
  doc.text(`Fecha: ${new Date().toLocaleString("es-VE")}`, ANCHO_PAGINA - MARGEN, y + 10, { align: "right" });

  y += 18;
  doc.setDrawColor(228, 231, 236);
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y);
  y += 8;

  // Cliente
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(17, 17, 17);
  doc.text("Cliente", MARGEN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Nombre: ${cliente.nombre || "-"}`, MARGEN, y);
  y += 5;
  doc.text(`WhatsApp: ${cliente.telefono || "-"}`, MARGEN, y);
  y += 5;
  doc.text(`Ciudad / zona de entrega: ${cliente.ubicacion || "-"}`, MARGEN, y);
  y += 9;

  // Tabla de productos
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Productos", MARGEN, y);
  y += 6;

  const colImg = MARGEN;
  const colNombre = MARGEN + 20;
  const colCant = 145;
  const colPrecio = 160;
  const colSub = 180;

  doc.setFontSize(7.5);
  doc.setTextColor(91, 100, 114);
  doc.text("CANT.", colCant, y);
  doc.text("PRECIO", colPrecio, y);
  doc.text("SUBTOTAL", colSub, y);
  y += 3;
  doc.setDrawColor(228, 231, 236);
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y);
  y += 5;

  for (const linea of lineas) {
    const alturaFila = linea.disenoNotas ? 20 : 16;
    if (y + alturaFila > 275) {
      doc.addPage();
      y = MARGEN;
    }

    const dataUrl = linea.producto.imagenUrl ? await imagenComoDataUrl(linea.producto.imagenUrl) : null;
    if (dataUrl) {
      try {
        doc.addImage(dataUrl, colImg, y - 3, 15, 15);
      } catch {
        // Formato de imagen no soportado por jsPDF: se omite la miniatura,
        // el resto de la fila se genera igual.
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    doc.text(linea.producto.nombre, colNombre, y, { maxWidth: 100 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(91, 100, 114);
    doc.text(`Ref. ${linea.producto.codigo}`, colNombre, y + 4);
    if (linea.disenoNotas) {
      doc.text(`Notas: ${linea.disenoNotas}`, colNombre, y + 8, { maxWidth: 100 });
    }

    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    doc.text(String(linea.cantidad), colCant, y);
    doc.text(`$${linea.unitario.toFixed(2)}`, colPrecio, y);
    doc.setFont("helvetica", "bold");
    doc.text(`$${linea.subtotal.toFixed(2)}`, colSub, y);

    y += alturaFila;
  }

  y += 2;
  doc.setDrawColor(228, 231, 236);
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y);
  y += 7;

  // Resumen por categoría (tarifa acumulada aplicada)
  for (const r of resumenCategorias) {
    if (y > 270) {
      doc.addPage();
      y = MARGEN;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    doc.text(`Resumen ${r.categoria}`, MARGEN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(91, 100, 114);
    doc.text(
      `Total ${r.categoria.toLowerCase()}: ${r.cantidad} u. · Tarifa aplicada: desde ${r.escalon.cantidadMinima} u. · ` +
        `Precio unitario: $${r.escalon.precioUnitario.toFixed(2)} · Subtotal: $${r.subtotal.toFixed(2)}`,
      MARGEN,
      y,
      { maxWidth: ANCHO_UTIL }
    );
    y += 8;
  }

  // Total general
  if (y > 260) {
    doc.addPage();
    y = MARGEN;
  }
  doc.setDrawColor(17, 17, 17);
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(17, 17, 17);
  doc.text(`TOTAL ESTIMADO: $${total.toFixed(2)}`, ANCHO_PAGINA - MARGEN, y, { align: "right" });

  // Pie
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Documento generado automáticamente por el catálogo público de Panaprice — precio y disponibilidad sujetos a confirmación por WhatsApp.",
    MARGEN,
    290,
    { maxWidth: ANCHO_UTIL }
  );

  const nombreArchivo = `BORRADOR-DE-PRODUCCION-${numeroOrden}.pdf`;
  doc.save(nombreArchivo);
  return nombreArchivo;
}
