-- Diagnostico de solo lectura. Ejecutar en el SQL Editor del proyecto Supabase.
-- 1. Comparar filas recibidas con reglas publicadas, incluso si estan inactivas.
with offer_rows as (
  select 'importacion' as origen, promotion_id, offer_id, sku, segment,
    offer_type::text as tipo, null::boolean as activa
  from public.promotion_import_rows
  where btrim(offer_id) = '27122'
  union all
  select 'publicacion', promotion_id, external_offer_id, sku, segment,
    offer_type::text, is_active
  from public.offer_rules
  where btrim(external_offer_id) = '27122'
)
select r.origen, r.promotion_id, r.offer_id, r.segment, r.tipo,
  count(*) as filas, count(distinct r.sku) as cantidad_sku,
  array_agg(distinct r.sku order by r.sku) as skus,
  bool_or(r.activa) as alguna_regla_activa,
  p.starts_at, p.ends_at, p.status,
  current_date as fecha_servidor
from offer_rows r
left join public.promotions p on p.id = r.promotion_id
group by r.origen, r.promotion_id, r.offer_id, r.segment, r.tipo,
  p.starts_at, p.ends_at, p.status
order by r.promotion_id, r.segment, r.origen;

-- 2. Mostrar la definicion realmente instalada; no basta con el SQL local.
select n.nspname as esquema, p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_functiondef(p.oid) as definicion_instalada
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'publish_promotion_sync';
