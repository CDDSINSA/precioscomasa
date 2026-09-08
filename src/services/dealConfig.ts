import type { DealConfig } from "../types/domain";

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
    case "KIT": return config.items.map(item => item.sku);
    case "MIX_MATCH": return config.skus;
    case "BUY_GET": return [...new Set([...config.buySkus, ...config.getSkus])];
    default: return [ownSku];
  }
}

export function dealDescription(config: DealConfig): string {
  switch (config.kind) {
    case "UNIT": return "Beneficio unitario importado";
    case "PACK": return `${config.quantity} unidades por C$${config.price.toFixed(2)}`;
    case "KIT": return `Kit completo: ${config.items.map(item => `${item.quantity} × ${item.sku}`).join(", ")}`;
    case "MIX_MATCH": return `${config.quantity} unidades mezcladas de ${config.skus.length} SKU elegibles`;
    case "BUY_GET": return `Compra ${config.buyQuantity} unidades y recibe beneficio en hasta ${config.getQuantity} unidades de recompensa`;
  }
}
