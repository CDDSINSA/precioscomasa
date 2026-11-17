import { Layers3, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { inventoryStoreId } from "../../config/features";
import { restrictProductsForRole } from "../../constants/suppliers";
import { productImageUrl, searchProducts } from "../../services/catalog";
import { dealSkus } from "../../services/dealConfig";
import {
  availableOfferGroups,
  isUniversalSegment,
  ruleMatchesQuantity,
  sampleOfferRules,
  type AvailableOfferGroup,
} from "../../services/promotions";
import { buildQuote, formatCurrency } from "../../services/quote";
import { loadInventoryForSkus, loadOfferRulesForSkus, loadProductDepartments, loadProductsBySkus, searchProductPageFromSupabase } from "../../services/supabase";
import type { AppRole, Customer, OfferRule, Product, ProductDepartment, ProductInventory, QuoteItem } from "../../types/domain";
import { ProductImage } from "./ProductImage";
import { SkuOfferPreviewPanel } from "./components/SkuOfferPreviewPanel";
import {
  buildDivisionOptions,
  compareOfferGroups,
  filterProductsByDivision,
  kitMissingCompanionSkus,
  mergeInventoryBySku,
  mergeProductsBySku,
  normSku,
  productsKey,
  skuEmptyMessage,
  sortProductsByInventory,
  sortProductPagesByInventory,
  stockLabel,
} from "./components/skuSearchHelpers";

const productSearchPageSize = 36;
const visibleResultStep = 12;

type Props = {
  catalog: Product[];
  customer?: Customer | null;
  segment: string;
  role?: AppRole;
  currentItems?: QuoteItem[];
  inventoryEnabled: boolean;
  onCatalogProductsFound: (products: Product[]) => void;
  onClose: () => void;
  onRequestSelectCustomer?: () => void;
  onAddItems: (items: QuoteItem[]) => void;
};

export function SkuSearchModal({
  catalog,
  customer,
  segment,
  role,
  currentItems = [],
  inventoryEnabled,
  onCatalogProductsFound,
  onClose,
  onRequestSelectCustomer,
  onAddItems,
}: Props) {
  const [term, setTerm] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [addedMessage, setAddedMessage] = useState("");
  const [offerRules, setOfferRules] = useState<OfferRule[]>([]);
  const hasCustomer = Boolean(customer?.customerId || (customer?.displayName && segment) || (segment && !isUniversalSegment(segment)));
  const [inventory, setInventory] = useState<Map<string, ProductInventory>>(new Map());
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryLoadedKey, setInventoryLoadedKey] = useState("");
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [remoteResults, setRemoteResults] = useState<Product[] | null>(null);
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [remoteOffset, setRemoteOffset] = useState(0);
  const [visibleCount, setVisibleCount] = useState(visibleResultStep);
  const [departments, setDepartments] = useState<ProductDepartment[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const searchController = useRef<AbortController | null>(null);
  const loadingMore = useRef(false);
  const [searchError, setSearchError] = useState("");
  const divisionOptions = useMemo(() => buildDivisionOptions(departments), [departments]);
  const selectedDepartmentIds = useMemo(
    () => new Set(departments.filter((department) => department.divisionId === selectedDivisionId).map((department) => department.departmentId)),
    [departments, selectedDivisionId],
  );
  const localResults = useMemo(
    () => filterProductsByDivision(searchProducts(catalog, term), selectedDepartmentIds, selectedDivisionId).slice(0, 60),
    [catalog, selectedDepartmentIds, selectedDivisionId, term],
  );
  const rawCandidateResults = remoteResults ?? localResults;
  const candidateResults = useMemo(
    () => restrictProductsForRole(rawCandidateResults, role),
    [role, rawCandidateResults],
  );
  const candidateResultsKey = useMemo(() => candidateResults.map((product) => product.sku).join("|"), [candidateResults]);
  const inventoryReady = !inventoryEnabled || !candidateResults.length || inventoryLoadedKey === candidateResultsKey;
  const results = useMemo(
    // Reordenar todo al agregar una página
    // mueve los SKU anteriores; ocultarlos mientras llega inventario pierde el scroll.
    () => remoteResults !== null
      ? sortProductPagesByInventory(candidateResults, inventoryEnabled ? inventory : new Map(), productSearchPageSize)
      : sortProductsByInventory(candidateResults, inventoryEnabled ? inventory : new Map()),
    [candidateResults, inventory, inventoryEnabled, remoteResults],
  );
  const visibleResults = results.slice(0, visibleCount);
  const hasLoadedHiddenResults = visibleCount < results.length;
  const canShowMoreResults = hasLoadedHiddenResults || Boolean(remoteResults && remoteHasMore);
  const [selectedSku, setSelectedSku] = useState(results[0]?.sku ?? "");
  const selected = results.find((product) => product.sku === selectedSku) ?? results[0];
  const offerGroups = useMemo(
    () => {
      if (!hasCustomer || !selected) return [];
      const baseGroups = availableOfferGroups(offerRules, selected.sku, segment);
      return [...baseGroups].sort((left, right) =>
        compareOfferGroups(left, right, selected, quantity, currentItems, catalog)
      );
    },
    [catalog, currentItems, hasCustomer, offerRules, quantity, selected, segment],
  );

  const kitPreview = useMemo(() => {
    if (!selected || !offerGroups.some(group => group.primary.deal?.kind === "KIT")) return undefined;
    return buildQuote([...currentItems, { sku: selected.sku, quantity }], segment, offerRules, catalog);
  }, [catalog, currentItems, offerGroups, offerRules, quantity, segment, selected]);

  const applicableOfferGroups = useMemo(
    () =>
      offerGroups.filter((group) => {
        if (group.primary.deal?.kind === "KIT") return false;
        const matchesQty = group.rules.every((offer) => ruleMatchesQuantity(offer, quantity));
        if (!matchesQty) return false;
        if (group.isKit && selected?.sku) {
          const missing = kitMissingCompanionSkus(group, selected.sku, currentItems);
          if (missing.length > 0) return false;
        }
        return true;
      }),
    [currentItems, offerGroups, quantity, selected?.sku],
  );

  const selectedOffer = useMemo(
    () => (hasCustomer && applicableOfferGroups.length > 0 ? applicableOfferGroups[0] : undefined),
    [applicableOfferGroups, hasCustomer],
  );

  useEffect(() => {
    let active = true;
    setDepartmentsLoading(true);

    loadProductDepartments().then((loadedDepartments) => {
      if (active) setDepartments(loadedDepartments);
    }).finally(() => {
      if (active) setDepartmentsLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    searchController.current = controller;
    loadingMore.current = false;
    const query = term.trim();
    setSearchError("");
    setRemoteResults(null);
    setVisibleCount(visibleResultStep);
    setRemoteHasMore(false);
    setRemoteOffset(0);

    if (query.length === 1) {
      setRemoteResults(null);
      setRemoteLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    setRemoteLoading(true);
    const timer = window.setTimeout(() => {
      searchProductPageFromSupabase(query, {
        divisionId: selectedDivisionId || undefined,
        limit: productSearchPageSize,
        prioritizeInventory: inventoryEnabled,
        storeId: inventoryStoreId,
        role,
        signal: controller.signal,
      }).then((page) => {
        if (!active) return;
        setRemoteResults(page ? page.products : null);
        setRemoteHasMore(Boolean(page?.hasMore));
        setRemoteOffset(productSearchPageSize);
        if (page?.products.length) {
          if (page.inventory) {
            setInventory((current) => mergeInventoryBySku(current, page.inventory!));
            setInventoryLoadedKey(productsKey(page.products));
          }
          onCatalogProductsFound(page.products);
        }
      }).catch(() => {
        if (active) {
          setRemoteResults(null);
          setRemoteHasMore(false);
        }
      }).finally(() => {
        if (active) setRemoteLoading(false);
      });
    }, 180);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [inventoryEnabled, onCatalogProductsFound, role, selectedDivisionId, term]);

  function loadMoreResults() {
    if (hasLoadedHiddenResults) {
      setVisibleCount((current) => current + visibleResultStep);
      return;
    }

    if (!remoteResults || !remoteHasMore || remoteLoading || loadingMore.current) return;

    const controller = searchController.current;
    if (!controller || controller.signal.aborted) return;
    loadingMore.current = true;
    setSearchError("");
    setRemoteLoading(true);
    searchProductPageFromSupabase(term, {
      divisionId: selectedDivisionId || undefined,
      limit: productSearchPageSize,
      offset: remoteOffset,
      prioritizeInventory: inventoryEnabled,
      storeId: inventoryStoreId,
      role,
      signal: controller.signal,
    }).then((page) => {
      if (controller.signal.aborted || searchController.current !== controller) return;
      if (!page) {
        setSearchError("No se pudieron cargar más resultados. Intente de nuevo.");
        return;
      }
      if (!page.products.length) {
        setRemoteHasMore(false);
        return;
      }

      const mergedProducts = mergeProductsBySku(remoteResults, page.products);
      setRemoteResults(mergedProducts);
      setRemoteHasMore(page.hasMore);
      setRemoteOffset((current) => current + productSearchPageSize);
      setVisibleCount((current) => current + visibleResultStep);
      if (page.inventory) {
        setInventory((current) => mergeInventoryBySku(current, page.inventory!));
        setInventoryLoadedKey(productsKey(mergedProducts));
      }
      onCatalogProductsFound(page.products);
    }).catch(() => {
      if (!controller.signal.aborted && searchController.current === controller) {
        setSearchError("No se pudieron cargar más resultados. Intente de nuevo.");
      }
    }).finally(() => {
      if (!controller.signal.aborted && searchController.current === controller) {
        loadingMore.current = false;
        setRemoteLoading(false);
      }
    });
  }

  useEffect(() => {
    if (!inventoryEnabled) {
      setInventory(new Map());
      setInventoryLoading(false);
      setInventoryLoadedKey(candidateResultsKey);
      return;
    }
    if (!candidateResults.length) {
      setInventory(new Map());
      setInventoryLoading(false);
      setInventoryLoadedKey(candidateResultsKey);
      return;
    }
    if (inventoryLoadedKey === candidateResultsKey) {
      setInventoryLoading(false);
      return;
    }

    let active = true;
    const missingSkus = candidateResults.filter(product => !inventory.has(product.sku)).map(product => product.sku);
    if (!missingSkus.length) {
      setInventoryLoadedKey(candidateResultsKey);
      setInventoryLoading(false);
      return;
    }
    setInventoryLoading(true);
    loadInventoryForSkus(missingSkus, [inventoryStoreId]).then((loadedInventory) => {
      if (active) {
        // También recordar los SKU sin stock para no repetir su consulta en cada página.
        missingSkus.forEach(sku => {
          if (!loadedInventory.has(sku)) loadedInventory.set(sku, { totalQuantity: 0, stores: [] });
        });
        setInventory(current => mergeInventoryBySku(current, loadedInventory));
        setInventoryLoadedKey(candidateResultsKey);
      }
    }).catch(() => {
      if (active) {
        setInventoryLoadedKey(candidateResultsKey);
      }
    }).finally(() => {
      if (active) setInventoryLoading(false);
    });
    return () => {
      active = false;
    };
  }, [candidateResults, candidateResultsKey, inventoryEnabled]);

  useEffect(() => {
    if (!results.length) {
      setSelectedSku("");
      return;
    }
    if (!results.some((product) => product.sku === selectedSku)) {
      setSelectedSku(results[0].sku);
    }
  }, [results, selectedSku]);

  const quoteSkusKey = [...new Set(currentItems.map(item => item.sku.trim()).filter(Boolean))].sort().join("|");
  const catalogRef = useRef(catalog);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  useEffect(() => {
    if (!hasCustomer || !selected?.sku) {
      setOfferRules([]);
      setOfferLoading(false);
      setOfferError("");
      return;
    }

    let active = true;
    setOfferLoading(true);
    setOfferError("");

    loadOfferRulesForSkus([...new Set([selected.sku, ...quoteSkusKey.split("|").filter(Boolean)])], [segment]).then((loadedRules) => {
      if (!active) return;
      const rules = loadedRules ?? sampleOfferRules;
      setOfferRules(rules);

      const knownSkus = new Set(catalogRef.current.map((p) => p.sku));
      const companionSkus = [...new Set(rules.flatMap(r => r.deal ? dealSkus(r.deal, r.sku) : [r.sku]))].filter((sku) => sku && !knownSkus.has(sku));
      if (companionSkus.length) {
        loadProductsBySkus(companionSkus, role).then((companionProducts) => {
          if (active && companionProducts.length) {
            onCatalogProductsFound(companionProducts);
          }
        });
      }
    }).catch((error) => {
      if (active) {
        setOfferRules([]);
        setOfferError(error instanceof Error ? error.message : "No se pudieron cargar las ofertas.");
      }
    }).finally(() => {
      if (active) setOfferLoading(false);
    });

    return () => {
      active = false;
    };
  }, [hasCustomer, onCatalogProductsFound, quoteSkusKey, role, selected?.sku, segment]);

  function selectSku(sku: string) {
    setSelectedSku(sku);
    setAddedMessage("");
  }

  function addSelected(product?: Product, offer?: AvailableOfferGroup) {
    if (!product) return;
    const cleanSku = normSku(product.sku);
    const safeQuantity = Math.max(1, Math.round(quantity) || 1);
    const effectiveOffer =
      offer &&
      offer.rules.every((rule) => ruleMatchesQuantity(rule, safeQuantity)) &&
      (!offer.isKit || kitMissingCompanionSkus(offer, cleanSku, currentItems).length === 0)
        ? offer
        : undefined;

    const items = [{ sku: cleanSku, quantity: safeQuantity }];

    onAddItems(items);
    setAddedMessage(
      kitPreview ? `SKU agregado: ${cleanSku}. Los kits se calculan con las cantidades de la cotización.` :
      effectiveOffer?.isKit
        ? `SKU agregado (Completa kit ${effectiveOffer.primary.id}): ${cleanSku}`
        : effectiveOffer
        ? `SKU agregado con oferta: ${cleanSku}`
        : `SKU agregado (Precio de lista): ${cleanSku}`
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="sku-modal">
        <header className="modal-head">
          <div>
            <h2>Agregar SKU</h2>
            <span>Búsqueda por código, descripción o número de parte.</span>
          </div>
          <button className="icon-btn" title="Cerrar" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="sku-modal-body">
          <aside className="sku-category-panel">
            <div className="sku-category-head">
              <Layers3 size={17} />
              <div>
                <h3>División</h3>
                <span>{departmentsLoading ? "Cargando categorías" : `${divisionOptions.length} divisiones`}</span>
              </div>
            </div>
            <div className="sku-division-list" aria-label="Filtro por división">
              <button
                className={!selectedDivisionId ? "selected" : ""}
                type="button"
                title="Todo el catálogo"
                onClick={() => setSelectedDivisionId("")}
              >
                <span>Todo el catálogo</span>
              </button>
              {divisionOptions.map((division) => (
                <button
                  className={division.id === selectedDivisionId ? "selected" : ""}
                  key={division.id}
                  type="button"
                  title={division.name}
                  onClick={() => setSelectedDivisionId(division.id)}
                >
                  <span>{division.name}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="sku-search-panel">
            <div className="sku-search-row">
              <label className="search-field">
                <Search size={16} />
                <input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar SKU" />
              </label>
              <label className="qty-field">
                <span>Cant.</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const parsed = parseInt(raw, 10);
                    setQuantity(Number.isNaN(parsed) ? 1 : Math.max(1, parsed));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "." || event.key === "," || event.key === "e" || event.key === "E" || event.key === "-") {
                      event.preventDefault();
                    }
                  }}
                />
              </label>
            </div>

            <div className="sku-results">
              {remoteLoading && !results.length ? <p className="empty-copy">Buscando productos...</p> : null}
              {visibleResults.map((product) => (
                <button
                  className={product.sku === selected?.sku ? "selected" : ""}
                  key={product.sku}
                  onClick={() => selectSku(product.sku)}
                >
                  <ProductImage src={productImageUrl(product.sku)} alt={product.description} />
                  <span className="sku-item-info">
                    <strong>{product.sku}</strong>
                    <small>{product.description}</small>
                    {inventoryEnabled ? <em>{!inventoryReady && !inventory.has(product.sku) ? "Revisando inventario..." : stockLabel(inventory.get(product.sku))}</em> : null}
                    <em>{product.partNumber ?? "Sin número de parte"}</em>
                  </span>
                  <div className="sku-item-price">
                    <span className="sku-price-label">Precio base</span>
                    <strong className="sku-price-value">{formatCurrency(product.listPrice)}</strong>
                  </div>
                </button>
              ))}
              {searchError ? <p className="empty-copy" role="status">{searchError}</p> : null}
              {canShowMoreResults ? (
                <button className="sku-load-more" type="button" onClick={loadMoreResults} disabled={remoteLoading}>
                  {remoteLoading ? "Buscando..." : "Ver más resultados"}
                </button>
              ) : null}
              {!remoteLoading && inventoryReady && !results.length ? (
                <p className="empty-copy">{skuEmptyMessage(term)}</p>
              ) : null}
            </div>
          </div>

          <SkuOfferPreviewPanel
            selected={selected}
            hasCustomer={hasCustomer}
            customer={customer}
            segment={segment}
            quantity={quantity}
            inventoryEnabled={inventoryEnabled}
            inventory={inventory}
            offerError={offerError}
            offerLoading={offerLoading}
            offerGroups={offerGroups}
            selectedOffer={selectedOffer}
            kitPreview={kitPreview}
            currentItems={currentItems}
            catalog={catalog}
            addedMessage={addedMessage}
            remoteLoading={remoteLoading}
            onRequestSelectCustomer={onRequestSelectCustomer}
            onAddSelected={addSelected}
          />
        </div>
      </section>
    </div>
  );
}
