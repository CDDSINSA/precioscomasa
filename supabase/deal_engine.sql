-- Reglas comerciales por oferta y segmento. No modifica precios ni clientes.
-- Sin FK a promotions: las configuraciones sobreviven a la sincronización,
-- que reemplaza las cabeceras. El cotizador filtra por promociones vigentes.
begin;

create table if not exists public.promotion_deal_configs (
  promotion_id text not null,
  offer_id text not null,
  segment text not null default '-',
  config jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (promotion_id, offer_id, segment),
  check (segment = btrim(segment) and segment <> ''),
  check (jsonb_typeof(config) = 'object' and config ? 'kind' and config->>'kind' in ('UNIT', 'PACK', 'KIT', 'MIX_MATCH', 'BUY_GET'))
);
alter table public.promotion_deal_configs enable row level security;
grant select, insert, update, delete on public.promotion_deal_configs to authenticated;
drop policy if exists deal_configs_read on public.promotion_deal_configs;
create policy deal_configs_read on public.promotion_deal_configs for select to authenticated using (true);
drop policy if exists deal_configs_admin on public.promotion_deal_configs;
create policy deal_configs_admin on public.promotion_deal_configs for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- La función de publicación actualizada se incluye a continuación para
-- conservar las filas de kits de cualquier tamaño. El motor exige un kit
-- completo o una configuración explícita (por ejemplo, BXGX de un solo SKU).

create or replace function public.publish_promotion_sync(promotions_payload jsonb, sync_mode text default 'partial')
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
declare
  promotions_loaded integer := 0;
  promotions_deleted integer := 0;
  rules_loaded integer := 0;
  kits_omitted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden publicar promociones.';
  end if;

  if sync_mode not in ('full', 'partial') then
    raise exception 'Modo de sincronizacion invalido: %', sync_mode;
  end if;

  create temp table incoming_promotions on commit drop as
  select distinct
    payload.id,
    coalesce(nullif(payload.name, ''), payload.id) as name,
    nullif(payload.starts_at, '')::date as starts_at,
    nullif(payload.ends_at, '')::date as ends_at,
    coalesce(nullif(payload.store_id, ''), '5') as store_id,
    case
      when payload.family in ('fidelizacion', 'estrategica') then payload.family::public.promotion_family
      else 'estrategica'::public.promotion_family
    end as family
  from jsonb_to_recordset(coalesce(promotions_payload, '[]'::jsonb)) as payload(
    id text,
    name text,
    starts_at text,
    ends_at text,
    store_id text,
    family text
  )
  where coalesce(payload.id, '') <> '';

  if sync_mode = 'full' then
    delete from public.offer_rules where true;
    delete from public.promotions where true;
  else
    delete from public.offer_rules rules
    using incoming_promotions incoming
    where rules.promotion_id = incoming.id;

    delete from public.promotions promos
    using incoming_promotions incoming
    where promos.id = incoming.id;
  end if;

  insert into public.promotions (id, name, starts_at, ends_at, store_id, family, status, updated_at)
  select
    id,
    name,
    starts_at,
    ends_at,
    store_id,
    family,
    case
      when starts_at is not null and starts_at > current_date then 'programada'
      else 'activa'
    end,
    now()
  from incoming_promotions
  where ends_at is null or ends_at >= current_date
  on conflict (id) do update
    set name = excluded.name,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        store_id = excluded.store_id,
        family = excluded.family,
        status = excluded.status,
        updated_at = now();

  get diagnostics promotions_loaded = row_count;

  select count(*) into promotions_deleted
  from incoming_promotions
  where ends_at is not null and ends_at < current_date;

  with kit_sizes as (
    select promotion_id, offer_id, segment, count(distinct sku) as sku_count
    from public.promotion_import_rows
    where offer_type = 'KIT_OFFER'
    group by promotion_id, offer_id, segment
  ),
  source_rows as (
    select distinct on (rows.offer_id, rows.promotion_id, rows.sku, rows.segment, rows.min_quantity)
      rows.*,
      coalesce(offer_settings.allow_stacking, false) as resolved_allow_stacking,
      case
        when rows.offer_type in ('LINE_ITEM_DISCOUNT', 'FIXED_QTY_PRICE') then 0
        when rows.offer_type = 'KIT_OFFER' and sku_settings.threshold_quantity is null then null
        else greatest(coalesce(sku_settings.threshold_quantity, 1), 0)
      end as resolved_threshold_quantity,
      case
        when rows.offer_type in ('LINE_ITEM_DISCOUNT', 'FIXED_QTY_PRICE', 'TIERED_DISCOUNT') then 'MINIMUM'
        when sku_settings.threshold_type is not null then sku_settings.threshold_type
        when rows.offer_type = 'KIT_OFFER' then null
        else 'EXACT'
      end as resolved_threshold_type
    from public.promotion_import_rows rows
    join public.promotions promos on promos.id = rows.promotion_id
    join incoming_promotions incoming on incoming.id = rows.promotion_id
    left join kit_sizes kits
      on kits.promotion_id = rows.promotion_id
     and kits.offer_id = rows.offer_id
     and kits.segment = rows.segment
    left join public.promotion_offer_settings offer_settings
      on offer_settings.promotion_id = rows.promotion_id
     and offer_settings.offer_id = rows.offer_id
    left join public.promotion_offer_sku_settings sku_settings
      on sku_settings.promotion_id = rows.promotion_id
     and sku_settings.offer_id = rows.offer_id
     and sku_settings.sku = rows.sku
     and sku_settings.segment = coalesce(nullif(rows.segment, ''), ' - ')
    where rows.offer_id is not null
      and rows.promotion_id is not null
      and rows.sku is not null
      and rows.offer_type is not null
      and (rows.offer_type <> 'KIT_OFFER' or coalesce(kits.sku_count, 0) >= 1)
    order by rows.offer_id, rows.promotion_id, rows.sku, rows.segment, rows.min_quantity, rows.created_at, rows.id
  )
  insert into public.offer_rules (
    external_offer_id,
    promotion_id,
    offer_type,
    sku,
    segment,
    min_quantity,
    fixed_price,
    discount_percent,
    discount_type,
    allow_stacking,
    threshold_quantity,
    threshold_type,
    is_active,
    updated_at
  )
  select
    offer_id,
    promotion_id,
    offer_type,
    sku,
    coalesce(nullif(segment, ''), ' - '),
    coalesce(min_quantity, 0),
    fixed_price,
    discount_percent,
    discount_type,
    resolved_allow_stacking,
    resolved_threshold_quantity,
    resolved_threshold_type,
    true,
    now()
  from source_rows;

  get diagnostics rules_loaded = row_count;

  with kit_sizes as (
    select promotion_id, offer_id, segment, count(distinct sku) as sku_count
    from public.promotion_import_rows
    where offer_type = 'KIT_OFFER'
    group by promotion_id, offer_id, segment
  )
  select count(*) into kits_omitted
  from public.promotion_import_rows rows
  join incoming_promotions incoming on incoming.id = rows.promotion_id
  join kit_sizes kits
    on kits.promotion_id = rows.promotion_id
   and kits.offer_id = rows.offer_id
   and kits.segment = rows.segment
  where rows.offer_type = 'KIT_OFFER'
    and kits.sku_count < 1;

  return jsonb_build_object(
    'promotions_loaded', promotions_loaded,
    'promotions_deleted', promotions_deleted,
    'rules_loaded', rules_loaded,
    'kits_omitted', kits_omitted
  );
end;
$$;

grant execute on function public.prepare_promotion_sync(jsonb, text) to authenticated;
grant execute on function public.publish_promotion_sync(jsonb, text) to authenticated;

commit;

