import type { ImportedPromotionRow, OfferRule, Promotion } from "../types/domain";

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
    const quantityMatches = !rule.minQuantity || quantity >= rule.minQuantity;
    const kitSupported = rule.type !== "KIT_OFFER" || getKitRules(rules, rule, segment).length < 4;
    return rule.sku === sku && segmentMatches && quantityMatches && kitSupported;
  });
}

export function rulesForSkuSegment(rules: OfferRule[], sku: string, segment: string) {
  return rules.filter((rule) => rule.sku === sku && ruleAppliesToSegment(rule, segment));
}

export function availableOfferGroups(rules: OfferRule[], sku: string, segment: string): AvailableOfferGroup[] {
  const groups = new Map<string, AvailableOfferGroup>();

  rulesForSkuSegment(rules, sku, segment).forEach((rule) => {
    const kitRules = rule.type === "KIT_OFFER" ? getKitRules(rules, rule, segment) : [rule];
    const uniqueSkuCount = new Set(kitRules.map((kitRule) => kitRule.sku)).size;
    if (rule.type === "KIT_OFFER" && uniqueSkuCount >= 4) return;

    const key = rule.type === "KIT_OFFER" ? kitGroupKey(rule) : `${rule.promotionId}|${rule.id}|${rule.sku}|${rule.segment}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        primary: rule,
        rules: kitRules,
        isKit: rule.type === "KIT_OFFER",
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

  if ((rule.type === "FIXED_QTY_PRICE" || rule.type === "KIT_OFFER") && rule.fixedPrice !== undefined) {
    return rule.fixedPrice;
  }

  if (
    (rule.type === "LINE_ITEM_DISCOUNT" || rule.type === "TIERED_DISCOUNT" || rule.type === "KIT_OFFER") &&
    rule.discountPercent
  ) {
    return listPrice * (1 - rule.discountPercent / 100);
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
  return rule.segment === segment || rule.segment.trim() === "-";
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
