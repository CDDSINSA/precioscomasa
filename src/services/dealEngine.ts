import type { DealBenefit, DealConfig, OfferRule, Product, QuoteAllocation, QuoteItem } from "../types/domain";
import { estimateUnitPrice, minimumQuantityForRule, ruleAppliesToSegment, ruleMatchesQuantity } from "./promotions";
import { dealSkus, validateDealConfig } from "./dealConfig";

const EPS = 1e-8;
const qty = (value: number) => Math.round(value * 1e6) / 1e6;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const offerIdentity = (r: OfferRule) => `${r.promotionId}|${r.id}`;
const groupIdentity = (r: OfferRule) => `${offerIdentity(r)}|${r.segment.trim() || "-"}`;
type Bucket = QuoteAllocation & { sku: string };
type UnitResult = { price: number; offers: OfferRule[] };
type Pattern = { consumption: number[]; buckets: Bucket[]; cost: number; offers: OfferRule[] };
type Result = { total: number; offers: OfferRule[]; buckets?: Bucket[]; pattern?: Pattern; child?: Result };

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function compareOfferPreference(a: OfferRule, b: OfferRule, segment: string) {
  const specific = (r: OfferRule) => !!segment.trim() && segment.trim() !== "-" && r.segment.trim() === segment.trim();
  if (specific(a) !== specific(b)) return specific(a) ? -1 : 1;
  const override = (r: OfferRule) => ["OVERRIDE_PRICE", "PRICE_OVERRIDE"].includes(r.discountType?.trim().toUpperCase() ?? "") || (r.fixedPrice !== undefined && !r.discountPercent);
  if (override(a) !== override(b)) return override(a) ? -1 : 1;
  const date = (a.endsAt || "9999-12-31").localeCompare(b.endsAt || "9999-12-31");
  return date || `${groupIdentity(a)}|${a.sku}|${a.minQuantity ?? 0}`.localeCompare(`${groupIdentity(b)}|${b.sku}|${b.minQuantity ?? 0}`);
}

function uniqueOffers(rules: OfferRule[]) {
  const found = new Map<string, OfferRule>();
  rules.forEach(rule => found.set(`${groupIdentity(rule)}|${rule.sku}|${rule.minQuantity ?? 0}`, rule));
  return [...found.values()];
}

function preferOffers(a: OfferRule[], b: OfferRule[], segment: string) {
  const left = uniqueOffers(a).sort((x, y) => compareOfferPreference(x, y, segment));
  const right = uniqueOffers(b).sort((x, y) => compareOfferPreference(x, y, segment));
  // A no-op deal should not replace regular pricing at the same total.
  if (!left.length || !right.length) return left.length - right.length;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const order = compareOfferPreference(left[i], right[i], segment);
    if (order) return order;
  }
  return left.length - right.length;
}

function better(total: number, offers: OfferRule[], bestTotal: number, bestOffers: OfferRule[], segment: string) {
  const payable = money(total);
  const bestPayable = money(bestTotal);
  return payable < bestPayable || (payable === bestPayable && preferOffers(offers, bestOffers, segment) < 0);
}

function unitKind(rule: OfferRule): "percent" | "override" | undefined {
  const type = rule.discountType?.trim().toUpperCase();
  if (type === "PERCENT_OFF") return "percent";
  if (type === "OVERRIDE_PRICE" || type === "PRICE_OVERRIDE") return "override";
  if (rule.fixedPrice !== undefined) return "override";
  if (rule.discountPercent !== undefined) return "percent";
}

// One tier per offer. Percentage chains are commutative; an optional override
// establishes the base before those percentages. No same offer can repeat.
function bestUnit(price: number, quantity: number, rules: OfferRule[], segment: string, anchor?: OfferRule, anchorBenefit?: DealBenefit): UnitResult {
  const initialPrice = anchorBenefit ? benefitPrice(price, anchorBenefit) : price;
  let best: UnitResult = { price: initialPrice, offers: anchor ? [anchor] : [] };

  const candidates = rules.filter(rule => ruleMatchesQuantity(rule, quantity) && (!anchor || offerIdentity(rule) !== offerIdentity(anchor)));
  const test = (value: number, offers: OfferRule[]) => {
    if (Number.isFinite(value) && value >= 0 && better(value * quantity, offers, best.price * quantity, best.offers, segment)) best = { price: value, offers };
  };
  if (!anchor) candidates.forEach(rule => test(estimateUnitPrice(price, rule), [rule]));

  const stackablePercentages = new Map<string, OfferRule>();
  for (const rule of candidates) {
    if (!rule.allowStacking || unitKind(rule) !== "percent" || !(rule.discountPercent! > 0 && rule.discountPercent! <= 100)) continue;
    const existing = stackablePercentages.get(offerIdentity(rule));
    if (!existing || rule.discountPercent! > existing.discountPercent! || (rule.discountPercent === existing.discountPercent && compareOfferPreference(rule, existing, segment) < 0)) {
      stackablePercentages.set(offerIdentity(rule), rule);
    }
  }

  const stackableOverrides = candidates.filter(rule => rule.allowStacking && unitKind(rule) === "override");
  const anchorIsExclusive = !!anchor && !anchor.allowStacking;

  const bases: { price: number; offers: OfferRule[] }[] = [{ price: initialPrice, offers: anchor ? [anchor] : [] }];

  stackableOverrides.forEach(rule => {
    let fixed = estimateUnitPrice(price, rule);
    if (anchorBenefit?.type === "PERCENT_OFF") fixed = benefitPrice(fixed, anchorBenefit);
    else if (anchorBenefit) fixed = Math.min(fixed, anchorBenefit.value);
    bases.push({ price: fixed, offers: anchor ? [anchor, rule] : [rule] });
  });

  if (!anchorIsExclusive) {
    const nonStackableOverrides = candidates.filter(rule => !rule.allowStacking && unitKind(rule) === "override");
    nonStackableOverrides.forEach(rule => {
      let fixed = estimateUnitPrice(price, rule);
      if (anchorBenefit?.type === "PERCENT_OFF") fixed = benefitPrice(fixed, anchorBenefit);
      else if (anchorBenefit) fixed = Math.min(fixed, anchorBenefit.value);
      bases.push({ price: fixed, offers: anchor ? [anchor, rule] : [rule] });
    });

    const nonStackablePercentages = candidates.filter(rule => !rule.allowStacking && unitKind(rule) === "percent" && rule.discountPercent! > 0 && rule.discountPercent! <= 100);
    for (const rule of nonStackablePercentages) {
      const p = initialPrice * (1 - rule.discountPercent! / 100);
      bases.push({ price: p, offers: anchor ? [anchor, rule] : [rule] });

      for (const sOverride of stackableOverrides) {
        let fixed = estimateUnitPrice(price, sOverride);
        if (anchorBenefit?.type === "PERCENT_OFF") fixed = benefitPrice(fixed, anchorBenefit);
        else if (anchorBenefit) fixed = Math.min(fixed, anchorBenefit.value);
        bases.push({ price: fixed * (1 - rule.discountPercent! / 100), offers: anchor ? [anchor, sOverride, rule] : [sOverride, rule] });
      }
    }
  }

  for (const base of bases) {
    test(base.price, base.offers);
    const chain = [...stackablePercentages.values()]
      .filter(rule => !base.offers.some(applied => offerIdentity(applied) === offerIdentity(rule)))
      .sort((a, b) => compareOfferPreference(a, b, segment));
    if (chain.length) {
      const value = chain.reduce((current, rule) => current * (1 - rule.discountPercent! / 100), base.price);
      test(value, [...base.offers, ...chain]);
    }
  }
  return best;
}

function benefitPrice(price: number, benefit: DealBenefit) {
  return benefit.type === "OVERRIDE_PRICE" ? benefit.value : price * (1 - benefit.value / 100);
}

function legacyConfig(rule: OfferRule, all: OfferRule[]): DealConfig | undefined {
  if (rule.deal) return validateDealConfig(rule.deal);
  if (rule.type === "KIT_OFFER") {
    const items = all.filter(r => groupIdentity(r) === groupIdentity(rule) && r.type === "KIT_OFFER");
    const bySku = new Map(items.map(r => [r.sku, r]));
    if (bySku.size < 2) return undefined;
    const hasConfiguredThreshold = items.some(r => typeof r.thresholdQuantity === "number" && r.thresholdQuantity > 0 && !!r.thresholdType);
    if (bySku.size >= 4 && !hasConfiguredThreshold) return undefined;
    return { kind: "KIT", items: [...bySku.values()].map(r => ({
      sku: r.sku, quantity: Math.max(minimumQuantityForRule(r), r.minQuantity ?? 0, 1),
      benefit: r.fixedPrice !== undefined && r.discountType !== "PERCENT_OFF"
        ? { type: "OVERRIDE_PRICE", value: r.fixedPrice }
        : { type: "PERCENT_OFF", value: r.discountPercent ?? 0 },
    })) };
  }
  // Explicit RMS OVERRIDE_PRICE is always unit pricing. Only legacy untyped
  // FIXED_QTY_PRICE with a quantity > 1 implies a closed package.
  if (rule.type === "FIXED_QTY_PRICE" && !rule.discountType && rule.fixedPrice !== undefined && minimumQuantityForRule(rule) > 1) {
    return { kind: "PACK", quantity: minimumQuantityForRule(rule), price: rule.fixedPrice };
  }
  return { kind: "UNIT" };
}

export type PricingOptions = { today?: string; maxStates?: number; maxPatterns?: number; maxTransitions?: number };

/** Exact search over disjoint consumed units, separately for connected SKU groups.
 * No greedy package priority: every state also considers selling its remainder
 * with the best eligible unit/tier/stack. Limits fail explicitly, never silently
 * turn an approximate result into a promised best deal.
 */
export function allocateBestDeals(items: QuoteItem[], catalog: Product[], rules: OfferRule[], segment: string, options: PricingOptions = {}): Map<string, QuoteAllocation[]> {
  const products = new Map(catalog.map(p => [p.sku, p]));
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (item.sku && (!Number.isFinite(item.quantity) || item.quantity < 0.000001 || Math.abs(qty(item.quantity) - item.quantity) > EPS)) throw new Error(`Cantidad inválida para ${item.sku}: usa un valor positivo con hasta seis decimales.`);
    if (products.has(item.sku) && Number.isFinite(item.quantity) && item.quantity > 0) quantities.set(item.sku, qty((quantities.get(item.sku) ?? 0) + item.quantity));
  }
  const skus = [...quantities.keys()].sort();
  const today = options.today ?? localDate();
  const active = rules.filter(r => ruleAppliesToSegment(r, segment) && (!r.startsAt || r.startsAt <= today) && (!r.endsAt || r.endsAt >= today));
  const units = new Map<string, OfferRule[]>();
  const groups = new Map<string, { rule: OfferRule; config: DealConfig }>();
  active.forEach(rule => {
    const config = legacyConfig(rule, active);
    if (!config) return; // A partial legacy kit is never an individual discount.
    if (config.kind === "UNIT") {
      units.set(rule.sku, [...(units.get(rule.sku) ?? []), rule]);
    } else {
      const key = config.kind === "PACK" ? `${groupIdentity(rule)}|${rule.sku}` : groupIdentity(rule);
      if (!groups.has(key)) groups.set(key, { rule, config: validateDealConfig(config) });
    }
  });
  const parent = new Map(skus.map(sku => [sku, sku]));
  function root(sku: string): string {
    let result = sku;
    while (parent.get(result) !== result) result = parent.get(result)!;
    return result;
  }
  for (const { rule, config } of groups.values()) {
    const involved = dealSkus(config, rule.sku).filter(sku => quantities.has(sku));
    involved.slice(1).forEach(sku => parent.set(root(sku), root(involved[0])));
  }
  const components = new Map<string, string[]>();
  skus.forEach(sku => components.set(root(sku), [...(components.get(root(sku)) ?? []), sku]));
  const output = new Map<string, QuoteAllocation[]>();
  let transitions = 0;
  const limit = () => {
    if (++transitions > (options.maxTransitions ?? 500000)) throw new Error("La combinación de promociones supera el límite de cálculo exacto. Reduce los SKU o cantidades relacionados antes de emitir.");
  };
  for (const component of components.values()) {
    const index = new Map(component.map((sku, i) => [sku, i]));
    const initial = component.map(sku => quantities.get(sku)!);
    const patterns: Pattern[] = [];
    function append(rule: OfferRule, parts: { sku: string; quantity: number; benefit?: DealBenefit; role: Bucket["role"]; triggerDiscount?: boolean }[], expand = true) {
      limit();
      const consumption = component.map(() => 0);
      for (const part of parts) {
        const i = index.get(part.sku);
        if (i === undefined) return;
        consumption[i] = qty(consumption[i] + part.quantity);
        if (consumption[i] > initial[i] + EPS) return;
      }
      const buckets: Bucket[] = parts.map(part => {
        const price = products.get(part.sku)!.listPrice;
        const base = part.benefit ? benefitPrice(price, part.benefit) : price;
        const pricing = part.role === "trigger" && !part.triggerDiscount
          ? { price: base, offers: [rule] }
          : bestUnit(price, part.quantity, units.get(part.sku) ?? [], segment, rule, part.benefit);
        const total = money(pricing.price * part.quantity);
        return { sku: part.sku, quantity: part.quantity, unitPrice: total / part.quantity, total, offers: pricing.offers, role: part.role };
      });
      patterns.push({ consumption, buckets, cost: money(buckets.reduce((sum, b) => sum + b.total, 0)), offers: uniqueOffers(buckets.flatMap(b => b.offers)) });
      if (patterns.length > (options.maxPatterns ?? 10000)) throw new Error("Demasiadas selecciones posibles en una promoción. Reduce los SKU relacionados para calcular el mejor precio exacto.");
      // A tier can qualify over several identical applications allocated to
      // the same bucket. Evaluate those blocks explicitly as well.
      if (expand && (rule.allowStacking || parts.some(part => (units.get(part.sku) ?? []).some(unit => unit.allowStacking))) && parts.some(part => (units.get(part.sku) ?? []).some(unit => minimumQuantityForRule(unit) > part.quantity))) {
        const maximum = Math.min(...consumption.map((n, i) => n > 0 ? Math.floor((initial[i] + EPS) / n) : Infinity));
        for (let times = 2; times <= maximum; times++) append(rule, parts.map(part => ({ ...part, quantity: qty(part.quantity * times) })), false);
      }
    }
    function selections(pool: string[], count: number, available: number[], visit: (chosen: { sku: string; quantity: number }[]) => void) {
      const candidates = [...new Set(pool)].filter(sku => index.has(sku) && available[index.get(sku)!] >= 1).sort();
      const chosen: { sku: string; quantity: number }[] = [];
      function walk(at: number, remaining: number) {
        limit();
        if (!remaining) { visit([...chosen]); return; }
        if (at === candidates.length) return;
        const capacity = candidates.slice(at).reduce((sum, sku) => sum + Math.floor(available[index.get(sku)!] + EPS), 0);
        if (capacity < remaining) return;
        const sku = candidates[at];
        for (let n = Math.min(remaining, Math.floor(available[index.get(sku)!] + EPS)); n >= 0; n--) {
          if (n) chosen.push({ sku, quantity: n });
          walk(at + 1, remaining - n);
          if (n) chosen.pop();
        }
      }
      walk(0, count);
    }
    for (const { rule, config } of groups.values()) {
      if (!dealSkus(config, rule.sku).some(sku => index.has(sku))) continue;
      switch (config.kind) {
        case "PACK": append(rule, [{ sku: rule.sku, quantity: config.quantity, benefit: { type: "OVERRIDE_PRICE", value: config.price / config.quantity }, role: "bundle" }]); break;
        case "KIT": append(rule, config.items.map(item => ({ ...item, role: "bundle" }))); break;
        case "MIX_MATCH":
          selections(config.skus, config.quantity, initial, chosen => append(rule, chosen.map(item => ({ ...item, benefit: config.benefit, role: "bundle" }))));
          break;
        case "BUY_GET": {
          const sameSku = config.buySkus.length === 1 && config.getSkus.length === 1 && config.buySkus[0] === config.getSkus[0];
          selections(config.buySkus, config.buyQuantity, initial, triggers => {
            const available = [...initial];
            triggers.forEach(item => { available[index.get(item.sku)!] -= item.quantity; });
            const capacity = config.getSkus.reduce((sum, sku) => sum + Math.floor(available[index.get(sku)!] ?? 0), 0);
            for (let count = Math.min(config.getQuantity, capacity); count >= (sameSku ? config.getQuantity : 1); count--) {
              selections(config.getSkus, count, available, rewards => append(rule, [
                ...triggers.map(item => ({ ...item, role: "trigger" as const, triggerDiscount: config.discountTriggers })),
                ...rewards.map(item => ({ ...item, benefit: config.benefit, role: "reward" as const })),
              ]));
            }
          });
          break;
        }
      }
    }
    const unitCache = new Map<string, UnitResult>();
    function remainder(remaining: number[]): Result {
      const buckets: Bucket[] = [];
      remaining.forEach((quantity, i) => {
        if (quantity <= EPS) return;
        const sku = component[i];
        const cacheKey = `${sku}|${quantity}`;
        let pricing = unitCache.get(cacheKey);
        if (!pricing) {
          pricing = bestUnit(products.get(sku)!.listPrice, quantity, units.get(sku) ?? [], segment);
          unitCache.set(cacheKey, pricing);
        }
        const total = money(pricing.price * quantity);
        buckets.push({ sku, quantity, unitPrice: total / quantity, total, offers: pricing.offers, role: pricing.offers.length ? "discount" : "regular" });
      });
      return { total: money(buckets.reduce((sum, b) => sum + b.total, 0)), offers: uniqueOffers(buckets.flatMap(b => b.offers)), buckets };
    }
    type Frame = { remaining: number[]; key: string; cursor: number; best: Result };
    const key = (remaining: number[]) => remaining.join(",");
    const memo = new Map<string, Result>();
    const stack: Frame[] = [{ remaining: initial, key: key(initial), cursor: 0, best: remainder(initial) }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (frame.cursor === patterns.length) {
        memo.set(frame.key, frame.best);
        stack.pop();
        if (memo.size > (options.maxStates ?? 50000)) throw new Error("La búsqueda exacta excede el límite de estados. Reduce la cotización antes de emitir.");
        continue;
      }
      limit();
      const pattern = patterns[frame.cursor];
      if (pattern.consumption.some((amount, i) => amount > frame.remaining[i] + EPS)) { frame.cursor++; continue; }
      const remaining = frame.remaining.map((amount, i) => qty(amount - pattern.consumption[i]));
      const childKey = key(remaining);
      const child = memo.get(childKey);
      if (!child) { stack.push({ remaining, key: childKey, cursor: 0, best: remainder(remaining) }); continue; }
      const total = child.total + pattern.cost;
      const offers = uniqueOffers([...pattern.offers, ...child.offers]);
      if (better(total, offers, frame.best.total, frame.best.offers, segment)) frame.best = { total, offers, pattern, child };
      frame.cursor++;
    }
    let result = memo.get(key(initial))!;
    const selected: Bucket[] = [];
    while (result.pattern && result.child) { selected.push(...result.pattern.buckets); result = result.child; }
    selected.push(...(result.buckets ?? []));
    for (const sku of component) {
      const buckets = new Map<string, QuoteAllocation>();
      selected.filter(bucket => bucket.sku === sku).forEach(({ sku: _, ...bucket }) => {
        const k = `${bucket.role}|${bucket.unitPrice}|${bucket.offers.map(groupIdentity).sort().join(",")}`;
        const prior = buckets.get(k);
        buckets.set(k, prior ? { ...prior, quantity: qty(prior.quantity + bucket.quantity), total: prior.total + bucket.total } : { ...bucket });
      });
      const allocations = [...buckets.values()];
      if (Math.abs(allocations.reduce((sum, b) => sum + b.quantity, 0) - quantities.get(sku)!) > EPS) throw new Error("No se pudo conciliar la asignación de unidades.");
      output.set(sku, allocations);
    }
  }
  return output;
}

export function allocationLabel(allocations: QuoteAllocation[] = []) {
  return allocations.map(bucket => `${bucket.quantity} u: ${bucket.offers.length ? [...new Set(bucket.offers.map(r => `${r.id} ${r.promotionName}`))].join(" + ") : "Precio regular"} = C$${bucket.total.toFixed(2)}`).join(" · ");
}

export { money as roundMoney };
