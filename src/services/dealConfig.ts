import type { DealConfig, OfferRule } from "../types/domain";

export function isPendingKit(rule: Pick<OfferRule, "type" | "deal">): boolean {
  return (rule.type === "KIT_OFFER" || rule.deal?.kind === "KIT") &&
    !(rule.deal?.kind === "KIT" && rule.deal.sets?.length);
}

export function validateDealConfig(value: unknown): DealConfig {
  if (!value || typeof value !== "object") throw new Error("La regla debe ser un objeto.");
  const config = value as Record<string, any>;
  const positive = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0.000001 && Math.abs(Math.round(n * 1e6) / 1e6 - n) < 1e-10;
  const units = (n: unknown) => positive(n) && Number.isInteger(n);
  const price = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const skus = (list: unknown) => Array.isArray(list) && list.length > 0 && list.every(s => typeof s === "string" && s.trim() === s && s.length > 0) && new Set(list).size === list.length;
  const benefit = (b: any) => b && price(b.value) && (b.type === "OVERRIDE_PRICE" || (b.type === "PERCENT_OFF" && b.value <= 100));
  switch (config.kind) {
    case "UNIT": return { kind: "UNIT" };
    case "PACK":
      if (positive(config.quantity) && price(config.price)) return { kind: "PACK", quantity: config.quantity, price: config.price };
      break;
    case "KIT":
      if (config.sets !== undefined) {
        if (Array.isArray(config.sets) && config.sets.length > 0 && skus(config.sets.map((set: any) => set?.id)) &&
          config.sets.every((set: any) => skus(set.skus) && units(set.quantity) &&
            ["EXACT", "MINIMUM"].includes(set.thresholdType) && (set.benefit === undefined || benefit(set.benefit)) &&
            (set.skuBenefits === undefined || (set.skuBenefits && typeof set.skuBenefits === "object" && !Array.isArray(set.skuBenefits) && set.skus.every((sku: string) => benefit(set.skuBenefits[sku])) && Object.keys(set.skuBenefits).every(sku => set.skus.includes(sku)))))) {
          return { kind: "KIT", sets: config.sets.map((set: any) => ({ id: set.id, skus: set.skus, quantity: set.quantity, thresholdType: set.thresholdType, ...(set.benefit ? { benefit: set.benefit } : {}), ...(set.skuBenefits ? { skuBenefits: set.skuBenefits } : {}) })) };
        }
        throw new Error("SET inválido: usa identificadores únicos, SKU sin duplicar dentro del SET, cantidades enteras positivas, umbral exacto o mínimo y un beneficio válido.");
      }
      if (Array.isArray(config.items) && config.items.length >= 2 && skus(config.items.map((i: any) => i?.sku)) && config.items.every((i: any) => positive(i.quantity) && benefit(i.benefit))) {
        return { kind: "KIT", items: config.items.map((i: any) => ({ sku: i.sku, quantity: i.quantity, benefit: i.benefit })) };
      }
      break;
    case "MIX_MATCH":
      if (skus(config.skus) && units(config.quantity) && benefit(config.benefit)) return { kind: "MIX_MATCH", skus: config.skus, quantity: config.quantity, benefit: config.benefit };
      break;
    case "BUY_GET":
      if (skus(config.buySkus) && skus(config.getSkus) && units(config.buyQuantity) && units(config.getQuantity) && benefit(config.benefit) && typeof config.discountTriggers === "boolean") {
        return { kind: "BUY_GET", buySkus: config.buySkus, buyQuantity: config.buyQuantity, getSkus: config.getSkus, getQuantity: config.getQuantity, benefit: config.benefit, discountTriggers: config.discountTriggers };
      }
  }
  throw new Error("Regla inválida: revisa cantidades positivas, SKU sin duplicar y beneficios (0–100% o precio no negativo).");
}

export function dealSkus(config: DealConfig, ownSku: string): string[] {
  switch (config.kind) {
    case "KIT": return config.sets ? [...new Set(config.sets.flatMap(set => set.skus))] : config.items.map(item => item.sku);
    case "MIX_MATCH": return config.skus;
    case "BUY_GET": return [...new Set([...config.buySkus, ...config.getSkus])];
    default: return [ownSku];
  }
}

export function dealDescription(config: DealConfig): string {
  switch (config.kind) {
    case "UNIT": return "Precio especial por unidad";
    case "PACK": return `${config.quantity} unidades por C$${config.price.toFixed(2)}`;
    case "KIT":
      return config.sets
        ? config.sets.map(set => {
            const benefit = set.benefit
              ? ` (${set.benefit.type === "PERCENT_OFF" ? `${set.benefit.value}% desc.` : `C$${set.benefit.value.toFixed(2)}`})`
              : "";
            return `SET ${set.id}: ${set.quantity} u. de SKU ${set.skus.join(", ")}${benefit}`;
          }).join(" · ")
        : "Kit pendiente de configurar";
    case "MIX_MATCH": return `${config.quantity} unidades combinables de ${config.skus.length} SKU`;
    case "BUY_GET": return `Compra ${config.buyQuantity} u. y recibe beneficio en ${config.getQuantity} u.`;
  }
}
