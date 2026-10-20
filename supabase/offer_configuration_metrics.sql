-- Función RPC para calcular las métricas del módulo de configuración de ofertas
-- de forma ultra rápida directamente en PostgreSQL (en <50ms en vez de descargar decenas de miles de filas).
-- Ejecutar en el SQL Editor de Supabase.

create or replace function public.get_offer_configuration_metrics()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'offers', coalesce(count(distinct external_offer_id), 0),
    'offerSkus', coalesce(count(distinct (external_offer_id, sku)), 0),
    'combinable', coalesce(count(distinct case when allow_stacking then external_offer_id end), 0)
  )
  from public.offer_rules
  where is_active = true and external_offer_id is not null and external_offer_id <> '';
$$;

revoke all on function public.get_offer_configuration_metrics() from public, anon;
grant execute on function public.get_offer_configuration_metrics() to authenticated;

-- Índice compuesto para acelerar tanto la función RPC como las consultas de cursor
create index if not exists offer_rules_active_metrics_idx
on public.offer_rules (is_active, external_offer_id, sku, allow_stacking)
where is_active = true;
