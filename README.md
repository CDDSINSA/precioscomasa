# Cotizador COMASA

Aplicacion web para administrar promociones de tienda 5 COMASA y calcular cotizaciones por SKU, cantidad y segmento comercial.

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
3. Configurar `VITE_CATALOG_TSV_URL` si se desea usar un origen distinto al TSV publicado del catalogo.
4. Ejecutar `supabase/schema.sql` en el SQL Editor del proyecto Supabase.
5. Instalar dependencias y ejecutar la aplicacion.

## Carga de clientes

Desde Administracion se puede cargar el reporte de clientes y usar `Actualizar clientes` para reemplazar la base completa en Supabase. El usuario debe tener rol `admin`.

Tambien queda disponible el script local:

1. Asegurar que `supabase/schema.sql` ya fue ejecutado para crear la tabla `customers`.
2. Validar el archivo con `npm run sync:customers -- --dry-run "C:/ruta/Clientes Estadisticas de Compras sep26.xlsx"`.
3. Definir `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en la terminal local.
4. Ejecutar `npm run sync:customers -- "C:/ruta/Clientes Estadisticas de Compras sep26.xlsx"`.

El script reemplaza totalmente la tabla `customers`: primero elimina los clientes actuales y despues carga todos los clientes validos del Excel.

## Variables en Vercel

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_CATALOG_TSV_URL`

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
- `src/services`: catalogo, promociones, importadores, PDF y Supabase.
- `supabase/schema.sql`: estructura inicial de base de datos.

## Seguridad

No se incluyen credenciales en el codigo. Las claves del cliente se leen desde variables `VITE_*`; cualquier proceso administrativo sensible debe moverse a funciones server-side antes de operar con datos reales.
