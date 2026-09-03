import { ChevronDown, PackagePlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Badge } from "../../components/ui";
import { productImageUrl, searchProducts } from "../../services/catalog";
import {
  availableOfferGroups,
  estimateLineTotal,
  estimateOfferGroupUnitPrice,
  sampleOfferRules,
  sortOfferGroupsByUnitPrice,
} from "../../services/promotions";
import type { AvailableOfferGroup } from "../../services/promotions";
import { formatCurrency } from "../../services/quote";
import { loadInventoryForSkus, loadOfferRulesForSkus, searchProductsFromSupabase } from "../../services/supabase";
import type { Product, ProductInventory, QuoteItem, OfferRule, StoreLocation } from "../../types/domain";
import { ProductImage } from "./ProductImage";

type Props = {
  catalog: Product[];
  segment: string;
  inventoryEnabled: boolean;
  stores: StoreLocation[];
  selectedStoreIds: string[];
  requireStock: boolean;
  onStoreSelectionChange: (storeIds: string[]) => void;
  onRequireStockChange: (required: boolean) => void;
  onCatalogProductsFound: (products: Product[]) => void;
  onClose: () => void;
  onAddItems: (items: QuoteItem[]) => void;
};

export function SkuSearchModal({
  catalog,
  segment,
  inventoryEnabled,
  stores,
  selectedStoreIds,
  requireStock,
  onStoreSelectionChange,
  onRequireStockChange,
  onCatalogProductsFound,
  onClose,
  onAddItems,
}: Props) {
  const [term, setTerm] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedOfferKey, setSelectedOfferKey] = useState("");
  const [addedMessage, setAddedMessage] = useState("");
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const [offerRules, setOfferRules] = useState<OfferRule[]>(sampleOfferRules);
  const [inventory, setInventory] = useState<Map<string, ProductInventory>>(new Map());
  const [remoteResults, setRemoteResults] = useState<Product[] | null>(null);
  const localResults = useMemo(() => searchProducts(catalog, term).slice(0, 60), [catalog, term]);
  const candidateResults = remoteResults ?? localResults;
  const results = useMemo(
    () => candidateResults
      .filter((product) => !inventoryEnabled || !requireStock || (inventory.get(product.sku)?.totalQuantity ?? 0) > 0)
      .slice(0, 12),
    [candidateResults, inventory, inventoryEnabled, requireStock],
  );
  const [selectedSku, setSelectedSku] = useState(results[0]?.sku ?? "");
  const selected = results.find((product) => product.sku === selectedSku) ?? results[0];
  const offerGroups = useMemo(
    () => (selected ? sortOfferGroupsByUnitPrice(availableOfferGroups(offerRules, selected.sku, segment), selected.listPrice) : []),
    [offerRules, selected, segment],
  );
  const selectedOffer = offerGroups.find((group) => group.key === selectedOfferKey) ?? offerGroups[0];

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      searchProductsFromSupabase(term, 60).then((products) => {
        if (!active) return;
        setRemoteResults(products?.length ? products : null);
        if (products?.length) onCatalogProductsFound(products);
      });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [onCatalogProductsFound, term]);

  useEffect(() => {
    if (!inventoryEnabled) {
      setInventory(new Map());
      return;
    }

    let active = true;
    loadInventoryForSkus(candidateResults.map((product) => product.sku), selectedStoreIds).then((loadedInventory) => {
      if (active) setInventory(loadedInventory);
    });
    return () => {
      active = false;
    };
  }, [candidateResults, inventoryEnabled, selectedStoreIds]);

  useEffect(() => {
    if (!results.length) {
      setSelectedSku("");
      return;
    }
    if (!results.some((product) => product.sku === selectedSku)) {
      setSelectedSku(results[0].sku);
    }
  }, [results, selectedSku]);

  useEffect(() => {
    if (!selected?.sku) return;
    let active = true;

    loadOfferRulesForSkus([selected.sku], [segment]).then((loadedRules) => {
      if (!active || loadedRules === null) return;
      setOfferRules(loadedRules);
    });

    return () => {
      active = false;
    };
  }, [selected?.sku, segment]);

  function selectSku(sku: string) {
    setSelectedSku(sku);
    setSelectedOfferKey("");
    setAddedMessage("");
  }

  function addSelected(product?: Product, offer?: AvailableOfferGroup) {
    if (!product) return;
    const items = offer?.isKit
      ? offer.rules.map((rule) => ({ sku: rule.sku, quantity: Math.max(quantity, rule.minQuantity ?? 1) }))
      : [{ sku: product.sku, quantity }];

    onAddItems(items);
    setAddedMessage(offer?.isKit ? `Kit agregado: ${items.length} SKU` : `SKU agregado: ${product.sku}`);
  }

  function toggleStore(storeId: string) {
    onStoreSelectionChange(
      selectedStoreIds.includes(storeId)
        ? selectedStoreIds.filter((id) => id !== storeId)
        : [...selectedStoreIds, storeId],
    );
  }

  function storeFilterLabel() {
    if (!selectedStoreIds.length) return "Todas las tiendas";
    const names = selectedStoreIds
      .map((id) => stores.find((store) => store.id === id)?.name ?? `Tienda ${id}`)
      .slice(0, 2);
    const suffix = selectedStoreIds.length > 2 ? ` +${selectedStoreIds.length - 2}` : "";
    return `${names.join(", ")}${suffix}`;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="sku-modal">
        <header className="modal-head">
          <div>
            <h2>Agregar SKU</h2>
            <span>Busqueda por codigo, descripcion o numero de parte.</span>
          </div>
          <button className="icon-btn" title="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="sku-modal-body">
          <div className="sku-search-panel">
            {inventoryEnabled ? (
            <div className="inventory-filter-panel">
              <div className="filter-mode-row" role="group" aria-label="Filtro de inventario">
                <button className={requireStock ? "active" : ""} type="button" onClick={() => onRequireStockChange(true)}>
                  Con inventario
                </button>
                <button className={!requireStock ? "active" : ""} type="button" onClick={() => onRequireStockChange(false)}>
                  Todo catalogo
                </button>
              </div>
              {requireStock ? (
                <div className="store-multiselect">
                  <button
                    className="store-multiselect-trigger"
                    type="button"
                    onClick={() => setStoreDropdownOpen((open) => !open)}
                    aria-expanded={storeDropdownOpen}
                  >
                    <span>{storeFilterLabel()}</span>
                    <ChevronDown size={16} />
                  </button>
                  {storeDropdownOpen ? (
                    <div className="store-filter-menu">
                      {stores.map((store) => (
                        <label key={store.id}>
                          <input
                            type="checkbox"
                            checked={selectedStoreIds.includes(store.id)}
                            onChange={() => toggleStore(store.id)}
                          />
                          <span>{store.name}</span>
                          <em>{store.id}</em>
                        </label>
                      ))}
                      {!stores.length ? <p className="empty-copy">No hay tiendas cargadas.</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            ) : null}

            <div className="sku-search-row">
              <label className="search-field">
                <Search size={16} />
                <input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar SKU" />
              </label>
              <label className="qty-field">
                <span>Cant.</span>
                <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
              </label>
            </div>

            <div className="sku-results">
              {results.map((product) => (
                <button
                  className={product.sku === selected?.sku ? "selected" : ""}
                  key={product.sku}
                  onClick={() => selectSku(product.sku)}
                >
                  <ProductImage src={productImageUrl(product.sku)} alt={product.description} />
                  <span>
                    <strong>{product.sku}</strong>
                    <small>{product.description}</small>
                    {inventoryEnabled ? <em>{stockLabel(inventory.get(product.sku))}</em> : null}
                    <em>{product.partNumber ?? "Sin numero de parte"}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <aside className="sku-offers-panel">
            {selected ? (
              <>
                <div className="selected-product">
                  <strong>{selected.sku}</strong>
                  <span>{selected.description}</span>
                  <p>{formatCurrency(selected.listPrice)}</p>
                  {inventoryEnabled ? <InventoryBreakdown inventory={inventory.get(selected.sku)} /> : null}
                </div>

                <div className="offer-list">
                  {offerGroups.map((offerGroup) => {
                    const applies = offerGroup.rules.every((offer) => !offer.minQuantity || quantity >= offer.minQuantity);
                    return (
                      <button
                        className={offerGroup.key === selectedOffer?.key ? "offer-row selected" : "offer-row"}
                        key={offerGroup.key}
                        type="button"
                        onClick={() => setSelectedOfferKey(offerGroup.key)}
                      >
                        <div>
                          <strong>{offerGroup.primary.id}</strong>
                          <span>{offerGroup.primary.promotionName}</span>
                        </div>
                        <Badge tone={offerGroup.primary.segment.trim() === "-" ? "info" : applies ? "success" : "warning"}>
                          {offerGroup.isKit ? `Kit ${offerGroup.skuCount} SKU` : offerGroup.primary.segment.trim() === "-" ? "General" : offerGroup.primary.segment}
                        </Badge>
                        <small>{thresholdLabel(offerGroup.rules)}</small>
                        {offerGroup.isKit ? (
                          <div className="kit-items">
                            {offerGroup.rules.map((offer) => (
                              <KitItemRow catalog={catalog} key={`${offer.id}-${offer.sku}`} offer={offer} quantity={quantity} />
                            ))}
                          </div>
                        ) : (
                          <p>{formatCurrency(estimateOfferGroupUnitPrice(selected.listPrice, offerGroup))}</p>
                        )}
                      </button>
                    );
                  })}
                  {!offerGroups.length ? <p className="empty-copy">No hay ofertas para este SKU y segmento.</p> : null}
                </div>

                {addedMessage ? <p className="added-message">{addedMessage}</p> : null}

                <Button onClick={() => addSelected(selected, selectedOffer)}>
                  <PackagePlus size={16} />
                  {selectedOffer?.isKit ? "Agregar kit" : "Agregar SKU"}
                </Button>
              </>
            ) : (
              <p className="empty-copy">No hay resultados con esa busqueda.</p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

function KitItemRow({ catalog, offer, quantity }: { catalog: Product[]; offer: OfferRule; quantity: number }) {
  const product = catalog.find((item) => item.sku === offer.sku);
  const rowQuantity = Math.max(quantity, offer.minQuantity ?? 1);
  const finalTotal = product ? estimateLineTotal(product.listPrice, rowQuantity, offer) : 0;

  return (
    <span className="kit-item">
      <strong>{offer.sku}</strong>
      <small>{product?.description ?? "Producto pendiente del maestro"}</small>
      <em>{benefitLabel(offer)} - {formatCurrency(finalTotal)}</em>
    </span>
  );
}

function InventoryBreakdown({ inventory }: { inventory?: ProductInventory }) {
  if (!inventory || inventory.totalQuantity <= 0) return <small className="stock-detail empty">Sin inventario en filtro actual</small>;

  return (
    <div className="stock-breakdown">
      {inventory.stores.slice(0, 5).map((store) => (
        <span key={store.storeId}>{store.storeName}: {store.quantity.toLocaleString("es-NI")}</span>
      ))}
    </div>
  );
}

function stockLabel(inventory?: ProductInventory) {
  if (!inventory || inventory.totalQuantity <= 0) return "Sin inventario";
  return `Inventario ${inventory.totalQuantity.toLocaleString("es-NI")}`;
}

function thresholdLabel(offers: OfferRule[]) {
  const minQuantity = Math.max(...offers.map((offer) => offer.minQuantity ?? 0));
  return minQuantity > 0 ? `Desde ${minQuantity} unidades` : "Sin minimo";
}

function benefitLabel(offer: OfferRule) {
  if (offer.fixedPrice) return `Precio ${formatCurrency(offer.fixedPrice)}`;
  if (offer.discountPercent) return `${offer.discountPercent}% descuento`;
  return offer.discountType ?? "Beneficio configurado";
}
