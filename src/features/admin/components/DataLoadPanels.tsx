import { Boxes, Database, Landmark, PackageSearch, Save } from "lucide-react";
import { Badge, Button } from "../../../components/ui";
import { CUSTOMER_SEGMENTS_LABEL } from "../../../services/customerSegments.mjs";
import type { PromotionSyncMode } from "../../../services/supabase";
import type { Customer, ImportedPromotionRow, InventoryRecord, Product, StoreLocation } from "../../../types/domain";
import { EmptyRow, LoadPanel, PreviewFrame, UploadButton, todayIso } from "./AdminLoadPrimitives";

export function PromotionLoadPanel({
  rows,
  syncMode,
  uniqueOffers,
  uniquePromotions,
  preview,
  onFile,
  onModeChange,
  onSync,
}: {
  rows: ImportedPromotionRow[];
  syncMode: PromotionSyncMode;
  uniqueOffers: number;
  uniquePromotions: number;
  preview: ImportedPromotionRow[];
  onFile: (file?: File) => void;
  onModeChange: (mode: PromotionSyncMode) => void;
  onSync: () => void;
}) {
  return (
    <LoadPanel
      title="Promociones"
      subtitle="Ofertas comerciales de tienda 5."
      actions={
        <>
          <UploadButton label="Cargar archivo" onFile={onFile} />
          <label className="filter-field compact">
            <span>Modo</span>
            <select value={syncMode} onChange={(event) => onModeChange(event.target.value as PromotionSyncMode)}>
              <option value="full">Carga total</option>
              <option value="partial">Actualizacion</option>
            </select>
          </label>
          <Button disabled={!rows.length} onClick={onSync}><Save size={16} />Sincronizar</Button>
        </>
      }
      summary={[
        ["Promociones", uniquePromotions],
        ["Ofertas", uniqueOffers],
        ["Filas", rows.length],
      ]}
    >
      <PreviewFrame title="Promociones detectadas">
        <table>
          <thead>
            <tr><th>Promo</th><th>Nombre</th><th>Familia</th><th>Vigencia</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {preview.map((promo) => (
              <tr key={promo.promotionId}>
                <td>{promo.promotionId}</td>
                <td>{promo.promotionName}</td>
                <td>{promo.segment.trim() === "-" ? "fidelizacion" : "estrategica"}</td>
                <td>{promo.startsAt || "-"} / {promo.endsAt || "-"}</td>
                <td><Badge tone={promo.endsAt && promo.endsAt < todayIso() ? "warning" : "success"}>{promo.endsAt && promo.endsAt < todayIso() ? "Vencida" : "Publicable"}</Badge></td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={5} label="No hay promociones cargadas." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

export function CustomerLoadPanel({
  rows,
  uniqueCustomers,
  uniqueSegments,
  rowsWithPhone,
  rowsWithEmail,
  preview,
  onFile,
  onSync,
}: {
  rows: Customer[];
  uniqueCustomers: number;
  uniqueSegments: number;
  rowsWithPhone: number;
  rowsWithEmail: number;
  preview: Customer[];
  onFile: (file?: File) => void;
  onSync: () => void;
}) {
  return (
    <LoadPanel
      title="Clientes"
      subtitle={`Base usada por búsqueda y segmento base del cotizador. Solo segmentos ${CUSTOMER_SEGMENTS_LABEL}. Cada carga reemplaza la base completa de clientes.`}
      actions={<><UploadButton label="Cargar archivo" onFile={onFile} /><Button disabled={!rows.length} onClick={onSync}><Database size={16} />Actualizar clientes</Button></>}
      summary={[
        ["Clientes", uniqueCustomers],
        ["Segmentos", uniqueSegments],
        ["Con correo", rowsWithEmail],
        ["Con teléfono", rowsWithPhone],
      ]}
    >
      <PreviewFrame title="Clientes detectados">
        <table>
          <thead>
            <tr><th>ID cliente</th><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>ID / Cédula</th><th>Segmento</th><th>Dirección</th></tr>
          </thead>
          <tbody>
            {preview.map((customer) => (
              <tr key={customer.customerId}>
                <td>{customer.customerId}</td><td>{customer.displayName}</td><td>{customer.email ?? "-"}</td><td>{customer.mobile ?? "-"}</td>
                <td>{customer.nationalId ?? "-"}</td><td>{customer.segment || "-"}</td><td>{customer.address ?? "-"}</td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={7} label="No hay clientes cargados." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

export function CatalogLoadPanel({
  rows,
  uniqueDepartments,
  uniqueSkus,
  uniqueSuppliers,
  preview,
  onFile,
  onSync,
}: {
  rows: Product[];
  uniqueDepartments: number;
  uniqueSkus: number;
  uniqueSuppliers: number;
  preview: Product[];
  onFile: (file?: File) => void;
  onSync: () => void;
}) {
  return (
    <LoadPanel
      title="Catalogo"
      subtitle="Maestro de SKU, descripcion, departamento, proveedor, unidad, precio y numero de parte."
      actions={<><UploadButton label="Cargar catálogo" onFile={onFile} /><Button disabled={!rows.length} onClick={onSync}><PackageSearch size={16} />Actualizar catálogo</Button></>}
      summary={[
        ["SKU", uniqueSkus],
        ["Con precio", rows.filter((row) => row.listPrice > 0).length],
        ["Departamentos", uniqueDepartments],
        ["Proveedores", uniqueSuppliers],
      ]}
    >
      <PreviewFrame title="Productos detectados">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descripción</th>
              <th>Depto.</th>
              <th>ID Prov.</th>
              <th>Proveedor</th>
              <th>U/M</th>
              <th>Precio unitario</th>
              <th>Número parte</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((product) => (
              <tr key={product.sku}>
                <td>{product.sku}</td>
                <td>{product.description}</td>
                <td>{product.departmentId ?? "-"}</td>
                <td>{product.supplierId ?? product.supplier ?? "-"}</td>
                <td>{product.supplierName ?? product.supName ?? "-"}</td>
                <td>{product.unitOfMeasure ?? "-"}</td>
                <td>{product.listPrice.toLocaleString("es-NI")}</td>
                <td>{product.partNumber ?? "-"}</td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={8} label="No hay catálogo cargado." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

export function InventoryLoadPanel({
  rows,
  uniqueSkus,
  uniqueStores,
  totalUnits,
  preview,
  onFile,
  onSync,
}: {
  rows: InventoryRecord[];
  uniqueSkus: number;
  uniqueStores: number;
  totalUnits: number;
  preview: InventoryRecord[];
  onFile: (file?: File) => void;
  onSync: () => void;
}) {
  return (
    <LoadPanel
      title="Inventario"
      subtitle="Existencias de todas las tiendas por SKU (d_comun.inventory, compartido). Cada carga reemplaza la base completa."
      actions={<><UploadButton label="Cargar inventario" onFile={onFile} /><Button disabled={!rows.length} onClick={onSync}><Boxes size={16} />Actualizar inventario</Button></>}
      summary={[
        ["SKU", uniqueSkus],
        ["Tiendas", uniqueStores],
        ["Unidades", totalUnits.toLocaleString("es-NI")],
      ]}
    >
      <PreviewFrame title="Inventario detectado">
        <table>
          <thead>
            <tr><th>Tienda</th><th>SKU</th><th>Inventario</th></tr>
          </thead>
          <tbody>
            {preview.map((record) => (
              <tr key={`${record.storeId}-${record.sku}`}>
                <td>{record.storeId}</td><td>{record.sku}</td><td>{record.quantity.toLocaleString("es-NI")}</td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={3} label="No hay inventario cargado." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

export function StoresLoadPanel({
  rows,
  preview,
  onFile,
  onSync,
}: {
  rows: StoreLocation[];
  preview: StoreLocation[];
  onFile: (file?: File) => void;
  onSync: () => void;
}) {
  return (
    <LoadPanel
      title="Tiendas"
      subtitle="Catalogo maestro de tiendas (ID, nombre, tipo, formato y ubicacion). Cada carga reemplaza la base completa."
      actions={<><UploadButton label="Cargar tiendas" onFile={onFile} /><Button disabled={!rows.length} onClick={onSync}><Landmark size={16} />Actualizar tiendas</Button></>}
      summary={[
        ["Tiendas", rows.length],
        ["Locales", rows.filter((row) => row.storeType?.toLowerCase() === "local").length],
        ["Foraneas", rows.filter((row) => row.storeType?.toLowerCase().startsWith("for")).length],
        ["Formatos", new Set(rows.map((row) => row.storeFormat).filter(Boolean)).size],
      ]}
    >
      <PreviewFrame title="Tiendas detectadas">
        <table>
          <thead>
            <tr><th>ID</th><th>Nombre tienda</th><th>Tipo</th><th>Formato</th><th>Ubicacion</th></tr>
          </thead>
          <tbody>
            {preview.map((store) => (
              <tr key={store.id}>
                <td>{store.id}</td><td>{store.name}</td><td>{store.storeType || "-"}</td><td>{store.storeFormat || "-"}</td><td>{store.location || "-"}</td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={5} label="No hay tiendas cargadas." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}
