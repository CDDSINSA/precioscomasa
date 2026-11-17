import { createClient } from "@supabase/supabase-js";
import {
  inventoryFeatureEnabled,
  supabaseAppSchema,
  supabaseCommonSchema,
} from "../../config/features";
import { updateStoredDataStatus } from "../dataStatus";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Cliente principal. Su esquema por defecto es el de la aplicación (VITE_SUPABASE_APP_SCHEMA,
 * p. ej. 'g_comasa'), así que supabase.from(...) y supabase.rpc(...) apuntan ahí.
 * Las tablas maestras compartidas (products, product_departments, stores, inventory) se leen con commonDb().
 */
export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, { db: { schema: supabaseAppSchema } })
    : null;
export const hasSupabaseConfig = Boolean(supabase);

/**
 * Cliente apuntando al esquema propio de la aplicación (por defecto 'public').
 * Cuando el proyecto migre a un esquema dedicado por aplicación, basta con definir
 * VITE_SUPABASE_APP_SCHEMA en las variables de entorno.
 */
export function appDb() {
  if (!supabase) return null;
  return supabaseAppSchema !== "public" && typeof supabase.schema === "function"
    ? supabase.schema(supabaseAppSchema)
    : supabase;
}

/**
 * Cliente apuntando al esquema común compartido por todas las aplicaciones (por defecto 'public').
 * Cuando las tablas maestras compartidas vivan en el esquema común, basta con definir
 * VITE_SUPABASE_COMMON_SCHEMA en las variables de entorno.
 */
export function commonDb() {
  if (!supabase) return null;
  return supabaseCommonSchema !== "public" && typeof supabase.schema === "function"
    ? supabase.schema(supabaseCommonSchema)
    : supabase;
}

export type RemoteDataMetrics = {
  promotions: number | null;
  customers: number | null;
  catalog: number | null;
  inventory: number | null;
  stores: number | null;
  errors?: Partial<Record<"promotions" | "customers" | "catalog" | "inventory" | "stores", string>>;
  estimated?: Partial<Record<"promotions" | "customers" | "catalog" | "inventory" | "stores", boolean>>;
};

export async function testSupabaseConnection() {
  if (!supabase) return { ok: false, label: "No configurado" };

  const { error } = await supabase.auth.getSession();
  return error ? { ok: false, label: "Sin conexión" } : { ok: true, label: "Conectado" };
}

export async function refreshRemoteDataStatuses(metrics?: RemoteDataMetrics) {
  if (!supabase) return;

  metrics ??= await loadRemoteDataMetrics();

  updateStoredDataStatus(
    "promotions",
    statusFromCount(metrics.promotions),
    detailFromCount(metrics.promotions, "promociones"),
  );
  updateStoredDataStatus(
    "customers",
    statusFromCount(metrics.customers),
    metrics.errors?.customers ?? detailFromCount(metrics.customers, metrics.estimated?.customers ? "clientes (aprox.)" : "clientes"),
  );
  updateStoredDataStatus(
    "catalog",
    statusFromCount(metrics.catalog),
    metrics.errors?.catalog ?? detailFromCount(metrics.catalog, metrics.estimated?.catalog ? "productos (aprox.)" : "productos"),
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

  return {
    promotions: promotions.count,
    customers: customers.count,
    catalog: catalog.count,
    inventory: inventory?.count ?? null,
    stores: stores?.count ?? null,
    errors: {
      promotions: promotions.error,
      customers: customers.error,
      catalog: catalog.error,
      inventory: inventory?.error,
      stores: stores?.error,
    },
    estimated: {
      promotions: promotions.estimated,
      customers: customers.estimated,
      catalog: catalog.estimated,
      inventory: inventory?.estimated,
      stores: stores?.estimated,
    },
  };
}

async function countRows(table: "promotions" | "customers" | "products" | "inventory" | "stores"): Promise<{ count: number | null; error?: string; estimated?: boolean }> {
  if (!supabase) return { count: null, error: "Supabase no está configurado." };

  // products, stores e inventory viven en el esquema común (d_comun).
  const client = table === "products" || table === "stores" || table === "inventory" ? commonDb()! : supabase;
  // El inventario es enorme: se usa el conteo estimado del planificador para no agotar el tiempo límite.
  // Usar GET con limit(0) conserva el cuerpo de error de PostgREST; HEAD lo descarta.
  // No se descargan productos ni se convierte una respuesta fallida en un catálogo vacío.
  try {
    const readCount = (mode: "estimated" | "exact" | "planned") => client
      .from(table)
      .select("*", { count: mode })
      .limit(0)
      .abortSignal(AbortSignal.timeout(15000));
    let estimated = table === "inventory";
    let { count, error } = await readCount(estimated ? "estimated" : "exact");
    // Un conteo completo puede agotar el tiempo aunque las búsquedas sí funcionen.
    // Solo se usa una estimación ante timeout; los errores de permisos se conservan.
    if (error && (error.code === "57014" || /timeout|timed out|aborted/i.test(error.message))) {
      const fallback = await readCount("planned");
      if (!fallback.error && fallback.count !== null) {
        count = fallback.count;
        error = null;
        estimated = true;
      }
    }
    if (error) {
      return { count: null, error: `${error.code ? `[${error.code}] ` : ""}${error.message}` };
    }
    return count === null
      ? { count: null, error: "La base no devolvió el total de registros." }
      : { count, error: undefined, estimated };
  } catch (error) {
    return { count: null, error: error instanceof Error ? error.message : "No se pudo consultar el total de registros." };
  }
}

function statusFromCount(count: number | null) {
  if (count === null) return "warning";
  return count > 0 ? "ok" : "pending";
}

function detailFromCount(count: number | null, label: string) {
  if (count === null) return "No se pudo verificar";
  return count > 0 ? `${count} ${label}` : "Sin datos";
}
