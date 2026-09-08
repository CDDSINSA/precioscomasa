alter table public.promotion_offer_sku_settings drop constraint if exists promotion_offer_sku_settings_quantity_check;

update public.offer_rules
set threshold_quantity = 0,
    threshold_type = 'MINIMUM',
    updated_at = now()
where offer_type in ('LINE_ITEM_DISCOUNT', 'FIXED_QTY_PRICE');

update public.offer_rules
set threshold_quantity = 0,
    updated_at = now()
where threshold_quantity is null or threshold_quantity < 0;

update public.promotion_offer_sku_settings settings
set threshold_quantity = 0,
    threshold_type = 'MINIMUM',
    updated_at = now()
from public.offer_rules rules
where settings.promotion_id = rules.promotion_id
  and settings.offer_id = rules.external_offer_id
  and settings.sku = rules.sku
  and settings.segment = rules.segment
  and rules.offer_type in ('LINE_ITEM_DISCOUNT', 'FIXED_QTY_PRICE');

update public.promotion_offer_sku_settings
set threshold_quantity = 0,
    updated_at = now()
where threshold_quantity is null or threshold_quantity < 0;

alter table public.promotion_offer_sku_settings alter column threshold_quantity set default 0;
alter table public.promotion_offer_sku_settings
  add constraint promotion_offer_sku_settings_quantity_check
  check (threshold_quantity >= 0);
