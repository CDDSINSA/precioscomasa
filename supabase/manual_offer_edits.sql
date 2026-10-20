-- Edición de reglas actuales. La publicación de reportes sigue reemplazándolas.
begin;
create table if not exists public.manual_offer_edit_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor uuid not null,
  promotion_id text not null,
  offer_id text not null,
  segment text not null,
  reason text not null,
  before_rows jsonb not null,
  after_rows jsonb not null
);
alter table public.manual_offer_edit_audit enable row level security;
revoke all on public.manual_offer_edit_audit from anon, authenticated;
grant select on public.manual_offer_edit_audit to authenticated;
drop policy if exists manual_offer_audit_admin on public.manual_offer_edit_audit;
create policy manual_offer_audit_admin on public.manual_offer_edit_audit for select to authenticated using (public.is_admin());

create or replace function public.edit_simple_offer(
  promo text, offer text, target_segment text,
  changes jsonb default null, expected_revision text default null, reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  before_rows jsonb; after_rows jsonb; revision text; entry jsonb;
  source public.offer_rules%rowtype; value numeric; benefit text; new_sku text;
  special boolean := false;
begin
  if not public.is_admin() or auth.uid() is null then raise exception 'Solo administradores pueden editar ofertas.'; end if;
  -- Serializa con otras ediciones y con el borrado/reemplazo de la importación.
  lock table public.offer_rules in share row exclusive mode;
  if to_regclass('public.promotion_deal_configs') is not null then
    lock table public.promotion_deal_configs in share mode;
    execute 'select exists(select 1 from public.promotion_deal_configs where promotion_id=$1 and offer_id=$2 and btrim(segment)=btrim($3) and config->>''kind'' <> ''UNIT'')'
      into special using promo, offer, target_segment;
  end if;
  if special then raise exception 'Esta oferta tiene una regla especial; no admite edición simple.'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) into before_rows
    from public.offer_rules r where promotion_id=promo and external_offer_id=offer and btrim(segment)=btrim(target_segment) and is_active;
  if jsonb_array_length(before_rows)=0 then raise exception 'La oferta ya no tiene reglas activas. Vuelva a buscar.'; end if;
  if exists(select 1 from jsonb_array_elements(before_rows) r where
    coalesce(r->>'offer_type','') not in ('LINE_ITEM_DISCOUNT','TIERED_DISCOUNT','FIXED_QTY_PRICE') or
    (coalesce(upper(btrim(r->>'discount_type')),'') not in ('PERCENT_OFF','OVERRIDE_PRICE','PRICE_OVERRIDE') and
      (r->>'offer_type'='FIXED_QTY_PRICE' or r->>'fixed_price' is not null))) then
    raise exception 'Solo se admiten descuentos y precios unitarios simples con beneficio identificable.';
  end if;
  revision := md5(before_rows::text);
  if changes is null then return jsonb_build_object('rows',before_rows,'revision',revision); end if;
  if expected_revision is distinct from revision then raise exception 'La oferta cambió desde que abrió el editor. Cierre y vuelva a abrir.'; end if;
  if length(btrim(coalesce(reason,''))) < 3 then raise exception 'Indique el motivo del cambio.'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes)=0 or jsonb_array_length(changes)>1000 then raise exception 'Lista de cambios inválida.'; end if;
  if exists(select 1 from jsonb_array_elements(changes) c where c->>'action' in ('update','remove') group by c->>'id' having count(*)>1) then raise exception 'Hay cambios duplicados.'; end if;
  for entry in select * from jsonb_array_elements(changes) loop
    if coalesce(entry->>'action','') not in ('update','remove','add') then raise exception 'Acción inválida.'; end if;
    select * into source from public.offer_rules where id=(entry->>'id')::uuid and promotion_id=promo and external_offer_id=offer and btrim(segment)=btrim(target_segment) and is_active;
    if not found then raise exception 'La regla seleccionada ya no pertenece a esta oferta.'; end if;
    if entry->>'action'='remove' then
      delete from public.offer_rules where id=source.id;
      continue;
    end if;
    benefit := entry->>'benefit'; value := (entry->>'value')::numeric;
    if benefit is null or benefit not in ('PERCENT_OFF','OVERRIDE_PRICE') or value is null or value::text in ('NaN','Infinity','-Infinity') or value<0 or value>9999999999 or round(value,4)<>value or (benefit='PERCENT_OFF' and value>100) then raise exception 'Beneficio inválido: descuento de 0 a 100 o precio unitario no negativo, hasta cuatro decimales.'; end if;
    if entry->>'action'='update' then
      update public.offer_rules set discount_type=benefit, discount_percent=case when benefit='PERCENT_OFF' then value end,
        fixed_price=case when benefit='OVERRIDE_PRICE' then value end, updated_at=clock_timestamp() where id=source.id;
    else
      new_sku := btrim(entry->>'sku');
      if coalesce(new_sku,'')='' or not exists(select 1 from public.products where sku=new_sku) then raise exception 'El SKU debe existir en el catálogo.'; end if;
      if exists(select 1 from public.offer_rules where promotion_id=promo and external_offer_id=offer and btrim(segment)=btrim(target_segment) and sku=new_sku and is_active) then raise exception 'El SKU ya está incluido en este segmento de la oferta.'; end if;
      insert into public.offer_rules(external_offer_id,promotion_id,offer_type,sku,segment,min_quantity,fixed_price,discount_percent,discount_type,promotion_attribute,allow_stacking,threshold_quantity,threshold_type,is_active)
      values(offer,promo,source.offer_type,new_sku,source.segment,source.min_quantity,
        case when benefit='OVERRIDE_PRICE' then value end,case when benefit='PERCENT_OFF' then value end,benefit,
        source.promotion_attribute,source.allow_stacking,source.threshold_quantity,source.threshold_type,true);
    end if;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into after_rows from public.offer_rules r
    where promotion_id=promo and external_offer_id=offer and btrim(segment)=btrim(target_segment) and is_active;
  insert into public.manual_offer_edit_audit(actor,promotion_id,offer_id,segment,reason,before_rows,after_rows)
    values(auth.uid(),promo,offer,target_segment,btrim(reason),before_rows,after_rows);
  return jsonb_build_object('applied',true);
end;
$$;
revoke all on function public.edit_simple_offer(text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.edit_simple_offer(text,text,text,jsonb,text,text) to authenticated;
commit;
