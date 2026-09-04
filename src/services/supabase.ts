import { createClient } from "@supabase/supabase-js";
import { inventoryFeatureEnabled, inventoryStoreId } from "../config/features";
import type {
  AdminQuote,
  AdminQuoteLine,
  Customer,
  ImportedPromotionRow,
  InventoryRecord,
  OfferRule,
  OfferType,
  Product,
  ProductDepartment,
  ProductInventory,
  QuoteSummary,
  StoreLocation,
  ThresholdType,
} from "../types/domain";
import { updateStoredDataStatus } from "./dataStatus";
import { sampleOfferRules } from "./promotions";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null;
export const hasSupabaseConfig = Boolean(supabase);

const productSelectColumns =
  "sku,legacy_number,description,unit_of_measure,list_price,part_number,department_id,max_discount,taxable";
const legacyProductSelectColumns =
  "sku,legacy_number,description,unit_of_measure,list_price,part_number,max_discount,taxable";

export type PromotionSyncMode = "full" | "partial";
export type AdminQuoteSearchField = "all" | "quote" | "customer" | "user" | "segment";
export type AdminQuoteSearchFilters = {
  query?: string;
  field?: AdminQuoteSearchField;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};
export type RemoteDataMetrics = {
  promotions: number | null;
  customers: number | null;
  catalog: number | null;
  inventory: number | null;
  stores: number | null;
};
export type ProductSearchPage = {
  products: Product[];
  hasMore: boolean;
  inventory?: Map<string, ProductInventory>;
};

type ProductSearchOptions = {
  limit?: number;
  offset?: number;
  prioritizeInventory?: boolean;
  divisionId?: string;
  storeId?: string;
};

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

type ProductRow = {
  sku: string;
  legacy_number: string | null;
  description: string;
  unit_of_measure: string | null;
  list_price: number | string | null;
  part_number: string | null;
  department_id: string | null;
  max_discount: number | string | null;
  taxable: boolean | null;
};

type ProductSearchInventoryRow = ProductRow & {
  inventory_quantity: number | string | null;
};

type InventoryRow = {
  store_id: string;
  sku: string;
  quantity: number | string | null;
};

type StoreRow = {
  id: string;
  name: string;
};

type ProductDepartmentRow = {
  department_id: string;
  department_name: string;
  division_id: string;
  division_name: string;
};

type IssueQuoteOptions = {
  customer?: Customer | null;
  segment: string;
  comparedSegment?: string;
};

export type OfferConfigurationFilters = {
  promotionId?: string;
  offerId?: string;
};

export type OfferConfigurationRow = {
  ruleId: string;
  promotionId: string;
  promotionName: string;
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

export type IssuedQuote = {
  id: string;
  quoteCode: string;
  quoteNumber: number;
  createdAt: string;
  generatedByName?: string;
  generatedByEmail?: string;
};

type IssueQuoteResult =
  | { ok: true; quote: IssuedQuote }
  | { ok: false; message: string };

type IssuedQuoteRow = {
  quote_id: string;
  quote_code: string;
  quote_number: number | string;
  created_at: string;
  generated_by_name: string | null;
  generated_by_email: string | null;
};

type AdminQuoteLineRow = {
  line_number: number | null;
  sku: string;
  quantity: number | string | null;
  list_price: number | string | null;
  list_total: number | string | null;
  final_total: number | string | null;
  savings: number | string | null;
  product_description: string | null;
  applied_offer_id: string | null;
  applied_promotion_id: string | null;
  applied_promotion_name: string | null;
};

type AdminQuoteRow = {
  id: string;
  quote_number: number | string | null;
  quote_code: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_national_id: string | null;
  original_segment: string;
  compared_segment: string | null;
  subtotal_list: number | string | null;
  subtotal_final: number | string | null;
  tax: number | string | null;
  total_with_tax: number | string | null;
  savings: number | string | null;
  created_by: string | null;
  generated_by_name: string | null;
  generated_by_email: string | null;
  created_at: string;
  quote_lines?: AdminQuoteLineRow[];
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

export const sampleStores: StoreLocation[] = [
  { id: "5", name: "COMASA" },
  { id: "35", name: "COMASA FORANEA" },
  { id: "1041", name: "CEDI" },
];

export async function testSupabaseConnection() {
  if (!supabase) return { ok: false, label: "No configurado" };

  const { error } = await supabase.auth.getSession();
  return error ? { ok: false, label: "Sin conexión" } : { ok: true, label: "Conectado" };
}

export async function refreshRemoteDataStatuses() {
  if (!supabase) return;

  const metrics = await loadRemoteDataMetrics();

  updateStoredDataStatus(
    "promotions",
    statusFromCount(metrics.promotions),
    detailFromCount(metrics.promotions, "promociones"),
  );
  updateStoredDataStatus(
    "customers",
    statusFromCount(metrics.customers),
    detailFromCount(metrics.customers, "clientes"),
  );
  updateStoredDataStatus(
    "catalog",
    statusFromCount(metrics.catalog),
    detailFromCount(metrics.catalog, "productos"),
  );

  if (inventoryFeatureEnabled) {
    updateStoredDataStatus(
      "inventory",
      statusFromCount(metrics.inventory),
      detailFromCount(metrics.inventory, "registros"),
    );
    updateStoredDataStatus(
      "stores",
      statusFromCount(metrics.stores),
      detailFromCount(metrics.stores, "tiendas"),
    );
  }
}

export async function loadRemoteDataMetrics(): Promise<RemoteDataMetrics> {
  if (!supabase) {
    return { promotions: null, customers: null, catalog: null, inventory: null, stores: null };
  }

  const [promotions, customers, catalog, inventory, stores] = await Promise.all([
    countRows("promotions"),
    countRows("customers"),
    countRows("products"),
    inventoryFeatureEnabled ? countRows("inventory") : Promise.resolve(null),
    inventoryFeatureEnabled ? countRows("stores") : Promise.resolve(null),
  ]);

  return { promotions, customers, catalog, inventory, stores };
}

export async function importPromotionRows(rows: ImportedPromotionRow[]) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  return importPromotionRowsInBatches(rows);
}

export async function issueQuote(summary: QuoteSummary, options: IssueQuoteOptions): Promise<IssueQuoteResult> {
  if (!supabase) {
    return { ok: false, message: "Supabase no está configurado; no se puede asignar un consecutivo seguro." };
  }

  if (!summary.lines.length) {
    return { ok: false, message: "Agregue al menos un SKU antes de emitir la cotización." };
  }

  const payload = {
    customer: options.customer ? customerQuotePayload(options.customer) : null,
    original_segment: options.segment,
    compared_segment: options.comparedSegment || null,
    subtotal_list: summary.subtotalList,
    subtotal_final: summary.subtotalFinal,
    tax: summary.tax,
    total_with_tax: summary.totalWithTax,
    savings: summary.savings,
    lines: summary.lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      list_price: line.unitPrice,
      list_total: line.listTotal,
      final_total: line.finalTotal,
      savings: line.savings,
      product_description: line.product?.description ?? null,
      applied_offer_id: line.appliedOffer?.id ?? null,
      applied_promotion_id: line.appliedOffer?.promotionId ?? null,
      applied_promotion_name: line.appliedOffer?.promotionName ?? null,
    })),
  };

  const { data, error } = await supabase.rpc("issue_quote", { payload });
  if (error) return { ok: false, message: error.message };

  const row = Array.isArray(data) ? data[0] as IssuedQuoteRow | undefined : undefined;
  if (!row?.quote_id || !row.quote_code) {
    return { ok: false, message: "La cotización se envió, pero Supabase no devolvió el consecutivo." };
  }

  return {
    ok: true,
    quote: {
      id: row.quote_id,
      quoteCode: row.quote_code,
      quoteNumber: Number(row.quote_number),
      createdAt: row.created_at,
      generatedByName: row.generated_by_name ?? undefined,
      generatedByEmail: row.generated_by_email ?? undefined,
    },
  };
}

export async function searchIssuedQuotes(
  filters: AdminQuoteSearchFilters = {},
): Promise<{ ok: true; quotes: AdminQuote[] } | { ok: false; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const limit = Math.max(10, Math.min(filters.limit ?? 80, 200));
  const query = filters.query?.trim() ?? "";
  const field = filters.field ?? "all";

  let request: any = supabase
    .from("quotes")
    .select(
      "id,quote_number,quote_code,customer_id,customer_name,customer_phone,customer_national_id,original_segment,compared_segment,subtotal_list,subtotal_final,tax,total_with_tax,savings,created_by,generated_by_name,generated_by_email,created_at,quote_lines(line_number,sku,quantity,list_price,list_total,final_total,savings,product_description,applied_offer_id,applied_promotion_id,applied_promotion_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.dateFrom) request = request.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) request = request.lt("created_at", nextDateIso(filters.dateTo));
  if (query) request = applyIssuedQuoteSearch(request, field, query);

  const { data, error } = await request;
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudieron cargar las cotizaciones." };

  return { ok: true, quotes: (data as AdminQuoteRow[]).map(mapAdminQuote) };
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

export async function loadStores(): Promise<StoreLocation[]> {
  if (!inventoryFeatureEnabled) return [];
  if (!supabase) return sampleStores;

  const { data, error } = await supabase
    .from("stores")
    .select("id,name")
    .order("id", { ascending: true });

  if (error || !data) return sampleStores;
  return (data as StoreRow[]).map((store) => ({ id: store.id, name: store.name }));
}

export async function loadProductDepartments(): Promise<ProductDepartment[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("product_departments")
    .select("department_id,department_name,division_id,division_name")
    .order("division_name", { ascending: true })
    .order("department_name", { ascending: true });

  if (error || !data) return [];
  return (data as ProductDepartmentRow[]).map(mapProductDepartment);
}

export async function loadProductsFromSupabase(): Promise<Product[] | null> {
  if (!supabase) return null;

  const response = await supabase
    .from("products")
    .select(productSelectColumns)
    .order("description", { ascending: true })
    .limit(8000);

  const { data, error } = response.error && isMissingColumnError(response.error)
    ? await supabase
        .from("products")
        .select(legacyProductSelectColumns)
        .order("description", { ascending: true })
        .limit(8000)
    : response;

  if (error || !data?.length) return null;
  return (data as ProductRow[]).map(mapProduct);
}

export async function searchProductsFromSupabase(term: string, limit = 60): Promise<Product[] | null> {
  const page = await searchProductPageFromSupabase(term, { limit });
  return page?.products ?? null;
}

export async function searchProductPageFromSupabase(
  term: string,
  options: ProductSearchOptions = {},
): Promise<ProductSearchPage | null> {
  if (!supabase) return null;

  const query = term.trim();
  const limit = Math.max(1, Math.min(options.limit ?? 30, 100));
  const offset = Math.max(0, options.offset ?? 0);

  if (inventoryFeatureEnabled && options.prioritizeInventory) {
    const inventoryPage = await searchProductPageWithInventory(query, {
      divisionId: options.divisionId,
      limit,
      offset,
      storeId: options.storeId ?? inventoryStoreId,
    });
    if (inventoryPage) return inventoryPage;
  }

  const departmentIds = options.divisionId ? await loadDepartmentIdsForDivision(options.divisionId) : [];
  if (options.divisionId && !departmentIds.length) return { products: [], hasMore: false };

  let request = supabase
    .from("products")
    .select(productSelectColumns);

  if (query) {
    const terms = unique([query, ...query.split(/\s+/).filter((item) => item.length >= 2).slice(0, 3)]);
    const patterns = terms.map((item) => `%${escapePostgrestPattern(item)}%`);
    request = request.or(
      patterns.flatMap((pattern) => [
        `sku.ilike.${pattern}`,
        `description.ilike.${pattern}`,
        `part_number.ilike.${pattern}`,
        `legacy_number.ilike.${pattern}`,
      ]).join(","),
    );
  }

  if (departmentIds.length) request = request.in("department_id", departmentIds);

  const response = await request
    .order("description", { ascending: true })
    .range(offset, offset + limit);

  const { data, error } = response.error && isMissingColumnError(response.error)
    ? await buildLegacyProductSearchRequest(query, offset, limit)
    : response;

  if (error || !data?.length) return null;

  const products = (data as ProductRow[]).map(mapProduct);
  return {
    products: sortProductsByRelevance(products.slice(0, limit), query),
    hasMore: products.length > limit,
  };
}

async function searchProductPageWithInventory(
  query: string,
  options: { divisionId?: string; limit: number; offset: number; storeId: string },
): Promise<ProductSearchPage | null> {
  if (!supabase) return null;

  const args: Record<string, string | number> = {
    search_term: query,
    search_store_id: options.storeId,
    result_limit: options.limit + 1,
    result_offset: options.offset,
  };
  if (options.divisionId) args.search_division_id = options.divisionId;

  const { data, error } = await supabase.rpc("search_products_with_inventory", args);

  if (error || !data?.length) return null;

  const rows = data as ProductSearchInventoryRow[];
  const pageRows = rows.slice(0, options.limit);
  return {
    products: pageRows.map(mapProduct),
    hasMore: rows.length > options.limit,
    inventory: mapProductSearchInventory(pageRows, options.storeId),
  };
}

export async function loadProductsBySkus(skus: string[]): Promise<Product[]> {
  if (!supabase) return [];

  const cleanSkus = unique(skus.map((sku) => sku.trim()).filter(Boolean));
  if (!cleanSkus.length) return [];

  const { data, error } = await supabase
    .from("products")
    .select(productSelectColumns)
    .in("sku", cleanSkus);

  if (error && isMissingColumnError(error)) {
    const legacyResponse = await supabase
      .from("products")
      .select(legacyProductSelectColumns)
      .in("sku", cleanSkus);

    if (legacyResponse.error || !legacyResponse.data) return [];
    return (legacyResponse.data as ProductRow[]).map(mapProduct);
  }

  if (error || !data) return [];
  return (data as ProductRow[]).map(mapProduct);
}

export async function loadInventoryForSkus(skus: string[], storeIds: string[] = []): Promise<Map<string, ProductInventory>> {
  if (!inventoryFeatureEnabled) return new Map();
  if (!supabase) return new Map();

  const cleanSkus = unique(skus.map((sku) => sku.trim()).filter(Boolean));
  if (!cleanSkus.length) return new Map();

  let request = supabase
    .from("inventory")
    .select("store_id,sku,quantity")
    .in("sku", cleanSkus)
    .gt("quantity", 0);

  if (storeIds.length) request = request.in("store_id", storeIds);

  const { data, error } = await request;
  if (error || !data) return new Map();
  const storeMap = new Map((await loadStores()).map((store) => [store.id, store.name]));
  return mapInventory(data as InventoryRow[], storeMap);
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

export async function syncProductsToSupabase(
  products: Product[],
  onProgress?: SyncProgressCallback,
) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const validProducts = deduplicateProducts(products.filter((product) => product.sku && product.description && product.listPrice > 0));
  if (!validProducts.length) return { ok: false, message: "No hay productos validos para sincronizar." };

  onProgress?.(0, validProducts.length, "Limpiando catálogo anterior");
  const prepared = await prepareCatalogSync();
  if (!prepared.ok) return prepared;

  const uploaded = await uploadInChunks(validProducts, 700, onProgress, "Cargando catálogo vigente", async (chunk) =>
    supabase.from("products").insert(chunk.map(productPayload)),
  );
  if (!uploaded.ok) return uploaded;

  return { ok: true, message: `Sincronización de catálogo completada: ${validProducts.length} productos publicados.` };
}

async function prepareCatalogSync() {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const prepared = await supabase.rpc("prepare_catalog_sync");
  if (!prepared.error) return { ok: true, message: "Catalogo anterior limpiado." };

  if (isMissingRpcFunctionError(prepared.error)) {
    return {
      ok: false,
      message:
        "Falta ejecutar la funcion prepare_catalog_sync en Supabase. Ejecute supabase/catalog_sync.sql y vuelva a intentar la carga del catalogo.",
    };
  }

  return { ok: false, message: prepared.error.message };
}

export async function syncInventoryToSupabase(
  records: InventoryRecord[],
  onProgress?: SyncProgressCallback,
) {
  if (!inventoryFeatureEnabled) {
    return { ok: false, message: "La logica de inventario esta desactivada en este entorno." };
  }

  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const validRecords = deduplicateInventory(
    records.filter((record) => record.storeId === inventoryStoreId && record.sku),
  );
  if (!validRecords.length) {
    return { ok: false, message: `No hay inventario valido de tienda ${inventoryStoreId} para sincronizar.` };
  }

  onProgress?.(0, validRecords.length, "Limpiando inventario anterior");
  const prepared = await prepareInventorySync();
  if (!prepared.ok) return prepared;

  const uploaded = await uploadInChunks(validRecords, 900, onProgress, "Cargando inventario vigente", async (chunk) =>
    supabase.from("inventory").insert(chunk.map(inventoryPayload)),
  );
  if (!uploaded.ok) return uploaded;

  return {
    ok: true,
    message: `Sincronizacion de inventario completada: ${validRecords.length} registros de tienda ${inventoryStoreId} publicados.`,
  };
}

async function prepareInventorySync() {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const prepared = await supabase.rpc("prepare_inventory_sync");
  if (!prepared.error) return { ok: true, message: "Inventario anterior limpiado." };

  if (isMissingRpcFunctionError(prepared.error)) {
    return {
      ok: false,
      message:
        "Falta ejecutar la funcion prepare_inventory_sync en Supabase. Ejecute supabase/inventory_sync.sql y vuelva a intentar la carga del inventario.",
    };
  }

  return { ok: false, message: prepared.error.message };
}

export async function syncStoresToSupabase(
  stores: StoreLocation[],
  onProgress?: SyncProgressCallback,
) {
  if (!inventoryFeatureEnabled) {
    return { ok: false, message: "La logica de tiendas para inventario esta desactivada en este entorno." };
  }

  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const validStores = deduplicateStores(stores.filter((store) => store.id && store.name));
  if (!validStores.length) return { ok: false, message: "No hay tiendas validas para sincronizar." };

  onProgress?.(0, validStores.length, "Eliminando tiendas anteriores");
  const deleted = await supabase.from("stores").delete().not("id", "is", null);
  if (deleted.error) return { ok: false, message: deleted.error.message };

  const uploaded = await uploadInChunks(validStores, 700, onProgress, "Cargando tiendas vigentes", async (chunk) =>
    supabase.from("stores").insert(chunk),
  );
  if (!uploaded.ok) return uploaded;

  return { ok: true, message: `Sincronizacion de tiendas completada: ${validStores.length} tiendas publicadas.` };
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

export async function searchOfferConfigurations(
  filters: OfferConfigurationFilters,
  limit = 120,
): Promise<OfferConfigurationResult> {
  const promotionQuery = filters.promotionId?.trim();
  const offerQuery = filters.offerId?.trim();

  if (!supabase) {
    return {
      ok: true,
      rows: sampleOfferRules
        .filter((rule) => matchesConfigFilter(rule.promotionId, promotionQuery) && matchesConfigFilter(rule.id, offerQuery))
        .slice(0, limit)
        .map((rule) => ({
          ruleId: `${rule.promotionId}-${rule.id}-${rule.sku}-${rule.segment}`,
          promotionId: rule.promotionId,
          promotionName: rule.promotionName,
          offerId: rule.id,
          type: rule.type,
          sku: rule.sku,
          segment: rule.segment,
          importedQuantity: rule.minQuantity,
          thresholdQuantity: rule.thresholdQuantity ?? 1,
          thresholdType: rule.thresholdType ?? "EXACT",
          allowStacking: rule.allowStacking ?? false,
          discountPercent: rule.discountPercent,
          fixedPrice: rule.fixedPrice,
          discountType: rule.discountType,
        })),
    };
  }

  let request = supabase
    .from("offer_rules")
    .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,configuration_note,allow_stacking,threshold_quantity,threshold_type")
    .eq("is_active", true)
    .order("promotion_id", { ascending: true })
    .limit(limit);

  if (promotionQuery) request = request.ilike("promotion_id", `%${escapePostgrestPattern(promotionQuery)}%`);
  if (offerQuery) request = request.ilike("external_offer_id", `%${escapePostgrestPattern(offerQuery)}%`);

  const { data, error } = await request;
  if (error || !data) {
    return {
      ok: false,
      message: error?.message ?? "No se pudieron cargar las configuraciones de ofertas.",
    };
  }

  const rows = data as PromotionRuleRow[];
  const promotionMap = await loadPromotionMapByIds(unique(rows.map((row) => row.promotion_id).filter(Boolean) as string[]));
  return { ok: true, rows: mapOfferConfigurationRows(rows, promotionMap) };
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

  const updatedAt = new Date().toISOString();
  const thresholdQuantity = Math.max(1, Number(row.thresholdQuantity) || 1);
  const thresholdType = toThresholdType(row.thresholdType);
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
    .select("id,name,starts_at,ends_at")
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
    .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,configuration_note,allow_stacking,threshold_quantity,threshold_type")
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
    .select("id,external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,configuration_note,allow_stacking,threshold_quantity,threshold_type")
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
      ruleId: row.id,
      promotionId: row.promotion_id!,
      promotionName: promotions.get(row.promotion_id!)?.name ?? row.promotion_id!,
      startsAt: promotions.get(row.promotion_id!)?.starts_at ?? undefined,
      endsAt: promotions.get(row.promotion_id!)?.ends_at ?? undefined,
      type: row.offer_type!,
      sku: row.sku!,
      segment: row.segment ?? " - ",
      minQuantity: Number(row.min_quantity ?? 0) || undefined,
      fixedPrice: row.fixed_price === null ? undefined : Number(row.fixed_price),
      discountPercent: row.discount_percent === null ? undefined : Number(row.discount_percent),
      discountType: row.discount_type ?? undefined,
      thresholdQuantity: Number(row.threshold_quantity ?? 1) || 1,
      thresholdType: toThresholdType(row.threshold_type),
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
      type: row.offer_type!,
      sku: row.sku!,
      segment: row.segment ?? " - ",
      importedQuantity: Number(row.min_quantity ?? 0) || undefined,
      thresholdQuantity: Number(row.threshold_quantity ?? 1) || 1,
      thresholdType: toThresholdType(row.threshold_type),
      allowStacking: row.allow_stacking ?? false,
      discountPercent: row.discount_percent === null ? undefined : Number(row.discount_percent),
      fixedPrice: row.fixed_price === null ? undefined : Number(row.fixed_price),
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

function mapProduct(row: ProductRow): Product {
  return {
    sku: row.sku,
    legacyNumber: row.legacy_number ?? undefined,
    description: row.description,
    unitOfMeasure: row.unit_of_measure ?? undefined,
    listPrice: Number(row.list_price ?? 0),
    partNumber: row.part_number ?? undefined,
    departmentId: row.department_id ?? undefined,
    maxDiscount: row.max_discount === null ? undefined : Number(row.max_discount),
    taxable: row.taxable ?? true,
  };
}

function mapProductDepartment(row: ProductDepartmentRow): ProductDepartment {
  return {
    departmentId: row.department_id,
    departmentName: row.department_name,
    divisionId: row.division_id,
    divisionName: row.division_name,
  };
}

function mapAdminQuote(row: AdminQuoteRow): AdminQuote {
  const lines = [...(row.quote_lines ?? [])]
    .sort((left, right) => Number(left.line_number ?? 0) - Number(right.line_number ?? 0))
    .map(mapAdminQuoteLine);

  return {
    id: row.id,
    quoteCode: row.quote_code ?? undefined,
    quoteNumber: row.quote_number === null ? undefined : Number(row.quote_number),
    customerId: row.customer_id ?? undefined,
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    customerNationalId: row.customer_national_id ?? undefined,
    originalSegment: row.original_segment,
    comparedSegment: row.compared_segment ?? undefined,
    subtotalList: Number(row.subtotal_list ?? 0),
    subtotalFinal: Number(row.subtotal_final ?? 0),
    tax: Number(row.tax ?? 0),
    totalWithTax: Number(row.total_with_tax ?? 0),
    savings: Number(row.savings ?? 0),
    createdBy: row.created_by ?? undefined,
    generatedByName: row.generated_by_name ?? undefined,
    generatedByEmail: row.generated_by_email ?? undefined,
    createdAt: row.created_at,
    lines,
  };
}

function mapAdminQuoteLine(row: AdminQuoteLineRow): AdminQuoteLine {
  return {
    lineNumber: Number(row.line_number ?? 0),
    sku: row.sku,
    quantity: Number(row.quantity ?? 0),
    listPrice: Number(row.list_price ?? 0),
    listTotal: Number(row.list_total ?? 0),
    finalTotal: Number(row.final_total ?? 0),
    savings: Number(row.savings ?? 0),
    productDescription: row.product_description ?? undefined,
    appliedOfferId: row.applied_offer_id ?? undefined,
    appliedPromotionId: row.applied_promotion_id ?? undefined,
    appliedPromotionName: row.applied_promotion_name ?? undefined,
  };
}

function mapInventory(rows: InventoryRow[], storeMap: Map<string, string>) {
  const grouped = new Map<string, ProductInventory>();
  rows.forEach((row) => {
    const current = grouped.get(row.sku) ?? { totalQuantity: 0, stores: [] };
    const quantity = Number(row.quantity ?? 0);
    current.totalQuantity += quantity;
    current.stores.push({
      storeId: row.store_id,
      storeName: storeMap.get(row.store_id) || `Tienda ${row.store_id}`,
      quantity,
    });
    grouped.set(row.sku, current);
  });

  grouped.forEach((inventory) => {
    inventory.stores.sort((left, right) => right.quantity - left.quantity);
  });

  return grouped;
}

function mapProductSearchInventory(rows: ProductSearchInventoryRow[], storeId: string) {
  const grouped = new Map<string, ProductInventory>();
  rows.forEach((row) => {
    const quantity = Number(row.inventory_quantity ?? 0);
    grouped.set(row.sku, {
      totalQuantity: quantity,
      stores: quantity > 0
        ? [{ storeId, storeName: `Tienda ${storeId}`, quantity }]
        : [],
    });
  });

  return grouped;
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

function customerQuotePayload(customer: Customer) {
  return {
    customer_id: customer.customerId,
    display_name: customer.displayName,
    mobile: customer.mobile ?? null,
    national_id: customer.nationalId ?? null,
    segment: customer.segment,
    address: customer.address ?? null,
  };
}

function productPayload(product: Product) {
  return {
    sku: product.sku,
    legacy_number: product.legacyNumber ?? null,
    description: product.description,
    unit_of_measure: product.unitOfMeasure ?? null,
    list_price: product.listPrice,
    part_number: product.partNumber ?? null,
    department_id: product.departmentId ?? null,
    max_discount: product.maxDiscount ?? null,
    taxable: product.taxable,
    updated_at: new Date().toISOString(),
  };
}

function inventoryPayload(record: InventoryRecord) {
  return {
    store_id: record.storeId,
    sku: record.sku,
    quantity: record.quantity,
    updated_at: new Date().toISOString(),
  };
}

async function uploadInChunks<T>(
  rows: T[],
  chunkSize: number,
  onProgress: SyncProgressCallback | undefined,
  detail: string,
  upload: (chunk: T[]) => Promise<{ error: { message: string } | null }>,
) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const response = await upload(chunk);
    if (response.error) return { ok: false, message: response.error.message };
    onProgress?.(Math.min(index + chunk.length, rows.length), rows.length, detail);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { ok: true, message: `Carga completada: ${rows.length} filas.` };
}

function deduplicateProducts(products: Product[]) {
  const grouped = new Map<string, Product>();
  products.forEach((product) => grouped.set(product.sku, product));
  return [...grouped.values()];
}

function deduplicateInventory(records: InventoryRecord[]) {
  const grouped = new Map<string, InventoryRecord>();
  records.forEach((record) => {
    const key = `${record.storeId}|${record.sku}`;
    const current = grouped.get(key);
    grouped.set(key, current ? { ...record, quantity: current.quantity + record.quantity } : record);
  });
  return [...grouped.values()];
}

function deduplicateStores(stores: StoreLocation[]) {
  const grouped = new Map<string, StoreLocation>();
  stores.forEach((store) => grouped.set(store.id, store));
  return [...grouped.values()];
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

function applyIssuedQuoteSearch(request: any, field: AdminQuoteSearchField, query: string) {
  const pattern = `%${escapePostgrestPattern(query)}%`;
  const quoteFilters = [`quote_code.ilike.${pattern}`];
  const numericQuote = Number(query);
  if (Number.isInteger(numericQuote) && numericQuote > 0) quoteFilters.push(`quote_number.eq.${numericQuote}`);
  if (isUuid(query)) quoteFilters.push(`id.eq.${query}`);

  if (field === "quote") return quoteFilters.length > 1 ? request.or(quoteFilters.join(",")) : request.ilike("quote_code", pattern);

  const fieldFilters: Record<Exclude<AdminQuoteSearchField, "all" | "quote">, string[]> = {
    customer: [
      `customer_id.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `customer_phone.ilike.${pattern}`,
      `customer_national_id.ilike.${pattern}`,
    ],
    user: [
      `generated_by_name.ilike.${pattern}`,
      `generated_by_email.ilike.${pattern}`,
    ],
    segment: [
      `original_segment.ilike.${pattern}`,
      `compared_segment.ilike.${pattern}`,
    ],
  };

  if (field !== "all") return request.or(fieldFilters[field].join(","));

  return request.or([
    ...quoteFilters,
    ...fieldFilters.customer,
    ...fieldFilters.user,
    ...fieldFilters.segment,
  ].join(","));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nextDateIso(value: string) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

async function loadDepartmentIdsForDivision(divisionId: string) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("product_departments")
    .select("department_id")
    .eq("division_id", divisionId);

  if (error || !data) return [];
  return (data as Pick<ProductDepartmentRow, "department_id">[]).map((row) => row.department_id);
}

async function buildLegacyProductSearchRequest(query: string, offset: number, limit: number) {
  if (!supabase) return { data: null, error: { message: "Supabase no esta configurado." } };

  let request = supabase
    .from("products")
    .select(legacyProductSelectColumns);

  if (query) {
    const terms = unique([query, ...query.split(/\s+/).filter((item) => item.length >= 2).slice(0, 3)]);
    const patterns = terms.map((item) => `%${escapePostgrestPattern(item)}%`);
    request = request.or(
      patterns.flatMap((pattern) => [
        `sku.ilike.${pattern}`,
        `description.ilike.${pattern}`,
        `part_number.ilike.${pattern}`,
        `legacy_number.ilike.${pattern}`,
      ]).join(","),
    );
  }

  return request
    .order("description", { ascending: true })
    .range(offset, offset + limit);
}

function isMissingRpcFunctionError(error: { code?: string; message: string }) {
  return error.code === "PGRST202" || error.message.toLowerCase().includes("could not find the function");
}

function isMissingColumnError(error: { code?: string; message: string }) {
  return error.code === "42703" || error.message.toLowerCase().includes("department_id");
}

function sortProductsByRelevance(products: Product[], query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return products;
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return [...products].sort((left, right) => {
    const scoreDifference = productSearchScore(left, normalizedQuery, queryTokens) - productSearchScore(right, normalizedQuery, queryTokens);
    if (scoreDifference !== 0) return scoreDifference;
    return left.description.localeCompare(right.description, "es");
  });
}

function productSearchScore(product: Product, query: string, queryTokens: string[]) {
  const sku = normalizeSearchValue(product.sku);
  const partNumber = normalizeSearchValue(product.partNumber);
  const legacyNumber = normalizeSearchValue(product.legacyNumber);
  const description = normalizeSearchValue(product.description);
  const searchable = [sku, partNumber, legacyNumber, description].join(" ");

  if (sku === query) return 0;
  if (partNumber === query || legacyNumber === query) return 1;
  if (sku.startsWith(query)) return 2;
  if (partNumber.startsWith(query) || legacyNumber.startsWith(query)) return 3;
  if (description.startsWith(query)) return 4;
  if (description.includes(query)) return 5;
  if (queryTokens.length && queryTokens.every((token) => searchable.includes(token))) return 6;
  if (sku.includes(query) || partNumber.includes(query) || legacyNumber.includes(query)) return 7;
  return 8;
}

function normalizeSearchValue(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function toThresholdType(value: unknown): ThresholdType {
  return value === "MINIMUM" ? "MINIMUM" : "EXACT";
}

async function countRows(table: "promotions" | "customers" | "products" | "inventory" | "stores") {
  if (!supabase) return null;

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  return error ? null : count ?? 0;
}

function statusFromCount(count: number | null) {
  if (count === null) return "warning";
  return count > 0 ? "ok" : "pending";
}

function detailFromCount(count: number | null, label: string) {
  if (count === null) return "No se pudo verificar";
  return count > 0 ? `${count} ${label}` : "Sin datos";
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
