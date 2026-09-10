import { Layers3, PackagePlus, Search, UserCheck, UserSearch, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Badge } from "../../components/ui";
import { inventoryStoreId } from "../../config/features";
import { productImageUrl, searchProducts } from "../../services/catalog";
import {
  availableOfferGroups,
  estimateKitTotals,
  estimateLineTotal,
  estimateOfferGroupUnitPrice,
  estimateUnitPrice,
  isUniversalSegment,
  minimumQuantityForRule,
  ruleMatchesQuantity,
  sampleOfferRules,
  sortOfferGroupsByUnitPrice,
} from "../../services/promotions";
import type { AvailableOfferGroup } from "../../services/promotions";
import { formatCurrency } from "../../services/quote";
import { dealDescription } from "../../services/dealConfig";
import { loadInventoryForSkus, loadOfferRulesForSkus, loadProductDepartments, loadProductsBySkus, searchProductPageFromSupabase } from "../../services/supabase";
import type { Customer, Product, ProductDepartment, ProductInventory, QuoteItem, OfferRule } from "../../types/domain";
import { ProductImage } from "./ProductImage";

const productSearchPageSize = 36;
const visibleResultStep = 12;

type Props = {
  catalog: Product[];
  customer?: Customer | null;
  segment: string;
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
  inventoryEnabled,
  onCatalogProductsFound,
  onClose,
  onRequestSelectCustomer,
  onAddItems,
}: Props) {
  const [term, setTerm] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedOfferKey, setSelectedOfferKey] = useState("");
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
    () => (hasCustomer && selected ? sortOfferGroupsByUnitPrice(availableOfferGroups(offerRules, selected.sku, segment), selected.listPrice, quantity) : []),
    [hasCustomer, offerRules, selected, segment, quantity],
  );

  const applicableOfferGroups = useMemo(
    () => offerGroups.filter((group) => group.rules.every((offer) => ruleMatchesQuantity(offer, quantity))),
    [offerGroups, quantity],
  );

  const selectedOffer = useMemo(() => {
    if (selectedOfferKey === "LIST_PRICE") return undefined;
    if (selectedOfferKey) {
      const match = applicableOfferGroups.find((group) => group.key === selectedOfferKey);
      if (match) return match;
    }
    return hasCustomer ? applicableOfferGroups[0] : undefined;
  }, [applicableOfferGroups, hasCustomer, selectedOfferKey]);

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

    loadOfferRulesForSkus([selected.sku], [segment]).then((loadedRules) => {
      if (!active) return;
      const rules = loadedRules ?? sampleOfferRules;
      setOfferRules(rules);

      const knownSkus = new Set(catalogRef.current.map((p) => p.sku));
      const companionSkus = [...new Set(rules.map((r) => r.sku))].filter((sku) => sku && !knownSkus.has(sku));
      if (companionSkus.length) {
        loadProductsBySkus(companionSkus).then((companionProducts) => {
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
  }, [hasCustomer, onCatalogProductsFound, selected?.sku, segment]);

  function selectSku(sku: string) {
    setSelectedSku(sku);
    setSelectedOfferKey("");
    setAddedMessage("");
  }

  function addSelected(product?: Product, offer?: AvailableOfferGroup) {
    if (!product) return;
    const safeQuantity = Math.max(1, Math.round(quantity) || 1);
    const effectiveOffer = offer && offer.rules.every((rule) => ruleMatchesQuantity(rule, safeQuantity)) ? offer : undefined;
    const items = effectiveOffer?.isKit
      ? effectiveOffer.rules.map((rule) => ({ sku: rule.sku, quantity: safeQuantity * Math.max(1, minimumQuantityForRule(rule), rule.minQuantity ?? 0) }))
      : [{ sku: product.sku, quantity: safeQuantity }];

    onAddItems(items);
    setAddedMessage(
      effectiveOffer?.isKit
        ? `Kit agregado: ${items.length} SKU`
        : effectiveOffer
        ? `SKU agregado con oferta: ${product.sku}`
        : `SKU agregado (Precio de lista): ${product.sku}`
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
                  {hasCustomer ? (
                    <div className="sku-customer-badge">
                      <UserCheck size={13} />
                      <span>
                        {customer?.displayName || customer?.customerId ? `${customer.displayName || customer.customerId} · ` : ""}
                        Segmento {segment || "-"}
                      </span>
                    </div>
                  ) : null}
                  {inventoryEnabled ? <InventoryBreakdown inventory={inventory.get(selected.sku)} /> : null}
                </div>

                {!hasCustomer ? (
                  <div className="offer-list">
                    <div className="sku-no-customer-banner">
                      <div className="sku-no-customer-icon">
                        <UserSearch size={22} />
                      </div>
                      <div className="sku-no-customer-content">
                        <h4>Cliente no seleccionado</h4>
                        <p>
                          Para consultar y aplicar ofertas o promociones disponibles según segmento comercial, debes seleccionar un cliente.
                        </p>
                        {onRequestSelectCustomer ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="sku-select-customer-btn"
                            onClick={onRequestSelectCustomer}
                          >
                            <UserSearch size={15} />
                            Seleccionar cliente
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="offer-row selected static-list-price">
                      <div>
                        <strong>Precio de lista</strong>
                        <span>Tarifa base estándar</span>
                      </div>
                      <Badge tone="neutral">Base</Badge>
                      <small>Sin descuento promocional</small>
                      <p>{formatCurrency(selected.listPrice)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="offer-list">
                    {offerError ? <p role="alert">{offerError}</p> : null}
                    {offerLoading ? <p className="empty-copy">Cargando ofertas del segmento...</p> : null}

                    {!offerLoading ? (
                      <>
                        <button
                          className={!selectedOffer ? "offer-row selected" : "offer-row"}
                          type="button"
                          onClick={() => setSelectedOfferKey("LIST_PRICE")}
                        >
                          <div>
                            <strong>Precio de lista</strong>
                            <span>Tarifa base regular</span>
                          </div>
                          <Badge tone="neutral">Base</Badge>
                          <small>Sin condiciones ni mínimo</small>
                          <p>{formatCurrency(selected.listPrice)}</p>
                        </button>

                        {offerGroups.map((offerGroup) => {
                          const applies = offerGroup.rules.every((offer) => ruleMatchesQuantity(offer, quantity));
                          const isUniversal = isUniversalSegment(offerGroup.primary.segment);
                          const isSelected = selectedOffer?.key === offerGroup.key;
                          const minQty = Math.max(...offerGroup.rules.map(minimumQuantityForRule));

                          return (
                            <button
                              className={isSelected ? "offer-row selected" : applies ? "offer-row" : "offer-row disabled"}
                              key={offerGroup.key}
                              type="button"
                              disabled={!applies}
                              onClick={() => {
                                if (applies) setSelectedOfferKey(offerGroup.key);
                              }}
                              title={!applies ? `Inhabilitada: requiere al menos ${minQty} unidades para aplicar (actual: ${quantity})` : undefined}
                            >
                              <div>
                                <strong>{offerGroup.primary.id}</strong>
                                <span>{offerGroup.primary.promotionName}</span>
                              </div>
                              <Badge tone={!applies ? "neutral" : isUniversal ? "info" : "success"}>
                                {!applies
                                  ? `Requiere mín. ${minQty} u.`
                                  : offerGroup.isKit
                                  ? `Kit ${offerGroup.skuCount} SKU`
                                  : isUniversal
                                  ? "Universal"
                                  : `Segmento ${offerGroup.primary.segment.trim() || segment}`}
                              </Badge>
                              <small>{offerGroup.primary.deal ? dealDescription(offerGroup.primary.deal) : thresholdLabel(offerGroup.rules)}</small>
                              {offerGroup.isKit ? (
                                <>
                                  <div className="kit-items">
                                    {offerGroup.rules.map((offer) => (
                                      <KitItemRow catalog={catalog} key={`${offer.id}-${offer.sku}`} offer={offer} quantity={quantity} />
                                    ))}
                                  </div>
                                  {(() => {
                                    const kitTotals = estimateKitTotals(offerGroup, catalog, quantity);
                                    return (
                                      <div className="kit-card-footer">
                                        <div className="kit-card-totals">
                                          <span className="kit-total-label">
                                            Total kit{quantity > 1 ? ` (${quantity} kits)` : ""}:
                                          </span>
                                          <strong className="kit-total-price">
                                            {formatCurrency(kitTotals.totalFinal)}
                                          </strong>
                                        </div>
                                        {kitTotals.savings > 0 ? (
                                          <span className="kit-total-savings">
                                            Ahorro total {formatCurrency(kitTotals.savings)}
                                          </span>
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                </>
                              ) : offerGroup.primary.deal && offerGroup.primary.deal.kind !== "UNIT" ? (
                                <p>Se evalúa con los productos de la cotización</p>
                              ) : (
                                <p>{formatCurrency(estimateOfferGroupUnitPrice(selected.listPrice, offerGroup))}</p>
                              )}
                              {!applies ? (
                                <span className="offer-row-unmet">
                                  Inhabilitada: requiere al menos {minQty} unidades para aplicar (cantidad actual: {quantity})
                                </span>
                              ) : null}
                            </button>
                          );
                        })}

                        {!offerError && !offerGroups.length ? (
                          <p className="empty-copy">No hay ofertas promocionales disponibles para este SKU en el segmento {segment}.</p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )}

                {addedMessage ? <p className="added-message">{addedMessage}</p> : null}

                {selectedOffer?.isKit ? (() => {
                  const kitTotals = estimateKitTotals(selectedOffer, catalog, quantity);
                  return (
                    <div className="selected-kit-banner">
                      <div className="selected-kit-banner-row">
                        <span>Total del kit: <strong>{formatCurrency(kitTotals.totalFinal)}</strong></span>
                        {kitTotals.savings > 0 ? (
                          <span className="selected-kit-savings">
                            Ahorro total: <strong>{formatCurrency(kitTotals.savings)}</strong>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })() : null}

                <Button onClick={() => addSelected(selected, selectedOffer)}>
                  <PackagePlus size={16} />
                  {selectedOffer?.isKit
                    ? "Agregar kit"
                    : selectedOffer
                    ? "Agregar SKU con oferta"
                    : "Agregar SKU (Precio de lista)"}
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
  const safeKitQuantity = Math.max(1, Math.round(quantity) || 1);
  const perKit = Math.max(1, minimumQuantityForRule(offer), offer.minQuantity ?? 0);
  const rowQuantity = safeKitQuantity * perKit;
  const unitPrice = product
    ? estimateUnitPrice(product.listPrice, offer)
    : (offer.fixedPrice !== undefined && offer.discountType !== "PERCENT_OFF" ? offer.fixedPrice : 0);
  const finalTotal = unitPrice * rowQuantity;

  return (
    <span className="kit-item">
      <strong>{offer.sku}</strong>
      <small>{product?.description ?? (offer.configurationNote || "Producto pendiente del maestro")}</small>
      <em>{rowQuantity > 1 ? `${rowQuantity} u · ` : ""}{benefitLabel(offer)} - {formatCurrency(finalTotal)}</em>
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
  const minQuantity = Math.max(...offers.map(minimumQuantityForRule));
  return minQuantity > 0 ? `Desde ${minQuantity} unidades` : "Sin mínimo";
}

function benefitLabel(offer: OfferRule) {
  if (offer.fixedPrice !== undefined) return `Precio ${formatCurrency(offer.fixedPrice)}`;
  if (offer.discountPercent) return `${offer.discountPercent}% descuento`;
  return offer.discountType ?? "Beneficio configurado";
}
