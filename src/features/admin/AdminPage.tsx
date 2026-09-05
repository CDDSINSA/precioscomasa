import { Boxes, Database, Landmark, PackageSearch, Save, Search, SlidersHorizontal, Tags, Upload, UsersRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Badge, Button, Card, CardContent, Header, Metric } from "../../components/ui";
import { inventoryFeatureEnabled, inventoryStoreId } from "../../config/features";
import {
  parseCatalogFile,
  parseCustomerFile,
  parseInventoryFile,
  parsePromotionFile,
  parseStoreFile,
} from "../../services/importers";
import { updateStoredDataStatus } from "../../services/dataStatus";
import {
  loadRemoteDataMetrics,
  refreshRemoteDataStatuses,
  searchOfferConfigurations,
  syncCustomersToSupabase,
  syncInventoryToSupabase,
  syncProductsToSupabase,
  syncPromotionsToSupabase,
  syncStoresToSupabase,
  updateOfferCombinationSetting,
  updateOfferSkuThresholdSetting,
  type OfferConfigurationFilters,
  type OfferConfigurationRow,
  type PromotionSyncMode,
  type RemoteDataMetrics,
} from "../../services/supabase";
import type { Customer, ImportedPromotionRow, InventoryRecord, Product, StoreLocation, ThresholdType } from "../../types/domain";

type ProgressState = {
  title: string;
  detail: string;
  current: number;
  total: number;
};

type ActiveLoad = "promotions" | "offer-settings" | "customers" | "catalog" | "inventory" | "stores";

export function AdminPage() {
  const [activeLoad, setActiveLoad] = useState<ActiveLoad>("promotions");
  const [promotionRows, setPromotionRows] = useState<ImportedPromotionRow[]>([]);
  const [customerRows, setCustomerRows] = useState<Customer[]>([]);
  const [catalogRows, setCatalogRows] = useState<Product[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRecord[]>([]);
  const [storeRows, setStoreRows] = useState<StoreLocation[]>([]);
  const [message, setMessage] = useState<string>();
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [syncMode, setSyncMode] = useState<PromotionSyncMode>("full");
  const [offerConfigFilters, setOfferConfigFilters] = useState<OfferConfigurationFilters>({});
  const [offerConfigRows, setOfferConfigRows] = useState<OfferConfigurationRow[]>([]);
  const [offerConfigLoading, setOfferConfigLoading] = useState(false);
  const [savingConfigKey, setSavingConfigKey] = useState("");
  const [remoteMetrics, setRemoteMetrics] = useState<RemoteDataMetrics>({
    promotions: null,
    customers: null,
    catalog: null,
    inventory: null,
    stores: null,
  });
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0);

  const uniqueOffers = useMemo(() => new Set(promotionRows.map((row) => row.offerId)).size, [promotionRows]);
  const uniquePromotions = useMemo(() => new Set(promotionRows.map((row) => row.promotionId)).size, [promotionRows]);
  const uniqueCustomers = useMemo(() => new Set(customerRows.map((row) => row.customerId)).size, [customerRows]);
  const uniqueCatalogSkus = useMemo(() => new Set(catalogRows.map((row) => row.sku)).size, [catalogRows]);
  const uniqueInventorySkus = useMemo(() => new Set(inventoryRows.map((row) => row.sku)).size, [inventoryRows]);
  const uniqueInventoryStores = useMemo(() => new Set(inventoryRows.map((row) => row.storeId)).size, [inventoryRows]);
  const inventoryUnits = useMemo(() => inventoryRows.reduce((sum, row) => sum + row.quantity, 0), [inventoryRows]);
  const customerSegments = useMemo(() => new Set(customerRows.map((row) => row.segment).filter(Boolean)).size, [customerRows]);
  const uniqueCatalogDepartments = useMemo(() => new Set(catalogRows.map((row) => row.departmentId).filter(Boolean)).size, [catalogRows]);

  useEffect(() => {
    let active = true;
    setMetricsLoading(true);

    loadRemoteDataMetrics().then(async (metrics) => {
      if (!active) return;
      setRemoteMetrics(metrics);
      await refreshRemoteDataStatuses();
      if (active) setMetricsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [metricsRefreshKey]);

  useEffect(() => {
    if (activeLoad !== "offer-settings" || offerConfigRows.length) return;
    loadOfferConfigurationRows();
  }, [activeLoad]);

  async function loadOfferConfigurationRows() {
    setOfferConfigLoading(true);
    const result = await searchOfferConfigurations(offerConfigFilters);
    setOfferConfigLoading(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setOfferConfigRows(result.rows);
    setMessage(result.rows.length ? `${result.rows.length} filas de oferta-SKU encontradas.` : "No se encontraron ofertas con esos filtros.");
  }

  function updateOfferConfigFilter(key: keyof OfferConfigurationFilters, value: string) {
    setOfferConfigFilters((current) => ({ ...current, [key]: value }));
  }

  function patchOfferConfigRow(ruleId: string, patch: Partial<OfferConfigurationRow>) {
    setOfferConfigRows((current) => current.map((row) => (row.ruleId === ruleId ? { ...row, ...patch } : row)));
  }

  async function saveOfferCombination(row: OfferConfigurationRow, allowStacking: boolean) {
    const key = `combine-${row.promotionId}-${row.offerId}`;
    setSavingConfigKey(key);
    const previousRows = offerConfigRows;
    setOfferConfigRows((current) =>
      current.map((item) =>
        item.promotionId === row.promotionId && item.offerId === row.offerId
          ? { ...item, allowStacking }
          : item,
      ),
    );

    const result = await updateOfferCombinationSetting(row, allowStacking);
    setSavingConfigKey("");
    if (!result.ok) {
      setOfferConfigRows(previousRows);
      setMessage(result.message);
      return;
    }

    setMessage(result.message);
  }

  async function saveOfferThreshold(row: OfferConfigurationRow) {
    const key = `threshold-${row.ruleId}`;
    setSavingConfigKey(key);
    const thresholdQuantity = Math.max(1, Number(row.thresholdQuantity) || 1);
    const normalizedRow = {
      ...row,
      thresholdQuantity,
      thresholdType: row.thresholdType,
    };
    const result = await updateOfferSkuThresholdSetting(normalizedRow);
    setSavingConfigKey("");

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    patchOfferConfigRow(row.ruleId, {
      thresholdQuantity: normalizedRow.thresholdQuantity,
      thresholdType: normalizedRow.thresholdType,
    });
    setMessage(result.message);
  }

  async function handlePromotionFile(file?: File) {
    if (!file) return;
    setActiveLoad("promotions");
    setProgress({ title: "Leyendo promociones", detail: file.name, current: 0, total: 1 });
    try {
      const parsedRows = await parsePromotionFile(file);
      setPromotionRows(parsedRows.filter((row) => row.offerId && row.sku));
      updateStoredDataStatus("promotions", parsedRows.length ? "ok" : "error", `${parsedRows.length} filas`);
      setMessage(`Archivo de promociones cargado: ${parsedRows.length} filas detectadas.`);
    } catch (error) {
      updateStoredDataStatus("promotions", "error", "No cargado");
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el archivo.");
    } finally {
      setProgress(null);
    }
  }

  async function handleCustomerFile(file?: File) {
    if (!file) return;
    setActiveLoad("customers");
    setProgress({ title: "Leyendo clientes", detail: file.name, current: 0, total: 1 });
    try {
      const parsedRows = await parseCustomerFile(file);
      setCustomerRows(parsedRows);
      updateStoredDataStatus("customers", parsedRows.length ? "ok" : "error", `${parsedRows.length} clientes`);
      setMessage(`Archivo de clientes cargado: ${parsedRows.length} clientes detectados.`);
    } catch (error) {
      updateStoredDataStatus("customers", "error", "No cargado");
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el archivo de clientes.");
    } finally {
      setProgress(null);
    }
  }

  async function handleCatalogFile(file?: File) {
    if (!file) return;
    setActiveLoad("catalog");
    setProgress({ title: "Leyendo catálogo", detail: file.name, current: 0, total: 1 });
    try {
      const parsedRows = await parseCatalogFile(file);
      setCatalogRows(parsedRows);
      updateStoredDataStatus("catalog", parsedRows.length ? "ok" : "error", `${parsedRows.length} productos`);
      setMessage(`Catalogo cargado: ${parsedRows.length} productos detectados.`);
    } catch (error) {
      updateStoredDataStatus("catalog", "error", "No cargado");
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el catálogo.");
    } finally {
      setProgress(null);
    }
  }

  async function handleInventoryFile(file?: File) {
    if (!file) return;
    setActiveLoad("inventory");
    setProgress({ title: "Leyendo inventario", detail: file.name, current: 0, total: 1 });
    try {
      const parsedRows = await parseInventoryFile(file);
      const storeInventoryRows = parsedRows.filter((row) => row.storeId === inventoryStoreId);
      setInventoryRows(storeInventoryRows);
      updateStoredDataStatus("inventory", storeInventoryRows.length ? "ok" : "error", `${storeInventoryRows.length} registros`);
      setMessage(
        `Inventario cargado: ${storeInventoryRows.length} registros de tienda ${inventoryStoreId} detectados.`,
      );
    } catch (error) {
      updateStoredDataStatus("inventory", "error", "No cargado");
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el inventario.");
    } finally {
      setProgress(null);
    }
  }

  async function handleStoreFile(file?: File) {
    if (!file) return;
    setActiveLoad("stores");
    setProgress({ title: "Leyendo tiendas", detail: file.name, current: 0, total: 1 });
    try {
      const parsedRows = await parseStoreFile(file);
      setStoreRows(parsedRows);
      updateStoredDataStatus("stores", parsedRows.length ? "ok" : "error", `${parsedRows.length} tiendas`);
      setMessage(`Catalogo de tiendas cargado: ${parsedRows.length} tiendas detectadas.`);
    } catch (error) {
      updateStoredDataStatus("stores", "error", "No cargado");
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el catálogo de tiendas.");
    } finally {
      setProgress(null);
    }
  }

  async function syncPromotions() {
    setProgress({ title: "Sincronizando promociones", detail: "Preparando lotes", current: 0, total: promotionRows.length });
    try {
      const result = await syncPromotionsToSupabase(promotionRows, syncMode, (current, total, detail) => {
        setProgress({ title: "Sincronizando promociones", detail: detail ?? `${current} de ${total} filas`, current, total });
      });
      setMessage(result.message);
      if (result.ok) setMetricsRefreshKey((current) => current + 1);
    } finally {
      setProgress(null);
    }
  }

  async function syncCustomers() {
    setProgress({ title: "Sincronizando clientes", detail: "Preparando reemplazo total", current: 0, total: customerRows.length });
    try {
      const result = await syncCustomersToSupabase(customerRows, (current, total, detail) => {
        setProgress({ title: "Sincronizando clientes", detail: detail ?? `${current} de ${total} clientes`, current, total });
      });
      updateStoredDataStatus("customers", result.ok ? "ok" : "error", result.ok ? `${uniqueCustomers} clientes` : "Error");
      setMessage(result.message);
      if (result.ok) setMetricsRefreshKey((current) => current + 1);
    } finally {
      setProgress(null);
    }
  }

  async function syncCatalog() {
    setProgress({ title: "Sincronizando catálogo", detail: "Preparando reemplazo total", current: 0, total: catalogRows.length });
    try {
      const result = await syncProductsToSupabase(catalogRows, (current, total, detail) => {
        setProgress({ title: "Sincronizando catálogo", detail: detail ?? `${current} de ${total} productos`, current, total });
      });
      updateStoredDataStatus("catalog", result.ok ? "ok" : "error", result.ok ? `${uniqueCatalogSkus} productos` : "Error");
      setMessage(result.message);
      if (result.ok) setMetricsRefreshKey((current) => current + 1);
    } finally {
      setProgress(null);
    }
  }

  async function syncInventory() {
    setProgress({ title: "Sincronizando inventario", detail: "Preparando reemplazo total", current: 0, total: inventoryRows.length });
    try {
      const result = await syncInventoryToSupabase(inventoryRows, (current, total, detail) => {
        setProgress({ title: "Sincronizando inventario", detail: detail ?? `${current} de ${total} registros`, current, total });
      });
      updateStoredDataStatus("inventory", result.ok ? "ok" : "error", result.ok ? `${inventoryRows.length} registros` : "Error");
      setMessage(result.message);
      if (result.ok) setMetricsRefreshKey((current) => current + 1);
    } finally {
      setProgress(null);
    }
  }

  async function syncStores() {
    setProgress({ title: "Sincronizando tiendas", detail: "Preparando reemplazo total", current: 0, total: storeRows.length });
    try {
      const result = await syncStoresToSupabase(storeRows, (current, total, detail) => {
        setProgress({ title: "Sincronizando tiendas", detail: detail ?? `${current} de ${total} tiendas`, current, total });
      });
      updateStoredDataStatus("stores", result.ok ? "ok" : "error", result.ok ? `${storeRows.length} tiendas` : "Error");
      setMessage(result.message);
      if (result.ok) setMetricsRefreshKey((current) => current + 1);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <Header title="Administración" subtitle="Carga, revisión y configuración comercial de datos." />

      <div className="metrics">
        <Metric title="Promos" value={metricValue(remoteMetrics.promotions, metricsLoading)} icon={Tags} />
        <Metric title="Clientes" value={metricValue(remoteMetrics.customers, metricsLoading)} icon={UsersRound} />
        <Metric title="Catalogo" value={metricValue(remoteMetrics.catalog, metricsLoading)} icon={PackageSearch} />
        {inventoryFeatureEnabled ? <Metric title="Inventario" value={metricValue(remoteMetrics.inventory, metricsLoading)} icon={Boxes} /> : null}
      </div>

      {message ? <AppFeedback tone={message.includes("completada") ? "success" : "info"} message={message} /> : null}

      <Card className="load-center">
        <CardContent>
          <div className="load-shell">
            <div className="load-process-list" aria-label="Procesos de carga">
              <ProcessButton active={activeLoad === "promotions"} count={promotionRows.length} icon={Tags} label="Promociones" onClick={() => setActiveLoad("promotions")} />
              <ProcessButton active={activeLoad === "offer-settings"} count={offerConfigRows.length} icon={SlidersHorizontal} label="Config. ofertas" onClick={() => setActiveLoad("offer-settings")} />
              <ProcessButton active={activeLoad === "customers"} count={customerRows.length} icon={UsersRound} label="Clientes" onClick={() => setActiveLoad("customers")} />
              <ProcessButton active={activeLoad === "catalog"} count={catalogRows.length} icon={PackageSearch} label="Catalogo" onClick={() => setActiveLoad("catalog")} />
              {inventoryFeatureEnabled ? (
                <>
                  <ProcessButton active={activeLoad === "inventory"} count={inventoryRows.length} icon={Boxes} label="Inventario" onClick={() => setActiveLoad("inventory")} />
                  <ProcessButton active={activeLoad === "stores"} count={storeRows.length} icon={Landmark} label="Tiendas" onClick={() => setActiveLoad("stores")} />
                </>
              ) : null}
            </div>

            <div className="load-workspace">
              {activeLoad === "promotions" ? (
                <PromotionLoadPanel
                  rows={promotionRows}
                  syncMode={syncMode}
                  uniqueOffers={uniqueOffers}
                  uniquePromotions={uniquePromotions}
                  preview={uniqueRowsByPromotion(promotionRows).slice(0, 20)}
                  onFile={handlePromotionFile}
                  onModeChange={setSyncMode}
                  onSync={syncPromotions}
                />
              ) : null}

              {activeLoad === "offer-settings" ? (
                <OfferConfigurationPanel
                  filters={offerConfigFilters}
                  loading={offerConfigLoading}
                  rows={offerConfigRows}
                  savingKey={savingConfigKey}
                  onFilterChange={updateOfferConfigFilter}
                  onSearch={loadOfferConfigurationRows}
                  onStackingChange={saveOfferCombination}
                  onThresholdChange={patchOfferConfigRow}
                  onThresholdSave={saveOfferThreshold}
                />
              ) : null}

              {activeLoad === "customers" ? (
                <CustomerLoadPanel
                  rows={customerRows}
                  uniqueCustomers={uniqueCustomers}
                  uniqueSegments={customerSegments}
                  rowsWithPhone={customerRows.filter((row) => row.mobile).length}
                  preview={customerRows.slice(0, 20)}
                  onFile={handleCustomerFile}
                  onSync={syncCustomers}
                />
              ) : null}

              {activeLoad === "catalog" ? (
                <CatalogLoadPanel
                  rows={catalogRows}
                  uniqueDepartments={uniqueCatalogDepartments}
                  uniqueSkus={uniqueCatalogSkus}
                  preview={catalogRows.slice(0, 20)}
                  onFile={handleCatalogFile}
                  onSync={syncCatalog}
                />
              ) : null}

              {inventoryFeatureEnabled && activeLoad === "inventory" ? (
                <InventoryLoadPanel
                  rows={inventoryRows}
                  uniqueSkus={uniqueInventorySkus}
                  uniqueStores={uniqueInventoryStores}
                  totalUnits={inventoryUnits}
                  preview={inventoryRows.slice(0, 20)}
                  onFile={handleInventoryFile}
                  onSync={syncInventory}
                />
              ) : null}

              {inventoryFeatureEnabled && activeLoad === "stores" ? (
                <StoresLoadPanel rows={storeRows} preview={storeRows.slice(0, 20)} onFile={handleStoreFile} onSync={syncStores} />
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {progress ? <SyncProgressModal progress={progress} /> : null}
    </div>
  );
}

function ProcessButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "load-process active" : "load-process"} onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function PromotionLoadPanel({
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

function OfferConfigurationPanel({
  filters,
  loading,
  rows,
  savingKey,
  onFilterChange,
  onSearch,
  onStackingChange,
  onThresholdChange,
  onThresholdSave,
}: {
  filters: OfferConfigurationFilters;
  loading: boolean;
  rows: OfferConfigurationRow[];
  savingKey: string;
  onFilterChange: (key: keyof OfferConfigurationFilters, value: string) => void;
  onSearch: () => void;
  onStackingChange: (row: OfferConfigurationRow, allowStacking: boolean) => void;
  onThresholdChange: (ruleId: string, patch: Partial<OfferConfigurationRow>) => void;
  onThresholdSave: (row: OfferConfigurationRow) => void;
}) {
  const uniqueOffers = new Set(rows.map((row) => `${row.promotionId}-${row.offerId}`)).size;
  const combinableOffers = new Set(rows.filter((row) => row.allowStacking).map((row) => `${row.promotionId}-${row.offerId}`)).size;

  return (
    <LoadPanel
      title="Configuración de ofertas"
      subtitle="Complete los campos que no vienen en el reporte: combinación y threshold por oferta-SKU."
      actions={
        <>
          <label className="filter-field compact">
            <span>ID promo</span>
            <input value={filters.promotionId ?? ""} onChange={(event) => onFilterChange("promotionId", event.target.value)} placeholder="Ej. 1821" />
          </label>
          <label className="filter-field compact">
            <span>ID oferta</span>
            <input value={filters.offerId ?? ""} onChange={(event) => onFilterChange("offerId", event.target.value)} placeholder="Ej. 62010" />
          </label>
          <label className="filter-field compact">
            <span>SKU</span>
            <input value={filters.sku ?? ""} onChange={(event) => onFilterChange("sku", event.target.value)} placeholder="Código exacto" />
          </label>
          <Button onClick={onSearch} disabled={loading}>
            <Search size={16} />
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </>
      }
      summary={[
        ["Ofertas", uniqueOffers],
        ["Oferta-SKU", rows.length],
        ["Combinables", combinableOffers],
      ]}
    >
      <PreviewFrame title="Columnas pendientes de configurar">
        <table className="settings-table">
          <thead>
            <tr>
              <th>Promo</th>
              <th>Oferta</th>
              <th>SKU</th>
              <th>Tipo oferta</th>
              <th>Segmento</th>
              <th>Combina</th>
              <th>Threshold</th>
              <th>Tipo threshold</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const combineKey = `combine-${row.promotionId}-${row.offerId}`;
              const thresholdKey = `threshold-${row.ruleId}`;
              const minimumThreshold = zeroThresholdAllowed(row.type) ? 0 : 1;
              return (
                <tr key={row.ruleId}>
                  <td>
                    <strong>{row.promotionId}</strong>
                    <span>{row.promotionName}</span>
                    <span>{row.startsAt ?? "Sin inicio"} — {row.endsAt ?? "Sin vencimiento"}</span>
                  </td>
                  <td>{row.offerId}</td>
                  <td>{row.sku}</td>
                  <td><Badge tone="info">{offerTypeLabel(row.type)}</Badge></td>
                  <td title={`Segmento almacenado: ${JSON.stringify(row.segment)}`}>{row.segment.trim() === "-" ? "Todos" : row.segment}</td>
                  <td>
                    <label className="inline-toggle">
                      <input
                        type="checkbox"
                        checked={row.allowStacking}
                        disabled={savingKey === combineKey}
                        onChange={(event) => onStackingChange(row, event.target.checked)}
                      />
                      <span>{row.allowStacking ? "Sí" : "No"}</span>
                    </label>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={minimumThreshold}
                      value={row.thresholdQuantity}
                      onChange={(event) => onThresholdChange(row.ruleId, { thresholdQuantity: Math.max(minimumThreshold, Number(event.target.value) || 0) })}
                    />
                    <small>Reporte: {row.importedQuantity ?? "-"}</small>
                  </td>
                  <td>
                    <select
                      value={zeroThresholdAllowed(row.type) ? "MINIMUM" : row.thresholdType}
                      disabled={zeroThresholdAllowed(row.type)}
                      onChange={(event) => onThresholdChange(row.ruleId, { thresholdType: event.target.value as ThresholdType })}
                    >
                      <option value="EXACT">Exacta</option>
                      <option value="MINIMUM">Mínima</option>
                    </select>
                  </td>
                  <td>{offerValueLabel(row)}</td>
                  <td>
                    <Button
                      variant="outline"
                      onClick={() => onThresholdSave(row)}
                      disabled={savingKey === thresholdKey}
                    >
                      <Save size={16} />
                      {savingKey === thresholdKey ? "Guardando" : "Guardar"}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? <EmptyRow colSpan={10} label={loading ? "Buscando ofertas..." : "Busque por ID de promo u oferta para configurar."} /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

function offerTypeLabel(type: string) {
  const labels: Record<string, string> = {
    LINE_ITEM_DISCOUNT: "Descuento línea",
    TIERED_DISCOUNT: "Escalonada",
    FIXED_QTY_PRICE: "Precio fijo",
    KIT_OFFER: "Kit",
  };
  return labels[type] ?? type;
}

function zeroThresholdAllowed(type: string) {
  return type === "LINE_ITEM_DISCOUNT" || type === "FIXED_QTY_PRICE";
}

function offerValueLabel(row: OfferConfigurationRow) {
  if (row.fixedPrice !== undefined) return `Precio ${row.fixedPrice.toLocaleString("es-NI")}`;
  if (row.discountPercent !== undefined) return `${row.discountPercent}%`;
  return row.discountType || "-";
}

function CustomerLoadPanel({
  rows,
  uniqueCustomers,
  uniqueSegments,
  rowsWithPhone,
  preview,
  onFile,
  onSync,
}: {
  rows: Customer[];
  uniqueCustomers: number;
  uniqueSegments: number;
  rowsWithPhone: number;
  preview: Customer[];
  onFile: (file?: File) => void;
  onSync: () => void;
}) {
  return (
    <LoadPanel
      title="Clientes"
      subtitle="Base usada por búsqueda y segmento base del cotizador."
      actions={<><UploadButton label="Cargar archivo" onFile={onFile} /><Button disabled={!rows.length} onClick={onSync}><Database size={16} />Actualizar clientes</Button></>}
      summary={[
        ["Clientes", uniqueCustomers],
        ["Segmentos", uniqueSegments],
        ["Con telefono", rowsWithPhone],
      ]}
    >
      <PreviewFrame title="Clientes detectados">
        <table>
          <thead>
            <tr><th>ID cliente</th><th>Nombre</th><th>Teléfono</th><th>ID / Cédula</th><th>Segmento</th><th>Dirección</th></tr>
          </thead>
          <tbody>
            {preview.map((customer) => (
              <tr key={customer.customerId}>
                <td>{customer.customerId}</td><td>{customer.displayName}</td><td>{customer.mobile ?? "-"}</td>
                <td>{customer.nationalId ?? "-"}</td><td>{customer.segment || "-"}</td><td>{customer.address ?? "-"}</td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={6} label="No hay clientes cargados." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

function CatalogLoadPanel({
  rows,
  uniqueDepartments,
  uniqueSkus,
  preview,
  onFile,
  onSync,
}: {
  rows: Product[];
  uniqueDepartments: number;
  uniqueSkus: number;
  preview: Product[];
  onFile: (file?: File) => void;
  onSync: () => void;
}) {
  return (
    <LoadPanel
      title="Catalogo"
      subtitle="Maestro de SKU, descripcion, departamento, unidad, precio y numero de parte."
      actions={<><UploadButton label="Cargar catálogo" onFile={onFile} /><Button disabled={!rows.length} onClick={onSync}><PackageSearch size={16} />Actualizar catálogo</Button></>}
      summary={[
        ["SKU", uniqueSkus],
        ["Con precio", rows.filter((row) => row.listPrice > 0).length],
        ["Departamentos", uniqueDepartments],
      ]}
    >
      <PreviewFrame title="Productos detectados">
        <table>
          <thead>
            <tr><th>SKU</th><th>Descripción</th><th>Depto.</th><th>U/M</th><th>Precio lista</th><th>Número parte</th></tr>
          </thead>
          <tbody>
            {preview.map((product) => (
              <tr key={product.sku}>
                <td>{product.sku}</td><td>{product.description}</td><td>{product.departmentId ?? "-"}</td><td>{product.unitOfMeasure ?? "-"}</td>
                <td>{product.listPrice.toLocaleString("es-NI")}</td><td>{product.partNumber ?? "-"}</td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={6} label="No hay catálogo cargado." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

function InventoryLoadPanel({
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
      subtitle="Existencias de tienda 1041 por SKU. Cada carga reemplaza la base completa."
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

function StoresLoadPanel({
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
      subtitle="Catalogo de tiendas usado como soporte interno del inventario."
      actions={<><UploadButton label="Cargar tiendas" onFile={onFile} /><Button disabled={!rows.length} onClick={onSync}><Landmark size={16} />Actualizar tiendas</Button></>}
      summary={[
        ["Tiendas", rows.length],
        ["Con nombre", rows.filter((row) => row.name).length],
        ["Fuente", rows.length ? "Lista" : "Pendiente"],
      ]}
    >
      <PreviewFrame title="Tiendas detectadas">
        <table>
          <thead>
            <tr><th>ID</th><th>Nombre tienda</th></tr>
          </thead>
          <tbody>
            {preview.map((store) => (
              <tr key={store.id}><td>{store.id}</td><td>{store.name}</td></tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={2} label="No hay tiendas cargadas." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </LoadPanel>
  );
}

function LoadPanel({
  actions,
  children,
  subtitle,
  summary,
  title,
}: {
  actions: ReactNode;
  children: ReactNode;
  subtitle: string;
  summary: Array<[string, string | number]>;
  title: string;
}) {
  return (
    <div className="load-panel">
      <div className="load-panel-head">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
        <div className="toolbar-actions">{actions}</div>
      </div>
      <div className="load-summary-grid">
        {summary.map(([label, value]) => <SummaryTile key={label} label={label} value={String(value)} />)}
      </div>
      {children}
    </div>
  );
}

function UploadButton({ label, onFile }: { label: string; onFile: (file?: File) => void }) {
  return (
    <label className="btn btn-outline file-btn">
      <Upload size={16} />
      {label}
      <input type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreviewFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="preview-frame">
      <div className="preview-head"><h3>{title}</h3></div>
      <div className="table-wrap">{children}</div>
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return <tr><td colSpan={colSpan}>{label}</td></tr>;
}

function uniqueRowsByPromotion(rows: ImportedPromotionRow[]) {
  const grouped = new Map<string, ImportedPromotionRow>();
  rows.forEach((row) => {
    if (row.promotionId && !grouped.has(row.promotionId)) grouped.set(row.promotionId, row);
  });
  return [...grouped.values()];
}

function metricValue(value: number | null, loading: boolean) {
  if (loading && value === null) return "...";
  if (value === null) return "N/D";
  return value.toLocaleString("es-NI");
}

function todayIso() {
  const now = new Date();
  const localTime = now.getTime() - now.getTimezoneOffset() * 60000;
  return new Date(localTime).toISOString().slice(0, 10);
}

function SyncProgressModal({ progress }: { progress: ProgressState }) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="modal-backdrop" role="status" aria-live="polite">
      <div className="sync-modal">
        <div className="sync-led" />
        <div>
          <h2>{progress.title}</h2>
          <p>{progress.detail}</p>
        </div>
        <div className="sync-bar">
          <span style={{ width: `${percent}%` }} />
        </div>
        <strong>{percent}%</strong>
      </div>
    </div>
  );
}
