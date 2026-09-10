import { Info, Layers3, PackagePlus, Search, UserCheck, UserSearch, X } from "lucide-react";
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
    () => {
      if (!hasCustomer || !selected) return [];
      const baseGroups = availableOfferGroups(offerRules, selected.sku, segment);
      return [...baseGroups].sort((left, right) =>
        compareOfferGroups(left, right, selected, quantity, currentItems, catalog)
      );
    },
    [catalog, currentItems, hasCustomer, offerRules, quantity, selected, segment],
  );

  const applicableOfferGroups = useMemo(
    () =>
      offerGroups.filter((group) => {
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
              {remoteLoading ? <p className="empty-copy">Buscando productos...</p> : null}
              {!remoteLoading && (inventoryLoading || !inventoryReady) ? <p className="empty-copy">Revisando inventario disponible...</p> : null}
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
                    {inventoryEnabled ? <em>{stockLabel(inventory.get(product.sku))}</em> : null}
                    <em>{product.partNumber ?? "Sin número de parte"}</em>
                  </span>
                  <div className="sku-item-price">
                    <span className="sku-price-label">Precio base</span>
                    <strong className="sku-price-value">{formatCurrency(product.listPrice)}</strong>
                  </div>
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
                  <div className="selected-product-header">
                    <div className="selected-product-title">
                      <strong>{selected.sku}</strong>
                      <span>{selected.description}</span>
                      {selected.partNumber ? <em className="selected-part-number">Parte: {selected.partNumber}</em> : null}
                    </div>
                    <div className="selected-base-price-badge">
                      <span className="selected-base-price-label">Precio de lista</span>
                      <strong className="selected-base-price-val">{formatCurrency(selected.listPrice)}</strong>
                    </div>
                  </div>
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

                    <div className="sku-base-notice">
                      <Info size={16} />
                      <div>
                        <strong>Precio regular de lista</strong>
                        <p>
                          Sin cliente seleccionado. Este producto se cotizará con su <strong>precio de lista base ({formatCurrency(selected.listPrice)})</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="offer-list">
                    {offerError ? <p role="alert">{offerError}</p> : null}
                    {offerLoading ? <p className="empty-copy">Cargando ofertas del segmento...</p> : null}

                    {!offerLoading ? (
                      <>
                        {offerGroups.length > 0 ? (
                          <>
                            <div className="offer-section-header">
                              <h4>Ofertas y promociones disponibles ({offerGroups.length})</h4>
                            </div>
                            {offerGroups.map((offerGroup) => {
                              const missingCompanions =
                                offerGroup.isKit && selected?.sku
                                  ? kitMissingCompanionSkus(offerGroup, selected.sku, currentItems)
                                  : [];
                              const hasMissingCompanions = missingCompanions.length > 0;
                              const matchesQty = offerGroup.rules.every((offer) => ruleMatchesQuantity(offer, quantity));
                              const applies = matchesQty && !hasMissingCompanions;
                              const isUniversal = isUniversalSegment(offerGroup.primary.segment);
                              const isBestOffer = selectedOffer?.key === offerGroup.key;
                              const minQty = Math.max(...offerGroup.rules.map(minimumQuantityForRule));

                              const promoUnitPrice = estimateOfferGroupUnitPrice(selected.listPrice, offerGroup);
                              const unitSavings = Math.max(0, selected.listPrice - promoUnitPrice);
                              const totalSavings = unitSavings * quantity;
                              const percentSavings = selected.listPrice > 0 ? Math.round((unitSavings / selected.listPrice) * 100) : 0;

                              return (
                                <div
                                  className={isBestOffer ? "offer-row best-offer" : applies ? "offer-row" : "offer-row disabled"}
                                  key={offerGroup.key}
                                  title={
                                    hasMissingCompanions
                                      ? `Inhabilitada: requiere que el resto de productos del kit ya estén en la cotización (falta: ${missingCompanions.join(", ")})`
                                      : !matchesQty
                                      ? `Inhabilitada: requiere al menos ${minQty} unidades para aplicar (actual: ${quantity})`
                                      : undefined
                                  }
                                >
                                  <div>
                                    <strong>{offerGroup.primary.id}</strong>
                                    <span>{offerGroup.primary.promotionName}</span>
                                  </div>
                                  <div className="offer-badges">
                                    {isBestOffer ? (
                                      <Badge tone="success">Aplica automáticamente</Badge>
                                    ) : null}
                                    <Badge tone={!applies ? "neutral" : isUniversal ? "info" : "success"}>
                                      {hasMissingCompanions
                                        ? `Kit incompleto (faltan ${missingCompanions.length} SKU)`
                                        : !matchesQty
                                        ? `Requiere mín. ${minQty} u.`
                                        : offerGroup.isKit
                                        ? `Kit ${offerGroup.skuCount} SKU`
                                        : isUniversal
                                        ? "Universal"
                                        : `Segmento ${offerGroup.primary.segment.trim() || segment}`}
                                    </Badge>
                                  </div>
                                  <small>{offerGroup.primary.deal ? dealDescription(offerGroup.primary.deal) : thresholdLabel(offerGroup.rules)}</small>
                                  {offerGroup.isKit ? (
                                    <>
                                      <div className="kit-items">
                                        {offerGroup.rules.map((offer) => {
                                          const cleanOfferSku = normSku(offer.sku);
                                          const isCurrent = cleanOfferSku === normSku(selected?.sku);
                                          const inCart = currentItems.some((item) => normSku(item.sku) === cleanOfferSku);
                                          return (
                                            <KitItemRow
                                              catalog={catalog}
                                              key={`${offer.id}-${cleanOfferSku}`}
                                              offer={offer}
                                              quantity={quantity}
                                              isCurrentSku={isCurrent}
                                              isInCart={inCart}
                                            />
                                          );
                                        })}
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
                                    <div className="offer-card-footer">
                                      <div className="offer-card-totals">
                                        <span className="offer-unit-label">Precio promo unitario:</span>
                                        <strong className="offer-unit-price">{formatCurrency(promoUnitPrice)}</strong>
                                      </div>
                                      {unitSavings > 0 ? (
                                        <span className="kit-total-savings">
                                          Ahorro {quantity > 1 ? `total ${formatCurrency(totalSavings)}` : formatCurrency(unitSavings)}
                                          {percentSavings > 0 ? ` (${percentSavings}%)` : ""}
                                        </span>
                                      ) : null}
                                    </div>
                                  )}
                                  {!applies ? (
                                    <span className="offer-row-unmet">
                                      {hasMissingCompanions
                                        ? `Inhabilitada: requiere que el resto de productos del kit ya estén agregados en la cotización (falta agregar: ${missingCompanions.join(", ")})`
                                        : `Inhabilitada: requiere al menos ${minQty} unidades para aplicar (cantidad actual: ${quantity})`}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </>
                        ) : !offerError ? (
                          <div className="sku-base-notice">
                            <Info size={16} />
                            <div>
                              <strong>Sin promociones configuradas</strong>
                              <p>
                                Este SKU no cuenta con promociones activas para el segmento {segment || "-"}. Se aplicará el <strong>precio base regular de {formatCurrency(selected.listPrice)}</strong>.
                              </p>
                            </div>
                          </div>
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
                        <span>Total del kit{quantity > 1 ? ` (${quantity} kits)` : ""}: <strong>{formatCurrency(kitTotals.totalFinal)}</strong></span>
                        {kitTotals.savings > 0 ? (
                          <span className="selected-kit-savings">
                            Ahorro total: <strong>{formatCurrency(kitTotals.savings)}</strong>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })() : selectedOffer ? (() => {
                  const promoUnitPrice = estimateOfferGroupUnitPrice(selected.listPrice, selectedOffer);
                  const lineTotal = promoUnitPrice * quantity;
                  const listTotal = selected.listPrice * quantity;
                  const savings = Math.max(0, listTotal - lineTotal);
                  return (
                    <div className="selected-kit-banner">
                      <div className="selected-kit-banner-row">
                        <span>Total ({quantity} {quantity === 1 ? "unidad" : "unidades"}): <strong>{formatCurrency(lineTotal)}</strong></span>
                        {savings > 0 ? (
                          <span className="selected-kit-savings">
                            Ahorro total: <strong>{formatCurrency(savings)}</strong>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="selected-base-banner">
                    <span>Total ({quantity} {quantity === 1 ? "unidad" : "unidades"}): <strong>{formatCurrency(selected.listPrice * quantity)}</strong></span>
                    <small>Precio de lista base</small>
                  </div>
                )}

                <Button onClick={() => addSelected(selected, selectedOffer)}>
                  <PackagePlus size={16} />
                  {selectedOffer?.isKit
                    ? "Agregar SKU (Completa kit)"
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

function KitItemRow({
  catalog,
  offer,
  quantity,
  isCurrentSku,
  isInCart,
}: {
  catalog: Product[];
  offer: OfferRule;
  quantity: number;
  isCurrentSku?: boolean;
  isInCart?: boolean;
}) {
  const cleanOfferSku = normSku(offer.sku);
  const product = catalog.find((item) => normSku(item.sku) === cleanOfferSku);
  const safeKitQuantity = Math.max(1, Math.round(quantity) || 1);
  const perKit = Math.max(1, minimumQuantityForRule(offer), offer.minQuantity ?? 0);
  const rowQuantity = safeKitQuantity * perKit;
  const unitPrice = product
    ? estimateUnitPrice(product.listPrice, offer)
    : (offer.fixedPrice !== undefined && offer.discountType !== "PERCENT_OFF" ? offer.fixedPrice : 0);
  const finalTotal = unitPrice * rowQuantity;

  return (
    <span className="kit-item">
      <strong>
        {cleanOfferSku}
        {isCurrentSku ? (
          <em className="kit-item-status current"> (Actual)</em>
        ) : isInCart ? (
          <em className="kit-item-status in-cart"> (En cotización)</em>
        ) : (
          <em className="kit-item-status missing"> (Falta agregar)</em>
        )}
      </strong>
      <small>{product?.description ?? (offer.configurationNote || "Producto pendiente del maestro")}</small>
      <em>{rowQuantity > 1 ? `${rowQuantity} u · ` : ""}{benefitLabel(offer)} - {formatCurrency(finalTotal)}</em>
    </span>
  );
}

function kitMissingCompanionSkus(offerGroup: AvailableOfferGroup, currentSku: string, currentItems: QuoteItem[] = []): string[] {
  if (!offerGroup.isKit) return [];
  const cleanCurrentSku = normSku(currentSku);
  const cartSkus = new Set(currentItems.map((item) => normSku(item.sku)).filter(Boolean));
  const companionSkus = [...new Set(offerGroup.rules.map((r) => normSku(r.sku)))].filter((sku) => sku && sku !== cleanCurrentSku);
  return companionSkus.filter((sku) => !cartSkus.has(sku));
}

function normSku(val: unknown): string {
  return String(val ?? "").trim();
}

function compareOfferGroups(
  left: AvailableOfferGroup,
  right: AvailableOfferGroup,
  product: Product,
  qty: number,
  currentItems: QuoteItem[],
  catalog: Product[],
): number {
  const leftMissing = left.isKit ? kitMissingCompanionSkus(left, product.sku, currentItems) : [];
  const rightMissing = right.isKit ? kitMissingCompanionSkus(right, product.sku, currentItems) : [];
  const leftMatchesQty = left.rules.every((offer) => ruleMatchesQuantity(offer, qty));
  const rightMatchesQty = right.rules.every((offer) => ruleMatchesQuantity(offer, qty));
  const leftApplies = leftMatchesQty && leftMissing.length === 0;
  const rightApplies = rightMatchesQty && rightMissing.length === 0;

  // 1. Applicable offers always precede non-applicable/disabled offers
  if (leftApplies !== rightApplies) {
    return leftApplies ? -1 : 1;
  }

  // 2. The offer with the greatest total savings wins
  const leftSavings = left.isKit
    ? estimateKitTotals(left, catalog, qty).savings
    : Math.max(0, product.listPrice - estimateOfferGroupUnitPrice(product.listPrice, left)) * qty;

  const rightSavings = right.isKit
    ? estimateKitTotals(right, catalog, qty).savings
    : Math.max(0, product.listPrice - estimateOfferGroupUnitPrice(product.listPrice, right)) * qty;

  if (Math.abs(leftSavings - rightSavings) > 0.001) {
    return rightSavings - leftSavings;
  }

  // 3. Lowest promo unit price on the selected SKU as tie-breaker
  const leftRule = left.rules.find((r) => normSku(r.sku) === normSku(product.sku)) ?? left.primary;
  const rightRule = right.rules.find((r) => normSku(r.sku) === normSku(product.sku)) ?? right.primary;
  const leftUnitPrice = estimateUnitPrice(product.listPrice, leftRule);
  const rightUnitPrice = estimateUnitPrice(product.listPrice, rightRule);

  if (Math.abs(leftUnitPrice - rightUnitPrice) > 0.001) {
    return leftUnitPrice - rightUnitPrice;
  }

  return left.primary.id.localeCompare(right.primary.id);
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
