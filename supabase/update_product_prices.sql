-- ==============================================================================
-- Script para Supabase: Actualizar precio de lista en el maestro de catálogo
-- Artículos: 100846011 y 101031543
-- Nuevo precio de lista: 377.00
-- Tabla: public.products
-- ==============================================================================

begin;

-- 1. Actualización del precio de lista y fecha de modificación
update public.products
set
  list_price = 377.00,
  updated_at = now()
where sku in ('100846011', '101031543')
   or legacy_number in ('100846011', '101031543');

-- 2. Consulta de comprobación para verificar los datos actualizados
select
  sku,
  legacy_number,
  description,
  list_price,
  updated_at
from public.products
where sku in ('100846011', '101031543')
   or legacy_number in ('100846011', '101031543');

commit;
