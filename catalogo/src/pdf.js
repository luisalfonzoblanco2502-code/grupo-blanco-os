// Generación de la Orden Comercial Panaprice — PDF 100% client-side (jsPDF
// + qrcode) — no hay backend propio para esto todavía. El documento se
// descarga al dispositivo del cliente como "BORRADOR"; no queda guardado en
// ningún servidor (eso requeriría subirlo a Supabase Storage desde el
// backend y asociarlo a la SolicitudPedido — trabajo de otro sprint, fuera
// de catalogo/). Lo que SÍ queda guardado del lado del servidor es la fila
// de SolicitudPedido con su numeroOrden (ver api.js intentarCrearSolicitudEnERP),
// que es lo que "Rastrea tu pedido" consulta — el QR de este PDF apunta
// justamente a esa pantalla.
//
// Los navegadores no permiten adjuntar un archivo a un mensaje de WhatsApp
// abierto por URL (wa.me) — es una restricción de seguridad del navegador,
// no algo que dependa de cómo esté armado este código. Por eso el flujo
// real es: 1) descargar el PDF, 2) abrir WhatsApp con el número de orden
// ya incluido en el texto, para que el cliente adjunte el PDF a mano en la
// conversación (un toque: clip → Documento → el que se acaba de descargar).
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

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

// Archivo local (subido en "Personaliza tus diseños") -> data URL, sin red
// de por medio — mismo criterio de nunca bloquear el PDF si algo falla.
function archivoComoDataUrl(archivo) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(archivo);
  });
}

// Miniatura de una línea del carrito, sea de catálogo (fetch por URL) o un
// diseño personalizado (archivo ya en memoria, sin red) — centraliza la
// decisión para que el loop de la tabla no tenga que saber la diferencia.
async function miniaturaDeLinea(linea) {
  if (linea.tipo === "personalizado" && linea.archivoLocal) {
    return archivoComoDataUrl(linea.archivoLocal);
  }
  return linea.producto?.imagenUrl ? imagenComoDataUrl(linea.producto.imagenUrl) : null;
}

// Logo opcional: mismo criterio que LogoPanaprice en App.jsx — si
// catalogo/public/logo-panaprice.png existe, se usa; si no, el PDF cae a un
// wordmark de texto. Nunca bloquea el documento por esto.
async function logoComoDataUrl() {
  return imagenComoDataUrl("/logo-panaprice.png");
}

const ANCHO_PAGINA = 210;
const MARGEN = 15;
const ANCHO_UTIL = ANCHO_PAGINA - MARGEN * 2;

const ETIQUETA_TIPO_ENTREGA = { RETIRO: "Retiro en tienda", ENVIO: "Envío a domicilio" };

export async function generarPdfPedido({ cliente, lineas, resumenCategorias, total, numeroOrden, tipoEntrega }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGEN;

  // ------------------------------------------------------------------
  // Encabezado: logo + título + estado BORRADOR + orden/fecha
  // ------------------------------------------------------------------
  const logoDataUrl = await logoComoDataUrl();
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, MARGEN, y - 4, 22, 22);
    } catch {
      // Formato no soportado por jsPDF — se omite el logo, el resto del
      // documento se genera igual.
    }
  }
  const xTexto = logoDataUrl ? MARGEN + 26 : MARGEN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(17, 17, 17);
  doc.text("PANAPRICE", xTexto, y + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(91, 100, 114);
  doc.text("Fábrica de personalización textil", xTexto, y + 7);

  // Estado BORRADOR: badge relleno, no solo texto — es lo primero que debe
  // saltar a la vista de Producción/Facturación/Despacho al abrir el PDF.
  doc.setFillColor(17, 70, 255);
  doc.roundedRect(ANCHO_PAGINA - MARGEN - 32, y - 5, 32, 7, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("BORRADOR", ANCHO_PAGINA - MARGEN - 16, y - 0.3, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 17, 17);
  doc.text("ORDEN COMERCIAL", ANCHO_PAGINA - MARGEN, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(91, 100, 114);
  doc.text(`N.º de orden: ${numeroOrden}`, ANCHO_PAGINA - MARGEN, y + 11, { align: "right" });
  doc.text(`Fecha: ${new Date().toLocaleString("es-VE")}`, ANCHO_PAGINA - MARGEN, y + 16, { align: "right" });

  y += 24;
  doc.setDrawColor(228, 231, 236);
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y);
  y += 8;

  // ------------------------------------------------------------------
  // Cliente
  // ------------------------------------------------------------------
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
  doc.text(`Ciudad / zona: ${cliente.ubicacion || "-"}`, MARGEN, y);
  y += 5;
  doc.text(`Entrega: ${ETIQUETA_TIPO_ENTREGA[tipoEntrega] || "Por confirmar"}`, MARGEN, y);
  y += 9;

  // ------------------------------------------------------------------
  // Tabla de productos (catálogo + diseños personalizados, mismo cuerpo)
  // ------------------------------------------------------------------
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
    const esPersonalizado = linea.tipo === "personalizado";
    const alturaFila = linea.disenoNotas ? 20 : 16;
    if (y + alturaFila > 275) {
      doc.addPage();
      y = MARGEN;
    }

    const dataUrl = await miniaturaDeLinea(linea);
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
    doc.text(esPersonalizado ? "Diseño personalizado" : `Ref. ${linea.producto.codigo}`, colNombre, y + 4);
    if (linea.disenoNotas) {
      doc.text(`Notas: ${linea.disenoNotas}`, colNombre, y + 8, { maxWidth: 100 });
    }

    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    doc.text(String(linea.cantidad), colCant, y);
    if (esPersonalizado) {
      doc.text("A cotizar", colPrecio, y);
      doc.setFont("helvetica", "bold");
      doc.text("—", colSub, y);
    } else {
      doc.text(`$${linea.unitario.toFixed(2)}`, colPrecio, y);
      doc.setFont("helvetica", "bold");
      doc.text(`$${linea.subtotal.toFixed(2)}`, colSub, y);
    }

    y += alturaFila;
  }

  y += 2;
  doc.setDrawColor(228, 231, 236);
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y);
  y += 7;

  // ------------------------------------------------------------------
  // Resumen por categoría (tarifa acumulada aplicada)
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // Total + QR de rastreo
  // ------------------------------------------------------------------
  if (y > 245) {
    doc.addPage();
    y = MARGEN;
  }
  doc.setDrawColor(17, 17, 17);
  doc.line(MARGEN, y, ANCHO_PAGINA - MARGEN, y);
  y += 9;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(17, 17, 17);
  doc.text(`TOTAL ESTIMADO: $${total.toFixed(2)}`, ANCHO_PAGINA - MARGEN, y, { align: "right" });

  // QR: escanearlo lleva directo a "Rastrea tu pedido" con el número ya
  // cargado — la misma pantalla accesible manualmente desde el catálogo.
  try {
    const urlRastreo = `${window.location.origin}${window.location.pathname}?orden=${encodeURIComponent(numeroOrden)}`;
    const qrDataUrl = await QRCode.toDataURL(urlRastreo, { margin: 0, width: 200 });
    doc.addImage(qrDataUrl, MARGEN, y - 6, 26, 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(91, 100, 114);
    doc.text("Escanea para rastrear", MARGEN + 13, y + 23, { align: "center" });
  } catch {
    // Sin QR el documento sigue siendo válido — nunca bloquea la descarga.
  }

  // Pie
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Documento generado automáticamente por el catálogo público de Panaprice — precio y disponibilidad sujetos a confirmación por WhatsApp. Uso interno: Producción / Facturación / Despacho.",
    MARGEN,
    290,
    { maxWidth: ANCHO_UTIL }
  );

  const nombreArchivo = `ORDEN-COMERCIAL-${numeroOrden}.pdf`;
  doc.save(nombreArchivo);
  return nombreArchivo;
}
