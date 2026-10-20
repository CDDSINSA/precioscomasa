alter table public.quotes drop constraint if exists quotes_customer_id_fkey;
alter table public.customers add column if not exists email text;
create index if not exists customers_email_idx on public.customers (email);

create or replace function public.prepare_customer_sync()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '180s'
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede actualizar clientes.';
  end if;

  truncate table public.customers;
end;
$$;

revoke all on function public.prepare_customer_sync() from public;
grant execute on function public.prepare_customer_sync() to authenticated;
