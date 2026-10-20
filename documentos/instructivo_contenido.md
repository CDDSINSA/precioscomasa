# Instructivo del Cotizador COMASA

Actualizado el 5 de octubre de 2026.

Guía para seleccionar clientes, preparar cotizaciones y descargar sus documentos. Las funciones de Administración y Gestión de cotizaciones corresponden al perfil administrativo.

## 1 Ingresar

1. Abra el enlace de la aplicación proporcionado por COMASA.
2. Escriba su correo y clave y pulse **Ingresar**.
3. Si olvidó la clave, escriba su correo y pulse **Restablecer clave**. Siga el enlace recibido y defina una clave de al menos ocho caracteres.
4. Si aparece **Perfil pendiente**, solicite al administrador que revise la autorización de su usuario.

## 2 Seleccionar el cliente

1. Abra **Cotización** y pulse **Buscar cliente**.
2. Busque por nombre, cédula o celular y seleccione el resultado correcto.
3. Revise ID, nombre, dirección, teléfono, identificación y segmento base.

El segmento se toma del cliente seleccionado. **Limpiar** quita el cliente y el segmento; no elimina los productos de la cotización.

## 3 Agregar productos

1. Pulse **Agregar SKU**.
2. Filtre por **División** o escriba en **Buscar SKU**.
3. Seleccione el producto y revise descripción, precio y existencia disponible.
4. Indique la cantidad y revise las ofertas disponibles y sus condiciones.
5. Pulse el botón de agregar que corresponda. Para kits por SET, **Agregar SKU** incorpora la cantidad y recalcula las condiciones con los productos de la cotización.
6. Repita para otros productos y cierre el buscador para revisar la cotización.

Seleccione primero el cliente para consultar ofertas por segmento. El inventario corresponde a la tienda 1041 cuando esta función está activa. Para kits y recompensas, revise los SKU y cantidades necesarios; las condiciones dependen de los productos incluidos en la cotización.

## 4 Importar una lista

**Desde archivo:** pulse **Importar**, mantenga **Archivo** y elija **Seleccionar archivo**. Se admiten XLSX, CSV y TSV. Al leer un archivo válido, sus líneas reemplazan los productos actuales.

**Desde texto:** pulse **Importar**, seleccione **Pegar datos** y pegue SKU y cantidad, una línea por producto. Revise el número de líneas detectadas y pulse **Agregar**. Esta opción añade líneas a las existentes.

Ejemplo de estructura, a sustituir por códigos del catálogo:

```text
SKU Cantidad
100634895 8
152281753 1
```

## 5 Revisar y emitir

1. Compruebe cliente, segmento, códigos y cantidades.
2. Edite la cantidad en la tabla o use la papelera para eliminar una línea.
3. Espere a que termine el cálculo de promociones y revise subtotal, ahorro e IVA.
4. Para una revisión previa, pulse **Borrador PDF**. No asigna consecutivo.
5. Para registrar la cotización, pulse **Emitir cotización**.
6. Revise el resumen y pulse **Confirmar emisión**. La app asigna consecutivo y descarga el PDF oficial.

Se requiere un cliente y al menos un SKU para emitir. Si hay un error de cálculo o las promociones siguen cargando, resuelva el aviso antes de continuar. Si aparece que la cotización se emitió pero falló la descarga, conserve el consecutivo y consulte al administrador antes de volver a emitir.

## 6 Consultar cotizaciones emitidas

Solo perfil administrativo.

1. Abra **Gestión de cotizaciones**.
2. Escriba un ID, cliente, usuario o segmento en **Búsqueda** y ajuste **Buscar en**.
3. Use **Desde** y **Hasta** si necesita delimitar fechas; pulse **Buscar**.
4. Seleccione una fila para ver sus productos y precios.
5. Use **Exportar a Excel** para descargar las cotizaciones consultadas o la opción del detalle para exportar una cotización individual.

**Limpiar** restablece los filtros de consulta. Un borrador PDF no equivale a una cotización emitida.

## 7 Actualizar los datos de la aplicación

Solo perfil administrativo. En **Administración**, seleccione el proceso, cargue el archivo correspondiente, revise los registros detectados y ejecute su botón de actualización. Espere el resultado y verifique el mensaje antes de continuar.

| Proceso | Acción de publicación | Uso |
| --- | --- | --- |
| Promociones | Sincronizar | Publicar ofertas comerciales según el modo seleccionado |
| Clientes | Actualizar clientes | Actualizar búsqueda y segmento del cliente |
| Catálogo | Actualizar catálogo | Actualizar SKU, descripción, unidad, precio y número de parte |
| Inventario | Actualizar inventario | Actualizar existencias de tienda 1041 |
| Tiendas | Actualizar tiendas | Actualizar el catálogo de tiendas de soporte |

Clientes, catálogo, inventario y tiendas usan reemplazo total: la actualización sustituye la base anterior de ese proceso. Cargue el archivo completo que debe quedar vigente. Seleccionar un archivo permite revisarlo; la publicación se realiza con el botón de sincronización o actualización.

## 8 Configurar ofertas

1. En **Administración**, abra **Config. ofertas**.
2. Busque por promoción, oferta o SKU y revise el resultado.
3. Ajuste **Combina** según la condición comercial. Este cambio se guarda al modificar la casilla y afecta la promoción y oferta correspondientes.
4. Para ofertas que no sean kits, revise **Threshold** y **Tipo threshold** y pulse **Guardar** en la fila. Algunas modalidades fijan el tipo mínimo y permiten cero.
5. Use **Definir regla** o **Editar regla** y pulse **Guardar regla** al terminar. En kits, las cantidades se configuran dentro de cada SET; los umbrales por fila no los habilitan.

Modalidades: precio o descuento unitario importado; paquete de un SKU a precio total; kit por SET; unidades mezcladas; compra X con beneficio en Y. En paquetes, el precio es el total del paquete. En beneficios porcentuales, 100 significa gratis. La recompensa debe estar agregada a la cotización.

### Configurar un kit por SET

1. Abra la regla de la oferta tipo kit. La modalidad es **Kit por SET**.
2. Pulse **Agregar SET** y escriba los SKU elegibles separados por coma. Un SET puede contener uno o varios SKU.
3. Indique **Unidades requeridas** y **Tipo threshold**: Exacta o Mínima.
4. Seleccione **Sin beneficio**, **Porcentaje** o **Precio unitario (C$)** y complete el valor cuando corresponda.
5. Agregue los demás SET y guarde la regla. Todos deben cumplirse. **Combina** se controla para la oferta completa desde la tabla.

Ejemplo: la oferta 23456 tiene SET 1 con A/B/C y 3 unidades exactas, sin beneficio propio; SET 2 con D y 2 unidades exactas gratis. Son válidos 3 A + 2 D, 1 A + 2 C + 2 D o 1 A + 1 B + 1 C + 2 D. Con una sola D no se completa el kit.

**Exacta:** si pide 18 y se agregan 20, puede usar 18 y buscar otra oferta válida para las 2 restantes; si no hay, quedan a precio regular. **Mínima:** con mínimo 30 y 10 % de descuento, 50 unidades pueden beneficiarse; con 29 no se cumple. También deben completarse los demás SET.

Un SKU puede pertenecer a varios SET, pero cada unidad cuenta una sola vez. El motor busca el reparto de menor costo y compara el kit con las otras ofertas; completar el kit no garantiza que sea la alternativa seleccionada.

Los kits se cargan sin límite por número de códigos. Si no tienen SET configurados quedan **pendientes** y no se aplican automáticamente. Las reglas antiguas requieren revisar la propuesta del editor y guardar sus SET. Recargar el reporte no aporta la pertenencia a SET.

**Combina** conserva el comportamiento existente: admite una base no combinable acompañada de ofertas combinables. Un kit no combinable todavía puede recibir un beneficio unitario marcado como combinable; no significa que las mismas unidades puedan completar otro kit.

## 9 Resolver avisos comunes

- **Kit pendiente de configurar SET:** configure y guarde todos sus SET; el threshold por fila SKU no activa el kit.
- **Perfil pendiente:** pida al administrador revisar el acceso de su usuario.
- **Cliente sin resultados:** pruebe otro nombre, cédula o celular; si sigue sin aparecer, solicite revisar la base de clientes.
- **Archivo sin SKU válidos:** compruebe formato, encabezados y códigos; vuelva a seleccionar el archivo corregido.
- **Promociones cargando o error de cálculo:** espere o revise conexión y disponibilidad de los datos antes de emitir.
- **Emitir cotización deshabilitado:** revise el aviso de requisitos debajo de los botones.
- **Actualización fallida:** revise el mensaje y no dé por publicada la nueva información hasta obtener confirmación de éxito.
