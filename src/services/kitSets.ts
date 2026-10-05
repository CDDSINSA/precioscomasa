import type { DealBenefit, KitSet } from "../types/domain";

export type KitSelection = { sku: string; quantity: number; benefit?: DealBenefit; kitSet: string; role: "bundle" };
type Selection = { sku: string; quantity: number };

/** Enumerate disjoint assignments. Minimum SETs also evaluate all larger groups,
 * allowing the exact optimizer to compare their benefit against other offers. */
export function enumerateKitSets(
  sets: KitSet[], initial: number[], index: Map<string, number>,
  selections: (pool: string[], count: number, available: number[], visit: (chosen: Selection[]) => void) => void,
  visit: (parts: KitSelection[]) => void, limit: () => void,
) {
  function walk(at: number, available: number[], parts: KitSelection[]) {
    limit();
    if (at === sets.length) { visit(parts); return; }
    const set = sets[at];
    const capacity = set.skus.reduce((sum, sku) => sum + Math.floor(available[index.get(sku) ?? -1] ?? 0), 0);
    const maximum = set.thresholdType === "EXACT" ? Math.min(set.quantity, capacity) : capacity;
    for (let count = set.quantity; count <= maximum; count++) {
      selections(set.skus, count, available, chosen => {
        const remaining = [...available];
        chosen.forEach(item => { remaining[index.get(item.sku)!] -= item.quantity; });
        walk(at + 1, remaining, [...parts, ...chosen.map(item => ({ ...item, benefit: set.skuBenefits?.[item.sku] ?? set.benefit, kitSet: set.id, role: "bundle" as const }))]);
      });
    }
  }
  walk(0, initial, []);
}
