import { createClient } from "@supabase/supabase-js";
import type { Customer, ImportedPromotionRow, OfferRule, OfferType } from "../types/domain";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null;
export const hasSupabaseConfig = Boolean(supabase);

export type PromotionSyncMode = "full" | "partial";

type SyncProgressCallback = (sent: number, total: number, detail?: string) => void;

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
  configuration_note: string | null;
};

type PromotionRow = {
  id: string;
  name: string;
};

type CustomerRow = {
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  display_name: string | null;
  mobile: string | null;
  national_id: string | null;
  segment: string | null;
  address: string | null;
};

export const sampleCustomers: Customer[] = [
  {
    customerId: "267637",
    firstName: "Ferreteria",
    lastName: "Dua",
    displayName: "Ferreteria Dua",
    mobile: "84695915",
    segment: "1002",
    address: "DE LA IGLESIA EL CALVARIO 2C ABAJO MEDIA AL LAGO SAN JOSE ORIENTAL",
  },
  {
    customerId: "528700",
    firstName: "Eduardo",
    lastName: "Calderon",
    orgName: "Eduardo Ariel Calderon Centeno",
    displayName: "Eduardo Ariel Calderon Centeno",
    mobile: "89457522",
    segment: "1003",
    address: "MANAGUA - SEMAFORO ROLTER 2C SUR 1C ESTE CASA NO KI14 CENTRAL",
  },
];

export async function testSupabaseConnection() {
  if (!supabase) return { ok: false, label: "No configurado" };

  const { error } = await supabase.auth.getSession();
  return error ? { ok: false, label: "Sin conexion" } : { ok: true, label: "Conectado" };
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

export async function searchCustomers(term: string, limit = 30): Promise<Customer[]> {
  const query = term.trim();
  if (!supabase) return filterSampleCustomers(query, limit);

  let request = supabase
    .from("customers")
    .select("customer_id,first_name,last_name,org_name,display_name,mobile,national_id,segment,address")
    .order("display_name", { ascending: true })
    .limit(limit);

  if (query) {
    const pattern = `%${escapePostgrestPattern(query)}%`;
    request = request.or(
      [
        `display_name.ilike.${pattern}`,
        `customer_id.ilike.${pattern}`,
        `mobile.ilike.${pattern}`,
        `national_id.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error } = await request;
  if (error || !data) return [];
  return (data as CustomerRow[]).map(mapCustomer);
}

export async function syncCustomersToSupabase(
  customers: Customer[],
  onProgress?: SyncProgressCallback,
) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const validCustomers = deduplicateCustomers(customers.filter((customer) => customer.customerId && customer.displayName));
  if (!validCustomers.length) {
    return { ok: false, message: "No hay clientes validos para sincronizar." };
  }

  onProgress?.(0, validCustomers.length, "Eliminando clientes anteriores");
  const deleted = await supabase
    .from("customers")
    .delete()
    .not("customer_id", "is", null);

  if (deleted.error) return { ok: false, message: deleted.error.message };

  const chunkSize = 750;
  for (let index = 0; index < validCustomers.length; index += chunkSize) {
    const chunk = validCustomers.slice(index, index + chunkSize).map(customerPayload);
    const inserted = await supabase.from("customers").insert(chunk);
    if (inserted.error) return { ok: false, message: inserted.error.message };
    onProgress?.(
      Math.min(index + chunk.length, validCustomers.length),
      validCustomers.length,
      "Cargando clientes vigentes",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const duplicates = customers.filter((customer) => customer.customerId && customer.displayName).length - validCustomers.length;
  return {
    ok: true,
    message:
      `Sincronizacion de clientes completada: ${validCustomers.length} clientes publicados.` +
      (duplicates ? ` ${duplicates} duplicados consolidados.` : ""),
  };
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
      (result.kits_omitted ? ` ${result.kits_omitted} lineas de kits 4+ omitidas.` : ""),
  };
}

export async function loadOfferRulesForSkus(skus: string[], segments: string[]) {
  if (!supabase) return null;

  const cleanSkus = unique(skus.map((sku) => sku.trim()).filter(Boolean));
  if (!cleanSkus.length) return [];

  const promotionMap = await loadCurrentPromotionMap();
  const promotionIds = [...promotionMap.keys()];
  if (!promotionIds.length) return [];

  const ruleSegments = unique([...segments.filter(Boolean), " - "]);
  const baseRows = await fetchOfferRuleRows(cleanSkus, ruleSegments, promotionIds);
  const kitRows = await fetchKitCompanionRows(baseRows, ruleSegments, promotionIds);
  return mapOfferRules([...baseRows, ...kitRows], promotionMap);
}

async function uploadPromotionRowsInBatches(
  rows: ImportedPromotionRow[],
  onProgress: SyncProgressCallback | undefined,
  writeMode: "insert" | "upsert",
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
    }));

    const response =
      writeMode === "insert"
        ? await supabase.from("promotion_import_rows").insert(chunk)
        : await supabase.from("promotion_import_rows").upsert(chunk, {
            onConflict: "offer_id,promotion_id,sku,segment,min_quantity",
          });

    if (response.error) return { ok: false, message: response.error.message };
    onProgress?.(Math.min(index + chunkSize, validRows.length), validRows.length, "Enviando reglas vigentes");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const removed = rows.filter((row) => row.offerId && row.promotionId && row.sku).length - validRows.length;
  const suffix = removed > 0 ? ` ${removed} duplicados omitidos conservando la primera aparicion.` : "";
  return { ok: true, message: `Carga completada: ${validRows.length} filas.${suffix}` };
}

function deduplicatePromotionRows(rows: ImportedPromotionRow[]) {
  const grouped = new Map<string, ImportedPromotionRow>();

  rows.forEach((row) => {
    const minQuantity = row.quantity ?? 0;
    const key = [
      row.offerId.trim(),
      row.promotionId.trim(),
      row.sku.trim(),
      row.segment.trim() || " - ",
      minQuantity,
    ].join("|");

    if (!grouped.has(key)) {
      grouped.set(key, { ...row, quantity: minQuantity });
    }
  });

  return [...grouped.values()];
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

function isExpired(endsAt: string | null) {
  return Boolean(endsAt && endsAt < todayIso());
}

function todayIso() {
  const now = new Date();
  const localTime = now.getTime() - now.getTimezoneOffset() * 60000;
  return new Date(localTime).toISOString().slice(0, 10);
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
  const { data, error } = await supabase
    .from("promotions")
    .select("id,name")
    .neq("status", "vencida")
    .or(`starts_at.is.null,starts_at.lte.${today}`)
    .or(`ends_at.is.null,ends_at.gte.${today}`);

  if (error || !data) return new Map<string, PromotionRow>();
  return new Map(data.map((promotion) => [promotion.id, promotion]));
}

async function fetchOfferRuleRows(skus: string[], segments: string[], promotionIds: string[]) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("offer_rules")
    .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,configuration_note")
    .eq("is_active", true)
    .in("promotion_id", promotionIds)
    .in("segment", segments)
    .in("sku", skus);

  return error || !data ? [] : (data as PromotionRuleRow[]);
}

async function fetchKitCompanionRows(rows: PromotionRuleRow[], segments: string[], promotionIds: string[]) {
  if (!supabase) return [];

  const kitOfferIds = unique(rows.filter((row) => row.offer_type === "KIT_OFFER").map((row) => row.external_offer_id).filter(Boolean));
  if (!kitOfferIds.length) return [];

  const { data, error } = await supabase
    .from("offer_rules")
    .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,configuration_note")
    .eq("is_active", true)
    .in("promotion_id", promotionIds)
    .in("segment", segments)
    .in("external_offer_id", kitOfferIds);

  return error || !data ? [] : (data as PromotionRuleRow[]);
}

function mapOfferRules(rows: PromotionRuleRow[], promotions: Map<string, PromotionRow>): OfferRule[] {
  const mapped = rows
    .filter((row) => row.external_offer_id && row.promotion_id && row.offer_type && row.sku)
    .map((row) => ({
      id: row.external_offer_id!,
      promotionId: row.promotion_id!,
      promotionName: promotions.get(row.promotion_id!)?.name ?? row.promotion_id!,
      type: row.offer_type!,
      sku: row.sku!,
      segment: row.segment ?? " - ",
      minQuantity: Number(row.min_quantity ?? 0) || undefined,
      fixedPrice: row.fixed_price === null ? undefined : Number(row.fixed_price),
      discountPercent: row.discount_percent === null ? undefined : Number(row.discount_percent),
      discountType: row.discount_type ?? undefined,
      configurationNote: row.configuration_note ?? undefined,
    }));

  return deduplicateRules(mapped);
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    customerId: row.customer_id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    orgName: row.org_name ?? undefined,
    displayName: row.display_name || row.org_name || [row.first_name, row.last_name].filter(Boolean).join(" "),
    mobile: row.mobile ?? undefined,
    nationalId: row.national_id ?? undefined,
    segment: row.segment ?? "",
    address: row.address ?? undefined,
  };
}

function customerPayload(customer: Customer) {
  return {
    customer_id: customer.customerId,
    first_name: customer.firstName,
    last_name: customer.lastName,
    org_name: customer.orgName ?? null,
    display_name: customer.displayName,
    mobile: customer.mobile ?? null,
    national_id: customer.nationalId ?? null,
    segment: customer.segment,
    address: customer.address ?? null,
    updated_at: new Date().toISOString(),
  };
}

function deduplicateCustomers(customers: Customer[]) {
  const grouped = new Map<string, Customer>();
  customers.forEach((customer) => {
    const current = grouped.get(customer.customerId);
    grouped.set(customer.customerId, current ? { ...current, ...withoutEmptyCustomerValues(customer) } : customer);
  });
  return [...grouped.values()];
}

function withoutEmptyCustomerValues(customer: Customer) {
  return Object.entries(customer).reduce<Partial<Customer>>((acc, [key, value]) => {
    if (value !== undefined && value !== "") acc[key as keyof Customer] = value;
    return acc;
  }, {});
}

function filterSampleCustomers(term: string, limit: number) {
  const query = term.toLowerCase();
  return sampleCustomers
    .filter((customer) => {
      if (!query) return true;
      return [customer.customerId, customer.displayName, customer.mobile, customer.nationalId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    })
    .slice(0, limit);
}

function escapePostgrestPattern(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function deduplicateRules(rules: OfferRule[]) {
  const grouped = new Map<string, OfferRule>();
  rules.forEach((rule) => {
    const key = [rule.promotionId, rule.id, rule.sku, rule.segment, rule.minQuantity ?? 0].join("|");
    if (!grouped.has(key)) grouped.set(key, rule);
  });
  return [...grouped.values()];
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
