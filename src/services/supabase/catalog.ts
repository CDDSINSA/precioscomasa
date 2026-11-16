import { inventoryFeatureEnabled, inventoryStoreId } from "../../config/features";
import {
  PEINSA_SUPPLIER_ID,
  isPeinsaSupplier,
  isSupplierRestrictedRole,
  restrictProductsForRole,
} from "../../constants/suppliers";
import type {
  AppRole,
  InventoryRecord,
  Product,
  ProductDepartment,
  ProductInventory,
  StoreLocation,
} from "../../types/domain";
import { updateStoredDataStatus } from "../dataStatus";
import { commonDb, supabase } from "./client";
import {
  type SyncProgressCallback,
  escapePostgrestPattern,
  isMissingColumnError,
  isMissingRpcFunctionError,
  unique,
  uploadInChunks,
} from "./shared";

/** Filtro PostgREST: productos cuyo supplier o supplier_id es PEINSA. */
const peinsaSupplierFilter = `supplier.eq.${PEINSA_SUPPLIER_ID},supplier_id.eq.${PEINSA_SUPPLIER_ID}`;

const productSelectColumns =
  "sku,legacy_number,description,unit_of_measure,list_price,part_number,department_id,max_discount,taxable,supplier,sup_name";
const standardProductSelectColumns =
  "sku,legacy_number,description,unit_of_measure,list_price,part_number,department_id,max_discount,taxable";
const legacyProductSelectColumns =
  "sku,legacy_number,description,unit_of_measure,list_price,part_number,max_discount,taxable";

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
  role?: AppRole;
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
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier?: string | null;
  sup_name?: string | null;
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

export const sampleStores: StoreLocation[] = [
  { id: "5", name: "COMASA" },
  { id: "35", name: "COMASA FORANEA" },
  { id: "1041", name: "CEDI" },
];

export async function loadStores(): Promise<StoreLocation[]> {
  if (!inventoryFeatureEnabled) return [];
  if (!supabase) return sampleStores;

  const { data, error } = await commonDb()!
    .from("stores")
    .select("id,name")
    .order("id", { ascending: true });

  if (error || !data) return sampleStores;
  return (data as StoreRow[]).map((store) => ({ id: store.id, name: store.name }));
}

export async function loadProductDepartments(): Promise<ProductDepartment[]> {
  if (!supabase) return [];

  const { data, error } = await commonDb()!
    .from("product_departments")
    .select("department_id,department_name,division_id,division_name")
    .order("division_name", { ascending: true })
    .order("department_name", { ascending: true });

  if (error || !data) return [];
  return (data as ProductDepartmentRow[]).map(mapProductDepartment);
}

export async function loadProductsFromSupabase(role?: AppRole): Promise<Product[] | null> {
  if (!supabase) return null;
  const restricted = isSupplierRestrictedRole(role);

  const request = (columns: string, withSupplierFilter: boolean) => {
    let query = commonDb()!
      .from("products")
      .select(columns)
      .order("description", { ascending: true })
      .limit(8000);
    if (withSupplierFilter) query = query.or(peinsaSupplierFilter);
    return query;
  };

  let response: { data: unknown; error: { code?: string; message: string } | null } =
    await request(productSelectColumns, restricted);

  if (response.error && isMissingColumnError(response.error)) {
    // Sin columnas de proveedor no se puede restringir: el rol PEINSA no recibe catálogo.
    if (restricted) {
      updateStoredDataStatus("catalog", "error", "Faltan columnas de proveedor en Supabase (ejecute peinsa_role.sql)");
      return null;
    }
    response = await request(standardProductSelectColumns, false);
  }

  if (response.error && isMissingColumnError(response.error)) {
    response = await request(legacyProductSelectColumns, false);
  }

  const { data, error } = response;
  if (error) {
    if (restricted) updateStoredDataStatus("catalog", "error", error.message);
    return null;
  }
  if (!Array.isArray(data) || !data.length) return null;
  return restrictProductsForRole(data as ProductRow[], role).map(mapProduct);
}

export async function searchProductsFromSupabase(term: string, limit = 60, role?: AppRole): Promise<Product[] | null> {
  const page = await searchProductPageFromSupabase(term, { limit, role });
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
      role: options.role,
    });
    if (inventoryPage) return inventoryPage;
  }

  const restricted = isSupplierRestrictedRole(options.role);
  const departmentIds = options.divisionId ? await loadDepartmentIdsForDivision(options.divisionId) : [];
  if (options.divisionId && !departmentIds.length) return { products: [], hasMore: false };

  let request = commonDb()!
    .from("products")
    .select(productSelectColumns);

  // Antes este camino (respaldo cuando la RPC no devuelve filas) no filtraba proveedor.
  if (restricted) request = request.or(peinsaSupplierFilter);

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

  if (response.error && isMissingColumnError(response.error) && restricted) return null;

  const { data, error } = response.error && isMissingColumnError(response.error)
    ? await buildLegacyProductSearchRequest(query, offset, limit)
    : response;

  if (error || !data?.length) return null;

  const products = restrictProductsForRole(data as ProductRow[], options.role).map(mapProduct);
  return {
    products: sortProductsByRelevance(products.slice(0, limit), query),
    hasMore: products.length > limit,
  };
}

async function searchProductPageWithInventory(
  query: string,
  options: { divisionId?: string; limit: number; offset: number; storeId: string; role?: AppRole },
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
  const validRows = restrictProductsForRole(rows, options.role);
  const pageRows = validRows.slice(0, options.limit);
  if (isSupplierRestrictedRole(options.role) && !pageRows.length) {
    return { products: [], hasMore: false, inventory: new Map() };
  }
  return {
    products: pageRows.map(mapProduct),
    hasMore: rows.length > options.limit,
    inventory: mapProductSearchInventory(pageRows, options.storeId),
  };
}

export async function loadProductsBySkus(skus: string[], role?: AppRole): Promise<Product[]> {
  if (!supabase) return [];

  const cleanSkus = unique(skus.map((sku) => sku.trim()).filter(Boolean));
  if (!cleanSkus.length) return [];
  const restricted = isSupplierRestrictedRole(role);

  const request = (columns: string) => {
    let query = commonDb()!.from("products").select(columns).in("sku", cleanSkus);
    if (restricted) query = query.or(peinsaSupplierFilter);
    return query;
  };

  let response: { data: unknown; error: { code?: string; message: string } | null } =
    await request(productSelectColumns);

  if (response.error && isMissingColumnError(response.error)) {
    if (restricted) return [];
    response = await request(standardProductSelectColumns);
  }

  if (response.error && isMissingColumnError(response.error)) {
    response = await request(legacyProductSelectColumns);
  }

  const { data, error } = response;
  if (error || !Array.isArray(data)) return [];
  return restrictProductsForRole(data as ProductRow[], role).map(mapProduct);
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

export async function syncProductsToSupabase(
  products: Product[],
  onProgress?: SyncProgressCallback,
) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const validProducts = deduplicateProducts(products.filter((product) => product.sku && product.description && product.listPrice > 0));
  if (!validProducts.length) return { ok: false, message: "No hay productos validos para sincronizar." };

  // Verificar ANTES de vaciar la tabla que existen las columnas de proveedor.
  // Antes se descartaban en silencio y el rol PEINSA quedaba sin catálogo.
  const supplierColumns = await commonDb()!.from("products").select("supplier,supplier_id,sup_name,supplier_name").limit(1);
  if (supplierColumns.error && isMissingColumnError(supplierColumns.error)) {
    return {
      ok: false,
      message:
        "Faltan las columnas de proveedor (supplier, supplier_id) en la tabla products. Ejecute supabase/peinsa_role.sql en Supabase y vuelva a cargar el catálogo. No se modificó el catálogo actual.",
    };
  }
  const peinsaCount = validProducts.filter(isPeinsaSupplier).length;
  const withSupplier = validProducts.filter((product) => (product.supplierId ?? product.supplier ?? "").trim()).length;

  onProgress?.(0, validProducts.length, "Limpiando catálogo anterior");
  const prepared = await prepareCatalogSync();
  if (!prepared.ok) return prepared;

  const excludedColumns = new Set<string>();
  const uploaded = await uploadInChunks(validProducts, 700, onProgress, "Cargando catálogo vigente", async (chunk) => {
    while (true) {
      const response = await commonDb()!.from("products").insert(chunk.map((p) => productPayload(p, excludedColumns)));
      if (response.error && isMissingColumnError(response.error)) {
        const match = response.error.message.match(/column ["']?([a-zA-Z0-9_]+)["']?|'([a-zA-Z0-9_]+)' column/i);
        const missingCol = match?.[1] || match?.[2];
        if (missingCol && !excludedColumns.has(missingCol)) {
          excludedColumns.add(missingCol);
          continue;
        }
      }
      return response;
    }
  });
  if (!uploaded.ok) return uploaded;

  const supplierNote = !withSupplier
    ? " Atención: el archivo no trae columna SUPPLIER; el rol asesor-peinsa no verá productos."
    : ` ${peinsaCount} productos del proveedor PEINSA (${PEINSA_SUPPLIER_ID}).`;
  return {
    ok: true,
    message: `Sincronización de catálogo completada: ${validProducts.length} productos publicados.${supplierNote}`,
  };
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

  const client = supabase;
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
    client.from("inventory").insert(chunk.map(inventoryPayload)),
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
  const deleted = await commonDb()!.from("stores").delete().not("id", "is", null);
  if (deleted.error) return { ok: false, message: deleted.error.message };

  const uploaded = await uploadInChunks(validStores, 700, onProgress, "Cargando tiendas vigentes", async (chunk) =>
    commonDb()!.from("stores").insert(chunk),
  );
  if (!uploaded.ok) return uploaded;

  return { ok: true, message: `Sincronizacion de tiendas completada: ${validStores.length} tiendas publicadas.` };
}

function mapProduct(row: ProductRow): Product {
  const supplierId = (row.supplier_id ?? row.supplier ?? "") ? String(row.supplier_id ?? row.supplier).trim() : undefined;
  const supplierName = (row.supplier_name ?? row.sup_name ?? "") ? String(row.supplier_name ?? row.sup_name).trim() : undefined;
  return {
    sku: row.sku.trim(),
    legacyNumber: row.legacy_number ?? undefined,
    description: row.description,
    unitOfMeasure: row.unit_of_measure ?? undefined,
    listPrice: Number(row.list_price ?? 0),
    partNumber: row.part_number ?? undefined,
    departmentId: row.department_id ?? undefined,
    maxDiscount: row.max_discount === null ? undefined : Number(row.max_discount),
    taxable: row.taxable ?? true,
    supplierId,
    supplierName,
    supplier: supplierId,
    supName: supplierName,
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

function productPayload(product: Product, excludedColumns: Set<string> = new Set()) {
  const supplierId = product.supplierId ?? product.supplier ?? null;
  const supplierName = product.supplierName ?? product.supName ?? null;
  const payload: Record<string, unknown> = {
    sku: product.sku,
    legacy_number: product.legacyNumber ?? null,
    description: product.description,
    unit_of_measure: product.unitOfMeasure ?? null,
    list_price: product.listPrice,
    part_number: product.partNumber ?? null,
    department_id: product.departmentId ?? null,
    max_discount: product.maxDiscount ?? null,
    taxable: product.taxable,
    supplier: supplierId,
    sup_name: supplierName,
    supplier_id: supplierId,
    supplier_name: supplierName,
    updated_at: new Date().toISOString(),
  };

  for (const col of excludedColumns) {
    delete payload[col];
  }
  return payload;
}

function inventoryPayload(record: InventoryRecord) {
  return {
    store_id: record.storeId,
    sku: record.sku,
    quantity: record.quantity,
    updated_at: new Date().toISOString(),
  };
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

async function loadDepartmentIdsForDivision(divisionId: string) {
  if (!supabase) return [];

  const { data, error } = await commonDb()!
    .from("product_departments")
    .select("department_id")
    .eq("division_id", divisionId);

  if (error || !data) return [];
  return (data as Pick<ProductDepartmentRow, "department_id">[]).map((row) => row.department_id);
}

async function buildLegacyProductSearchRequest(query: string, offset: number, limit: number) {
  if (!supabase) return { data: null, error: { message: "Supabase no esta configurado." } };

  let request = commonDb()!
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
  const supplierId = normalizeSearchValue(product.supplierId ?? product.supplier);
  const supplierName = normalizeSearchValue(product.supplierName ?? product.supName);
  const searchable = [sku, partNumber, legacyNumber, description, supplierId, supplierName].join(" ");

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
