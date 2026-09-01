import type { OfferRule, QuoteItem, QuoteSummary } from "../types/domain";
import { findProduct, productImageUrl, sampleCatalog } from "./catalog";
import { estimateLineTotal, findBestRule } from "./promotions";

export const taxRate = 0.15;

export function buildQuote(
  items: QuoteItem[],
  segment: string,
  rules: OfferRule[],
  catalog = sampleCatalog,
): QuoteSummary {
  const lines = items
    .filter((item) => item.sku.trim() && item.quantity > 0)
    .map((item) => {
      const product = findProduct(catalog, item.sku);
      const unitPrice = product?.listPrice ?? 0;
      const appliedOffer = product
        ? findBestRule(rules, item.sku, segment, item.quantity, product.listPrice)
        : undefined;
      const listTotal = unitPrice * item.quantity;
      const finalTotal = estimateLineTotal(unitPrice, item.quantity, appliedOffer);

      return {
        ...item,
        product,
        unitPrice,
        listTotal,
        finalTotal,
        savings: listTotal - finalTotal,
        appliedOffer,
        imageUrl: productImageUrl(item.sku),
      };
    });

  const subtotalFinal = lines.reduce((sum, line) => sum + line.finalTotal, 0);
  const tax = lines.reduce((sum, line) => sum + (line.product?.taxable ? line.finalTotal * taxRate : 0), 0);

  return {
    lines,
    subtotalList: lines.reduce((sum, line) => sum + line.listTotal, 0),
    subtotalFinal,
    tax,
    totalWithTax: subtotalFinal + tax,
    savings: lines.reduce((sum, line) => sum + line.savings, 0),
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    maximumFractionDigits: 2,
  }).format(value);
}
