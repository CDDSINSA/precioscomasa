-- ==============================================================================
-- Migración: Rol 'asesor-peinsa' con restricción RLS y RPC para proveedor 1022301
-- ==============================================================================
-- NOTA: El paso 1 agrega el enum (si ya lo ejecutaste previamente, no causará error).
-- Ejecuta el script completo en el SQL Editor de Supabase.
-- ==============================================================================

-- 1. Columnas de proveedor en public.products
alter table public.products add column if not exists supplier text;
alter table public.products add column if not exists sup_name text;
alter table public.products add column if not exists supplier_id text;
alter table public.products add column if not exists supplier_name text;

create index if not exists idx_products_supplier on public.products (supplier);
create index if not exists idx_products_supplier_id on public.products (supplier_id);

-- 2. Asegurar que el enum app_role contiene 'asesor-peinsa'
alter type public.app_role add value if not exists 'asesor-peinsa';

-- 3. Actualizar función trigger de nuevos usuarios
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
begin
  insert into public.app_profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Usuario'),
    case
      when requested_role in ('admin', 'asesor-comasa', 'asesor-retail', 'asesor-peinsa')
        then requested_role::public.app_role
      else 'asesor-comasa'::public.app_role
    end
  )
  on conflict (id) do update
    set full_name = excluded.full_name;

  return new;
end;
$$;

-- 4. Configurar Row Level Security (RLS) estricto en public.products
alter table public.products enable row level security;
alter table public.products force row level security;

-- Eliminar TODAS las políticas existentes de products, cualquiera sea su nombre.
-- Las políticas permisivas se combinan con OR: una sola política antigua con
-- "using (true)" anula la restricción PEINSA aunque esta exista.
do $$
declare
  existing record;
begin
  for existing in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'products'
  loop
    execute format('drop policy if exists %I on public.products', existing.policyname);
  end loop;
end $$;

-- Crear política estricta de lectura:
-- - admin, asesor-comasa y asesor-retail: ven todo el catálogo
-- - asesor-peinsa: ÚNICAMENTE productos del proveedor 1022301
create policy "products_read_for_quotes" on public.products
for select to authenticated
using (
  public.current_app_role()::text in ('admin', 'asesor-comasa', 'asesor-retail')
  or (
    public.current_app_role()::text = 'asesor-peinsa'
    and (
      coalesce(supplier, '') = '1022301'
      or coalesce(supplier_id, '') = '1022301'
    )
  )
);

-- Asegurar política de escritura para administradores
drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write" on public.products
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 5. Actualizar la función RPC de búsqueda de productos e inventario
-- Esta es la función principal que ejecuta el modal "Agregar SKU" del cotizador.
-- Al incluir el filtro directo en su WHERE y definirla con SECURITY INVOKER,
-- PostgreSQL NUNCA devolverá productos de otros proveedores a asesor-peinsa.
drop function if exists public.search_products_with_inventory(text, text, integer, integer);
drop function if exists public.search_products_with_inventory(text, text, integer, integer, text);

create or replace function public.search_products_with_inventory(
  search_term text default '',
  search_store_id text default '1041',
  result_limit integer default 36,
  result_offset integer default 0,
  search_division_id text default null
)
returns table (
  sku text,
  legacy_number text,
  description text,
  unit_of_measure text,
  list_price numeric,
  part_number text,
  department_id text,
  max_discount numeric,
  taxable boolean,
  inventory_quantity numeric,
  supplier text,
  sup_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select
      lower(trim(coalesce(search_term, ''))) as query,
      regexp_split_to_array(lower(trim(coalesce(search_term, ''))), '\s+') as tokens
  ),
  matched as (
    select
      products.sku,
      products.legacy_number,
      products.description,
      products.unit_of_measure,
      products.list_price,
      products.part_number,
      products.department_id,
      products.max_discount,
      products.taxable,
      coalesce(products.supplier, products.supplier_id) as supplier,
      coalesce(products.sup_name, products.supplier_name) as sup_name,
      coalesce(sum(inventory.quantity) filter (where inventory.quantity > 0), 0) as inventory_quantity,
      normalized.query,
      concat_ws(
        ' ',
        lower(products.sku),
        lower(coalesce(products.part_number, '')),
        lower(coalesce(products.legacy_number, '')),
        lower(products.description)
      ) as searchable
    from public.products
    cross join normalized
    left join public.inventory
      on inventory.sku = products.sku
      and inventory.store_id = search_store_id
      and inventory.quantity > 0
    left join public.product_departments
      on product_departments.department_id = products.department_id
    where (
        search_division_id is null
        or search_division_id = ''
        or product_departments.division_id = search_division_id
      )
      and (
        public.current_app_role()::text in ('admin', 'asesor-comasa', 'asesor-retail')
        or (
          public.current_app_role()::text = 'asesor-peinsa'
          and (
            coalesce(products.supplier, '') = '1022301'
            or coalesce(products.supplier_id, '') = '1022301'
          )
        )
      )
      and (
        normalized.query = ''
        or position(normalized.query in lower(products.sku)) > 0
        or position(normalized.query in lower(products.description)) > 0
        or position(normalized.query in lower(coalesce(products.part_number, ''))) > 0
        or position(normalized.query in lower(coalesce(products.legacy_number, ''))) > 0
        or exists (
          select 1
          from unnest(normalized.tokens) as token
          where length(token) >= 2
            and position(token in concat_ws(
              ' ',
              lower(products.sku),
              lower(coalesce(products.part_number, '')),
              lower(coalesce(products.legacy_number, '')),
              lower(products.description)
            )) > 0
        )
      )
    group by
      products.sku,
      products.legacy_number,
      products.description,
      products.unit_of_measure,
      products.list_price,
      products.part_number,
      products.department_id,
      products.max_discount,
      products.taxable,
      products.supplier,
      products.supplier_id,
      products.sup_name,
      products.supplier_name,
      normalized.query
  ),
  scored as (
    select
      matched.*,
      case
        when matched.query = '' then 9
        when lower(matched.sku) = matched.query then 0
        when lower(coalesce(matched.part_number, '')) = matched.query
          or lower(coalesce(matched.legacy_number, '')) = matched.query then 1
        when left(lower(matched.sku), length(matched.query)) = matched.query then 2
        when left(lower(coalesce(matched.part_number, '')), length(matched.query)) = matched.query
          or left(lower(coalesce(matched.legacy_number, '')), length(matched.query)) = matched.query then 3
        when left(lower(matched.description), length(matched.query)) = matched.query then 4
        when position(matched.query in lower(matched.description)) > 0 then 5
        when (
          select bool_and(position(token in matched.searchable) > 0)
          from unnest(regexp_split_to_array(matched.query, '\s+')) as token
          where token <> ''
        ) then 6
        when position(matched.query in lower(matched.sku)) > 0
          or position(matched.query in lower(coalesce(matched.part_number, ''))) > 0
          or position(matched.query in lower(coalesce(matched.legacy_number, ''))) > 0 then 7
        else 8
      end as search_score
    from matched
  )
  select
    scored.sku,
    scored.legacy_number,
    scored.description,
    scored.unit_of_measure,
    scored.list_price,
    scored.part_number,
    scored.department_id,
    scored.max_discount,
    scored.taxable,
    scored.inventory_quantity,
    scored.supplier,
    scored.sup_name
  from scored
  order by
    (scored.inventory_quantity > 0) desc,
    scored.search_score asc,
    scored.description asc
  limit greatest(1, least(coalesce(result_limit, 36), 101))
  offset greatest(0, coalesce(result_offset, 0));
$$;

revoke all on function public.search_products_with_inventory(text, text, integer, integer, text) from public;
grant execute on function public.search_products_with_inventory(text, text, integer, integer, text) to authenticated;

-- 6. Recargar la caché de esquema de la API (columnas nuevas visibles de inmediato)
notify pgrst, 'reload schema';
