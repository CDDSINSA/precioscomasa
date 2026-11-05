-- ==============================================================================
-- Diagnóstico del rol asesor-peinsa (solo lectura, no modifica datos)
-- Ejecutar en el SQL Editor de Supabase y revisar cada resultado.
-- ==============================================================================

-- 1. ¿El enum contiene asesor-peinsa?
select enumlabel from pg_enum
where enumtypid = 'public.app_role'::regtype
order by enumsortorder;

-- 2. ¿Existen las columnas de proveedor?
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'products'
  and column_name in ('supplier', 'supplier_id', 'sup_name', 'supplier_name');

-- 3. ¿El catálogo cargado trae proveedor? (si peinsa = 0, recargar el catálogo con la columna SUPPLIER)
select
  count(*) as total_productos,
  count(*) filter (where coalesce(supplier, supplier_id, '') <> '') as con_proveedor,
  count(*) filter (where supplier = '1022301' or supplier_id = '1022301') as peinsa,
  count(*) filter (where trim(coalesce(supplier, '')) = '1022301' and supplier <> '1022301') as peinsa_con_espacios
from public.products;

-- 3b. Valores de proveedor más frecuentes (detecta formatos como '1022301.0' o '01022301')
select supplier, supplier_id, count(*) from public.products
group by 1, 2 order by 3 desc limit 15;

-- 4. Políticas activas en products: deben quedar SOLO products_read_for_quotes y products_admin_write.
select policyname, permissive, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'products';

-- 5. ¿RLS está activo en products?
select relname, relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.products'::regclass;

-- 6. Usuarios con rol PEINSA (confirmar que el perfil tiene el rol correcto)
select p.id, u.email, p.role
from public.app_profiles p
join auth.users u on u.id = p.id
where p.role::text = 'asesor-peinsa';

-- 7. Simular lo que ve un usuario PEINSA (reemplazar el UUID por uno del paso 6).
--    Debe devolver solo productos del proveedor 1022301.
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
--   select count(*) as visibles, count(*) filter (where coalesce(supplier, supplier_id) <> '1022301') as ajenos
--   from public.products;
-- rollback;
