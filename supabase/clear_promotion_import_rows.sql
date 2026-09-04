begin;

truncate table public.promotion_import_rows;

select count(*) as promotion_import_rows_remaining
from public.promotion_import_rows;

commit;
