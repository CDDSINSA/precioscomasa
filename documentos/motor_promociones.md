# Motor de mejor oferta

Actualizado el 5 de octubre de 2026 según el código local. Este documento describe el motor del cotizador; no certifica equivalencia con Oracle Xstore/ORCE ni el estado de una instalación remota.

## Responsabilidades y persistencia

- `src/services/dealEngine.ts`: filtra vigencia y segmento, genera alternativas y busca el menor total.
- `src/services/kitSets.ts`: enumera asignaciones entre SET con cantidades disjuntas.
- `src/services/dealConfig.ts`: valida las reglas, identifica kits pendientes y describe sus condiciones.
- `src/services/dealSettings.ts`: guarda y carga el JSON en `promotion_deal_configs` por `promotion_id`, `offer_id` y `segment` normalizado.
- `src/services/quote.ts`: distribuye asignaciones entre líneas, calcula IVA y concilia importes.
- `src/features/admin/DealEditor.tsx` y `KitSetFields.tsx`: edición de modalidades y SET.

La configuración adicional se almacena separada de las filas del reporte. La tabla no depende por FK de las cabeceras de promociones que reemplaza la sincronización. Una recarga con los mismos identificadores recupera la configuración; no debe suponerse que una oferta con otro identificador la hereda.

**Combina** se guarda en `promotion_offer_settings` por promoción y oferta y se propaga a sus filas. No es una propiedad por SET ni por segmento. Los umbrales por fila de `promotion_offer_sku_settings` siguen correspondiendo a otras modalidades; en kits se usan los umbrales de los SET.

## Disponibilidad y kits pendientes

Los scripts de publicación locales conservan kits de cualquier cantidad de SKU. El motor ya no deduce un kit por el número de filas, beneficios o umbrales importados.

Una oferta `KIT_OFFER` solo participa si tiene una configuración `kind: "KIT"` con SET definidos y válidos. Los kits sin configuración, con una modalidad distinta o con la antigua lista `items` quedan pendientes. Se muestran para configurar en Administración y no aparecen como ofertas automáticas en el buscador.

La antigua lista `items` sigue siendo legible: al abrirla, el editor propone SET de un SKU y umbral exacto. Esa propuesta no activa el kit hasta que se revise y guarde. No se convierte silenciosamente durante el cálculo. Una configuración inválida leída de la base produce un error de validación, no un descuento supuesto.

Si falta `promotion_deal_configs`, la aplicación puede seguir leyendo reglas importadas de otras modalidades, pero los kits continúan pendientes y el guardado informa de la tabla faltante. Si una carga histórica omitió kits, actualizar la aplicación no restaura sus filas: se necesita una sincronización de promociones después de verificar la función de publicación instalada.

## Modalidades

| Modalidad | Condición y beneficio |
| --- | --- |
| UNIT | Precio o descuento importado, con mínimos/escalas aplicables. |
| PACK | Cantidad cerrada de un SKU a precio total; el excedente se reevalúa. |
| KIT | Todos los SET completos, con SKU alternativos y beneficio propio por SET. |
| MIX_MATCH | Cantidad de unidades de una lista; permite repetir SKU y aplica el beneficio al grupo completo. |
| BUY_GET | Compra y recompensa con listas y cantidades separadas; la recompensa debe estar en la cotización. |

## Configuración de SET

Cada SET contiene `id`, `skus`, `quantity`, `thresholdType` y, opcionalmente, `benefit`.

- El identificador es único dentro del kit. El editor lo numera al agregar el SET.
- La lista contiene uno o más SKU, sin duplicados dentro del mismo SET. Se permite repetir un SKU en SET diferentes.
- `quantity` es un entero positivo. `thresholdType` es `EXACT` o `MINIMUM`.
- Sin `benefit`, el SET cumple una condición de compra sin otorgar un beneficio propio.
- `PERCENT_OFF` admite valores de 0 a 100; 100 significa gratis.
- `OVERRIDE_PRICE` fija un precio no negativo por unidad asignada a ese SET, no el total del SET.

Ejemplo de oferta 23456:

```json
{
  "kind": "KIT",
  "sets": [
    { "id": "1", "skus": ["A", "B", "C"], "quantity": 3, "thresholdType": "EXACT" },
    { "id": "2", "skus": ["D"], "quantity": 2, "thresholdType": "EXACT", "benefit": { "type": "PERCENT_OFF", "value": 100 } }
  ]
}
```

El SET 1 puede completarse con 3 A, 1 A + 2 C o 1 A + 1 B + 1 C. Siempre se requieren también 2 D en el SET 2. Un excedente en un SET no compensa un faltante en otro. La aplicación no agrega la regalía automáticamente.

### Exacto y mínimo

**Exacto:** toma la cantidad exigida por aplicación. Si pide 18 A y hay 20, puede usar 18 y evaluar las 2 restantes con ofertas que cumplan las condiciones para esas 2 unidades, o precio regular. Puede repetir el kit cuando alcance para completar todos los SET otra vez.

**Mínimo:** requiere alcanzar la cantidad y admite asignar cantidades mayores con el mismo beneficio. Con mínimo 30 y 10 % de descuento, 50 unidades pueden recibir ese 10 %; 29 no completan el SET. Los otros SET también deben cumplirse. El optimizador compara asignaciones mayores y alternativas que destinen unidades a otras ofertas para minimizar el total.

Los SET, selección mixta y compra/recompensa trabajan con unidades enteras. Los paquetes conservan soporte de cantidades fraccionarias. Una fracción de una línea no se cuenta como unidad completa de un SET y se calcula fuera de él.

### SKU compartidos y consumo

Cada unidad de la cotización solo completa un SET de una aplicación de kit. Por ejemplo, SET 1 acepta A/B y exige 3; SET 2 acepta A/D y exige 2 gratis. Con 5 A pueden asignarse 3 al primero y 2 al segundo; con 3 A no se completan ambos.

El motor explora repartos alternativos, en vez de asignar primero un SKU y bloquear las otras posibilidades. El beneficio corresponde al SET receptor. Consumir significa reservar unidades dentro del cálculo, no descontar inventario. Las asignaciones conservan `kitSet` y el desglose muestra su identificador.

## Elección global y combinación

Solo compiten ofertas vigentes del segmento del cliente y universales; sin segmento específico, solo universales. El motor compara kits, paquetes, otras modalidades y sobrantes sobre los SKU relacionados para minimizar el total. Completar un kit permite evaluarlo, pero no obliga a seleccionarlo.

Los descuentos unitarios adicionales siguen las reglas existentes de `bestUnit`; la incorporación de SET no las cambió:

- Una oferta no se aplica dos veces sobre la misma asignación y se elige una escala por oferta.
- Se admite una base no combinable acompañada de beneficios combinables. No es correcto afirmar que todas las ofertas deban tener Combina activado.
- Un kit no combinable puede recibir un beneficio unitario marcado como combinable. Un kit combinable también puede evaluarse con una base unitaria no combinable.
- Los precios fijos se evalúan como base y los porcentajes se encadenan multiplicativamente: 10 % y luego 20 % dejan el 72 % del precio, no el 70 %.
- En BUY_GET, `discountTriggers` controla si las unidades de compra pueden recibir esos beneficios adicionales.

La combinación de descuentos no permite reutilizar físicamente las unidades en otro paquete. Las escalas se evalúan sobre las cantidades de cada asignación; los sobrantes no vuelven a contar unidades consumidas.

Los empates a centavos usan segmento específico, tipo de precio fijo y vencimiento más próximo, con un desempate estable por identidad. Una promoción sin ahorro no desplaza el precio regular al mismo total. Se redondea por asignación a dos decimales y se concilian las líneas repetidas de un SKU.

## Interfaz y validación

En Administración, los kits muestran **Pendiente de configurar SET** hasta tener definición. Sus cantidades se editan dentro de **Kit por SET**, no en el threshold por fila de la tabla. **Combina** permanece en la tabla para toda la oferta. El editor conserva los estilos existentes.

En el buscador, los kits configurados muestran sus SET y se evalúan con los productos actuales más la cantidad que se va a agregar. El resultado puede indicar **Seleccionado en mejor oferta** y mostrar el subtotal previsto de la cotización; no debe confundirse con un precio unitario garantizado para cualquier cantidad.

## SQL y verificación

`supabase/deal_engine.sql` define la tabla de configuración y redefine la publicación de promociones. Requiere el esquema, la sincronización de promociones y `public.is_admin()`. El JSON admite SET sin agregar nuevas columnas. `promotion_sync.sql` también redefine la publicación: comparar antes de ejecutar cualquiera en una instalación existente. Consultar el inventario del README. Ninguno está certificado como instalado por esta documentación.

La búsqueda conserva límites explícitos de patrones, estados y transiciones. Si los supera, informa un error y bloquea la emisión/PDF; no presenta una aproximación como mejor oferta. Los precios de respaldo mostrados con error no autorizan emitir.

Comandos: `npm test` y `npm run build`. La verificación de la implementación de SET registró 64 pruebas aprobadas y compilación correcta. Incluye mezcla de SKU, 18 de 20, mínimo 30 sobre 50, SET incompletos, solapamientos, repetición, beneficios, competencia global, guardado simulado y regresiones de las otras modalidades. No sustituye probar datos reales, permisos y objetos instalados en Supabase.
