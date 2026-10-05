import type { DealBenefit, KitSet, OfferRule, ThresholdType } from "../types/domain";

/** Global commercial conditions. Empty set_id is a non-kit condition. */
export type OfferDetail = {
  offer_id: string;
  sku: string;
  set_id: string;
  quantity: number;
  threshold_type: ThresholdType;
};
export type DetailImport = { rows: OfferDetail[]; errors: string[] };
const normalized = (value: unknown) => String(value ?? "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function parseOfferDetails(table: unknown[][]): DetailImport {
  const errors: string[] = [];
  const rows: OfferDetail[] = [];
  // Column A is deliberately excluded, regardless of its title or content.
  const header = table[0]?.map((cell, index) => index ? normalized(cell) : "") ?? [];
  const columns = ["id de oferta", "set", "item", "umbral", "cantidad"].map(name => header.indexOf(name));
  if (columns.some(index => index < 1)) return { rows, errors: ["Se requieren los encabezados Id de oferta, SET, ITEM, Umbral y Cantidad desde la columna B. La columna A se ignora."] };
  if (table.length > 10001) return { rows, errors: ["El archivo admite hasta 10,000 filas por carga."] };
  const seen = new Set<string>();
  const sets = new Map<string, string>();
  table.slice(1).forEach((cells, index) => {
    const [offer, set, sku, threshold, amount] = columns.map(col => cells[col]);
    if ([offer, set, sku, threshold, amount].every(value => String(value ?? "").trim() === "")) return;
    const row: OfferDetail = {
      offer_id: String(offer ?? "").trim(), sku: String(sku ?? "").trim(),
      set_id: String(set ?? "").trim().replace(/^set\s+/i, ""),
      quantity: Number(amount),
      threshold_type: ["exacto", "exacta", "exact"].includes(normalized(threshold)) ? "EXACT" : "MINIMUM",
    };
    const prefix = `Fila ${index + 2}: `;
    if (!row.offer_id || !row.sku || !Number.isSafeInteger(row.quantity) || row.quantity <= 0 ||
      !["exacto", "exacta", "exact", "minimo", "minima", "minimum"].includes(normalized(threshold))) {
      errors.push(prefix + "indique oferta, ITEM, cantidad entera positiva y umbral Exacto o Mínimo."); return;
    }
    const key = JSON.stringify([row.offer_id, row.sku, row.set_id]);
    if (seen.has(key)) { errors.push(prefix + "oferta–ITEM–SET duplicado."); return; }
    seen.add(key);
    if (row.set_id) {
      const setKey = JSON.stringify([row.offer_id, row.set_id]);
      const condition = `${row.quantity}|${row.threshold_type}`;
      if (sets.has(setKey) && sets.get(setKey) !== condition) errors.push(prefix + "el mismo SET tiene cantidades o umbrales distintos; no se suman.");
      sets.set(setKey, condition);
    }
    rows.push(row);
  });
  if (!rows.length && !errors.length) errors.push("El archivo no contiene configuraciones.");
  return { rows, errors };
}

export function reportBenefit(rule: OfferRule): DealBenefit | undefined {
  const type = rule.discountType?.trim().toUpperCase();
  if (type === "OVERRIDE_PRICE" || type === "PRICE_OVERRIDE" || (!type && rule.fixedPrice !== undefined)) {
    if (Number.isFinite(rule.fixedPrice) && rule.fixedPrice! >= 0) return { type: "OVERRIDE_PRICE", value: rule.fixedPrice! };
  } else if (type === "PERCENT_OFF" || !type) {
    if (Number.isFinite(rule.discountPercent) && rule.discountPercent! >= 0 && rule.discountPercent! <= 100) return { type: "PERCENT_OFF", value: rule.discountPercent! };
  }
  return undefined;
}

/** Conditions are global, but benefits and eligibility stay in their RMS context. */
export function applyOfferDetails(rules: OfferRule[], details: OfferDetail[]): OfferRule[] {
  const byOffer = new Map<string, OfferDetail[]>();
  details.forEach(detail => byOffer.set(detail.offer_id, [...(byOffer.get(detail.offer_id) ?? []), detail]));
  const kitConfigs = new Map<string, OfferRule["deal"]>();
  return rules.map(rule => {
    const offerDetails = byOffer.get(rule.id);
    if (!offerDetails?.length) return !rule.deal && (rule.thresholdQuantity ?? 0) <= 1 &&
      !(rule.type === "FIXED_QTY_PRICE" && !rule.discountType && (rule.minQuantity ?? 0) > 1) &&
      ["LINE_ITEM_DISCOUNT", "FIXED_QTY_PRICE"].includes(rule.type)
      ? { ...rule, thresholdQuantity: 1, thresholdType: "EXACT", repeatExact: true } : rule;
    const isKit = rule.type === "KIT_OFFER";
    if (offerDetails.some(detail => Boolean(detail.set_id) !== isKit)) throw new Error(`Oferta ${rule.id}: el tipo del reporte cambió. Revise la configuración adicional.`);
    if (!isKit) {
      const detail = offerDetails.find(item => item.sku === rule.sku);
      return detail ? { ...rule, deal: undefined, thresholdQuantity: detail.quantity, thresholdType: detail.threshold_type, repeatExact: true } : rule;
    }
    const key = JSON.stringify([rule.promotionId, rule.id, rule.segment.trim()]);
    if (!kitConfigs.has(key)) {
      const context = rules.filter(item => item.id === rule.id && item.promotionId === rule.promotionId && item.segment.trim() === rule.segment.trim());
      const sets = new Map<string, KitSet>();
      for (const detail of offerDetails) {
        const candidates = context.filter(item => item.sku === detail.sku);
        if (!candidates.length) continue; // A different segment may have other eligible SKUs.
        const validBenefits = candidates.map(reportBenefit).filter((b): b is DealBenefit => Boolean(b));
        if (!validBenefits.length) throw new Error(`Oferta ${rule.id}, ITEM ${detail.sku}: beneficio ausente en el reporte.`);
        const benefit = validBenefits[0];
        const set = sets.get(detail.set_id) ?? { id: detail.set_id, skus: [], quantity: detail.quantity, thresholdType: detail.threshold_type, skuBenefits: {} };
        set.skus.push(detail.sku);
        set.skuBenefits![detail.sku] = benefit;
        sets.set(detail.set_id, set);
      }
      // Never enable a subset of the configured SETs or silently omit a new report SKU.
      const complete = sets.size === new Set(offerDetails.map(item => item.set_id)).size && context.every(item => offerDetails.some(detail => detail.sku === item.sku));
      kitConfigs.set(key, complete ? { kind: "KIT", sets: [...sets.values()] } : undefined);
    }
    return { ...rule, deal: kitConfigs.get(key), configurationNote: "Configuración por oferta–SKU; beneficios del reporte" };
  });
}
