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



## Carga de clientes

Desde Administracion se puede cargar el reporte de clientes y usar `Actualizar clientes` para reemplazar la base completa en Supabase. El usuario debe tener rol `admin`.



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
