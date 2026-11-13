export const inventoryFeatureEnabled = import.meta.env.VITE_ENABLE_INVENTORY !== "false";
export const inventoryStoreId = "1041";
export const supabaseAppSchema = (import.meta.env.VITE_SUPABASE_APP_SCHEMA || "public").trim() || "public";
export const supabaseCommonSchema = (import.meta.env.VITE_SUPABASE_COMMON_SCHEMA || "public").trim() || "public";
