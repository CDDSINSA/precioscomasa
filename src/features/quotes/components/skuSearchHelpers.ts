import {
  estimateKitTotals,
  estimateOfferGroupUnitPrice,
  estimateUnitPrice,
  minimumQuantityForRule,
  ruleMatchesQuantity,
  type AvailableOfferGroup,
} from "../../../services/promotions";
import { formatCurrency } from "../../../services/quote";
import type { OfferRule, Product, ProductDepartment, ProductInventory, QuoteItem } from "../../../types/domain";

export function kitMissingCompanionSkus(offerGroup: AvailableOfferGroup, currentSku: string, currentItems: QuoteItem[] = []): string[] {
  if (!offerGroup.isKit) return [];
  const cleanCurrentSku = normSku(currentSku);
  const cartSkus = new Set(currentItems.map((item) => normSku(item.sku)).filter(Boolean));
  const companionSkus = [...new Set(offerGroup.rules.map((r) => normSku(r.sku)))].filter((sku) => sku && sku !== cleanCurrentSku);
  return companionSkus.filter((sku) => !cartSkus.has(sku));
}

export function normSku(val: unknown): string {
  return String(val ?? "").trim();
}

export function compareOfferGroups(
  left: AvailableOfferGroup,
  right: AvailableOfferGroup,
  product: Product,
  qty: number,
  currentItems: QuoteItem[],
  catalog: Product[],
): number {
  const leftMissing = left.isKit ? kitMissingCompanionSkus(left, product.sku, currentItems) : [];
  const rightMissing = right.isKit ? kitMissingCompanionSkus(right, product.sku, currentItems) : [];
  const leftMatchesQty = left.rules.every((offer) => ruleMatchesQuantity(offer, qty));
  const rightMatchesQty = right.rules.every((offer) => ruleMatchesQuantity(offer, qty));
  const leftApplies = leftMatchesQty && leftMissing.length === 0;
  const rightApplies = rightMatchesQty && rightMissing.length === 0;

  // 1. Applicable offers always precede non-applicable/disabled offers
  if (leftApplies !== rightApplies) {
    return leftApplies ? -1 : 1;
  }

  // 2. The offer with the greatest total savings wins
  const leftSavings = left.isKit
    ? estimateKitTotals(left, catalog, qty).savings
    : Math.max(0, product.listPrice - estimateOfferGroupUnitPrice(product.listPrice, left)) * qty;

  const rightSavings = right.isKit
    ? estimateKitTotals(right, catalog, qty).savings
    : Math.max(0, product.listPrice - estimateOfferGroupUnitPrice(product.listPrice, right)) * qty;

  if (Math.abs(leftSavings - rightSavings) > 0.001) {
    return rightSavings - leftSavings;
  }

  // 3. Lowest promo unit price on the selected SKU as tie-breaker
  const leftRule = left.rules.find((r) => normSku(r.sku) === normSku(product.sku)) ?? left.primary;
  const rightRule = right.rules.find((r) => normSku(r.sku) === normSku(product.sku)) ?? right.primary;
  const leftUnitPrice = estimateUnitPrice(product.listPrice, leftRule);
  const rightUnitPrice = estimateUnitPrice(product.listPrice, rightRule);

  if (Math.abs(leftUnitPrice - rightUnitPrice) > 0.001) {
    return leftUnitPrice - rightUnitPrice;
  }

  return left.primary.id.localeCompare(right.primary.id);
}

export function stockLabel(inventory?: ProductInventory) {
  if (!inventory || inventory.totalQuantity <= 0) return "Sin inventario";
  return `Inventario ${inventory.totalQuantity.toLocaleString("es-NI")}`;
}

export function skuEmptyMessage(term: string) {
  if (term.trim().length === 1) return "Escribe al menos 2 caracteres para buscar en todo el catálogo.";
  return "No hay productos con esa búsqueda.";
}

export function mergeProductsBySku(current: Product[], incoming: Product[]) {
  const grouped = new Map(current.map((product) => [product.sku, product]));
  incoming.forEach((product) => grouped.set(product.sku, product));
  return [...grouped.values()];
}

export function mergeInventoryBySku(current: Map<string, ProductInventory>, incoming: Map<string, ProductInventory>) {
  const grouped = new Map(current);
  incoming.forEach((inventory, sku) => grouped.set(sku, inventory));
  return grouped;
}

export function productsKey(products: Product[]) {
  return products.map((product) => product.sku).join("|");
}

export function sortProductsByInventory(products: Product[], inventory: Map<string, ProductInventory>) {
  if (!inventory.size) return products;

  return [...products].sort((left, right) => {
    const leftQuantity = inventory.get(left.sku)?.totalQuantity ?? 0;
    const rightQuantity = inventory.get(right.sku)?.totalQuantity ?? 0;
    const stockDifference = Number(rightQuantity > 0) - Number(leftQuantity > 0);
    if (stockDifference !== 0) return stockDifference;
    return 0;
  });
}

export function filterProductsByDivision(products: Product[], departmentIds: Set<string>, divisionId: string) {
  if (!divisionId) return products;
  if (!departmentIds.size) return [];
  return products.filter((product) => product.departmentId && departmentIds.has(product.departmentId));
}

export function buildDivisionOptions(departments: ProductDepartment[]) {
  const grouped = new Map<string, { id: string; name: string; departmentCount: number }>();

  departments.forEach((department) => {
    const current = grouped.get(department.divisionId);
    if (current) {
      current.departmentCount += 1;
      return;
    }

    grouped.set(department.divisionId, {
      id: department.divisionId,
      name: department.divisionName,
      departmentCount: 1,
    });
  });

  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name, "es"));
}

export function thresholdLabel(offers: OfferRule[]) {
  const minQuantity = Math.max(...offers.map(minimumQuantityForRule));
  return minQuantity > 0 ? `Desde ${minQuantity} unidades` : "Sin mínimo";
}

export function benefitLabel(offer: OfferRule) {
  if (offer.fixedPrice !== undefined) return `Precio ${formatCurrency(offer.fixedPrice)}`;
  if (offer.discountPercent) return `${offer.discountPercent}% descuento`;
  return offer.discountType ?? "Beneficio configurado";
}
