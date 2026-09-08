import type { OfferRule, QuoteItem, QuoteSummary } from "../types/domain";
import { findProduct, productImageUrl, sampleCatalog } from "./catalog";
import { allocateBestDeals, roundMoney, type PricingOptions } from "./dealEngine";

export const taxRate = 0.15;

export function buildQuote(
  items: QuoteItem[],
  segment: string,
  rules: OfferRule[],
  catalog = sampleCatalog,
  options: PricingOptions = {},
): QuoteSummary {
  let pricingError: string | undefined;
  let allocations: ReturnType<typeof allocateBestDeals> = new Map();
  try {
    allocations = allocateBestDeals(items.map(item => ({ ...item, sku: item.sku.trim() })), catalog, rules, segment, options);
  } catch (error) {
    pricingError = error instanceof Error ? error.message : "No se pudo calcular la mejor oferta.";
  }
  const used = new Map<string, { raw: number; rounded: number }>();
  const lines = items
    .map((item, itemIndex) => ({ ...item, sku: item.sku.trim(), itemIndex }))
    .filter((item) => item.sku)
    .map((item) => {
      const product = findProduct(catalog, item.sku);
      const unitPrice = product?.listPrice ?? 0;
      if (!product) pricingError = `El SKU ${item.sku} está pendiente de cargar en el catálogo.`;
      let remaining = item.quantity;
      const lineAllocations = [];
      const running = used.get(item.sku) ?? { raw: 0, rounded: 0 };
      for (const bucket of allocations.get(item.sku) ?? []) {
        if (remaining <= 1e-8) break;
        const quantity = Math.min(bucket.quantity, remaining);
        if (quantity <= 1e-8) continue;
        running.raw += bucket.unitPrice * quantity;
        const total = roundMoney(running.raw) - running.rounded;
        running.rounded = roundMoney(running.raw);
        lineAllocations.push({ ...bucket, quantity, total: roundMoney(total) });
        bucket.quantity -= quantity;
        remaining -= quantity;
      }
      if (remaining > 1e-8) {
        running.raw += unitPrice * remaining;
        const total = roundMoney(running.raw) - running.rounded;
        running.rounded = roundMoney(running.raw);
        lineAllocations.push({
          quantity: remaining,
          unitPrice,
          total: roundMoney(total),
          offers: [],
          role: "regular" as const,
        });
      }
      used.set(item.sku, running);
      const appliedOffer = lineAllocations.flatMap(bucket => bucket.offers)[0];
      const listTotal = roundMoney(unitPrice * item.quantity);
      const finalTotal = roundMoney(lineAllocations.reduce((sum, bucket) => sum + bucket.total, 0));

      return {
        ...item,
        product,
        unitPrice,
        listTotal,
        finalTotal,
        savings: roundMoney(listTotal - finalTotal),
        appliedOffer,
        allocations: lineAllocations,
        imageUrl: productImageUrl(item.sku),
      };
    });

  const subtotalFinal = roundMoney(lines.reduce((sum, line) => sum + line.finalTotal, 0));
  const tax = roundMoney(lines.reduce((sum, line) => sum + (line.product?.taxable ? line.finalTotal * taxRate : 0), 0));

  return {
    pricingError,
    lines,
    subtotalList: roundMoney(lines.reduce((sum, line) => sum + line.listTotal, 0)),
    subtotalFinal,
    tax,
    totalWithTax: roundMoney(subtotalFinal + tax),
    savings: roundMoney(lines.reduce((sum, line) => sum + line.savings, 0)),
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    maximumFractionDigits: 2,
  }).format(value);
}
