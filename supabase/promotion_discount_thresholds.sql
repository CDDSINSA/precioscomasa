alter table public.promotion_offer_sku_settings drop constraint if exists promotion_offer_sku_settings_quantity_check;
alter table public.promotion_offer_sku_settings
  add constraint promotion_offer_sku_settings_quantity_check
  check (threshold_quantity >= 0);

-- Keep blank Xstore threshold configuration as EXACT + 1. The quote engine
-- treats FIXED_QTY_PRICE / EXACT / 1 as a viable candidate for larger quantities
-- at runtime, without changing the persisted threshold semantics.
update public.offer_rules
set threshold_type = 'EXACT',
    updated_at = now()
where offer_type = 'FIXED_QTY_PRICE'
  and coalesce(threshold_quantity, 1) <= 1
  and threshold_type = 'MINIMUM';

update public.promotion_offer_sku_settings settings
set threshold_type = 'EXACT',
    updated_at = now()
from public.offer_rules rules
where settings.promotion_id = rules.promotion_id
  and settings.offer_id = rules.external_offer_id
  and settings.sku = rules.sku
  and settings.segment = rules.segment
  and rules.offer_type = 'FIXED_QTY_PRICE'
  and coalesce(settings.threshold_quantity, 1) <= 1
  and settings.threshold_type = 'MINIMUM';
