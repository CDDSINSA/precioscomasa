create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$
begin
  create type public.app_role as enum ('admin', 'asesor-comasa', 'asesor-retail');
exception
  when duplicate_object then null;
end $$;

alter type public.app_role add value if not exists 'admin';
alter type public.app_role add value if not exists 'asesor-comasa';
alter type public.app_role add value if not exists 'asesor-retail';

do $$
begin
  create type public.offer_type as enum (
    'LINE_ITEM_DISCOUNT',
    'TIERED_DISCOUNT',
    'FIXED_QTY_PRICE',
    'KIT_OFFER'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.offer_type add value if not exists 'LINE_ITEM_DISCOUNT';
alter type public.offer_type add value if not exists 'TIERED_DISCOUNT';
alter type public.offer_type add value if not exists 'FIXED_QTY_PRICE';
alter type public.offer_type add value if not exists 'KIT_OFFER';

do $$
begin
  create type public.promotion_family as enum ('fidelizacion', 'estrategica');
exception
  when duplicate_object then null;
end $$;

alter type public.promotion_family add value if not exists 'fidelizacion';
alter type public.promotion_family add value if not exists 'estrategica';

create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'asesor-comasa',
  created_at timestamptz not null default now()
);

alter table public.app_profiles add column if not exists full_name text;
alter table public.app_profiles add column if not exists role public.app_role default 'asesor-comasa';
alter table public.app_profiles add column if not exists created_at timestamptz default now();
update public.app_profiles set full_name = '' where full_name is null;
update public.app_profiles set role = 'asesor-comasa' where role is null;
update public.app_profiles set created_at = now() where created_at is null;
alter table public.app_profiles alter column full_name set not null;
alter table public.app_profiles alter column role set not null;
alter table public.app_profiles alter column created_at set not null;

create table if not exists public.products (
  sku text primary key,
  legacy_number text,
  upc text,
  description text not null default '',
  unit_of_measure text,
  part_number text,
  department_id text,
  list_price numeric(14, 4) not null default 0 check (list_price >= 0),
  max_discount numeric(7, 4),
  taxable boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists legacy_number text;
alter table public.products add column if not exists upc text;
alter table public.products add column if not exists description text default '';
alter table public.products add column if not exists unit_of_measure text;
alter table public.products add column if not exists part_number text;
alter table public.products add column if not exists department_id text;
alter table public.products add column if not exists list_price numeric(14, 4) default 0;
alter table public.products add column if not exists max_discount numeric(7, 4);
alter table public.products add column if not exists taxable boolean default true;
alter table public.products add column if not exists updated_at timestamptz default now();
update public.products set description = '' where description is null;
update public.products set list_price = 0 where list_price is null;
update public.products set taxable = true where taxable is null;
update public.products set updated_at = now() where updated_at is null;
alter table public.products alter column description set not null;
alter table public.products alter column list_price set not null;
alter table public.products alter column taxable set not null;
alter table public.products alter column updated_at set not null;

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

create table if not exists public.product_departments (
  department_id text primary key,
  department_name text not null default '',
  division_id text not null default '',
  division_name text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.product_departments add column if not exists department_name text default '';
alter table public.product_departments add column if not exists division_id text default '';
alter table public.product_departments add column if not exists division_name text default '';
alter table public.product_departments add column if not exists updated_at timestamptz default now();
update public.product_departments set department_name = '' where department_name is null;
update public.product_departments set division_id = '' where division_id is null;
update public.product_departments set division_name = '' where division_name is null;
update public.product_departments set updated_at = now() where updated_at is null;
alter table public.product_departments alter column department_name set not null;
alter table public.product_departments alter column division_id set not null;
alter table public.product_departments alter column division_name set not null;
alter table public.product_departments alter column updated_at set not null;

create index if not exists product_departments_division_id_idx
on public.product_departments (division_id);

create table if not exists public.promotions (
  id text primary key,
  name text not null default '',
  starts_at date,
  ends_at date,
  store_id text not null default '5',
  family public.promotion_family not null default 'estrategica',
  status text not null default 'activa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promotions add column if not exists name text default '';
alter table public.promotions add column if not exists starts_at date;
alter table public.promotions add column if not exists ends_at date;
alter table public.promotions add column if not exists store_id text default '5';
alter table public.promotions add column if not exists family public.promotion_family default 'estrategica';
alter table public.promotions add column if not exists status text default 'activa';
alter table public.promotions add column if not exists created_at timestamptz default now();
alter table public.promotions add column if not exists updated_at timestamptz default now();
update public.promotions set name = '' where name is null;
update public.promotions set store_id = '5' where store_id is null;
update public.promotions set family = 'estrategica' where family is null;
update public.promotions set status = 'activa' where status is null;
update public.promotions set created_at = now() where created_at is null;
update public.promotions set updated_at = now() where updated_at is null;
alter table public.promotions alter column name set not null;
alter table public.promotions alter column store_id set not null;
alter table public.promotions alter column family set not null;
alter table public.promotions alter column status set not null;

create table if not exists public.offer_rules (
  id uuid primary key default gen_random_uuid(),
  external_offer_id text,
  promotion_id text,
  offer_type public.offer_type,
  sku text,
  segment text not null default ' - ',
  min_quantity numeric(14, 4) not null default 0,
  fixed_price numeric(14, 4),
  discount_percent numeric(7, 4),
  discount_type text,
  promotion_attribute text,
  configuration_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.offer_rules add column if not exists external_offer_id text;
alter table public.offer_rules add column if not exists promotion_id text;
alter table public.offer_rules add column if not exists offer_type public.offer_type;
alter table public.offer_rules add column if not exists sku text;
alter table public.offer_rules add column if not exists segment text default ' - ';
alter table public.offer_rules add column if not exists min_quantity numeric(14, 4);
alter table public.offer_rules add column if not exists fixed_price numeric(14, 4);
alter table public.offer_rules add column if not exists discount_percent numeric(7, 4);
alter table public.offer_rules add column if not exists discount_type text;
alter table public.offer_rules add column if not exists promotion_attribute text;
alter table public.offer_rules add column if not exists configuration_note text;
alter table public.offer_rules add column if not exists allow_stacking boolean default false;
alter table public.offer_rules add column if not exists threshold_quantity numeric(14, 4) default 1;
alter table public.offer_rules add column if not exists threshold_type text default 'EXACT';
alter table public.offer_rules add column if not exists is_active boolean default true;
alter table public.offer_rules add column if not exists created_at timestamptz default now();
alter table public.offer_rules add column if not exists updated_at timestamptz default now();
update public.offer_rules set segment = ' - ' where segment is null;
update public.offer_rules set allow_stacking = false where allow_stacking is null;
update public.offer_rules set threshold_quantity = 1 where threshold_quantity is null;
update public.offer_rules set threshold_type = 'EXACT' where threshold_type is null;
update public.offer_rules set is_active = true where is_active is null;
update public.offer_rules set created_at = now() where created_at is null;
update public.offer_rules set updated_at = now() where updated_at is null;
alter table public.offer_rules drop constraint if exists offer_rules_sku_fkey;

alter table public.offer_rules drop constraint if exists offer_rules_threshold_type_check;
alter table public.offer_rules
  add constraint offer_rules_threshold_type_check
  check (threshold_type in ('EXACT', 'MINIMUM'));

create table if not exists public.promotion_offer_settings (
  promotion_id text not null,
  offer_id text not null,
  allow_stacking boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (promotion_id, offer_id)
);

alter table public.promotion_offer_settings add column if not exists allow_stacking boolean default false;
alter table public.promotion_offer_settings add column if not exists updated_at timestamptz default now();
update public.promotion_offer_settings set allow_stacking = false where allow_stacking is null;
update public.promotion_offer_settings set updated_at = now() where updated_at is null;
alter table public.promotion_offer_settings alter column allow_stacking set not null;
alter table public.promotion_offer_settings alter column updated_at set not null;

create table if not exists public.promotion_offer_sku_settings (
  promotion_id text not null,
  offer_id text not null,
  sku text not null,
  segment text not null default ' - ',
  threshold_quantity numeric(14, 4) not null default 1,
  threshold_type text not null default 'EXACT',
  updated_at timestamptz not null default now(),
  primary key (promotion_id, offer_id, sku, segment),
  check (threshold_quantity >= 1),
  check (threshold_type in ('EXACT', 'MINIMUM'))
);

alter table public.promotion_offer_sku_settings add column if not exists segment text default ' - ';
alter table public.promotion_offer_sku_settings add column if not exists threshold_quantity numeric(14, 4) default 1;
alter table public.promotion_offer_sku_settings add column if not exists threshold_type text default 'EXACT';
alter table public.promotion_offer_sku_settings add column if not exists updated_at timestamptz default now();
update public.promotion_offer_sku_settings set segment = ' - ' where segment is null;
update public.promotion_offer_sku_settings set threshold_quantity = 1 where threshold_quantity is null;
update public.promotion_offer_sku_settings set threshold_type = 'EXACT' where threshold_type is null;
update public.promotion_offer_sku_settings set updated_at = now() where updated_at is null;
alter table public.promotion_offer_sku_settings alter column segment set not null;
alter table public.promotion_offer_sku_settings alter column threshold_quantity set not null;
alter table public.promotion_offer_sku_settings alter column threshold_type set not null;
alter table public.promotion_offer_sku_settings alter column updated_at set not null;
alter table public.promotion_offer_sku_settings drop constraint if exists promotion_offer_sku_settings_quantity_check;
alter table public.promotion_offer_sku_settings
  add constraint promotion_offer_sku_settings_quantity_check
  check (threshold_quantity >= 1);
alter table public.promotion_offer_sku_settings drop constraint if exists promotion_offer_sku_settings_threshold_type_check;
alter table public.promotion_offer_sku_settings
  add constraint promotion_offer_sku_settings_threshold_type_check
  check (threshold_type in ('EXACT', 'MINIMUM'));

create table if not exists public.promotion_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  row_count integer not null default 0,
  imported_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.promotion_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.promotion_import_batches(id) on delete set null,
  offer_id text,
  promotion_id text,
  promotion_name text not null default '',
  store_id text not null default '5',
  sku text,
  offer_type public.offer_type,
  min_quantity numeric(14, 4),
  fixed_price numeric(14, 4),
  discount_percent numeric(7, 4),
  discount_type text,
  promotion_attribute text,
  segment text not null default ' - ',
  created_at timestamptz not null default now()
);

alter table public.promotion_import_rows add column if not exists batch_id uuid;
alter table public.promotion_import_rows add column if not exists offer_id text;
alter table public.promotion_import_rows add column if not exists promotion_id text;
alter table public.promotion_import_rows add column if not exists promotion_name text default '';
alter table public.promotion_import_rows add column if not exists store_id text default '5';
alter table public.promotion_import_rows add column if not exists sku text;
alter table public.promotion_import_rows add column if not exists offer_type public.offer_type;
alter table public.promotion_import_rows add column if not exists min_quantity numeric(14, 4) default 0;
alter table public.promotion_import_rows add column if not exists fixed_price numeric(14, 4);
alter table public.promotion_import_rows add column if not exists discount_percent numeric(7, 4);
alter table public.promotion_import_rows add column if not exists discount_type text;
alter table public.promotion_import_rows add column if not exists promotion_attribute text;
alter table public.promotion_import_rows add column if not exists segment text default ' - ';
alter table public.promotion_import_rows add column if not exists created_at timestamptz default now();
alter table public.promotion_import_rows drop column if exists item_description;
alter table public.promotion_import_rows drop column if exists starts_at;
alter table public.promotion_import_rows drop column if exists ends_at;
update public.promotion_import_rows set min_quantity = 0 where min_quantity is null;
alter table public.promotion_import_rows alter column min_quantity set default 0;
alter table public.promotion_import_rows alter column min_quantity set not null;

create table if not exists public.customers (
  customer_id text primary key,
  first_name text not null default '',
  last_name text not null default '',
  org_name text,
  display_name text not null default '',
  mobile text,
  national_id text,
  segment text not null default '',
  address text,
  updated_at timestamptz not null default now()
);

alter table public.customers add column if not exists first_name text default '';
alter table public.customers add column if not exists last_name text default '';
alter table public.customers add column if not exists org_name text;
alter table public.customers add column if not exists display_name text default '';
alter table public.customers add column if not exists mobile text;
alter table public.customers add column if not exists national_id text;
alter table public.customers add column if not exists segment text default '';
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists updated_at timestamptz default now();
update public.customers set first_name = '' where first_name is null;
update public.customers set last_name = '' where last_name is null;
update public.customers set display_name = coalesce(nullif(display_name, ''), nullif(org_name, ''), trim(concat(first_name, ' ', last_name)), customer_id);
update public.customers set segment = '' where segment is null;
update public.customers set updated_at = now() where updated_at is null;
alter table public.customers alter column first_name set not null;
alter table public.customers alter column last_name set not null;
alter table public.customers alter column display_name set not null;
alter table public.customers alter column segment set not null;
alter table public.customers alter column updated_at set not null;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigint,
  quote_code text,
  customer_id text references public.customers(customer_id) on delete set null,
  customer_name text,
  customer_address text,
  customer_phone text,
  customer_national_id text,
  original_segment text not null,
  compared_segment text,
  subtotal_list numeric(14, 4) not null default 0,
  subtotal_final numeric(14, 4) not null default 0,
  tax numeric(14, 4) not null default 0,
  total_with_tax numeric(14, 4) not null default 0,
  savings numeric(14, 4) not null default 0,
  created_by uuid references auth.users(id),
  generated_by_name text,
  generated_by_email text,
  created_at timestamptz not null default now()
);

alter table public.quotes add column if not exists quote_number bigint;
alter table public.quotes add column if not exists quote_code text;
alter table public.quotes add column if not exists tax numeric(14, 4) default 0;
alter table public.quotes add column if not exists total_with_tax numeric(14, 4) default 0;
alter table public.quotes add column if not exists customer_id text references public.customers(customer_id) on delete set null;
alter table public.quotes add column if not exists customer_address text;
alter table public.quotes add column if not exists customer_phone text;
alter table public.quotes add column if not exists customer_national_id text;
alter table public.quotes add column if not exists generated_by_name text;
alter table public.quotes add column if not exists generated_by_email text;

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  line_number integer not null default 0,
  sku text not null,
  quantity numeric(14, 4) not null check (quantity > 0),
  list_price numeric(14, 4) not null,
  list_total numeric(14, 4) not null default 0,
  final_total numeric(14, 4) not null,
  savings numeric(14, 4) not null default 0,
  applied_offer_rule_id uuid references public.offer_rules(id),
  product_description text,
  applied_offer_id text,
  applied_promotion_id text,
  applied_promotion_name text
);

alter table public.quote_lines add column if not exists line_number integer default 0;
alter table public.quote_lines add column if not exists list_total numeric(14, 4) default 0;
alter table public.quote_lines add column if not exists product_description text;
alter table public.quote_lines add column if not exists applied_offer_id text;
alter table public.quote_lines add column if not exists applied_promotion_id text;
alter table public.quote_lines add column if not exists applied_promotion_name text;
update public.quote_lines set line_number = 0 where line_number is null;
update public.quote_lines set list_total = 0 where list_total is null;
alter table public.quote_lines alter column line_number set default 0;
alter table public.quote_lines alter column line_number set not null;
alter table public.quote_lines alter column list_total set default 0;
alter table public.quote_lines alter column list_total set not null;
alter table public.quote_lines drop constraint if exists quote_lines_sku_fkey;

create index if not exists quotes_created_at_idx
on public.quotes (created_at desc);

create index if not exists quotes_quote_code_trgm_idx
on public.quotes using gin (quote_code gin_trgm_ops);

create index if not exists quotes_customer_name_trgm_idx
on public.quotes using gin (customer_name gin_trgm_ops);

create index if not exists quotes_customer_id_trgm_idx
on public.quotes using gin (customer_id gin_trgm_ops);

create index if not exists quotes_generated_by_name_trgm_idx
on public.quotes using gin (generated_by_name gin_trgm_ops);

create index if not exists quotes_generated_by_email_trgm_idx
on public.quotes using gin (generated_by_email gin_trgm_ops);

create index if not exists quotes_segment_idx
on public.quotes (original_segment, compared_segment);

create index if not exists quote_lines_quote_id_idx
on public.quote_lines (quote_id, line_number);

create table if not exists public.quote_number_sequence (
  id boolean primary key default true check (id),
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.quote_number_sequence (id, last_value)
values (true, 0)
on conflict (id) do nothing;

drop index if exists public.promotion_import_rows_business_key;
create unique index promotion_import_rows_business_key
on public.promotion_import_rows (offer_id, promotion_id, sku, segment, min_quantity);

create index if not exists promotion_import_rows_promotion_idx
on public.promotion_import_rows (promotion_id);

create index if not exists promotion_import_rows_kit_lookup_idx
on public.promotion_import_rows (offer_type, promotion_id, offer_id, segment, sku);

create index if not exists promotion_import_rows_publish_idx
on public.promotion_import_rows (promotion_id, offer_id, sku, segment, min_quantity, created_at, id);

create index if not exists offer_rules_lookup_idx
on public.offer_rules (sku, segment, is_active);

create index if not exists offer_rules_promotion_idx
on public.offer_rules (promotion_id);

create index if not exists offer_rules_offer_lookup_idx
on public.offer_rules (promotion_id, external_offer_id, sku, segment);

create index if not exists promotion_offer_sku_settings_lookup_idx
on public.promotion_offer_sku_settings (promotion_id, offer_id, sku, segment);

create index if not exists quote_lines_applied_offer_rule_idx
on public.quote_lines (applied_offer_rule_id);

create unique index if not exists quotes_quote_number_unique_idx
on public.quotes (quote_number)
where quote_number is not null;

create unique index if not exists quotes_quote_code_unique_idx
on public.quotes (quote_code)
where quote_code is not null;

create index if not exists quotes_created_by_created_at_idx
on public.quotes (created_by, created_at desc);

create index if not exists customers_display_name_idx
on public.customers (display_name);

create index if not exists customers_mobile_idx
on public.customers (mobile);

create index if not exists customers_national_id_idx
on public.customers (national_id);

create table if not exists public.stores (
  id text primary key,
  name text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.stores add column if not exists name text default '';
alter table public.stores add column if not exists updated_at timestamptz default now();
update public.stores set name = '' where name is null;
update public.stores set updated_at = now() where updated_at is null;
alter table public.stores alter column name set not null;
alter table public.stores alter column updated_at set not null;

create table if not exists public.inventory (
  store_id text not null,
  sku text not null,
  quantity numeric(14, 4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (store_id, sku)
);

alter table public.inventory add column if not exists quantity numeric(14, 4) default 0;
alter table public.inventory add column if not exists updated_at timestamptz default now();
update public.inventory set quantity = 0 where quantity is null;
update public.inventory set updated_at = now() where updated_at is null;
alter table public.inventory alter column quantity set not null;
alter table public.inventory alter column updated_at set not null;

create index if not exists inventory_sku_idx
on public.inventory (sku);

create index if not exists inventory_store_quantity_idx
on public.inventory (store_id, quantity);

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

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.app_profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() = 'admin'
$$;

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
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when requested_role in ('admin', 'asesor-comasa', 'asesor-retail')
        then requested_role::public.app_role
      else 'asesor-comasa'::public.app_role
    end
  )
  on conflict (id) do update
    set full_name = excluded.full_name;

  return new;
end;
$$;

create or replace function public.ensure_app_profile()
returns table (
  id uuid,
  full_name text,
  role public.app_role
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
begin
  if current_user_id is null then
    return;
  end if;

  select email
  into current_email
  from auth.users
  where auth.users.id = current_user_id;

  insert into public.app_profiles (id, full_name, role)
  values (
    current_user_id,
    coalesce(split_part(current_email, '@', 1), 'Usuario'),
    'asesor-comasa'::public.app_role
  )
  on conflict (id) do nothing;

  return query
  select p.id, p.full_name, p.role
  from public.app_profiles p
  where p.id = current_user_id;
end;
$$;

grant execute on function public.ensure_app_profile() to authenticated;

drop function if exists public.issue_quote(jsonb);

create or replace function public.issue_quote(payload jsonb)
returns table (
  quote_id uuid,
  quote_code text,
  quote_number bigint,
  created_at timestamptz,
  generated_by_name text,
  generated_by_email text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  issued_at timestamptz := now();
  next_number bigint;
  new_quote_id uuid;
  new_quote_code text;
  advisor_name text;
  advisor_email text;
begin
  if current_user_id is null then
    raise exception 'Debe iniciar sesion para emitir una cotizacion.';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'La cotizacion enviada no tiene un formato valido.';
  end if;

  if jsonb_typeof(payload->'lines') <> 'array' or jsonb_array_length(payload->'lines') = 0 then
    raise exception 'Agregue al menos un SKU antes de generar el PDF.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload->'lines') as line(value)
    where coalesce(nullif(line.value->>'sku', ''), '') = ''
      or coalesce(nullif(line.value->>'quantity', '')::numeric, 0) <= 0
  ) then
    raise exception 'Todas las lineas deben tener SKU y cantidad mayor que cero.';
  end if;

  select
    coalesce(nullif(profile.full_name, ''), split_part(auth_user.email, '@', 1), 'Usuario COMASA'),
    auth_user.email
  into advisor_name, advisor_email
  from auth.users auth_user
  left join public.app_profiles profile on profile.id = auth_user.id
  where auth_user.id = current_user_id;

  insert into public.quote_number_sequence as quote_sequence (id, last_value, updated_at)
  values (true, 1, issued_at)
  on conflict (id) do update
    set last_value = quote_sequence.last_value + 1,
        updated_at = excluded.updated_at
  returning quote_sequence.last_value into next_number;

  new_quote_code :=
    'COT-' ||
    to_char(issued_at at time zone 'America/Managua', 'YYYYMMDD') ||
    '-' ||
    lpad(next_number::text, 6, '0');

  insert into public.quotes as inserted_quote (
    quote_number,
    quote_code,
    customer_id,
    customer_name,
    customer_address,
    customer_phone,
    customer_national_id,
    original_segment,
    compared_segment,
    subtotal_list,
    subtotal_final,
    tax,
    total_with_tax,
    savings,
    created_by,
    generated_by_name,
    generated_by_email,
    created_at
  )
  values (
    next_number,
    new_quote_code,
    nullif(payload->'customer'->>'customer_id', ''),
    nullif(payload->'customer'->>'display_name', ''),
    nullif(payload->'customer'->>'address', ''),
    nullif(payload->'customer'->>'mobile', ''),
    nullif(payload->'customer'->>'national_id', ''),
    coalesce(nullif(payload->>'original_segment', ''), 'Sin segmento'),
    nullif(payload->>'compared_segment', ''),
    coalesce(nullif(payload->>'subtotal_list', '')::numeric, 0),
    coalesce(nullif(payload->>'subtotal_final', '')::numeric, 0),
    coalesce(nullif(payload->>'tax', '')::numeric, 0),
    coalesce(nullif(payload->>'total_with_tax', '')::numeric, 0),
    coalesce(nullif(payload->>'savings', '')::numeric, 0),
    current_user_id,
    advisor_name,
    advisor_email,
    issued_at
  )
  returning inserted_quote.id into new_quote_id;

  insert into public.quote_lines (
    quote_id,
    line_number,
    sku,
    quantity,
    list_price,
    list_total,
    final_total,
    savings,
    product_description,
    applied_offer_id,
    applied_promotion_id,
    applied_promotion_name
  )
  select
    new_quote_id,
    line.ordinality::integer,
    line.value->>'sku',
    coalesce(nullif(line.value->>'quantity', '')::numeric, 0),
    coalesce(nullif(line.value->>'list_price', '')::numeric, 0),
    coalesce(nullif(line.value->>'list_total', '')::numeric, 0),
    coalesce(nullif(line.value->>'final_total', '')::numeric, 0),
    coalesce(nullif(line.value->>'savings', '')::numeric, 0),
    nullif(line.value->>'product_description', ''),
    nullif(line.value->>'applied_offer_id', ''),
    nullif(line.value->>'applied_promotion_id', ''),
    nullif(line.value->>'applied_promotion_name', '')
  from jsonb_array_elements(payload->'lines') with ordinality as line(value, ordinality);

  return query
  select new_quote_id, new_quote_code, next_number, issued_at, advisor_name, advisor_email;
end;
$$;

grant execute on function public.issue_quote(jsonb) to authenticated;

insert into public.app_profiles (id, full_name, role)
select
  users.id,
  coalesce(users.raw_user_meta_data->>'full_name', split_part(users.email, '@', 1), 'Usuario'),
  case
    when users.raw_user_meta_data->>'role' in ('admin', 'asesor-comasa', 'asesor-retail')
      then (users.raw_user_meta_data->>'role')::public.app_role
    else 'asesor-comasa'::public.app_role
  end
from auth.users
left join public.app_profiles profiles on profiles.id = users.id
where profiles.id is null;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.app_profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_departments enable row level security;
alter table public.promotions enable row level security;
alter table public.offer_rules enable row level security;
alter table public.customers enable row level security;
alter table public.stores enable row level security;
alter table public.inventory enable row level security;
alter table public.promotion_offer_settings enable row level security;
alter table public.promotion_offer_sku_settings enable row level security;
alter table public.promotion_import_batches enable row level security;
alter table public.promotion_import_rows enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.quote_number_sequence enable row level security;

drop policy if exists "profiles_select_by_role" on public.app_profiles;
drop policy if exists "profiles_admin_write" on public.app_profiles;
drop policy if exists "products_read_for_quotes" on public.products;
drop policy if exists "products_admin_write" on public.products;
drop policy if exists "product_departments_read_for_quotes" on public.product_departments;
drop policy if exists "product_departments_admin_write" on public.product_departments;
drop policy if exists "promotions_read_for_quotes" on public.promotions;
drop policy if exists "promotions_admin_write" on public.promotions;
drop policy if exists "offer_rules_read_for_quotes" on public.offer_rules;
drop policy if exists "offer_rules_admin_write" on public.offer_rules;
drop policy if exists "customers_read_for_quotes" on public.customers;
drop policy if exists "customers_admin_write" on public.customers;
drop policy if exists "stores_read_for_quotes" on public.stores;
drop policy if exists "stores_admin_write" on public.stores;
drop policy if exists "inventory_read_for_quotes" on public.inventory;
drop policy if exists "inventory_admin_write" on public.inventory;
drop policy if exists "promotion_offer_settings_read_for_quotes" on public.promotion_offer_settings;
drop policy if exists "promotion_offer_settings_admin_write" on public.promotion_offer_settings;
drop policy if exists "promotion_offer_sku_settings_read_for_quotes" on public.promotion_offer_sku_settings;
drop policy if exists "promotion_offer_sku_settings_admin_write" on public.promotion_offer_sku_settings;
drop policy if exists "import_batches_admin_only" on public.promotion_import_batches;
drop policy if exists "import_rows_admin_only" on public.promotion_import_rows;
drop policy if exists "quotes_select_by_owner_or_admin" on public.quotes;
drop policy if exists "quotes_insert_by_owner" on public.quotes;
drop policy if exists "quotes_admin_update_delete" on public.quotes;
drop policy if exists "users_read_own_quote_lines" on public.quote_lines;
drop policy if exists "users_insert_own_quote_lines" on public.quote_lines;
drop policy if exists "quote_lines_admin_write" on public.quote_lines;
drop policy if exists "quote_number_sequence_admin_only" on public.quote_number_sequence;

create policy "profiles_select_by_role" on public.app_profiles
for select to authenticated using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_write" on public.app_profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "products_read_for_quotes" on public.products
for select to authenticated using (true);

create policy "products_admin_write" on public.products
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "product_departments_read_for_quotes" on public.product_departments
for select to authenticated using (true);

create policy "product_departments_admin_write" on public.product_departments
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "promotions_read_for_quotes" on public.promotions
for select to authenticated using (true);

create policy "promotions_admin_write" on public.promotions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "offer_rules_read_for_quotes" on public.offer_rules
for select to authenticated using (true);

create policy "offer_rules_admin_write" on public.offer_rules
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "customers_read_for_quotes" on public.customers
for select to authenticated using (true);

create policy "customers_admin_write" on public.customers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "stores_read_for_quotes" on public.stores
for select to authenticated using (true);

create policy "stores_admin_write" on public.stores
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "inventory_read_for_quotes" on public.inventory
for select to authenticated using (true);

create policy "inventory_admin_write" on public.inventory
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "promotion_offer_settings_read_for_quotes" on public.promotion_offer_settings
for select to authenticated using (true);

create policy "promotion_offer_settings_admin_write" on public.promotion_offer_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "promotion_offer_sku_settings_read_for_quotes" on public.promotion_offer_sku_settings
for select to authenticated using (true);

create policy "promotion_offer_sku_settings_admin_write" on public.promotion_offer_sku_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "import_batches_admin_only" on public.promotion_import_batches
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "import_rows_admin_only" on public.promotion_import_rows
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "quotes_select_by_owner_or_admin" on public.quotes
for select to authenticated using (created_by = auth.uid() or public.is_admin());

create policy "quotes_insert_by_owner" on public.quotes
for insert to authenticated with check (created_by = auth.uid());

create policy "quotes_admin_update_delete" on public.quotes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "users_read_own_quote_lines" on public.quote_lines
for select to authenticated using (
  exists (
    select 1 from public.quotes q
    where q.id = quote_id and (q.created_by = auth.uid() or public.is_admin())
  )
);

create policy "users_insert_own_quote_lines" on public.quote_lines
for insert to authenticated with check (
  exists (select 1 from public.quotes q where q.id = quote_id and q.created_by = auth.uid())
);

create policy "quote_lines_admin_write" on public.quote_lines
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "quote_number_sequence_admin_only" on public.quote_number_sequence
for all to authenticated using (public.is_admin()) with check (public.is_admin());
