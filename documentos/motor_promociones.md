# Motor de mejor oferta

La implementación sigue las siete reglas comerciales acordadas. No constituye una certificación de equivalencia con el motor propietario de Oracle Xstore.

## Activación

1. En una instalación existente, ejecutar `supabase/deal_engine.sql` completo en el SQL Editor del proyecto Supabase. Requiere el esquema y la sincronización de promociones existentes, incluida la función `public.is_admin()`.
2. Entrar como administrador y buscar una oferta en la configuración de promociones. Usar **Definir regla** para guardar su modalidad por promoción, oferta y segmento.
3. Volver a sincronizar las promociones si la carga anterior había omitido kits por su cantidad de SKU.
4. Cotizar casos reales y comprobar el desglose de unidades, promociones y subtotales antes de publicar la aplicación.

La migración crea `promotion_deal_configs`, habilita lectura autenticada y escritura administrativa, y actualiza la función de publicación para conservar los kits. No carga nuevas promociones ni inventa condiciones para las existentes. Sin la tabla, siguen funcionando las reglas importadas; el formulario indica que falta la migración al intentar guardar.

## Modalidades y elección

- Unitarias: precio fijo, descuentos y escalas de cantidad.
- Paquetes: cantidad cerrada por precio total, con reevaluación del excedente.
- Kits: todos los componentes, con sus proporciones y beneficios respectivos.
- Selección mixta: cualquier combinación de **unidades** de la lista elegible; no exige códigos distintos ni la lista completa.
- Compra y recompensa: listas y cantidades separadas, incluyendo el mismo SKU en ambas. Las recompensas deben estar agregadas a la cotización; el motor no añade productos automáticamente.

Solo compiten el segmento del cliente y el universal. Sin segmento, solo el universal. El motor compara combinaciones completas y remanentes para minimizar el importe monetario, sin reutilizar unidades en dos paquetes. Los descuentos sobre una misma unidad se combinan únicamente si todas las ofertas implicadas permiten stacking. Primero se evalúa el precio fijo y después los porcentajes multiplicativos; el descuento de disparadores requiere su opción habilitada y ofertas compatibles.

Los empates monetarios favorecen segmento específico, precio fijo y vencimiento más próximo, en ese orden. Los importes se redondean a dos decimales por asignación y se concilian al distribuir SKU repetidos entre líneas. Los paquetes y kits admiten cantidades fraccionarias; selección mixta y compra/recompensa usan cantidades enteras.

La búsqueda tiene límites explícitos de patrones, estados y transiciones. Si los supera, bloquea emisión y PDF con un mensaje; no entrega una combinación aproximada como si fuera la mejor.

## Verificación local

Ejecutar `npm test` y `npm run build`. Las pruebas cubren segmentación, reparto y excedentes, kits superpuestos, selección mixta, BXGX/BXGY, stacking, desempates, redondeo, paginación y la regresión de `FIXED_QTY_PRICE` del SKU 160292022. La validación local no sustituye ejecutar la migración ni comprobar reglas reales con una sesión autenticada.
