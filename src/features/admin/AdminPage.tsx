import { Boxes, Landmark, PackageSearch, ShieldCheck, SlidersHorizontal, Tags, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Card, CardContent, Header, Metric } from "../../components/ui";
import { inventoryFeatureEnabled, inventoryStoreId } from "../../config/features";
import { customerImportMessage } from "../../services/customerSegments.mjs";
import { updateStoredDataStatus } from "../../services/dataStatus";
import {
  parseCatalogFile,
  parseCustomerImport,
  parseInventoryFile,
  parsePromotionFile,
  parseStoreFile,
} from "../../services/importers";
import {
  loadOfferConfigurationMetrics,
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
  type OfferConfigurationMetrics,
  type OfferConfigurationRow,
  type PromotionSyncMode,
  type RemoteDataMetrics,
} from "../../services/supabase";
import { canManageCustomers, canManageUsers } from "../../constants/permissions";
import type { AdminManagedUser, AppRole, Customer, ImportedPromotionRow, InventoryRecord, Product, StoreLocation } from "../../types/domain";
import { UserManagementPanel, listAdminUsers } from "./UserManagementPanel";
import {
  ProcessButton,
  SyncProgressModal,
  metricValue,
  uniqueRowsByPromotion,
  type ProgressState,
} from "./components/AdminLoadPrimitives";
import {
  CatalogLoadPanel,
  CustomerLoadPanel,
  InventoryLoadPanel,
  PromotionLoadPanel,
  StoresLoadPanel,
} from "./components/DataLoadPanels";
import { OfferConfigurationPanel, zeroThresholdAllowed } from "./components/OfferConfigurationPanel";

type ActiveLoad = "promotions" | "offer-settings" | "customers" | "catalog" | "inventory" | "stores" | "users";

export function AdminPage({ role }: { role?: AppRole }) {
  // El rol "oper" carga y actualiza datos, pero no ve clientes ni usuarios.
  const showCustomers = canManageCustomers(role);
  const showUsers = canManageUsers(role);
  const [activeLoadState, setActiveLoad] = useState<ActiveLoad>("promotions");
  const activeLoad: ActiveLoad =
    (activeLoadState === "customers" && !showCustomers) || (activeLoadState === "users" && !showUsers)
      ? "promotions"
      : activeLoadState;
  const [promotionRows, setPromotionRows] = useState<ImportedPromotionRow[]>([]);
  const [customerRows, setCustomerRows] = useState<Customer[]>([]);
  const [catalogRows, setCatalogRows] = useState<Product[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRecord[]>([]);
  const [storeRows, setStoreRows] = useState<StoreLocation[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersWarning, setUsersWarning] = useState<string>();
  const [usersRefreshKey, setUsersRefreshKey] = useState(0);
  const [message, setMessage] = useState<string>();
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [syncMode, setSyncMode] = useState<PromotionSyncMode>("full");
  const [offerConfigFilters, setOfferConfigFilters] = useState<OfferConfigurationFilters>({ limit: 100 });
  const [offerConfigRows, setOfferConfigRows] = useState<OfferConfigurationRow[]>([]);
  const [offerConfigLoading, setOfferConfigLoading] = useState(false);
  const [offerMetrics, setOfferMetrics] = useState<OfferConfigurationMetrics | null>(null);
  const [offerMetricsLoading, setOfferMetricsLoading] = useState(false);
  const [offerMetricsError, setOfferMetricsError] = useState("");
  const [offerMetricsRefreshKey, setOfferMetricsRefreshKey] = useState(0);
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
  const uniqueCatalogSuppliers = useMemo(() => new Set(catalogRows.map((row) => row.supplierId || row.supplierName || row.supplier || row.supName).filter(Boolean)).size, [catalogRows]);

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
    if (activeLoad !== "offer-settings") return;
    let active = true;
    const controller = new AbortController();
    setOfferMetricsLoading(true);
    setOfferMetricsError("");
    loadOfferConfigurationMetrics(controller.signal)
      .then(metrics => { if (active) setOfferMetrics(metrics); })
      .catch(error => { if (active) setOfferMetricsError(error instanceof Error ? error.message : "No se pudieron actualizar los totales de ofertas."); })
      .finally(() => {
        if (active) setOfferMetricsLoading(false);
      });
    return () => { active = false; controller.abort(); };
  }, [activeLoad, offerMetricsRefreshKey]);

  useEffect(() => {
    if (!showUsers) return;
    let active = true;
    setUsersLoading(true);
    listAdminUsers()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setAdminUsers(result.users);
          setUsersWarning(result.warning);
        } else {
          setUsersWarning(result.message);
        }
      })
      .finally(() => {
        if (active) setUsersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showUsers, usersRefreshKey]);

  function refreshSavedOfferConfiguration() {
    setOfferMetricsRefreshKey(key => key + 1);
    setMetricsRefreshKey(key => key + 1);
    if (offerConfigRows.length) void loadOfferConfigurationRows();
  }

  async function loadOfferConfigurationRows() {
    setOfferConfigLoading(true);
    try {
      const result = await searchOfferConfigurations(offerConfigFilters);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setOfferConfigRows(result.rows);
      const isLimited = Boolean(offerConfigFilters.limit && result.rows.length >= offerConfigFilters.limit);
      setMessage(
        result.rows.length
          ? `${result.rows.length} filas de oferta-SKU encontradas${isLimited ? ` (límite de ${offerConfigFilters.limit})` : ""}.`
          : "No se encontraron ofertas con esos filtros."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar las configuraciones de ofertas.");
    } finally {
      setOfferConfigLoading(false);
    }
  }

  function updateOfferConfigFilter(key: keyof OfferConfigurationFilters, value: any) {
    setOfferConfigFilters((current) => ({ ...current, [key]: value }));
  }

  function clearOfferConfigFilters() {
    setOfferConfigFilters({ promotionId: "", offerId: "", sku: "", limit: 100 });
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
    setOfferMetricsRefreshKey(key => key + 1);
    setMetricsRefreshKey(key => key + 1);
  }

  async function saveOfferThreshold(row: OfferConfigurationRow) {
    const key = `threshold-${row.ruleId}`;
    setSavingConfigKey(key);
    const thresholdQuantity = Math.max(row.globalDetails ? 1 : zeroThresholdAllowed(row.type) ? 0 : 1, Number(row.thresholdQuantity) || 0);
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
    if (row.globalDetails) await loadOfferConfigurationRows();
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
    if (!file || !showCustomers) return;
    setActiveLoad("customers");
    setProgress({ title: "Leyendo clientes", detail: file.name, current: 0, total: 1 });
    try {
      const { accepted: parsedRows, excluded } = await parseCustomerImport(file);
      setCustomerRows(parsedRows);
      updateStoredDataStatus("customers", parsedRows.length ? "ok" : "error", `${parsedRows.length} clientes`);
      setMessage(customerImportMessage(parsedRows.length, excluded));
    } catch (error) {
      setCustomerRows([]);
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
    if (!showCustomers) return;
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
        {showCustomers ? <Metric title="Clientes" value={metricValue(remoteMetrics.customers, metricsLoading)} icon={UsersRound} /> : null}
        <Metric title="Catalogo" value={metricValue(remoteMetrics.catalog, metricsLoading)} icon={PackageSearch} />
        {inventoryFeatureEnabled ? <Metric title="Inventario" value={metricValue(remoteMetrics.inventory, metricsLoading)} icon={Boxes} /> : null}
      </div>

      {message ? <AppFeedback tone={message.includes("completada") ? "success" : "info"} message={message} /> : null}

      <Card className="load-center">
        <CardContent>
          <div className="load-shell">
            <div className="load-process-list" aria-label="Procesos de carga">
              <ProcessButton active={activeLoad === "promotions"} count={promotionRows.length} icon={Tags} label="Promociones" onClick={() => setActiveLoad("promotions")} />
              <ProcessButton active={activeLoad === "offer-settings"} count={offerConfigRows.length} icon={SlidersHorizontal} label="Config. ofertas" onClick={() => { setActiveLoad("offer-settings"); setOfferMetricsRefreshKey(key => key + 1); }} />
              {showCustomers ? <ProcessButton active={activeLoad === "customers"} count={customerRows.length} icon={UsersRound} label="Clientes" onClick={() => setActiveLoad("customers")} /> : null}
              <ProcessButton active={activeLoad === "catalog"} count={catalogRows.length} icon={PackageSearch} label="Catalogo" onClick={() => setActiveLoad("catalog")} />
              {showUsers ? <ProcessButton active={activeLoad === "users"} count={adminUsers.length} icon={ShieldCheck} label="Usuarios" onClick={() => { setActiveLoad("users"); setUsersRefreshKey((key) => key + 1); }} /> : null}
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
                  metrics={offerMetrics}
                  metricsLoading={offerMetricsLoading}
                  metricsError={offerMetricsError}
                  rows={offerConfigRows}
                  savingKey={savingConfigKey}
                  onFilterChange={updateOfferConfigFilter}
                  onSearch={loadOfferConfigurationRows}
                  onClear={clearOfferConfigFilters}
                  onSaved={refreshSavedOfferConfiguration}
                  onStackingChange={saveOfferCombination}
                  onThresholdChange={patchOfferConfigRow}
                  onThresholdSave={saveOfferThreshold}
                />
              ) : null}

              {showCustomers && activeLoad === "customers" ? (
                <CustomerLoadPanel
                  rows={customerRows}
                  uniqueCustomers={uniqueCustomers}
                  uniqueSegments={customerSegments}
                  rowsWithPhone={customerRows.filter((row) => row.mobile).length}
                  rowsWithEmail={customerRows.filter((row) => row.email).length}
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
                  uniqueSuppliers={uniqueCatalogSuppliers}
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
                <StoresLoadPanel rows={storeRows} preview={storeRows.slice(0, 20)} onFile={handleStoreFile} onSync={syncStores} />) : null}
              {showUsers && activeLoad === "users" ? (<UserManagementPanel users={adminUsers} loadingUsers={usersLoading} usersWarning={usersWarning} onRefreshUsers={() => setUsersRefreshKey((key) => key + 1)} onNotify={(msg) => setMessage(msg)} />
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {progress ? <SyncProgressModal progress={progress} /> : null}
    </div>
  );
}
