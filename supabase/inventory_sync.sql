create or replace function public.prepare_inventory_sync()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede actualizar el inventario.';
  end if;

  truncate table public.inventory;
end;
$$;

revoke all on function public.prepare_inventory_sync() from public;
grant execute on function public.prepare_inventory_sync() to authenticated;
