alter table public.quote_lines drop constraint if exists quote_lines_applied_offer_rule_id_fkey;
alter table public.quote_lines
  add constraint quote_lines_applied_offer_rule_id_fkey
  foreign key (applied_offer_rule_id) references public.offer_rules(id) on delete set null;

alter table public.offer_rules drop constraint if exists offer_rules_sku_fkey;
alter table public.offer_rules add column if not exists allow_stacking boolean default false;
alter table public.offer_rules add column if not exists threshold_quantity numeric(14, 4) default 1;
alter table public.offer_rules add column if not exists threshold_type text default 'EXACT';
update public.offer_rules set allow_stacking = false where allow_stacking is null;
update public.offer_rules set threshold_quantity = 1 where threshold_quantity is null;
update public.offer_rules set threshold_type = 'EXACT' where threshold_type is null;
alter table public.offer_rules drop constraint if exists offer_rules_threshold_type_check;
alter table public.offer_rules
  add constraint offer_rules_threshold_type_check
  check (threshold_type in ('EXACT', 'MINIMUM'));

create table if not exists public.promotion_offer_settings (
  promotion_id text not null,
  offer_id text not null,
  allow_stacking boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (promotion_id, offer_id)
);

create table if not exists public.promotion_offer_sku_settings (
  promotion_id text not null,
  offer_id text not null,
  sku text not null,
  segment text not null default ' - ',
  threshold_quantity numeric(14, 4) not null default 1,
  threshold_type text not null default 'EXACT',
  updated_at timestamptz not null default now(),
  primary key (promotion_id, offer_id, sku, segment)
);

alter table public.promotion_offer_sku_settings drop constraint if exists promotion_offer_sku_settings_quantity_check;
alter table public.promotion_offer_sku_settings
  add constraint promotion_offer_sku_settings_quantity_check
  check (threshold_quantity >= 1);
alter table public.promotion_offer_sku_settings drop constraint if exists promotion_offer_sku_settings_threshold_type_check;
alter table public.promotion_offer_sku_settings
  add constraint promotion_offer_sku_settings_threshold_type_check
  check (threshold_type in ('EXACT', 'MINIMUM'));

create index if not exists promotion_import_rows_promotion_idx
on public.promotion_import_rows (promotion_id);

create index if not exists promotion_import_rows_kit_lookup_idx
on public.promotion_import_rows (offer_type, promotion_id, offer_id, segment, sku);

create index if not exists promotion_import_rows_publish_idx
on public.promotion_import_rows (promotion_id, offer_id, sku, segment, min_quantity, created_at, id);

create index if not exists offer_rules_promotion_idx
on public.offer_rules (promotion_id);

create index if not exists offer_rules_offer_lookup_idx
on public.offer_rules (promotion_id, external_offer_id, sku, segment);

create index if not exists promotion_offer_sku_settings_lookup_idx
on public.promotion_offer_sku_settings (promotion_id, offer_id, sku, segment);

create index if not exists quote_lines_applied_offer_rule_idx
on public.quote_lines (applied_offer_rule_id);

alter table public.promotion_offer_settings enable row level security;
alter table public.promotion_offer_sku_settings enable row level security;

drop policy if exists "promotion_offer_settings_read_for_quotes" on public.promotion_offer_settings;
drop policy if exists "promotion_offer_settings_admin_write" on public.promotion_offer_settings;
drop policy if exists "promotion_offer_sku_settings_read_for_quotes" on public.promotion_offer_sku_settings;
drop policy if exists "promotion_offer_sku_settings_admin_write" on public.promotion_offer_sku_settings;

create policy "promotion_offer_settings_read_for_quotes" on public.promotion_offer_settings
for select to authenticated using (true);

create policy "promotion_offer_settings_admin_write" on public.promotion_offer_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "promotion_offer_sku_settings_read_for_quotes" on public.promotion_offer_sku_settings
for select to authenticated using (true);

create policy "promotion_offer_sku_settings_admin_write" on public.promotion_offer_sku_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.prepare_promotion_sync(promotions_payload jsonb, sync_mode text default 'partial')
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
declare
  affected_count integer := 0;
  staging_deleted integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Solo administradores pueden sincronizar promociones.';
  end if;

  if sync_mode not in ('full', 'partial') then
    raise exception 'Modo de sincronizacion invalido: %', sync_mode;
  end if;

  create temp table incoming_promotions on commit drop as
  select distinct id
  from jsonb_to_recordset(coalesce(promotions_payload, '[]'::jsonb)) as payload(id text)
  where coalesce(id, '') <> '';

  select count(*) into affected_count from incoming_promotions;

  if sync_mode = 'full' then
    truncate table public.promotion_import_rows;
  else
    delete from public.promotion_import_rows rows
    using incoming_promotions incoming
    where rows.promotion_id = incoming.id;
  end if;

  get diagnostics staging_deleted = row_count;

  return jsonb_build_object(
    'affected_promotions', affected_count,
    'staging_deleted', staging_deleted
  );
end;
$$;

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
      coalesce(sku_settings.threshold_quantity, 1) as resolved_threshold_quantity,
      coalesce(sku_settings.threshold_type, 'EXACT') as resolved_threshold_type
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
      and (rows.offer_type <> 'KIT_OFFER' or coalesce(kits.sku_count, 0) between 1 and 3)
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
    and kits.sku_count >= 4;

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
