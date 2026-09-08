import type { ImportedPromotionRow, OfferRule, Promotion } from "../types/domain";
import { dealSkus } from "./dealConfig";

export type AvailableOfferGroup = {
  key: string;
  primary: OfferRule;
  rules: OfferRule[];
  isKit: boolean;
  skuCount: number;
};

export const segments = [
  { id: "1003", label: "Segmento 1003" },
  { id: "1002", label: "Segmento 1002" },
  { id: "1001", label: "Segmento 1001" },
  { id: "1105", label: "Segmento 1105" },
  { id: "1104", label: "Segmento 1104" },
  { id: "1103", label: "Segmento 1103" },
  { id: "1102", label: "Segmento 1102" },
  { id: " - ", label: "Todos los segmentos" },
];

export const samplePromotions: Promotion[] = [
  {
    id: "1675",
    name: "PLAN_LENTO_MOVIMIENTO_2026",
    startsAt: "2026-06-02",
    endsAt: "2026-12-31",
    storeId: "5",
    family: "fidelizacion",
    status: "activa",
  },
  {
    id: "1821",
    name: "IMPULSO_COMERCIAL_AGOSTO",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    storeId: "5",
    family: "estrategica",
    status: "activa",
  },
];

export const sampleOfferRules: OfferRule[] = [
  {
    id: "40709",
    promotionId: "1675",
    promotionName: "PLAN_LENTO_MOVIMIENTO_2026",
    startsAt: "2026-06-02",
    endsAt: "2026-12-31",
    type: "LINE_ITEM_DISCOUNT",
    sku: "140862737",
    segment: " - ",
    thresholdQuantity: 1,
    thresholdType: "MINIMUM",
    allowStacking: false,
    discountPercent: 80,
  },
  {
    id: "51021",
    promotionId: "1821",
    promotionName: "IMPULSO_COMERCIAL_AGOSTO",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    type: "TIERED_DISCOUNT",
    sku: "100634895",
    segment: "1003",
    minQuantity: 8,
    thresholdQuantity: 8,
    thresholdType: "MINIMUM",
    allowStacking: false,
    discountPercent: 10,
  },
  {
    id: "51022",
    promotionId: "1821",
    promotionName: "IMPULSO_COMERCIAL_AGOSTO",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    type: "TIERED_DISCOUNT",
    sku: "100634895",
    segment: "1002",
    minQuantity: 8,
    thresholdQuantity: 8,
    thresholdType: "MINIMUM",
    allowStacking: false,
    discountPercent: 15,
  },
  {
    id: "51023",
    promotionId: "1821",
    promotionName: "IMPULSO_COMERCIAL_AGOSTO",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    type: "FIXED_QTY_PRICE",
    sku: "152281753",
    segment: "1002",
    thresholdQuantity: 1,
    thresholdType: "MINIMUM",
    allowStacking: false,
    fixedPrice: 9600,
  },
  {
    id: "62010",
    promotionId: "1821",
    promotionName: "KIT_HERRAMIENTAS_AGOSTO",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    type: "KIT_OFFER",
    sku: "100535125",
    segment: "1003",
    minQuantity: 1,
    thresholdQuantity: 1,
    thresholdType: "EXACT",
    allowStacking: false,
    discountPercent: 8,
    discountType: "PERCENT_OFF",
    configurationNote: "Elemento 1 de kit",
  },
  {
    id: "62010",
    promotionId: "1821",
    promotionName: "KIT_HERRAMIENTAS_AGOSTO",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    type: "KIT_OFFER",
    sku: "145617861",
    segment: "1003",
    minQuantity: 1,
    thresholdQuantity: 1,
    thresholdType: "EXACT",
    allowStacking: false,
    fixedPrice: 390,
    discountType: "PRICE_OVERRIDE",
    configurationNote: "Elemento 2 de kit",
  },
  {
    id: "62010",
    promotionId: "1821",
    promotionName: "KIT_HERRAMIENTAS_AGOSTO",
    startsAt: "2026-08-01",
    endsAt: "2026-08-31",
    type: "KIT_OFFER",
    sku: "100634895",
    segment: "1003",
    minQuantity: 1,
    thresholdQuantity: 1,
    thresholdType: "EXACT",
    allowStacking: false,
    discountPercent: 5,
    discountType: "PERCENT_OFF",
    configurationNote: "Elemento 3 de kit",
  },
];

export function classifyPromotion(row: Pick<ImportedPromotionRow, "segment">) {
  return row.segment.trim() === "-" ? "fidelizacion" : "estrategica";
}

export function eligibleRules(rules: OfferRule[], sku: string, segment: string, quantity: number) {
  return rules.filter((rule) => {
    const segmentMatches = ruleAppliesToSegment(rule, segment);
    const quantityMatches = ruleMatchesQuantity(rule, quantity);
    return rule.sku === sku && segmentMatches && quantityMatches && rule.type !== "KIT_OFFER" && (!rule.deal || rule.deal.kind === "UNIT");
  });
}

export function ruleMatchesQuantity(rule: OfferRule, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  const thresholdQuantity = minimumQuantityForRule(rule);
  const thresholdType = effectiveThresholdType(rule);
  return thresholdType === "MINIMUM" ? quantity >= thresholdQuantity : quantity === thresholdQuantity;
}

export function minimumQuantityForRule(rule: OfferRule) {
  return effectiveThresholdQuantity(rule);
}

export function rulesForSkuSegment(rules: OfferRule[], sku: string, segment: string) {
  return rules.filter((rule) => (rule.sku === sku || (rule.deal && dealSkus(rule.deal, rule.sku).includes(sku))) && ruleAppliesToSegment(rule, segment));
}

export function availableOfferGroups(rules: OfferRule[], sku: string, segment: string): AvailableOfferGroup[] {
  const groups = new Map<string, AvailableOfferGroup>();

  rulesForSkuSegment(rules, sku, segment).forEach((rule) => {
    const kitRules = rule.type === "KIT_OFFER" ? getKitRules(rules, rule, segment) : [rule];
    const uniqueSkuCount = new Set(kitRules.map((kitRule) => kitRule.sku)).size;

    const key = rule.type === "KIT_OFFER" ? kitGroupKey(rule) : `${rule.promotionId}|${rule.id}|${rule.sku}|${rule.segment}|${rule.minQuantity ?? 0}`;
    if (rule.type === "KIT_OFFER") {
      if (uniqueSkuCount < 2) return;
      const hasConfiguredThreshold = kitRules.some(r => typeof r.thresholdQuantity === "number" && r.thresholdQuantity > 0 && !!r.thresholdType);
      if (!rule.deal && uniqueSkuCount >= 4 && !hasConfiguredThreshold) return;
    }
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        primary: rule,
        rules: kitRules,
        isKit: rule.type === "KIT_OFFER" && !rule.deal,
        skuCount: uniqueSkuCount,
      });
    }
  });

  return [...groups.values()];
}

export function sortOfferGroupsByUnitPrice(groups: AvailableOfferGroup[], listPrice: number) {
  return [...groups].sort((left, right) => {
    const leftPrice = estimateOfferGroupUnitPrice(listPrice, left);
    const rightPrice = estimateOfferGroupUnitPrice(listPrice, right);
    if (leftPrice !== rightPrice) return leftPrice - rightPrice;
    return left.primary.id.localeCompare(right.primary.id);
  });
}

export function estimateOfferGroupUnitPrice(listPrice: number, group: AvailableOfferGroup) {
  return estimateUnitPrice(listPrice, group.primary);
}

export function estimateLineTotal(listPrice: number, quantity: number, rule?: OfferRule) {
  return estimateUnitPrice(listPrice, rule) * quantity;
}

export function estimateUnitPrice(listPrice: number, rule?: OfferRule) {
  if (!rule) return listPrice;
  if (rule.deal?.kind === "UNIT" && rule.fixedPrice !== undefined && !rule.discountType) return validPrice(rule.fixedPrice) ? rule.fixedPrice : listPrice;

  // RMS describes the benefit separately from the offer's quantity conditions.
  const discountType = rule.discountType?.trim().toUpperCase();
  if (discountType === "OVERRIDE_PRICE" || discountType === "PRICE_OVERRIDE") {
    return validPrice(rule.fixedPrice) ? rule.fixedPrice : listPrice;
  }
  if (discountType === "PERCENT_OFF") {
    return percentOffPrice(listPrice, rule.discountPercent);
  }

  if (rule.type === "FIXED_QTY_PRICE" && rule.fixedPrice !== undefined) {
    return validPrice(rule.fixedPrice) ? fixedQtyUnitPrice(rule) : listPrice;
  }

  if (rule.type === "KIT_OFFER" && rule.fixedPrice !== undefined) {
    return rule.fixedPrice;
  }

  if (
    (rule.type === "LINE_ITEM_DISCOUNT" || rule.type === "TIERED_DISCOUNT" || rule.type === "FIXED_QTY_PRICE" || rule.type === "KIT_OFFER") &&
    rule.discountPercent
  ) {
    return percentOffPrice(listPrice, rule.discountPercent);
  }

  return listPrice;
}

export function findBestRule(rules: OfferRule[], sku: string, segment: string, quantity: number, price: number) {
  const candidates = eligibleRules(rules, sku, segment, quantity);
  return candidates.reduce<OfferRule | undefined>((best, rule) => {
    const bestTotal = estimateLineTotal(price, quantity, best);
    const ruleTotal = estimateLineTotal(price, quantity, rule);
    return ruleTotal < bestTotal ? rule : best;
  }, undefined);
}

export function ruleAppliesToSegment(rule: Pick<OfferRule, "segment">, segment: string) {
  const ruleSegment = rule.segment.trim();
  const customerSegment = segment.trim();
  return ruleSegment === "-" || ruleSegment === "" || (!!customerSegment && customerSegment !== "-" && ruleSegment === customerSegment);
}

function effectiveThresholdType(rule: OfferRule) {
  if (rule.type === "LINE_ITEM_DISCOUNT" || rule.type === "FIXED_QTY_PRICE" || rule.type === "TIERED_DISCOUNT") {
    return "MINIMUM";
  }

  return rule.thresholdType === "MINIMUM" ? "MINIMUM" : "EXACT";
}

function effectiveThresholdQuantity(rule: OfferRule) {
  // Zero explicitly means no minimum for these offers, including fractional units.
  if ((rule.type === "LINE_ITEM_DISCOUNT" || rule.type === "FIXED_QTY_PRICE") && rule.thresholdQuantity === 0) {
    return 0;
  }
  const configuredQuantity = Number(rule.thresholdQuantity ?? 0);
  const importedQuantity = Number(rule.minQuantity ?? 0);
  if (rule.type === "TIERED_DISCOUNT") return Math.max(Number.isFinite(configuredQuantity) ? configuredQuantity : 0, Number.isFinite(importedQuantity) ? importedQuantity : 0, 1);
  const quantity = configuredQuantity > 0 ? configuredQuantity : importedQuantity > 0 ? importedQuantity : 1;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function fixedQtyUnitPrice(rule: OfferRule) {
  const fixedPrice = Number(rule.fixedPrice ?? 0);
  const quantity = effectiveThresholdQuantity(rule);
  return quantity > 1 ? fixedPrice / quantity : fixedPrice;
}

function validPrice(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function percentOffPrice(listPrice: number, percent: number | undefined) {
  return percent !== undefined && Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? listPrice * (1 - percent / 100)
    : listPrice;
}

function getKitRules(rules: OfferRule[], offer: OfferRule, segment: string) {
  const kitRules = rules.filter(
    (rule) => rule.type === "KIT_OFFER" && kitGroupKey(rule) === kitGroupKey(offer) && ruleAppliesToSegment(rule, segment),
  );
  return uniqueRulesBySku(kitRules);
}

function kitGroupKey(rule: OfferRule) {
  return `${rule.promotionId}|${rule.id}|${rule.segment.trim() || "-"}`;
}

function uniqueRulesBySku(rules: OfferRule[]) {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    if (seen.has(rule.sku)) return false;
    seen.add(rule.sku);
    return true;
  });
}
