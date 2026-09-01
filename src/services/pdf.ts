import type { QuoteSummary } from "../types/domain";
import { formatCurrency } from "./quote";

export async function exportQuotePdf(summary: QuoteSummary, segment: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 42;
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Cotizacion COMASA", margin, y);
  y += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Segmento: ${segment}`, margin, y);
  doc.text(`Fecha: ${new Date().toLocaleDateString("es-NI")}`, 420, y);
  y += 28;

  doc.setFont("helvetica", "bold");
  doc.text("SKU", margin, y);
  doc.text("Descripcion", 118, y);
  doc.text("Cant.", 355, y);
  doc.text("Total", 410, y);
  doc.text("Ahorro", 500, y);
  y += 14;
  doc.setFont("helvetica", "normal");

  summary.lines.forEach((line) => {
    const description = line.product?.description ?? "Producto no encontrado";
    doc.text(line.sku, margin, y);
    doc.text(doc.splitTextToSize(description, 210), 118, y);
    doc.text(String(line.quantity), 365, y);
    doc.text(formatCurrency(line.finalTotal), 410, y);
    doc.text(formatCurrency(line.savings), 500, y);
    y += 38;
    if (y > 710) {
      doc.addPage();
      y = 48;
    }
  });

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text(`Subtotal lista: ${formatCurrency(summary.subtotalList)}`, margin, y);
  y += 16;
  doc.text(`Subtotal final: ${formatCurrency(summary.subtotalFinal)}`, margin, y);
  y += 16;
  doc.text(`IVA: ${formatCurrency(summary.tax)}`, margin, y);
  y += 16;
  doc.text(`Total con IVA: ${formatCurrency(summary.totalWithTax)}`, margin, y);
  y += 16;
  doc.text(`Ahorro estimado: ${formatCurrency(summary.savings)}`, margin, y);
  doc.save(`cotizacion-comasa-${Date.now()}.pdf`);
}
