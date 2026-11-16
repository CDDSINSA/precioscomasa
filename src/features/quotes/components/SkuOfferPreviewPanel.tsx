import { Info, PackagePlus, UserCheck, UserSearch } from "lucide-react";
import { Badge, Button } from "../../../components/ui";
import { dealDescription } from "../../../services/dealConfig";
import {
  estimateKitTotals,
  estimateOfferGroupUnitPrice,
  estimateUnitPrice,
  isUniversalSegment,
  minimumQuantityForRule,
  ruleMatchesQuantity,
  type AvailableOfferGroup,
} from "../../../services/promotions";
import { formatCurrency } from "../../../services/quote";
import type { Customer, OfferRule, Product, ProductInventory, QuoteItem, QuoteSummary } from "../../../types/domain";
import {
  benefitLabel,
  kitMissingCompanionSkus,
  normSku,
  thresholdLabel,
} from "./skuSearchHelpers";

type Props = {
  selected?: Product;
  hasCustomer: boolean;
  customer?: Customer | null;
  segment: string;
  quantity: number;
  inventoryEnabled: boolean;
  inventory: Map<string, ProductInventory>;
  offerError: string;
  offerLoading: boolean;
  offerGroups: AvailableOfferGroup[];
  selectedOffer?: AvailableOfferGroup;
  kitPreview?: QuoteSummary;
  currentItems: QuoteItem[];
  catalog: Product[];
  addedMessage: string;
  remoteLoading: boolean;
  onRequestSelectCustomer?: () => void;
  onAddSelected: (product?: Product, offer?: AvailableOfferGroup) => void;
};

export function SkuOfferPreviewPanel({
  selected,
  hasCustomer,
  customer,
  segment,
  quantity,
  inventoryEnabled,
  inventory,
  offerError,
  offerLoading,
  offerGroups,
  selectedOffer,
  kitPreview,
  currentItems,
  catalog,
  addedMessage,
  remoteLoading,
  onRequestSelectCustomer,
  onAddSelected,
}: Props) {
  return (
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
                        const deal = offerGroup.primary.deal;
                        if (deal?.kind === "KIT") {
                          const offer = offerGroup.primary;
                          const applied = !kitPreview?.pricingError && kitPreview?.lines.some(line => line.allocations?.some(bucket => bucket.offers.some(rule => rule.id === offer.id && rule.promotionId === offer.promotionId && rule.segment.trim() === offer.segment.trim())));
                          return (
                            <div className={applied ? "offer-row best-offer" : "offer-row"} key={offerGroup.key}>
                              <div className="offer-title-group">
                                <span className="offer-id-label">Oferta {offer.id}</span>
                                <strong className="offer-promo-name">{offer.promotionName}</strong>
                              </div>
                              <div className="offer-badges">
                                <Badge tone={applied ? "success" : "neutral"}>
                                  {applied ? "Mejor oferta" : "Kit en combo"}
                                </Badge>
                              </div>
                              <div className="kit-deal-requirements">
                                <span className="kit-deal-subtitle">Productos requeridos en combo:</span>
                                <div className="kit-set-chips">
                                  {deal.sets ? deal.sets.map((set) => (
                                    <span className="kit-set-chip" key={set.id}>
                                      <strong>SET {set.id}:</strong> {set.quantity} u. · SKU {set.skus.join(", ")}
                                      {set.benefit ? (
                                        <span className="kit-chip-benefit">
                                          ({set.benefit.type === "PERCENT_OFF" ? `${set.benefit.value}% desc.` : `C$${set.benefit.value.toFixed(2)}`})
                                        </span>
                                      ) : null}
                                    </span>
                                  )) : deal.items ? deal.items.map((item) => (
                                    <span className="kit-set-chip" key={item.sku}>
                                      {item.quantity} u. · SKU {item.sku}
                                    </span>
                                  )) : null}
                                </div>
                              </div>
                              <div className="kit-deal-status">
                                {kitPreview?.pricingError ? (
                                  <span className="kit-status-error">{kitPreview.pricingError}</span>
                                ) : applied ? (
                                  <span className="kit-status-applied">✓ Aplica con la cantidad seleccionada</span>
                                ) : (
                                  <span className="kit-status-pending">Requiere completar los productos del combo</span>
                                )}
                              </div>
                            </div>
                          );
                        }
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
                            <div className="offer-title-group">
                              <span className="offer-id-label">Oferta {offerGroup.primary.id}</span>
                              <strong className="offer-promo-name">{offerGroup.primary.promotionName}</strong>
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
                            <small className="offer-deal-desc">{offerGroup.primary.deal ? dealDescription(offerGroup.primary.deal) : thresholdLabel(offerGroup.rules)}</small>
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

          {kitPreview ? (
            <div className="selected-kit-banner">
              <div className="selected-kit-banner-row">
                <span>{kitPreview.pricingError ? kitPreview.pricingError : <>Subtotal cotización: <strong>{formatCurrency(kitPreview.subtotalFinal)}</strong></>}</span>
              </div>
              <small>Incluye productos actuales y combo completo con oferta</small>
            </div>
          ) : selectedOffer?.isKit ? (() => {
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

          <Button onClick={() => onAddSelected(selected, selectedOffer)}>
            <PackagePlus size={16} />
            {kitPreview ? "Agregar SKU" : selectedOffer?.isKit
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
  );
}

export function KitItemRow({
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

export function InventoryBreakdown({ inventory }: { inventory?: ProductInventory }) {
  if (!inventory || inventory.totalQuantity <= 0) return <small className="stock-detail empty">Sin inventario disponible</small>;

  return (
    <div className="stock-breakdown">
      <span>Inventario total: {inventory.totalQuantity.toLocaleString("es-NI")}</span>
    </div>
  );
}
