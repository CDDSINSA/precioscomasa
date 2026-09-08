create extension if not exists pg_trgm;

alter table public.products add column if not exists department_id text;

create table if not exists public.product_departments (
  department_id text primary key,
  department_name text not null default '',
  division_id text not null default '',
  division_name text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists products_sku_trgm_idx
on public.products using gin (sku gin_trgm_ops);

create index if not exists products_description_trgm_idx
on public.products using gin (description gin_trgm_ops);

create index if not exists products_part_number_trgm_idx
on public.products using gin (part_number gin_trgm_ops);

create index if not exists products_legacy_number_trgm_idx
on public.products using gin (legacy_number gin_trgm_ops);

create index if not exists products_department_id_idx
on public.products (department_id);

create index if not exists product_departments_division_id_idx
on public.product_departments (division_id);

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
  inventory_quantity numeric
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
    scored.inventory_quantity
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
