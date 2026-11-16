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
 * Las tablas maestras compartidas (products, product_departments, stores) se leen con commonDb().
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
};

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

async function countRows(table: "promotions" | "customers" | "products" | "inventory" | "stores") {
  if (!supabase) return null;

  const client = table === "products" || table === "stores" ? commonDb()! : supabase;
  const { count, error } = await client
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
