import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferDetail } from "./offerConfiguration";

const installation = "Falta instalar supabase/offer_configuration_details.sql para cargar configuraciones por oferta–SKU.";
export async function readOfferDetails(client: SupabaseClient, offerIds: string[]): Promise<OfferDetail[] | null> {
  if (!offerIds.length) return [];
  const rows: OfferDetail[] = [];
  const ids = [...new Set(offerIds)];
  for (let start = 0; start < ids.length; start += 100) {
    for (let offset = 0; ;) {
      const { data, error } = await client.from("offer_configuration_details").select("offer_id,sku,set_id,quantity,threshold_type")
        .in("offer_id", ids.slice(start, start + 100)).order("offer_id").order("sku").order("set_id").range(offset, offset + 499);
      if (error) {
        if (["42P01", "PGRST205"].includes(error.code)) return null;
        throw new Error(`No se pudieron leer las configuraciones adicionales: ${error.message}`);
      }
      rows.push(...(data ?? []) as OfferDetail[]);
      if (!data?.length) break;
      offset += data.length;
    }
  }
  return rows;
}

export type ConfigurationPreview = {
  revision: string;
  before: OfferDetail[];
  legacy_count: number;
  affected_rules: number;
  applied: boolean;
};

export async function readKitEditorData(client: SupabaseClient, offerId: string) {
  const details = await readOfferDetails(client, [offerId]);
  if (details === null) throw new Error(installation);
  const skus = new Set<string>();
  for (let offset = 0; ;) {
    const { data, error } = await client.from("offer_rules").select("sku").eq("is_active", true).eq("external_offer_id", offerId).order("id").range(offset, offset + 499);
    if (error) throw new Error(error.message);
    data?.forEach(row => skus.add(row.sku));
    if (!data?.length) break;
    offset += data.length;
  }
  return { details, skus: [...skus].sort() };
}
export async function submitOfferDetails(client: SupabaseClient, rows: OfferDetail[], revision?: string): Promise<ConfigurationPreview> {
  const { data, error } = await client.rpc("import_offer_configuration_details", {
    payload: rows, apply_changes: revision !== undefined, expected_revision: revision ?? null,
  });
  if (error) throw new Error(["42883", "PGRST202", "42P01"].includes(error.code) ? installation : error.message);
  return data as ConfigurationPreview;
}
