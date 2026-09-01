import { PackagePlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Badge } from "../../components/ui";
import { productImageUrl, searchProducts } from "../../services/catalog";
import { availableOfferGroups, estimateLineTotal, sampleOfferRules } from "../../services/promotions";
import type { AvailableOfferGroup } from "../../services/promotions";
import { formatCurrency } from "../../services/quote";
import { loadOfferRulesForSkus } from "../../services/supabase";
import type { Product, QuoteItem, OfferRule } from "../../types/domain";
import { ProductImage } from "./ProductImage";

type Props = {
  catalog: Product[];
  segment: string;
  onClose: () => void;
  onAddItems: (items: QuoteItem[]) => void;
};

export function SkuSearchModal({ catalog, segment, onClose, onAddItems }: Props) {
  const [term, setTerm] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedOfferKey, setSelectedOfferKey] = useState("");
  const [addedMessage, setAddedMessage] = useState("");
  const [offerRules, setOfferRules] = useState<OfferRule[]>(sampleOfferRules);
  const results = useMemo(() => searchProducts(catalog, term).slice(0, 12), [catalog, term]);
  const [selectedSku, setSelectedSku] = useState(results[0]?.sku ?? "");
  const selected = results.find((product) => product.sku === selectedSku) ?? results[0];
  const offerGroups = selected ? availableOfferGroups(offerRules, selected.sku, segment) : [];
  const selectedOffer = offerGroups.find((group) => group.key === selectedOfferKey) ?? offerGroups[0];

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
                          <p>{applies ? formatCurrency(estimateLineTotal(selected.listPrice, quantity, offerGroup.primary)) : "Umbral pendiente"}</p>
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

function thresholdLabel(offers: OfferRule[]) {
  const minQuantity = Math.max(...offers.map((offer) => offer.minQuantity ?? 0));
  return minQuantity > 0 ? `Desde ${minQuantity} unidades` : "Sin minimo";
}

function benefitLabel(offer: OfferRule) {
  if (offer.fixedPrice) return `Precio ${formatCurrency(offer.fixedPrice)}`;
  if (offer.discountPercent) return `${offer.discountPercent}% descuento`;
  return offer.discountType ?? "Beneficio configurado";
}
