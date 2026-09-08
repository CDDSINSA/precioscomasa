import * as XLSX from "xlsx";
import type { AdminQuote } from "../types/domain";

function formatDateTimeForExport(value: string) {
  try {
    return new Intl.DateTimeFormat("es-NI", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

type DetailedQuoteLineRow = {
  "Código Cotización": string;
  "No. Consecutivo": string | number;
  "Fecha Emisión": string;
  "ID Cliente": string;
  "Nombre Cliente": string;
  "Segmento": string;
  "No. Línea": number | string;
  "Código (SKU)": string;
  "Descripción del Producto": string;
  "Cantidad": number;
  "Precio Lista Unitario": number;
  "Total Lista": number;
  "Precio Final Unitario": number;
  "Total Final": number;
  "Ahorro": number;
  "Promoción / Oferta": string;
  "Usuario Creador": string;
};

/**
 * Exporta todas las cotizaciones consultadas en un libro de Excel.
 * La primera hoja contiene el DETALLE COMPLETO de productos/SKUs, cantidades y precios.
 * La segunda hoja contiene el resumen agrupado por cotización.
 */
export function exportAdminQuotesToExcel(quotes: AdminQuote[], filenamePrefix = "cotizaciones_consultadas") {
  if (!quotes || quotes.length === 0) {
    throw new Error("No hay cotizaciones para exportar.");
  }

  // Hoja 1 (PRINCIPAL): Detalle línea por línea (SKUs, cantidades, precios y promociones)
  const detailedLinesData = quotes.flatMap<DetailedQuoteLineRow>((q): DetailedQuoteLineRow[] => {
    const quoteCode = q.quoteCode ?? (q.id ? q.id.slice(0, 8) : "-");
    const quoteNumber = q.quoteNumber ?? "";
    const dateFormatted = formatDateTimeForExport(q.createdAt);
    const customerId = q.customerId ?? "";
    const customerName = q.customerName ?? "Sin cliente";
    const segment = q.originalSegment || "-";
    const user = q.generatedByName ?? "Usuario";

    if (!q.lines || q.lines.length === 0) {
      return [
        {
          "Código Cotización": quoteCode,
          "No. Consecutivo": quoteNumber,
          "Fecha Emisión": dateFormatted,
          "ID Cliente": customerId,
          "Nombre Cliente": customerName,
          "Segmento": segment,
          "No. Línea": "-",
          "Código (SKU)": "-",
          "Descripción del Producto": "(Sin productos registrados)",
          "Cantidad": 0,
          "Precio Lista Unitario": 0,
          "Total Lista": 0,
          "Precio Final Unitario": 0,
          "Total Final": 0,
          "Ahorro": 0,
          "Promoción / Oferta": "-",
          "Usuario Creador": user,
        },
      ];
    }

    return q.lines.map((line) => {
      const finalUnitPrice = line.quantity > 0 ? Number((line.finalTotal / line.quantity).toFixed(2)) : line.listPrice;
      return {
        "Código Cotización": quoteCode,
        "No. Consecutivo": quoteNumber,
        "Fecha Emisión": dateFormatted,
        "ID Cliente": customerId,
        "Nombre Cliente": customerName,
        "Segmento": segment,
        "No. Línea": line.lineNumber,
        "Código (SKU)": line.sku,
        "Descripción del Producto": line.productDescription ?? "Producto sin descripción",
        "Cantidad": line.quantity,
        "Precio Lista Unitario": Number(line.listPrice.toFixed(2)),
        "Total Lista": Number(line.listTotal.toFixed(2)),
        "Precio Final Unitario": finalUnitPrice,
        "Total Final": Number(line.finalTotal.toFixed(2)),
        "Ahorro": Number(line.savings.toFixed(2)),
        "Promoción / Oferta": line.appliedPromotionName || line.appliedOfferId || "Precio regular",
        "Usuario Creador": user,
      };
    });
  });

  // Hoja 2: Resumen general de cotizaciones
  const summaryQuotesData = quotes.map((q) => ({
    "Código": q.quoteCode ?? (q.id ? q.id.slice(0, 8) : "-"),
    "No. Cotización": q.quoteNumber ?? "",
    "Fecha": formatDateTimeForExport(q.createdAt),
    "ID Cliente": q.customerId ?? "",
    "Nombre Cliente": q.customerName ?? "Sin cliente",
    "Teléfono Cliente": q.customerPhone ?? "",
    "Cédula / RUC": q.customerNationalId ?? "",
    "Segmento": q.originalSegment || "-",
    "Segmento Comparado": q.comparedSegment || "-",
    "Subtotal Lista": Number(q.subtotalList.toFixed(2)),
    "Subtotal Final": Number(q.subtotalFinal.toFixed(2)),
    "IVA (15%)": Number(q.tax.toFixed(2)),
    "Total con IVA": Number(q.totalWithTax.toFixed(2)),
    "Ahorro Total": Number(q.savings.toFixed(2)),
    "Cant. Líneas": q.lines?.length ?? 0,
    "Usuario": q.generatedByName ?? "Usuario",
    "Email": q.generatedByEmail ?? "",
    "ID Registro": q.id,
  }));

  const wb = XLSX.utils.book_new();

  // 1. Agregar Hoja Principal de Detalle
  const wsDetail = XLSX.utils.json_to_sheet(detailedLinesData);
  wsDetail["!cols"] = [
    { wch: 18 }, // Código Cotización
    { wch: 15 }, // No. Consecutivo
    { wch: 18 }, // Fecha Emisión
    { wch: 14 }, // ID Cliente
    { wch: 32 }, // Nombre Cliente
    { wch: 15 }, // Segmento
    { wch: 10 }, // No. Línea
    { wch: 16 }, // Código (SKU)
    { wch: 42 }, // Descripción del Producto
    { wch: 12 }, // Cantidad
    { wch: 20 }, // Precio Lista Unitario
    { wch: 16 }, // Total Lista
    { wch: 20 }, // Precio Final Unitario
    { wch: 16 }, // Total Final
    { wch: 14 }, // Ahorro
    { wch: 32 }, // Promoción / Oferta
    { wch: 22 }, // Usuario Creador
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle de Cotizaciones");

  // 2. Agregar Hoja de Resumen
  const wsSummary = XLSX.utils.json_to_sheet(summaryQuotesData);
  wsSummary["!cols"] = [
    { wch: 18 }, // Código
    { wch: 15 }, // No. Cotización
    { wch: 18 }, // Fecha
    { wch: 14 }, // ID Cliente
    { wch: 32 }, // Nombre Cliente
    { wch: 16 }, // Teléfono Cliente
    { wch: 16 }, // Cédula / RUC
    { wch: 15 }, // Segmento
    { wch: 18 }, // Segmento Comparado
    { wch: 16 }, // Subtotal Lista
    { wch: 16 }, // Subtotal Final
    { wch: 14 }, // IVA
    { wch: 16 }, // Total con IVA
    { wch: 14 }, // Ahorro Total
    { wch: 12 }, // Cant. Líneas
    { wch: 22 }, // Usuario
    { wch: 26 }, // Email
    { wch: 38 }, // ID Registro
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen de Cotizaciones");

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `${filenamePrefix}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, filename);
}

/**
 * Exporta una cotización específica a Excel con su encabezado,
 * tabla detallada de códigos, cantidades, precios unitarios, totales y promociones,
 * y desglose final de totales.
 */
export function exportSingleQuoteToExcel(quote: AdminQuote) {
  const wb = XLSX.utils.book_new();
  const code = quote.quoteCode ?? (quote.id ? quote.id.slice(0, 8) : "cotizacion");
  const dateFormatted = formatDateTimeForExport(quote.createdAt);

  const rows: (string | number | undefined)[][] = [
    ["COTIZACIÓN COMASA", "", "", "", "", "", "", "", "", ""],
    ["Código:", code, "", "Fecha:", dateFormatted, "", "", "", "", ""],
    ["No. Consecutivo:", quote.quoteNumber ?? "-", "", "Segmento:", quote.originalSegment || "-", "", "", "", "", ""],
    ["Cliente:", quote.customerName ?? "Sin cliente", "", "ID Cliente:", quote.customerId ?? "-", "", "", "", "", ""],
    ["Teléfono:", quote.customerPhone ?? "-", "", "Cédula / RUC:", quote.customerNationalId ?? "-", "", "", "", "", ""],
    ["Atendido por:", quote.generatedByName ?? "Usuario", "", "Email:", quote.generatedByEmail ?? "-", "", "", "", "", ""],
    [],
    [
      "No.",
      "Código (SKU)",
      "Descripción",
      "Cantidad",
      "Precio Lista Unit.",
      "Total Lista",
      "Precio Final Unit.",
      "Total Final",
      "Ahorro",
      "Promoción Aplicada",
    ],
  ];

  if (!quote.lines || quote.lines.length === 0) {
    rows.push(["-", "-", "Sin productos en esta cotización", 0, 0, 0, 0, 0, 0, "-"]);
  } else {
    quote.lines.forEach((line) => {
      const finalUnitPrice = line.quantity > 0 ? Number((line.finalTotal / line.quantity).toFixed(2)) : line.listPrice;
      rows.push([
        line.lineNumber,
        line.sku,
        line.productDescription ?? "Producto sin descripción",
        line.quantity,
        Number(line.listPrice.toFixed(2)),
        Number(line.listTotal.toFixed(2)),
        finalUnitPrice,
        Number(line.finalTotal.toFixed(2)),
        Number(line.savings.toFixed(2)),
        line.appliedPromotionName || line.appliedOfferId || "Precio regular",
      ]);
    });
  }

  rows.push([]);
  rows.push(["", "", "", "", "", "", "Subtotal Lista:", Number(quote.subtotalList.toFixed(2)), "", ""]);
  rows.push(["", "", "", "", "", "", "Subtotal Final:", Number(quote.subtotalFinal.toFixed(2)), "", ""]);
  rows.push(["", "", "", "", "", "", "IVA (15%):", Number(quote.tax.toFixed(2)), "", ""]);
  rows.push(["", "", "", "", "", "", "TOTAL CON IVA:", Number(quote.totalWithTax.toFixed(2)), "", ""]);
  rows.push(["", "", "", "", "", "", "Ahorro Total:", Number(quote.savings.toFixed(2)), "", ""]);

  const wsQuote = XLSX.utils.aoa_to_sheet(rows);
  wsQuote["!cols"] = [
    { wch: 6 },  // No.
    { wch: 16 }, // SKU
    { wch: 42 }, // Descripción
    { wch: 12 }, // Cantidad
    { wch: 18 }, // Precio Lista Unit.
    { wch: 16 }, // Total Lista
    { wch: 18 }, // Precio Final Unit.
    { wch: 16 }, // Total Final
    { wch: 14 }, // Ahorro
    { wch: 32 }, // Promoción Aplicada
  ];
  XLSX.utils.book_append_sheet(wb, wsQuote, "Cotización");

  // Tabla plana complementaria para filtros y análisis
  const tableData = (quote.lines ?? []).map((line) => {
    const finalUnitPrice = line.quantity > 0 ? Number((line.finalTotal / line.quantity).toFixed(2)) : line.listPrice;
    return {
      "No.": line.lineNumber,
      "Código (SKU)": line.sku,
      "Descripción": line.productDescription ?? "Producto sin descripción",
      "Cantidad": line.quantity,
      "Precio Lista Unitario": Number(line.listPrice.toFixed(2)),
      "Total Lista": Number(line.listTotal.toFixed(2)),
      "Precio Final Unitario": finalUnitPrice,
      "Total Final": Number(line.finalTotal.toFixed(2)),
      "Ahorro": Number(line.savings.toFixed(2)),
      "Oferta / Promoción": line.appliedPromotionName || line.appliedOfferId || "Precio regular",
    };
  });

  if (tableData.length > 0) {
    const wsTable = XLSX.utils.json_to_sheet(tableData);
    wsTable["!cols"] = [
      { wch: 8 },
      { wch: 16 },
      { wch: 42 },
      { wch: 12 },
      { wch: 20 },
      { wch: 16 },
      { wch: 20 },
      { wch: 16 },
      { wch: 14 },
      { wch: 32 },
    ];
    XLSX.utils.book_append_sheet(wb, wsTable, "Tabla de Productos");
  }

  const cleanCode = code.replace(/[^a-zA-Z0-9_-]/g, "_");
  XLSX.writeFile(wb, `cotizacion_${cleanCode}.xlsx`);
}
