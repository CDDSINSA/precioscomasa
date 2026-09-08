alter table public.offer_rules drop constraint if exists offer_rules_sku_fkey;
alter table public.quote_lines drop constraint if exists quote_lines_sku_fkey;
alter table public.products add column if not exists department_id text;

create index if not exists products_department_id_idx
on public.products (department_id);

create or replace function public.prepare_catalog_sync()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede actualizar el catalogo.';
  end if;

  truncate table public.products;
end;
$$;

revoke all on function public.prepare_catalog_sync() from public;
grant execute on function public.prepare_catalog_sync() to authenticated;
