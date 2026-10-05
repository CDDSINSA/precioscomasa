# Cotizador COMASA

Aplicacion web para administrar promociones de tienda 5 COMASA y calcular cotizaciones por SKU, cantidad y segmento comercial.

## Estado de esta documentación

Actualizada el 5 de octubre de 2026 a partir del código local. Describe la implementación de kits por SET. No certifica el estado instalado en Supabase ni el despliegue en Vercel. No se ha implementado en esta actualización un repositorio Git, un registro de migraciones ni una auditoría remota.

Referencias:

- [Motor de promociones](documentos/motor_promociones.md): reglas comerciales, SET, combinación, persistencia y pruebas.
- [Instructivo operativo](documentos/instructivo_contenido.md): uso de la aplicación y configuración de ofertas.
- [Instructivo Word](documentos/Instructivo_Cotizador_COMASA.docx): guía ilustrada; sus capturas históricas se distinguen del comportamiento actual.
- [Guía visual reutilizable](documentos/frontend_design_system_app_base.md): referencia de diseño para otras aplicaciones; no define las reglas comerciales del cotizador.

## Stack

- React + TypeScript + Vite
- Supabase como backend transaccional
- Vercel como destino de despliegue
- `lucide-react` para iconografia
- `xlsx` para lectura de archivos Excel/CSV
- `jspdf` para exportacion de cotizaciones

## Configuracion

1. Copiar `.env.example` a `.env.local`.
2. Completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Configurar `VITE_CATALOG_TSV_URL` solo como respaldo temporal del catalogo.
4. Revisar el esquema y las funciones requeridas en Supabase según la sección SQL de este documento. No ejecutar el esquema completo como actualización indiscriminada de una base existente.
5. Instalar dependencias y ejecutar la aplicacion.

Para una base existente, comprobar primero las funciones instaladas y el error específico. `supabase/catalog_sync.sql` e `inventory_sync.sql` definen las funciones de reemplazo correspondientes; no deben reaplicarse por rutina sin comparar su definición con la instalada. La sincronización de promociones y las configuraciones adicionales requieren los objetos descritos abajo.

## Carga operativa desde Administracion

El centro de carga permite actualizar datos por proceso. Clientes, catalogo, inventario y tiendas usan reemplazo total: cada sincronizacion elimina la data anterior de esa tabla y publica la data nueva cargada desde el archivo.

- Promociones: archivo comercial de ofertas. Se conservan los kits de cualquier número de SKU; sin SET configurados quedan pendientes y no participan en el cálculo. El reporte no aporta la pertenencia a SET.
- Clientes: reporte de clientes para busqueda y segmento base.
- Catalogo: SKU, descripcion, unidad de medida, precio unitario y numero de parte.
- Inventario: tienda, SKU y existencia. La sincronizacion publica solo registros de tienda 1041.
- Tiendas: ID y nombre de tienda como soporte interno del inventario.

## Carga de clientes

Desde Administracion se puede cargar el reporte de clientes y usar `Actualizar clientes` para reemplazar la base completa en Supabase. El usuario debe tener rol `admin`.

Tambien queda disponible el script local:

1. Comprobar que exista la tabla `customers` con los campos requeridos por el script; su definición está en `supabase/schema.sql`.
2. Validar el archivo con `npm run sync:customers -- --dry-run "C:/ruta/Clientes Estadisticas de Compras sep26.xlsx"`.
3. Definir `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en la terminal local.
4. Ejecutar `npm run sync:customers -- "C:/ruta/Clientes Estadisticas de Compras sep26.xlsx"`.

El script reemplaza totalmente la tabla `customers`: primero elimina los clientes actuales y despues carga todos los clientes validos del Excel.

## Variables en Vercel

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_CATALOG_TSV_URL`
- `VITE_ENABLE_INVENTORY`: opcional. El inventario queda activo por defecto; usar `false` solo si se necesita ocultar carga y lectura de inventario.

## Roles

- `admin`: acceso a administracion y cotizacion.
- `asesor-comasa`: acceso solo al cotizador.
- `asesor-retail`: acceso solo al cotizador.

Al crear usuarios en Supabase Auth, asignar el rol en `app_profiles.role`. Si el usuario se crea despues de ejecutar el script SQL, el perfil se genera automaticamente con `asesor-comasa` como rol inicial.

## Estructura

- `src/app`: shell, navegacion lateral y navegacion movil.
- `src/components`: componentes visuales reutilizables.
- `src/features/admin`: carga y revision de promociones.
- `src/features/quotes`: cotizacion y comparacion de segmentos.
- `src/services`: catálogo, promociones, importadores, PDF y Supabase.
- `src/services/dealEngine.ts`: búsqueda de la mejor combinación y asignación de unidades.
- `src/services/kitSets.ts`: combinaciones de SKU y cantidades para completar SET sin reutilizar unidades.
- `src/services/dealConfig.ts`: validación, descripción y estado pendiente de las reglas.
- `src/services/dealSettings.ts`: lectura y escritura de configuración adicional, independiente del reporte.
- `src/features/admin/DealEditor.tsx` y `KitSetFields.tsx`: editor de modalidades y SET con los estilos existentes.
- `scripts/promotions.test.mjs`: pruebas del motor y regresiones.
- `supabase/schema.sql`: estructura inicial de base de datos.

## Configuración adicional de kits

La modalidad **Kit por SET** define para cada SET un identificador, SKU elegibles, cantidad entera positiva, umbral exacto o mínimo y beneficio opcional (porcentaje o precio unitario). Todos los SET deben completarse. Un SKU puede aparecer en varios SET, pero cada unidad se asigna una sola vez.

Los umbrales exactos dejan sobrantes para otras ofertas; los mínimos permiten beneficiar cantidades superiores al umbral. El motor compara el costo conjunto con las demás ofertas. **Combina** se guarda para la promoción y oferta completas, no por SET. La configuración de SET se guarda por promoción, oferta y segmento.

Las definiciones antiguas de kit por componente se conservan para revisión, pero no se aplican automáticamente. El editor propone un SET por componente antiguo; el administrador debe revisar y guardar la configuración. Los umbrales por fila SKU no habilitan un kit pendiente.

## SQL local y estado instalado

Este inventario describe archivos, no su historial de ejecución. El estado remoto de todos ellos está **sin verificar** en esta revisión. Las fechas de los archivos y su presencia en el proyecto no demuestran qué versión está instalada.

| Archivo en `supabase/` | Finalidad y efecto relevante |
| --- | --- |
| `schema.sql` | Esquema general, tablas, funciones y políticas. Contiene alteraciones y eliminaciones de objetos; no es un actualizador universal inocuo. |
| `promotion_sync.sql` | Configuraciones de ofertas/SKU y funciones de preparación y publicación de promociones. |
| `deal_engine.sql` | Tabla JSON de reglas adicionales, permisos y otra definición de `publish_promotion_sync`. Conserva los kits de cualquier tamaño. |
| `promotion_discount_thresholds.sql` | Modifica condiciones de cantidad y actualiza datos de reglas/configuraciones; no define SET. |
| `catalog_sync.sql`, `inventory_sync.sql`, `customer_sync.sql` | Funciones para reemplazo de datos en sus respectivos procesos. |
| `product_departments.sql` | Soporte de departamentos y divisiones del catálogo. |
| `product_search_indexes.sql`, `quote_admin_indexes.sql` | Índices para consultas de productos y cotizaciones. |
| `update_product_prices.sql` | Operación puntual: cambia el precio de dos SKU específicos. No forma parte de una instalación general. |
| `clear_promotion_import_rows.sql` | Vacía la tabla de filas importadas de promociones. Es mantenimiento destructivo, no una migración de esquema. |

`promotion_sync.sql` y `deal_engine.sql` redefinen la misma función de publicación; el último ejecutado determina la definición instalada. `schema.sql` también comparte objetos con scripts complementarios. Antes de ejecutar un SQL sobre una base existente, comparar los objetos afectados, sus dependencias y sus efectos sobre datos. No se establece aquí un orden universal de ejecución ni se declara obsoleto un archivo sin esa comprobación.

Los SET usan la columna JSON `promotion_deal_configs.config`: el cambio de la aplicación no necesita una columna SQL por SET. La tabla debe existir con los permisos correspondientes. Su ausencia deja los kits pendientes e impide guardar reglas adicionales; no habilita una inferencia automática del kit.

## Verificación local

- `npm test`: pruebas del motor y persistencia simulada.
- `npm run build`: comprobación TypeScript y compilación de producción.

La implementación local de SET fue verificada con 64 pruebas aprobadas y compilación correcta. Ese resultado no confirma migraciones remotas, permisos efectivos ni despliegues.

## Configuraciones por oferta–SKU (implementación del 5 de octubre de 2026)

Administración → Config. ofertas permite descargar una plantilla, leer Excel/CSV/TSV,
validar contra las ofertas existentes y revisar antes de guardar. Solo se lee la primera
hoja. A y VALID se ignoran; los encabezados desde B son `Id de oferta`, `SET`, `ITEM`,
`Umbral`, `Cantidad`. Los identificadores deben mantenerse como texto en Excel.
No se heredan SET de filas anteriores. Un SET vacío identifica una oferta no kit.

Las nuevas condiciones se guardan en `offer_configuration_details`, con clave
`offer_id, sku, set_id`, sin promoción ni segmento. Esta tercera parte de la clave
permite incluir el mismo SKU en varios SET. Los SET de ofertas diferentes son independientes.
Cada SET exige una sola cantidad combinada de sus SKU alternativos: siete SKU con
cantidad 1 representan una unidad de cualquiera de ellos. Las filas del mismo SET
deben coincidir en cantidad y umbral. El beneficio de cada SKU se resuelve desde
`offer_rules` dentro de su promoción y segmento; nunca se copia un precio global.

También se pueden editar los kits con **Configurar SET** y las otras ofertas con
los campos de umbral y **Guardar**. Las condiciones nuevas tienen prioridad sobre las
reglas anteriores únicamente para los SKU afectados; las reglas anteriores no se borran.
Descuento y precio fijo sin regla especial usan Exacto 1 repetible por unidad.
Se conservan condiciones anteriores mayores que 1 hasta que se configuren explícitamente.
Exacto N aplica a grupos completos repetibles y deja sobrantes; Mínimo N beneficia
todas las unidades cuando se cumple el mínimo configurado. Las vigencias, segmentos
y combinación siguen perteneciendo a las ofertas del reporte.

### Instalación en una base existente

1. Conservar respaldo de la base y verificar que existen `offer_rules` y `is_admin()`.
2. Ejecutar **solo** `supabase/offer_configuration_details.sql` para este cambio.
   Es aditivo y repetible; no reemplaza `publish_promotion_sync`, no modifica los
   reportes ni migra automáticamente configuraciones históricas potencialmente distintas.
3. Desplegar esta versión de la aplicación. Si falta la migración, la aplicación
   mantiene el recorrido anterior y la nueva carga informa el SQL faltante.
4. Validar y revisar una plantilla antes de guardar. Los kits se presentan completos;
   las ofertas no kit se actualizan solo para los SKU incluidos. No se admiten
   ofertas inexistentes, SET incompatibles, kits incompletos ni beneficios ambiguos.

La RPC `import_offer_configuration_details` valida también en servidor, exige admin,
usa una transacción, detecta cambios desde la vista previa y conserva antes/después en
`offer_configuration_import_audit`. Los clientes autenticados solo leen la tabla;
las escrituras pasan por la RPC. La sincronización de promociones no borra esta tabla.
Al cambiar el reporte, un kit sin todos sus SET queda pendiente; un tipo incompatible
o beneficio inválido produce un error explícito. Una reversión de condiciones puede
prepararse desde `before_rows` del registro de auditoría; no hay botón de restauración.

Verificación local: `npm test`, `npm run build` y la prueba PostgreSQL aislada
`node scripts/offer-configuration-sql.test.mjs <ruta-a-pglite/dist/index.js>`.
PGlite es una herramienta de prueba opcional, instalada fuera del proyecto; no es una
dependencia de producción. La migración no ha sido aplicada ni verificada en Supabase remoto.

## Credenciales

No registrar claves en la documentación ni en el código. Las variables `VITE_*` se exponen al cliente: usar ahí únicamente la clave publicable prevista para la aplicación. `SUPABASE_SERVICE_ROLE_KEY` es exclusiva de procesos administrativos del servidor o terminal, nunca del navegador. Las operaciones remotas dependen de autenticación, políticas RLS y funciones autorizadas en Supabase.
