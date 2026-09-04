import comasaLogo from "../assets/logo-comasa.png";
import type { Customer, QuoteSummary } from "../types/domain";
import { formatCurrency } from "./quote";

const printProductImagesInPdf = false;

type ExportQuotePdfOptions = {
  segment: string;
  customer?: Customer | null;
  generatedBy?: string;
  generatedAt?: string | Date;
  quoteCode?: string;
};

export async function exportQuotePdf(summary: QuoteSummary, options: ExportQuotePdfOptions) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const page = { width: 612, height: 792 };
  const margin = 38;
  const contentWidth = page.width - margin * 2;
  const generatedAt = options.generatedAt ? new Date(options.generatedAt) : new Date();
  const logoData = await imageToDataUrl(comasaLogo).catch(() => "");
  const productImages = printProductImagesInPdf
    ? await Promise.all(
      summary.lines.map((line) =>
        imageToDataUrl(productPdfImageUrl(line.sku)).catch(() =>
          imageToDataUrl(line.imageUrl).catch(() => ""),
        ),
      ),
    )
    : [];
  let y = drawHeader(doc, logoData, options, generatedAt, margin, contentWidth);

  y = drawCustomerDetails(doc, options, margin, y, contentWidth);
  y += 20;
  y = drawTableHead(doc, margin, y, contentWidth);

  summary.lines.forEach((line, index) => {
    const rowHeight = 58;
    if (y + rowHeight > page.height - 120) {
      doc.addPage();
      y = drawHeader(doc, logoData, options, generatedAt, margin, contentWidth, true);
      y = drawTableHead(doc, margin, y, contentWidth);
    }

    y = drawSkuRow(doc, {
      imageData: productImages[index],
      index,
      margin,
      rowHeight,
      summaryWidth: contentWidth,
      y,
      line,
    });
  });

  if (!summary.lines.length) {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 42, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("No hay SKU agregados a esta cotización.", margin + 14, y + 25);
    y += 42;
  }

  y += 18;
  if (y + 128 > page.height - 48) {
    doc.addPage();
    y = drawHeader(doc, logoData, options, generatedAt, margin, contentWidth, true);
  }

  drawTotals(doc, summary, margin, y, contentWidth);
  drawWarning(doc, margin, page.height - 82, contentWidth);
  drawFooters(doc, page, margin);
  doc.save(`${safeFileName(options.quoteCode || `borrador-comasa-${Date.now()}`)}.pdf`);
}

function drawHeader(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  logoData: string,
  options: ExportQuotePdfOptions,
  generatedAt: Date,
  margin: number,
  contentWidth: number,
  compact = false,
) {
  doc.setFillColor(234, 244, 255);
  doc.rect(0, 0, 612, compact ? 76 : 104, "F");
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, compact ? 76 : 104, margin + contentWidth, compact ? 76 : 104);

  if (logoData) {
    doc.addImage(logoData, imageFormat(logoData), margin, 24, 120, 34);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 91, 170);
    doc.text("COMASA", margin, 45);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 15 : 20);
  doc.setTextColor(30, 41, 59);
  doc.text("Cotización Comercial", compact ? margin + 138 : margin, compact ? 46 : 82);

  const headerMetaX = margin + contentWidth - 178;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text("Cotización:", headerMetaX, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 91, 170);
  doc.text(options.quoteCode || "Borrador", headerMetaX + 58, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Fecha: ${formatDate(generatedAt)}`, headerMetaX, 38);
  doc.text(`Generado por: ${options.generatedBy || "Usuario COMASA"}`, headerMetaX, 53);

  return compact ? 96 : 124;
}

function drawCustomerDetails(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  options: ExportQuotePdfOptions,
  margin: number,
  y: number,
  contentWidth: number,
) {
  const customer = options.customer;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 92, 8, 8, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("Detalles del cliente", margin + 14, y + 22);

  const fields = [
    ["Cliente", customer?.displayName || "Sin cliente seleccionado"],
    ["ID cliente", customer?.customerId || "-"],
    ["Teléfono", customer?.mobile || "-"],
    ["ID / Cédula", customer?.nationalId || "-"],
    ["Dirección", customer?.address || "-"],
  ];
  const leftX = margin + 14;
  const rightX = margin + contentWidth / 2 + 10;

  drawLabelValue(doc, fields[0][0], fields[0][1], leftX, y + 45, 230);
  drawLabelValue(doc, fields[1][0], fields[1][1], rightX, y + 45, 150);
  drawLabelValue(doc, fields[2][0], fields[2][1], rightX, y + 66, 150);
  drawLabelValue(doc, fields[3][0], fields[3][1], rightX + 98, y + 66, 130);
  drawLabelValue(doc, fields[4][0], fields[4][1], leftX, y + 72, 270);

  return y + 92;
}

function drawTableHead(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  margin: number,
  y: number,
  contentWidth: number,
) {
  doc.setFillColor(0, 91, 170);
  doc.rect(margin, y, contentWidth, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("SKU", margin + 14, y + 18);
  doc.text("Descripción", margin + 84, y + 18);
  doc.text("Cant.", margin + 320, y + 18);
  doc.text("Promoción", margin + 362, y + 18);
  doc.text("Total", margin + 480, y + 18);
  return y + 28;
}

function drawSkuRow(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  {
    imageData,
    index,
    line,
    margin,
    rowHeight,
    summaryWidth,
    y,
  }: {
    imageData?: string;
    index: number;
    line: QuoteSummary["lines"][number];
    margin: number;
    rowHeight: number;
    summaryWidth: number;
    y: number;
  },
) {
  doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
  doc.rect(margin, y, summaryWidth, rowHeight, "F");
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y + rowHeight, margin + summaryWidth, y + rowHeight);

  if (printProductImagesInPdf && imageData) {
    doc.addImage(imageData, imageFormat(imageData), margin + 10, y + 9, 38, 38);
  }

  const description = line.product?.description ?? "Producto no encontrado";
  const promo = line.appliedOffer;
  const promoName = promo ? `${promo.id} - ${promo.promotionName}` : "Sin oferta aplicada";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(line.sku, margin + 14, y + 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(doc.splitTextToSize(description, 220).slice(0, 3), margin + 84, y + 16);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(String(line.quantity), margin + 324, y + 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(doc.splitTextToSize(promoName, 108).slice(0, 3), margin + 362, y + 16);

  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(formatCurrency(line.finalTotal), margin + 480, y + 20, { maxWidth: 70 });

  return y + rowHeight;
}

function drawTotals(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  summary: QuoteSummary,
  margin: number,
  y: number,
  contentWidth: number,
) {
  const boxWidth = 216;
  const x = margin + contentWidth - boxWidth;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(x, y, boxWidth, 68, 8, 8, "FD");

  const rows = [
    ["Subtotal final", formatCurrency(summary.subtotalFinal)],
    ["IVA", formatCurrency(summary.tax)],
  ];

  rows.forEach(([label, value], index) => {
    const rowY = y + 22 + index * 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, x + 14, rowY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(value, x + boxWidth - 14, rowY, { align: "right" });
  });

  doc.setFillColor(0, 91, 170);
  doc.roundedRect(x + 10, y + 42, boxWidth - 20, 18, 5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("Total con IVA", x + 18, y + 55);
  doc.text(formatCurrency(summary.totalWithTax), x + boxWidth - 18, y + 55, { align: "right" });
}

function drawWarning(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  margin: number,
  y: number,
  contentWidth: number,
) {
  const note =
    "Este documento es una referencia aproximada de la oferta de Xstore; las ofertas pueden variar por lógica, cantidad de SKU, unidades y fechas de vencimiento.";
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(245, 158, 11);
  doc.roundedRect(margin, y, contentWidth, 38, 7, 7, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(133, 77, 14);
  doc.text("Advertencia", margin + 12, y + 16);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(note, contentWidth - 96), margin + 82, y + 16);
}

function drawFooters(doc: InstanceType<typeof import("jspdf").jsPDF>, page: { width: number; height: number }, margin: number) {
  const totalPages = doc.getNumberOfPages();
  for (let currentPage = 1; currentPage <= totalPages; currentPage += 1) {
    doc.setPage(currentPage);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("COMASA - Cotizador Comercial", margin, page.height - 28);
    doc.text(`Página ${currentPage} de ${totalPages}`, page.width - margin, page.height - 28, { align: "right" });
  }
}

function drawLabelValue(
  doc: InstanceType<typeof import("jspdf").jsPDF>,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 41, 59);
  doc.text(doc.splitTextToSize(value, maxWidth).slice(0, 2), x, y + 12);
}

async function imageToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo cargar la imagen");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(blob);
  });
}

function imageFormat(dataUrl: string) {
  return dataUrl.includes("image/png") ? "PNG" : "JPEG";
}

function productPdfImageUrl(sku: string) {
  return `/api/product-image?sku=${encodeURIComponent(sku)}`;
}

function safeFileName(value: string) {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(typeof value === "string" ? localDate(value) : value);
}

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}
