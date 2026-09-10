import type { OfferRule, QuoteItem, QuoteLine, QuoteSummary } from "../types/domain";
import { findProduct, productImageUrl, sampleCatalog } from "./catalog";
import { allocateBestDeals, roundMoney, type PricingOptions } from "./dealEngine";

export const taxRate = 0.15;

export function groupQuoteLinesByOffer(lines: QuoteLine[]): QuoteLine[] {
  if (lines.length <= 1) return lines;

  function getOfferKey(line: QuoteLine): string | undefined {
    const isKitOrBundle =
      line.appliedOffer?.type === "KIT_OFFER" ||
      line.appliedOffer?.deal?.kind === "KIT" ||
      line.allocations?.some((a) => a.role === "bundle" || a.offers.some((o) => o.type === "KIT_OFFER" || o.deal?.kind === "KIT"));

    if (isKitOrBundle) {
      const offer = line.appliedOffer || line.allocations?.flatMap((a) => a.offers).find((o) => o.type === "KIT_OFFER" || o.deal?.kind === "KIT");
      return `KIT_${offer?.promotionId || offer?.id || "bundle"}`;
    }

    if (line.appliedOffer?.deal && (line.appliedOffer.deal.kind === "BUY_GET" || line.appliedOffer.deal.kind === "MIX_MATCH")) {
      return `DEAL_${line.appliedOffer.promotionId || line.appliedOffer.id}`;
    }

    return undefined;
  }

  const result: QuoteLine[] = [];
  const visited = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (visited.has(i)) continue;
    result.push(lines[i]);
    visited.add(i);

    const key = getOfferKey(lines[i]);
    if (key) {
      for (let j = i + 1; j < lines.length; j++) {
        if (!visited.has(j) && getOfferKey(lines[j]) === key) {
          result.push(lines[j]);
          visited.add(j);
        }
      }
    }
  }

  return result;
}

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
  const rawLines = items
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

  const lines = groupQuoteLinesByOffer(rawLines);
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
