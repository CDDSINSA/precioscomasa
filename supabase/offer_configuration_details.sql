-- Additive migration. Requires schema.sql (offer_rules, is_admin).
-- Does not replace publication functions or erase/migrate legacy configurations.
begin;
create table if not exists public.offer_configuration_details (
  offer_id text not null check (offer_id = btrim(offer_id) and offer_id <> ''),
  sku text not null check (sku = btrim(sku) and sku <> ''),
  set_id text not null default '' check (set_id = btrim(set_id)),
  quantity integer not null check (quantity > 0),
  threshold_type text not null check (threshold_type in ('EXACT', 'MINIMUM')),
  updated_at timestamptz not null default now(),
  primary key (offer_id, sku, set_id)
);
create table if not exists public.offer_configuration_import_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  before_rows jsonb not null,
  after_rows jsonb not null,
  source_revision text not null
);
alter table public.offer_configuration_details enable row level security;
alter table public.offer_configuration_import_audit enable row level security;
revoke all on public.offer_configuration_details, public.offer_configuration_import_audit from anon, authenticated;
grant select on public.offer_configuration_details, public.offer_configuration_import_audit to authenticated;
drop policy if exists offer_details_read on public.offer_configuration_details;
create policy offer_details_read on public.offer_configuration_details for select to authenticated using (true);
drop policy if exists offer_details_audit_read on public.offer_configuration_import_audit;
create policy offer_details_audit_read on public.offer_configuration_import_audit for select to authenticated using (public.is_admin());

create or replace function public.import_offer_configuration_details(
  payload jsonb, apply_changes boolean default false, expected_revision text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  previous_rows jsonb;
  source_rows jsonb;
  legacy_rows jsonb := '[]'::jsonb;
  revision text;
  affected integer;
  problem text;
begin
  if not public.is_admin() then raise exception 'Solo administradores pueden configurar ofertas.'; end if;
  if jsonb_typeof(payload) is distinct from 'array' then raise exception 'El archivo debe contener una lista de configuraciones.'; end if;
  if jsonb_array_length(payload) not between 1 and 10000 then raise exception 'Se requieren entre 1 y 10,000 filas.'; end if;
  if exists (
    select 1 from jsonb_array_elements(payload) r
    where jsonb_typeof(r) is distinct from 'object'
      or jsonb_typeof(r->'offer_id') is distinct from 'string' or coalesce(r->>'offer_id','') = ''
      or r->>'offer_id' <> btrim(r->>'offer_id')
      or jsonb_typeof(r->'sku') is distinct from 'string' or coalesce(r->>'sku','') = '' or r->>'sku' <> btrim(r->>'sku')
      or jsonb_typeof(r->'set_id') is distinct from 'string' or r->>'set_id' <> btrim(r->>'set_id')
      or jsonb_typeof(r->'quantity') is distinct from 'number'
      or coalesce(r->>'quantity','') !~ '^[1-9][0-9]{0,8}$'
      or coalesce(r->>'threshold_type','') not in ('EXACT','MINIMUM')
  ) then raise exception 'Filas inválidas: revise oferta, ITEM, SET, umbral y cantidad entera positiva.'; end if;

  -- Serialize imports and prevent promotion publication/manual changes between preview and commit.
  lock table public.offer_configuration_details in share row exclusive mode;
  lock table public.offer_rules in share mode;
  if to_regclass('public.promotion_deal_configs') is not null then
    lock table public.promotion_deal_configs in share mode;
    execute 'select coalesce(jsonb_agg(to_jsonb(d) order by promotion_id, offer_id, segment), ''[]''::jsonb)
      from public.promotion_deal_configs d where offer_id in (select r->>''offer_id'' from jsonb_array_elements($1) r)'
      into legacy_rows using payload;
  end if;
  if exists (select 1 from jsonb_to_recordset(payload) as r(offer_id text, sku text, set_id text)
    group by offer_id, sku, set_id having count(*) > 1) then raise exception 'Hay filas oferta–ITEM–SET duplicadas.'; end if;
  if exists (select 1 from jsonb_to_recordset(payload) as r(offer_id text, set_id text, quantity integer, threshold_type text)
    where set_id <> '' group by offer_id, set_id having count(distinct (quantity, threshold_type)) > 1)
    then raise exception 'Las cantidades y umbrales deben coincidir dentro de cada SET.'; end if;
  if exists (select 1 from jsonb_to_recordset(payload) as r(offer_id text, set_id text)
    group by offer_id having bool_or(set_id = '') and bool_or(set_id <> ''))
    then raise exception 'Una oferta no puede mezclar filas con SET y sin SET.'; end if;

  select r.offer_id || ' / ' || r.sku into problem
  from jsonb_to_recordset(payload) as r(offer_id text, sku text, set_id text)
  where not exists (select 1 from public.offer_rules o where o.is_active and o.external_offer_id = r.offer_id and o.sku = r.sku)
  limit 1;
  if problem is not null then raise exception 'Oferta / ITEM no encontrado en el reporte: %', problem; end if;
  if exists (select 1 from jsonb_to_recordset(payload) as r(offer_id text, set_id text)
    join public.offer_rules o on o.external_offer_id = r.offer_id and o.is_active
    where (o.offer_type = 'KIT_OFFER') is distinct from (r.set_id <> ''))
    then raise exception 'El SET no corresponde al tipo de oferta del reporte (kit requiere SET; otros tipos no).'; end if;
  -- Kits are submitted in full; ordinary conditions are updated only for supplied SKUs.
  select o.external_offer_id || ' / ' || o.sku into problem from public.offer_rules o
  where o.is_active and o.offer_type = 'KIT_OFFER'
    and o.external_offer_id in (select r->>'offer_id' from jsonb_array_elements(payload) r)
    and not exists (select 1 from jsonb_to_recordset(payload) as r(offer_id text, sku text) where r.offer_id = o.external_offer_id and r.sku = o.sku)
  limit 1;
  if problem is not null then raise exception 'Incluya el kit completo. Falta oferta / ITEM: %', problem; end if;
  -- Every context needs every SET. Benefits remain on offer_rules and are never copied globally.
  if exists (
    select 1 from (select distinct o.external_offer_id, o.promotion_id, o.segment from public.offer_rules o
      where o.is_active and o.offer_type = 'KIT_OFFER') contexts
    join (select distinct r.offer_id, r.set_id from jsonb_to_recordset(payload) as r(offer_id text, set_id text) where r.set_id <> '') sets
      on sets.offer_id = contexts.external_offer_id
    where not exists (select 1 from jsonb_to_recordset(payload) as r(offer_id text, sku text, set_id text)
      join public.offer_rules o on o.external_offer_id = r.offer_id and o.sku = r.sku and o.is_active
      where r.offer_id = sets.offer_id and r.set_id = sets.set_id and o.promotion_id = contexts.promotion_id and o.segment is not distinct from contexts.segment)
  ) then raise exception 'Un SET no tiene SKU elegibles en alguna promoción o segmento de la oferta.'; end if;
  if exists (
    select 1 from public.offer_rules o
    where o.is_active and o.offer_type = 'KIT_OFFER'
      and o.external_offer_id in (select r->>'offer_id' from jsonb_array_elements(payload) r)
      and not (case
        when upper(coalesce(o.discount_type,'')) in ('OVERRIDE_PRICE','PRICE_OVERRIDE') or (coalesce(o.discount_type,'') = '' and o.fixed_price is not null)
          then coalesce(o.fixed_price >= 0, false)
        when upper(coalesce(o.discount_type,'')) in ('','PERCENT_OFF') then coalesce(o.discount_percent between 0 and 100, false)
        else false end)
  ) then raise exception 'Un SKU del kit no tiene un beneficio válido en el reporte de promociones.'; end if;
  -- Si un SKU del kit aparece con mas de un beneficio, se toma el primero disponible en el cotizador sin bloquear la carga.

  select coalesce(jsonb_agg(to_jsonb(d) - 'updated_at' order by offer_id, sku, set_id), '[]'::jsonb) into previous_rows
    from public.offer_configuration_details d where offer_id in (select r->>'offer_id' from jsonb_array_elements(payload) r);
  select coalesce(jsonb_agg(to_jsonb(o) order by id), '[]'::jsonb), count(*) into source_rows, affected
    from public.offer_rules o where o.is_active and external_offer_id in (select r->>'offer_id' from jsonb_array_elements(payload) r);
  revision := md5(previous_rows::text || source_rows::text || legacy_rows::text || payload::text);
  if apply_changes then
    if expected_revision is distinct from revision then raise exception 'Las ofertas o configuraciones cambiaron. Vuelva a validar el archivo antes de guardar.'; end if;
    delete from public.offer_configuration_details d using jsonb_to_recordset(payload) as r(offer_id text, sku text, set_id text)
      where d.offer_id = r.offer_id and (r.set_id <> '' or d.sku = r.sku);
    insert into public.offer_configuration_details (offer_id, sku, set_id, quantity, threshold_type)
      select offer_id, sku, set_id, quantity, threshold_type
      from jsonb_to_recordset(payload) as r(offer_id text, sku text, set_id text, quantity integer, threshold_type text);
    insert into public.offer_configuration_import_audit (before_rows, after_rows, source_revision)
      values (previous_rows, payload, revision);
  end if;
  return jsonb_build_object('revision', revision, 'before', previous_rows, 'legacy_count', jsonb_array_length(legacy_rows), 'affected_rules', affected, 'applied', apply_changes);
end;
$$;
revoke all on function public.import_offer_configuration_details(jsonb, boolean, text) from public, anon;
grant execute on function public.import_offer_configuration_details(jsonb, boolean, text) to authenticated;
commit;
