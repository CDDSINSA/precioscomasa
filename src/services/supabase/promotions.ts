import type {
  DealConfig,
  ImportedPromotionRow,
  OfferRule,
  OfferType,
  ThresholdType,
} from "../../types/domain";
import { dealSkus } from "../dealConfig";
import { dealSettingKey, readDealSettings, writeDealSetting } from "../dealSettings";
import { applyOfferDetails } from "../offerConfiguration";
import { readOfferDetails, submitOfferDetails } from "../offerConfigurationStore";
import { promotionSegmentFilter } from "../promotionFilters";
import { sampleOfferRules } from "../promotions";
import { readPromotionPages } from "../readPromotionPages";
import { supabase } from "./client";
import {
  type SyncProgressCallback,
  escapePostgrestPattern,
  isExpired,
  optionalNumber,
  todayIso,
  unique,
} from "./shared";

export type PromotionSyncMode = "full" | "partial";

type PromotionPayload = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  store_id: string;
  family: "fidelizacion" | "estrategica";
};

type PromotionRuleRow = {
  id: string;
  external_offer_id: string | null;
  promotion_id: string | null;
  offer_type: OfferType | null;
  sku: string | null;
  segment: string | null;
  min_quantity: number | null;
  fixed_price: number | null;
  discount_percent: number | null;
  discount_type: string | null;
  promotion_attribute: string | null;
  configuration_note: string | null;
  allow_stacking: boolean | null;
  threshold_quantity: number | null;
  threshold_type: ThresholdType | string | null;
};

type PromotionRow = {
  id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
};

export type OfferConfigurationFilters = {
  promotionId?: string;
  offerId?: string;
  sku?: string;
  limit?: number;
};

export type OfferConfigurationRow = {
  globalDetails?: boolean;
  deal?: DealConfig;
  ruleId: string;
  promotionId: string;
  promotionName: string;
  startsAt?: string;
  endsAt?: string;
  offerId: string;
  type: OfferType;
  sku: string;
  segment: string;
  importedQuantity?: number;
  thresholdQuantity: number;
  thresholdType: ThresholdType;
  allowStacking: boolean;
  discountPercent?: number;
  fixedPrice?: number;
  discountType?: string;
};

type OfferConfigurationResult =
  | { ok: true; rows: OfferConfigurationRow[] }
  | { ok: false; message: string };

export type OfferConfigurationMetrics = { offers: number; offerSkus: number; combinable: number };

export async function loadOfferConfigurationMetrics(signal?: AbortSignal): Promise<OfferConfigurationMetrics> {
  const offers = new Set<string>();
  const offerSkus = new Set<string>();
  const combinable = new Set<string>();
  const add = (offer: string, sku: string, stacking: boolean) => {
    offers.add(offer);
    offerSkus.add(JSON.stringify([offer, sku.trim()]));
    if (stacking) combinable.add(offer);
  };
  if (!supabase) {
    sampleOfferRules.forEach(row => add(row.id, row.sku, Boolean(row.allowStacking)));
  } else {
    // Check if high-performance RPC is available on live Supabase
    const isMockClient = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl === "https://test.supabase.co";
    if (!isMockClient) {
      try {
        const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
        const { data, error } = await supabase.rpc("get_offer_configuration_metrics").abortSignal(requestSignal);
        if (!error && data && typeof data.offers === "number") {
          return {
            offers: data.offers,
            offerSkus: data.offerSkus,
            combinable: data.combinable,
          };
        }
      } catch {
        // Fall back to cursor pagination
      }
    }

    let afterId: string | undefined;
    for (;;) {
      signal?.throwIfAborted();
      // Continue from the last primary key: no full COUNT or growing OFFSET per page.
      let query = supabase.from("offer_rules")
        .select("id,external_offer_id,sku,allow_stacking")
        .eq("is_active", true).order("id").limit(1000);
      if (afterId) query = query.gt("id", afterId);
      const requestSignal = AbortSignal.any([
        ...(signal ? [signal] : []), AbortSignal.timeout(30000),
      ]);
      const { data, error } = await query.abortSignal(requestSignal);
      if (error) {
        if (requestSignal.aborted && !signal?.aborted) {
          throw new Error("La consulta de totales no respondió en 30 segundos. Vuelva a abrir Config. ofertas para reintentar.");
        }
        throw new Error(`No se pudieron actualizar los totales de ofertas: ${error.message}`);
      }
      if (!data?.length) break;
      data.forEach(row => {
        if (row.external_offer_id && row.sku) add(row.external_offer_id, row.sku, Boolean(row.allow_stacking));
      });
      afterId = data[data.length - 1].id;
    }
  }
  return { offers: offers.size, offerSkus: offerSkus.size, combinable: combinable.size };
}

export async function importPromotionRows(rows: ImportedPromotionRow[]) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  return importPromotionRowsInBatches(rows);
}

export async function importPromotionRowsInBatches(
  rows: ImportedPromotionRow[],
  onProgress?: SyncProgressCallback,
) {
  return uploadPromotionRowsInBatches(rows, onProgress, "upsert");
}

export async function syncPromotionsToSupabase(
  rows: ImportedPromotionRow[],
  mode: PromotionSyncMode,
  onProgress?: SyncProgressCallback,
) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const promotions = promotionPayloadsFromRows(rows);
  if (!promotions.length) {
    return { ok: false, message: "No hay promociones validas para sincronizar." };
  }

  onProgress?.(0, rows.length, "Limpiando staging");
  const prepared = await supabase.rpc("prepare_promotion_sync", {
    promotions_payload: promotions,
    sync_mode: mode,
  });
  if (prepared.error) return { ok: false, message: prepared.error.message };

  const validPromotionIds = new Set(promotions.filter((promotion) => !isExpired(promotion.ends_at)).map((promotion) => promotion.id));
  const uploadRows = rows.filter((row) => validPromotionIds.has(row.promotionId));

  const upload = await uploadPromotionRowsInBatches(uploadRows, onProgress, "insert");
  if (!upload.ok) return upload;

  onProgress?.(uploadRows.length, uploadRows.length, "Publicando reglas vigentes");
  const published = await supabase.rpc("publish_promotion_sync", {
    promotions_payload: promotions,
    sync_mode: mode,
  });
  if (published.error) return { ok: false, message: published.error.message };

  const result = asPublicationResult(published.data);
  return {
    ok: true,
    message:
      `Sincronizacion completada: ${result.promotions_loaded} promociones y ${result.rules_loaded} reglas publicadas.` +
      (result.promotions_deleted ? ` ${result.promotions_deleted} promociones vencidas eliminadas.` : "") +
      (result.kits_omitted ? ` ${result.kits_omitted} líneas de kits incompletos omitidas.` : ""),
  };
}

export async function loadOfferRulesForSkus(skus: string[], segments: string[]) {
  if (!supabase) return null;

  const cleanSkus = unique(skus.map((sku) => sku.trim()).filter(Boolean));
  if (!cleanSkus.length) return [];

  const promotionMap = await loadCurrentPromotionMap();
  const promotionIds = [...promotionMap.keys()];
  if (!promotionIds.length) return [];

  const ruleSegments = segmentLookupValues(segments);
  const settings = await readDealSettings(supabase, promotionIds);
  const baseRows = await fetchOfferRuleRows(cleanSkus, ruleSegments, promotionIds);
  const configuredOfferIds = settings.filter(setting => ruleSegments.some(segment => segment.trim() === setting.segment.trim()) && dealSkus(setting.config, "").some(sku => cleanSkus.includes(sku))).map(setting => setting.offer_id);
  const kitRows = await fetchKitCompanionRows(baseRows, ruleSegments, promotionIds, configuredOfferIds);
  const configMap = new Map(settings.map(setting => [dealSettingKey(setting.promotion_id, setting.offer_id, setting.segment), setting.config]));
  const rules = mapOfferRules([...baseRows, ...kitRows], promotionMap).map(rule => ({ ...rule, deal: configMap.get(dealSettingKey(rule.promotionId, rule.id, rule.segment)) }));
  const details = await readOfferDetails(supabase, rules.map(rule => rule.id));
  return details === null ? rules : applyOfferDetails(rules, details);
}

export async function saveOfferDeal(row: OfferConfigurationRow, config: DealConfig) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  await writeDealSetting(supabase, { promotion_id: row.promotionId, offer_id: row.offerId, segment: row.segment, config });
}

export async function searchOfferConfigurations(
  filters: OfferConfigurationFilters,
): Promise<OfferConfigurationResult> {
  const promotionQuery = filters.promotionId?.trim();
  const offerQuery = filters.offerId?.trim();
  const skuQuery = filters.sku?.trim();
  const limit = filters.limit && filters.limit > 0 ? filters.limit : undefined;

  if (!supabase) {
    const matched = sampleOfferRules
      .filter((rule) => matchesConfigFilter(rule.promotionId, promotionQuery) && matchesConfigFilter(rule.id, offerQuery) && (!skuQuery || rule.sku === skuQuery));
    const finalSample = limit ? matched.slice(0, limit) : matched;
    return {
      ok: true,
      rows: finalSample
        .map((rule) => ({
          ruleId: `${rule.promotionId}-${rule.id}-${rule.sku}-${rule.segment}`,
          promotionId: rule.promotionId,
          promotionName: rule.promotionName,
          offerId: rule.id,
          type: rule.type,
          sku: rule.sku,
          segment: rule.segment,
          importedQuantity: rule.minQuantity,
          thresholdQuantity: zeroThresholdOfferType(rule.type) ? 0 : rule.thresholdQuantity ?? 1,
          thresholdType: zeroThresholdOfferType(rule.type) ? "MINIMUM" : rule.thresholdType ?? "EXACT",
          allowStacking: rule.allowStacking ?? false,
          discountPercent: rule.discountPercent,
          fixedPrice: rule.fixedPrice,
          discountType: rule.discountType,
        })),
    };
  }

  const client = supabase;
  let rows: PromotionRuleRow[];
  try {
    let total: number | null = null;
    rows = await readPromotionPages(async (from, to) => {
      if (total !== null && from >= total) return { data: [], error: null };
      if (limit !== undefined && from >= limit) return { data: [], error: null };
      const rangeTo = limit !== undefined ? Math.min(to, limit - 1) : to;
      let request = client
        .from("offer_rules")
        .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,promotion_attribute,configuration_note,allow_stacking,threshold_quantity,threshold_type", { count: "exact" })
        .eq("is_active", true)
        .order("promotion_id", { ascending: true })
        .order("id", { ascending: true });

      if (promotionQuery) request = request.ilike("promotion_id", `%${escapePostgrestPattern(promotionQuery)}%`);
      if (offerQuery) request = request.ilike("external_offer_id", `%${escapePostgrestPattern(offerQuery)}%`);
      if (skuQuery) request = request.eq("sku", skuQuery);

      const result = await request.range(from, rangeTo).abortSignal(AbortSignal.timeout(30000));
      total = result.count ?? null;
      return result;
    }) as PromotionRuleRow[];
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudieron cargar las configuraciones de ofertas." };
  }

  try {
    const promotionMap = await loadPromotionMapByIds(unique(rows.map((row) => row.promotion_id).filter(Boolean) as string[]));
    const settings = await readDealSettings(supabase, [...promotionMap.keys()]);
    const configs = new Map(settings.map(setting => [dealSettingKey(setting.promotion_id, setting.offer_id, setting.segment), setting.config]));
    const details = await readOfferDetails(supabase, rows.map(row => row.external_offer_id!).filter(Boolean));
    const companions = await fetchKitCompanionRows(rows, unique(rows.map(row => row.segment ?? " - ")), [...promotionMap.keys()]);
    const allRules = mapOfferRules([...rows, ...companions], promotionMap).map(rule => ({ ...rule, deal: configs.get(dealSettingKey(rule.promotionId, rule.id, rule.segment)) }));
    const resolved = new Map((details === null ? allRules : applyOfferDetails(allRules, details)).map(rule => [rule.ruleId, rule]));
    return { ok: true, rows: mapOfferConfigurationRows(rows, promotionMap).map(row => {
      const rule = resolved.get(row.ruleId);
      return { ...row, globalDetails: details !== null, deal: rule?.deal,
        thresholdQuantity: rule?.thresholdQuantity ?? row.thresholdQuantity,
        thresholdType: rule?.thresholdType ?? row.thresholdType };
    }) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudieron cargar las reglas." };
  }
}

export async function updateOfferCombinationSetting(row: OfferConfigurationRow, allowStacking: boolean) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const updatedAt = new Date().toISOString();
  const setting = await supabase
    .from("promotion_offer_settings")
    .upsert({
      promotion_id: row.promotionId,
      offer_id: row.offerId,
      allow_stacking: allowStacking,
      updated_at: updatedAt,
    }, {
      onConflict: "promotion_id,offer_id",
    });

  if (setting.error) return { ok: false, message: setting.error.message };

  const rules = await supabase
    .from("offer_rules")
    .update({ allow_stacking: allowStacking, updated_at: updatedAt })
    .eq("promotion_id", row.promotionId)
    .eq("external_offer_id", row.offerId);

  return rules.error
    ? { ok: false, message: rules.error.message }
    : { ok: true, message: "Configuracion de combinacion actualizada." };
}

export async function updateOfferSkuThresholdSetting(row: OfferConfigurationRow) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  if (row.globalDetails) {
    try {
      const details = [{ offer_id: row.offerId, sku: row.sku, set_id: "", quantity: row.thresholdQuantity, threshold_type: row.thresholdType }];
      const preview = await submitOfferDetails(supabase, details);
      await submitOfferDetails(supabase, details, preview.revision);
      return { ok: true, message: "Condición por oferta–SKU actualizada en todas sus promociones y segmentos." };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "No se pudo guardar." }; }
  }

  const updatedAt = new Date().toISOString();
  const thresholdQuantity = Math.max(0, Number(row.thresholdQuantity) || 0);
  const thresholdType = minimumThresholdType(row.type, row.thresholdType);
  const setting = await supabase
    .from("promotion_offer_sku_settings")
    .upsert({
      promotion_id: row.promotionId,
      offer_id: row.offerId,
      sku: row.sku,
      segment: row.segment || " - ",
      threshold_quantity: thresholdQuantity,
      threshold_type: thresholdType,
      updated_at: updatedAt,
    }, {
      onConflict: "promotion_id,offer_id,sku,segment",
    });

  if (setting.error) return { ok: false, message: setting.error.message };

  let request = supabase
    .from("offer_rules")
    .update({
      threshold_quantity: thresholdQuantity,
      threshold_type: thresholdType,
      updated_at: updatedAt,
    })
    .eq("promotion_id", row.promotionId)
    .eq("external_offer_id", row.offerId)
    .eq("sku", row.sku);

  request = row.segment ? request.eq("segment", row.segment) : request.eq("segment", " - ");
  const rules = await request;

  return rules.error
    ? { ok: false, message: rules.error.message }
    : { ok: true, message: "Threshold actualizado." };
}

async function uploadPromotionRowsInBatches(
  rows: ImportedPromotionRow[],
  onProgress: SyncProgressCallback | undefined,
  _writeMode: "insert" | "upsert",
) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const chunkSize = 750;
  const validRows = deduplicatePromotionRows(rows.filter((row) => row.offerId && row.promotionId && row.sku));

  for (let index = 0; index < validRows.length; index += chunkSize) {
    const chunk = validRows.slice(index, index + chunkSize).map((row) => ({
      offer_id: row.offerId,
      promotion_id: row.promotionId,
      promotion_name: row.promotionName,
      store_id: row.storeId,
      sku: row.sku,
      offer_type: row.type,
      min_quantity: row.quantity ?? 0,
      fixed_price: row.fixedPrice ?? null,
      discount_percent: row.discountPercent ?? null,
      discount_type: row.discountType,
      segment: row.segment,
      promotion_attribute: row.attribute ?? null,
    }));

    const response = await supabase.from("promotion_import_rows").insert(chunk);

    if (response.error) return { ok: false, message: response.error.message };
    onProgress?.(Math.min(index + chunkSize, validRows.length), validRows.length, "Enviando reglas vigentes");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const removed = rows.filter((row) => row.offerId && row.promotionId && row.sku).length - validRows.length;
  const suffix = removed > 0 ? ` ${removed} duplicados omitidos conservando la primera aparicion.` : "";
  return { ok: true, message: `Carga completada: ${validRows.length} filas.${suffix}` };
}

function deduplicatePromotionRows(rows: ImportedPromotionRow[]) {
  const firstAttributeByGroup = new Map<string, string>();
  const validRows: ImportedPromotionRow[] = [];

  rows.forEach((row) => {
    const minQuantity = row.quantity ?? 0;
    const groupKey = [
      row.offerId.trim(),
      row.promotionId.trim(),
      row.sku.trim(),
      row.segment.trim() || " - ",
      minQuantity,
    ].join("|");

    const currentAttr = (row.attribute ?? "").trim();

    if (!firstAttributeByGroup.has(groupKey)) {
      // Primera aparición de la oferta-sku: registrar atributo y conservar fila
      firstAttributeByGroup.set(groupKey, currentAttr);
      validRows.push({ ...row, quantity: minQuantity });
    } else {
      const firstAttr = firstAttributeByGroup.get(groupKey)!;
      // Si el atributo es el mismo, se permite cargar
      if (currentAttr === firstAttr) {
        validRows.push({ ...row, quantity: minQuantity });
      }
      // Si el atributo es distinto, se omite (solo se conserva la primera aparición)
    }
  });

  return validRows;
}

function promotionPayloadsFromRows(rows: ImportedPromotionRow[]) {
  const promotions = new Map<string, PromotionPayload>();
  rows.forEach((row) => {
    if (!row.promotionId) return;
    if (!promotions.has(row.promotionId)) {
      promotions.set(row.promotionId, {
        id: row.promotionId,
        name: row.promotionName || row.promotionId,
        starts_at: row.startsAt || null,
        ends_at: row.endsAt || null,
        store_id: row.storeId || "5",
        family: row.segment.trim() === "-" ? "fidelizacion" : "estrategica",
      });
    } else if (row.segment.trim() === "-") {
      promotions.get(row.promotionId)!.family = "fidelizacion";
    }
  });

  return [...promotions.values()];
}

function asPublicationResult(value: unknown) {
  const result = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    promotions_loaded: Number(result.promotions_loaded ?? 0),
    promotions_deleted: Number(result.promotions_deleted ?? 0),
    rules_loaded: Number(result.rules_loaded ?? 0),
    kits_omitted: Number(result.kits_omitted ?? 0),
  };
}

async function loadCurrentPromotionMap() {
  if (!supabase) return new Map<string, PromotionRow>();

  const today = todayIso();
  const client = supabase;
  const data = await readPromotionPages((from, to) => client
    .from("promotions")
    .select("id,name,starts_at,ends_at")
    .neq("status", "vencida")
    .or(`starts_at.is.null,starts_at.lte.${today}`)
    .or(`ends_at.is.null,ends_at.gte.${today}`)
    .order("id").range(from, to));
  return new Map(data.map((promotion) => [promotion.id, promotion]));
}

async function fetchOfferRuleRows(skus: string[], segments: string[], promotionIds: string[]) {
  if (!supabase) return [];

  const client = supabase;
  const data = await readPromotionPages((from, to) => client
    .from("offer_rules")
    .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,configuration_note,allow_stacking,threshold_quantity,threshold_type")
    .eq("is_active", true)
    .in("promotion_id", promotionIds)
    .filter("segment", "in", promotionSegmentFilter(segments))
    .in("sku", skus).order("id").range(from, to));

  return data as PromotionRuleRow[];
}

async function fetchKitCompanionRows(rows: PromotionRuleRow[], segments: string[], promotionIds: string[], configuredOfferIds: string[] = []) {
  if (!supabase) return [];

  const kitOfferIds = unique([...rows.filter((row) => row.offer_type === "KIT_OFFER").map((row) => row.external_offer_id).filter(Boolean), ...configuredOfferIds]);
  if (!kitOfferIds.length) return [];

  const client = supabase;
  const data = await readPromotionPages((from, to) => client
    .from("offer_rules")
    .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,configuration_note,allow_stacking,threshold_quantity,threshold_type")
    .eq("is_active", true)
    .in("promotion_id", promotionIds)
    .filter("segment", "in", promotionSegmentFilter(segments))
    .in("external_offer_id", kitOfferIds).order("id").range(from, to));

  return data as PromotionRuleRow[];
}

function mapOfferRules(rows: PromotionRuleRow[], promotions: Map<string, PromotionRow>): OfferRule[] {
  const mapped = rows
    .filter((row) => row.external_offer_id && row.promotion_id && row.offer_type && row.sku)
    .map((row) => ({
      id: row.external_offer_id!,
      ruleId: row.id,
      promotionId: row.promotion_id!,
      promotionName: promotions.get(row.promotion_id!)?.name ?? row.promotion_id!,
      startsAt: promotions.get(row.promotion_id!)?.starts_at ?? undefined,
      endsAt: promotions.get(row.promotion_id!)?.ends_at ?? undefined,
      type: row.offer_type!,
      sku: row.sku!.trim(),
      segment: row.segment ?? " - ",
      minQuantity: optionalNumber(row.min_quantity),
      fixedPrice: optionalNumber(row.fixed_price),
      discountPercent: optionalNumber(row.discount_percent),
      discountType: row.discount_type ?? undefined,
      promotionAttribute: row.promotion_attribute ?? undefined,
      thresholdQuantity: optionalThresholdQuantity(row.threshold_quantity),
      thresholdType: optionalThresholdType(row.threshold_type),
      allowStacking: row.allow_stacking ?? false,
      configurationNote: row.configuration_note ?? undefined,
    }));

  return deduplicateRules(mapped);
}

function mapOfferConfigurationRows(rows: PromotionRuleRow[], promotions: Map<string, PromotionRow>): OfferConfigurationRow[] {
  return rows
    .filter((row) => row.id && row.external_offer_id && row.promotion_id && row.offer_type && row.sku)
    .map((row) => ({
      ruleId: row.id,
      promotionId: row.promotion_id!,
      promotionName: promotions.get(row.promotion_id!)?.name ?? row.promotion_id!,
      offerId: row.external_offer_id!,
      startsAt: promotions.get(row.promotion_id!)?.starts_at ?? undefined,
      endsAt: promotions.get(row.promotion_id!)?.ends_at ?? undefined,
      type: row.offer_type!,
      sku: row.sku!.trim(),
      segment: row.segment ?? " - ",
      importedQuantity: optionalNumber(row.min_quantity),
      thresholdQuantity: toThresholdQuantity(row.threshold_quantity),
      thresholdType: toThresholdType(row.threshold_type),
      allowStacking: row.allow_stacking ?? false,
      discountPercent: optionalNumber(row.discount_percent),
      fixedPrice: optionalNumber(row.fixed_price),
      discountType: row.discount_type ?? undefined,
    }));
}

async function loadPromotionMapByIds(promotionIds: string[]) {
  if (!supabase || !promotionIds.length) return new Map<string, PromotionRow>();

  const { data, error } = await supabase
    .from("promotions")
    .select("id,name,starts_at,ends_at")
    .in("id", promotionIds);

  if (error || !data) return new Map<string, PromotionRow>();
  return new Map((data as PromotionRow[]).map((promotion) => [promotion.id, promotion]));
}

function matchesConfigFilter(value: string, query: string | undefined) {
  if (!query) return true;
  return value.toLowerCase().includes(query.toLowerCase());
}

function segmentLookupValues(segments: string[]) {
  const values = new Set([" - ", "-", ""]);
  segments.map((segment) => segment.trim()).filter(Boolean).forEach((segment) => {
    values.add(segment);
    if (segment === "-") values.add(" - ");
  });
  return [...values];
}

function optionalThresholdType(value: unknown): ThresholdType | undefined {
  return value === "MINIMUM" || value === "EXACT" ? value : undefined;
}

function optionalThresholdQuantity(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : undefined;
}

function toThresholdType(value: unknown): ThresholdType {
  return value === "MINIMUM" ? "MINIMUM" : "EXACT";
}

function minimumThresholdType(type: OfferType, value: unknown): ThresholdType {
  return zeroThresholdOfferType(type) ? "MINIMUM" : toThresholdType(value);
}

function zeroThresholdOfferType(type: OfferType) {
  return type === "LINE_ITEM_DISCOUNT" || type === "FIXED_QTY_PRICE";
}

function toThresholdQuantity(value: unknown) {
  const quantity = Number(value ?? 0);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
}

function deduplicateRules(rules: OfferRule[]) {
  const firstAttributeByGroup = new Map<string, string>();
  const result: OfferRule[] = [];

  rules.forEach((rule) => {
    const groupKey = [rule.promotionId, rule.id, rule.sku, rule.segment, rule.minQuantity ?? 0].join("|");
    const currentAttr = (rule.promotionAttribute ?? "").trim();

    if (!firstAttributeByGroup.has(groupKey)) {
      firstAttributeByGroup.set(groupKey, currentAttr);
      result.push(rule);
    } else {
      const firstAttr = firstAttributeByGroup.get(groupKey)!;
      if (currentAttr === firstAttr) {
        result.push(rule);
      }
    }
  });

  return result;
}
