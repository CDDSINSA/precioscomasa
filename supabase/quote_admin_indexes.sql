create extension if not exists pg_trgm;

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
