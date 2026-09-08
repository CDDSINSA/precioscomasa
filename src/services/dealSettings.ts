import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealConfig } from "../types/domain";
import { validateDealConfig } from "./dealConfig";

export type DealSetting = { promotion_id: string; offer_id: string; segment: string; config: DealConfig };
export const dealSettingKey = (promotion: string, offer: string, segment: string) => `${promotion}|${offer}|${segment.trim() || "-"}`;

export async function readDealSettings(client: SupabaseClient, promotionIds?: string[]): Promise<DealSetting[]> {
  const rows: DealSetting[] = [];
  for (let offset = 0; ;) {
    let query = client.from("promotion_deal_configs").select("promotion_id,offer_id,segment,config").order("promotion_id").order("offer_id").order("segment").range(offset, offset + 499);
    if (promotionIds?.length) query = query.in("promotion_id", promotionIds);
    const { data, error } = await query;
    if (error) {
      // Existing installations continue to use their imported rules until the
      // additive migration is installed. Other failures must not hide deals.
      if (error.code === "42P01" || error.code === "PGRST205") return [];
      throw new Error(`No se pudo cargar la configuración de promociones: ${error.message}`);
    }
    rows.push(...(data ?? []).map(row => ({ ...row, config: validateDealConfig(row.config) })));
    if (!data?.length) return rows;
    offset += data.length;
  }
}

export async function writeDealSetting(client: SupabaseClient, row: DealSetting) {
  const config = validateDealConfig(row.config);
  const { error } = await client.from("promotion_deal_configs").upsert({ ...row, segment: row.segment.trim() || "-", config, updated_at: new Date().toISOString() }, { onConflict: "promotion_id,offer_id,segment" });
  if (error) throw new Error(error.code === "42P01" || error.code === "PGRST205"
    ? "Falta instalar la migración supabase/deal_engine.sql para guardar estas reglas."
    : error.message);
}
