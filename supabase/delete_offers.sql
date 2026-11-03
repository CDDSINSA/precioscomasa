-- Ejecutar una vez en el SQL Editor de Supabase. Requiere schema.sql.
-- Aditivo: no sustituye las funciones de edición, importación ni cotización.
begin;
-- Igual que promotion_sync.sql: conservar las cotizaciones históricas al retirar reglas.
do $$ begin
  if to_regclass('public.quote_lines') is not null then
    alter table public.quote_lines drop constraint if exists quote_lines_applied_offer_rule_id_fkey;
    alter table public.quote_lines add constraint quote_lines_applied_offer_rule_id_fkey
      foreign key (applied_offer_rule_id) references public.offer_rules(id) on delete set null;
  end if;
end $$;
create table if not exists public.offer_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor uuid not null,
  offer_id text not null,
  promotion_id text,
  segment text,
  reason text not null,
  before_rows jsonb not null
);
alter table public.offer_deletion_audit enable row level security;
revoke all on public.offer_deletion_audit from anon, authenticated;
grant select on public.offer_deletion_audit to authenticated;
drop policy if exists offer_deletion_audit_admin on public.offer_deletion_audit;
create policy offer_deletion_audit_admin on public.offer_deletion_audit
  for select to authenticated using (public.is_admin());

create or replace function public.delete_offer(
  offer text, promo text default null, target_segment text default null,
  apply_changes boolean default false, expected_revision text default null, reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  rules jsonb; configs jsonb := '[]'::jsonb; details jsonb := '[]'::jsonb;
  snapshot jsonb; revision text; affected integer;
begin
  if public.is_admin() is distinct from true or auth.uid() is null then
    raise exception 'Solo administradores pueden borrar ofertas.';
  end if;
  if coalesce(btrim(offer),'') = '' or (promo is null) <> (target_segment is null)
    or (promo is not null and (btrim(promo) = '' or btrim(target_segment) = '')) then
    raise exception 'Indique la oferta y un alcance válido.';
  end if;
  if apply_changes is null then raise exception 'Confirmación inválida.'; end if;
  -- Mismo orden que la edición simple: reglas primero, luego configuraciones.
  -- El bloqueo también serializa el borrado con la publicación del reporte.
  lock table public.offer_rules in share row exclusive mode;
  if to_regclass('public.promotion_deal_configs') is not null then
    lock table public.promotion_deal_configs in share row exclusive mode;
    execute 'select coalesce(jsonb_agg(to_jsonb(c) order by promotion_id, segment), ''[]''::jsonb)
      from public.promotion_deal_configs c where offer_id=$1
      and ($2 is null or (promotion_id=$2 and btrim(segment)=btrim($3)))'
      into configs using offer, promo, target_segment;
  end if;
  if to_regclass('public.offer_configuration_details') is not null then
    lock table public.offer_configuration_details in share row exclusive mode;
    execute 'select coalesce(jsonb_agg(to_jsonb(d) order by sku, set_id), ''[]''::jsonb)
      from public.offer_configuration_details d where offer_id=$1' into details using offer;
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb), count(*)
    into rules, affected from public.offer_rules r where external_offer_id=offer
    and (promo is null or (promotion_id=promo and btrim(segment)=btrim(target_segment)));
  if affected=0 then raise exception 'La oferta ya no existe en este alcance. Vuelva a buscar.'; end if;
  snapshot := jsonb_build_object('rules',rules,'configs',configs,'details',details);
  revision := md5(snapshot::text);
  if not apply_changes then
    return jsonb_build_object('revision',revision,'affected_rules',affected,'applied',false);
  end if;
  if expected_revision is distinct from revision then
    raise exception 'La oferta cambió. Vuelva a pulsar Borrar oferta para revisar el alcance actualizado.';
  end if;
  if length(btrim(coalesce(reason,''))) < 3 then raise exception 'Indique el motivo del borrado.'; end if;
  delete from public.offer_rules where external_offer_id=offer
    and (promo is null or (promotion_id=promo and btrim(segment)=btrim(target_segment)));
  if to_regclass('public.promotion_deal_configs') is not null then
    execute 'delete from public.promotion_deal_configs where offer_id=$1
      and ($2 is null or (promotion_id=$2 and btrim(segment)=btrim($3)))' using offer, promo, target_segment;
  end if;
  -- Las condiciones globales siguen disponibles si otro contexto usa la oferta.
  if to_regclass('public.offer_configuration_details') is not null
    and not exists(select 1 from public.offer_rules where external_offer_id=offer) then
    execute 'delete from public.offer_configuration_details where offer_id=$1' using offer;
  end if;
  insert into public.offer_deletion_audit(actor,offer_id,promotion_id,segment,reason,before_rows)
    values(auth.uid(),offer,promo,target_segment,btrim(reason),snapshot);
  return jsonb_build_object('applied',true,'affected_rules',affected);
end;
$$;
revoke all on function public.delete_offer(text,text,text,boolean,text,text) from public, anon;
grant execute on function public.delete_offer(text,text,text,boolean,text,text) to authenticated;
commit;
