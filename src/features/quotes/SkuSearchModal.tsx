import { Layers3, PackagePlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Badge } from "../../components/ui";
import { inventoryStoreId } from "../../config/features";
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
import { loadInventoryForSkus, loadOfferRulesForSkus, loadProductDepartments, searchProductPageFromSupabase } from "../../services/supabase";
import type { Product, ProductDepartment, ProductInventory, QuoteItem, OfferRule } from "../../types/domain";
import { ProductImage } from "./ProductImage";

const productSearchPageSize = 36;
const visibleResultStep = 12;

type Props = {
  catalog: Product[];
  segment: string;
  inventoryEnabled: boolean;
  onCatalogProductsFound: (products: Product[]) => void;
  onClose: () => void;
  onAddItems: (items: QuoteItem[]) => void;
};

export function SkuSearchModal({
  catalog,
  segment,
  inventoryEnabled,
  onCatalogProductsFound,
  onClose,
  onAddItems,
}: Props) {
  const [term, setTerm] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedOfferKey, setSelectedOfferKey] = useState("");
  const [addedMessage, setAddedMessage] = useState("");
  const [offerRules, setOfferRules] = useState<OfferRule[]>(sampleOfferRules);
  const [inventory, setInventory] = useState<Map<string, ProductInventory>>(new Map());
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryLoadedKey, setInventoryLoadedKey] = useState("");
  const [offerLoading, setOfferLoading] = useState(false);
  const [remoteResults, setRemoteResults] = useState<Product[] | null>(null);
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [remoteOffset, setRemoteOffset] = useState(0);
  const [visibleCount, setVisibleCount] = useState(visibleResultStep);
  const [departments, setDepartments] = useState<ProductDepartment[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const divisionOptions = useMemo(() => buildDivisionOptions(departments), [departments]);
  const selectedDepartmentIds = useMemo(
    () => new Set(departments.filter((department) => department.divisionId === selectedDivisionId).map((department) => department.departmentId)),
    [departments, selectedDivisionId],
  );
  const localResults = useMemo(
    () => filterProductsByDivision(searchProducts(catalog, term), selectedDepartmentIds, selectedDivisionId).slice(0, 60),
    [catalog, selectedDepartmentIds, selectedDivisionId, term],
  );
  const candidateResults = remoteResults ?? localResults;
  const candidateResultsKey = useMemo(() => candidateResults.map((product) => product.sku).join("|"), [candidateResults]);
  const inventoryReady = !inventoryEnabled || !candidateResults.length || inventoryLoadedKey === candidateResultsKey;
  const results = useMemo(
    () => (inventoryReady ? sortProductsByInventory(candidateResults, inventoryEnabled ? inventory : new Map()) : []),
    [candidateResults, inventory, inventoryEnabled, inventoryReady],
  );
  const visibleResults = results.slice(0, visibleCount);
  const hasLoadedHiddenResults = visibleCount < results.length;
  const canShowMoreResults = hasLoadedHiddenResults || Boolean(remoteResults && remoteHasMore);
  const [selectedSku, setSelectedSku] = useState(results[0]?.sku ?? "");
  const selected = results.find((product) => product.sku === selectedSku) ?? results[0];
  const offerGroups = useMemo(
    () => (selected ? sortOfferGroupsByUnitPrice(availableOfferGroups(offerRules, selected.sku, segment), selected.listPrice) : []),
    [offerRules, selected, segment],
  );
  const selectedOffer = offerGroups.find((group) => group.key === selectedOfferKey) ?? offerGroups[0];

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
    const query = term.trim();
    setVisibleCount(visibleResultStep);
    setRemoteHasMore(false);
    setRemoteOffset(0);

    if (query.length === 1) {
      setRemoteResults(null);
      setRemoteLoading(false);
      return () => {
        active = false;
      };
    }

    setRemoteLoading(true);
    const timer = window.setTimeout(() => {
      searchProductPageFromSupabase(query, {
        divisionId: selectedDivisionId || undefined,
        limit: productSearchPageSize,
        prioritizeInventory: inventoryEnabled,
        storeId: inventoryStoreId,
      }).then((page) => {
        if (!active) return;
        setRemoteResults(page?.products.length ? page.products : null);
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
      window.clearTimeout(timer);
    };
  }, [inventoryEnabled, onCatalogProductsFound, selectedDivisionId, term]);

  function loadMoreResults() {
    if (hasLoadedHiddenResults) {
      setVisibleCount((current) => current + visibleResultStep);
      return;
    }

    if (!remoteResults || !remoteHasMore || remoteLoading) return;

    setRemoteLoading(true);
    searchProductPageFromSupabase(term, {
      divisionId: selectedDivisionId || undefined,
      limit: productSearchPageSize,
      offset: remoteOffset,
      prioritizeInventory: inventoryEnabled,
      storeId: inventoryStoreId,
    }).then((page) => {
      if (!page?.products.length) {
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
      setRemoteHasMore(false);
    }).finally(() => {
      setRemoteLoading(false);
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
    setInventoryLoading(true);
    setInventoryLoadedKey("");
    loadInventoryForSkus(candidateResults.map((product) => product.sku), [inventoryStoreId]).then((loadedInventory) => {
      if (active) {
        setInventory(loadedInventory);
        setInventoryLoadedKey(candidateResultsKey);
      }
    }).catch(() => {
      if (active) {
        setInventory(new Map());
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

  useEffect(() => {
    if (!selected?.sku) return;
    let active = true;
    setOfferLoading(true);

    loadOfferRulesForSkus([selected.sku], [segment]).then((loadedRules) => {
      if (!active || loadedRules === null) return;
      setOfferRules(loadedRules);
    }).finally(() => {
      if (active) setOfferLoading(false);
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
                <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} />
              </label>
            </div>

            <div className="sku-results">
              {remoteLoading ? <p className="empty-copy">Buscando productos...</p> : null}
              {!remoteLoading && (inventoryLoading || !inventoryReady) ? <p className="empty-copy">Revisando inventario disponible...</p> : null}
              {visibleResults.map((product) => (
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
                    <em>{product.partNumber ?? "Sin número de parte"}</em>
                  </span>
                </button>
              ))}
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
                  {offerLoading ? <p className="empty-copy">Cargando ofertas del segmento...</p> : null}
                  {!offerLoading && offerGroups.map((offerGroup) => {
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
                  {!offerLoading && !offerGroups.length ? <p className="empty-copy">No hay ofertas para este SKU y segmento.</p> : null}
                </div>

                {addedMessage ? <p className="added-message">{addedMessage}</p> : null}

                <Button onClick={() => addSelected(selected, selectedOffer)}>
                  <PackagePlus size={16} />
                  {selectedOffer?.isKit ? "Agregar kit" : "Agregar SKU"}
                </Button>
              </>
            ) : (
              <p className="empty-copy">{remoteLoading ? "Buscando productos..." : "No hay resultados con esa búsqueda."}</p>
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
  if (!inventory || inventory.totalQuantity <= 0) return <small className="stock-detail empty">Sin inventario disponible</small>;

  return (
    <div className="stock-breakdown">
      <span>Inventario total: {inventory.totalQuantity.toLocaleString("es-NI")}</span>
    </div>
  );
}

function stockLabel(inventory?: ProductInventory) {
  if (!inventory || inventory.totalQuantity <= 0) return "Sin inventario";
  return `Inventario ${inventory.totalQuantity.toLocaleString("es-NI")}`;
}

function skuEmptyMessage(term: string) {
  if (term.trim().length === 1) return "Escribe al menos 2 caracteres para buscar en todo el catálogo.";
  return "No hay productos con esa búsqueda.";
}

function mergeProductsBySku(current: Product[], incoming: Product[]) {
  const grouped = new Map(current.map((product) => [product.sku, product]));
  incoming.forEach((product) => grouped.set(product.sku, product));
  return [...grouped.values()];
}

function mergeInventoryBySku(current: Map<string, ProductInventory>, incoming: Map<string, ProductInventory>) {
  const grouped = new Map(current);
  incoming.forEach((inventory, sku) => grouped.set(sku, inventory));
  return grouped;
}

function productsKey(products: Product[]) {
  return products.map((product) => product.sku).join("|");
}

function sortProductsByInventory(products: Product[], inventory: Map<string, ProductInventory>) {
  if (!inventory.size) return products;

  return [...products].sort((left, right) => {
    const leftQuantity = inventory.get(left.sku)?.totalQuantity ?? 0;
    const rightQuantity = inventory.get(right.sku)?.totalQuantity ?? 0;
    const stockDifference = Number(rightQuantity > 0) - Number(leftQuantity > 0);
    if (stockDifference !== 0) return stockDifference;
    return 0;
  });
}

function filterProductsByDivision(products: Product[], departmentIds: Set<string>, divisionId: string) {
  if (!divisionId) return products;
  if (!departmentIds.size) return [];
  return products.filter((product) => product.departmentId && departmentIds.has(product.departmentId));
}

function buildDivisionOptions(departments: ProductDepartment[]) {
  const grouped = new Map<string, { id: string; name: string; departmentCount: number }>();

  departments.forEach((department) => {
    const current = grouped.get(department.divisionId);
    if (current) {
      current.departmentCount += 1;
      return;
    }

    grouped.set(department.divisionId, {
      id: department.divisionId,
      name: department.divisionName,
      departmentCount: 1,
    });
  });

  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function thresholdLabel(offers: OfferRule[]) {
  const minQuantity = Math.max(...offers.map((offer) => offer.minQuantity ?? 0));
  return minQuantity > 0 ? `Desde ${minQuantity} unidades` : "Sin mínimo";
}

function benefitLabel(offer: OfferRule) {
  if (offer.fixedPrice) return `Precio ${formatCurrency(offer.fixedPrice)}`;
  if (offer.discountPercent) return `${offer.discountPercent}% descuento`;
  return offer.discountType ?? "Beneficio configurado";
}
