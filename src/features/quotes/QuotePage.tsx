import { Download, FileCheck2, FileUp, GitCompareArrows, PackagePlus, Search, Trash2, TrendingUp, TriangleAlert, UserSearch, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type RefObject, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Button, Card, CardContent, Header } from "../../components/ui";
import { inventoryFeatureEnabled } from "../../config/features";
import { loadCatalog, sampleCatalog } from "../../services/catalog";
import { exportQuotePdf } from "../../services/pdf";
import { segments, sampleOfferRules } from "../../services/promotions";
import { buildQuote, formatCurrency } from "../../services/quote";
import { allocationLabel, allocationLines } from "../../services/dealEngine";
import { issueQuote, loadOfferRulesForSkus, loadProductsBySkus } from "../../services/supabase";
import type { AppProfile, Customer, OfferRule } from "../../types/domain";
import type { Product, QuoteItem, QuoteSummary } from "../../types/domain";
import { CustomerSearchModal } from "./CustomerSearchModal";
import { ImportQuoteModal } from "./ImportQuoteModal";
import { ProductImage } from "./ProductImage";
import { SkuSearchModal } from "./SkuSearchModal";
import "./quotes.css";

const initialItems: QuoteItem[] = [];

export function QuotePage({ profile }: { profile?: AppProfile }) {
  const [segment, setSegment] = useState("");
  const [compareSegment, setCompareSegment] = useState("");
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const [resumeSkuAfterCustomer, setResumeSkuAfterCustomer] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [catalog, setCatalog] = useState(sampleCatalog);
  const [offerRules, setOfferRules] = useState<OfferRule[]>(sampleOfferRules);
  const [loadedRulesKey, setLoadedRulesKey] = useState("");
  const [offerLoadError, setOfferLoadError] = useState("");
  const [issuingPdf, setIssuingPdf] = useState(false);
  const [downloadingDraft, setDownloadingDraft] = useState(false);
  const [quoteFeedback, setQuoteFeedback] = useState<{ tone: "success" | "warning" | "info"; message: string } | null>(null);
  const quoteScrollRef = useRef<HTMLDivElement>(null);
  const compareScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const skuList = useMemo(() => items.map((item) => item.sku.trim()).filter(Boolean).join("|"), [items]);
  const requestedRulesKey = `${skuList}|${segment}|${compareSegment}`;
  const quote = useMemo(() => {
    const result = buildQuote(items, segment, offerRules, catalog);
    if (skuList && (offerLoadError || loadedRulesKey !== requestedRulesKey)) result.pricingError = offerLoadError || "Cargando promociones para calcular el mejor precio…";
    return result;
  }, [catalog, items, offerRules, segment, skuList, offerLoadError, loadedRulesKey, requestedRulesKey]);
  const compared = useMemo(
    () => (compareSegment ? buildQuote(items, compareSegment, offerRules, catalog) : undefined),
    [catalog, compareSegment, items, offerRules],
  );
  const issueBlocker = quote.pricingError || issueBlockerMessage(customer, segment, quote.lines.length);
  const mergeCatalogProducts = useCallback((products: Product[]) => {
    if (!products.length) return;
    setCatalog((current) => {
      const grouped = new Map(current.map((product) => [product.sku, product]));
      products.forEach((product) => grouped.set(product.sku, product));
      return [...grouped.values()];
    });
  }, []);

  useEffect(() => {
    let active = true;
    loadCatalog().then((loadedCatalog) => {
      if (active) setCatalog(loadedCatalog);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const skus = skuList.split("|").filter(Boolean);
    const quoteSegments = compareSegment ? [segment, compareSegment] : [segment];
    setOfferLoadError("");

    loadOfferRulesForSkus(skus, quoteSegments).then((loadedRules) => {
      if (!active) return;
      setOfferRules(loadedRules ?? sampleOfferRules);
      setLoadedRulesKey(requestedRulesKey);
    }).catch((error) => {
      if (active) setOfferLoadError(error instanceof Error ? error.message : "No se pudieron cargar las promociones.");
    });

    return () => {
      active = false;
    };
  }, [compareSegment, segment, skuList, requestedRulesKey]);

  useEffect(() => {
    let active = true;
    const knownSkus = new Set(catalog.map((product) => product.sku));
    const missingSkus = skuList.split("|").filter(Boolean).filter((sku) => !knownSkus.has(sku));

    if (!missingSkus.length) return () => {
      active = false;
    };

    loadProductsBySkus(missingSkus).then((products) => {
      if (active) mergeCatalogProducts(products);
    });

    return () => {
      active = false;
    };
  }, [catalog, mergeCatalogProducts, skuList]);

  function updateItem(index: number, item: Partial<QuoteItem>) {
    setItems((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...item } : row)));
  }

  function selectCustomer(selectedCustomer: Customer) {
    setCustomer(selectedCustomer);
    setSegment(selectedCustomer.segment);
    if (compareSegment === selectedCustomer.segment) setCompareSegment("");
    if (resumeSkuAfterCustomer) {
      setResumeSkuAfterCustomer(false);
      setSkuModalOpen(true);
    }
  }

  function clearCustomer() {
    setCustomer(null);
    setSegment("");
    setCompareSegment("");
  }

  function syncComparisonScroll(source: "quote" | "compare", event: UIEvent<HTMLDivElement>) {
    if (!compareSegment || isSyncingScroll.current) return;
    const target = source === "quote" ? compareScrollRef.current : quoteScrollRef.current;
    if (!target) return;

    isSyncingScroll.current = true;
    target.scrollTop = event.currentTarget.scrollTop;
    window.requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  }

  async function handleGeneratePdf() {
    if (issuingPdf) return;
    if (issueBlocker) {
      setQuoteFeedback({ tone: "warning", message: issueBlocker });
      return;
    }

    setIssuingPdf(true);
    setQuoteFeedback({ tone: "info", message: "Emitiendo cotización y reservando consecutivo..." });

    const issued = await issueQuote(quote, {
      customer,
      segment,
      comparedSegment: compareSegment,
    });

    if (!issued.ok) {
      setQuoteFeedback({ tone: "warning", message: issued.message });
      setIssuingPdf(false);
      setConfirmIssueOpen(false);
      return;
    }

    try {
      const generatedBy = issued.quote.generatedByName || profile?.fullName || profile?.email || "Usuario COMASA";
      await exportQuotePdf(quote, {
        customer,
        generatedAt: issued.quote.createdAt,
        generatedBy,
        quoteCode: issued.quote.quoteCode,
        segment,
      });
      setQuoteFeedback({ tone: "success", message: `Cotización ${issued.quote.quoteCode} emitida y PDF generado.` });
    } catch (error) {
      setQuoteFeedback({
        tone: "warning",
        message: `Cotización ${issued.quote.quoteCode} emitida, pero no se pudo descargar el PDF: ${errorMessage(error)}`,
      });
    } finally {
      setIssuingPdf(false);
      setConfirmIssueOpen(false);
    }
  }

  async function handleDownloadDraftPdf() {
    if (downloadingDraft) return;
    if (!quote.lines.length || quote.pricingError) {
      setQuoteFeedback({ tone: "warning", message: "Agregue al menos un SKU antes de descargar el borrador." });
      return;
    }

    setDownloadingDraft(true);
    setQuoteFeedback({ tone: "info", message: "Generando borrador sin asignar consecutivo..." });

    try {
      await exportQuotePdf(quote, {
        customer,
        generatedBy: profile?.fullName || profile?.email || "Usuario COMASA",
        segment,
      });
      setQuoteFeedback({ tone: "success", message: "Borrador descargado. Aún no se ha emitido consecutivo." });
    } catch (error) {
      setQuoteFeedback({ tone: "warning", message: `No se pudo descargar el borrador: ${errorMessage(error)}` });
    } finally {
      setDownloadingDraft(false);
    }
  }

  return (
    <div>
      <div className="quote-page-head">
        <Header title="Cotización" subtitle="Cálculo de precio final por SKU, cantidad y segmento comercial." />
        <QuoteSummaryCard quote={quote} />
      </div>

      <Card className="form-card">
        <CardContent>
          <div className="section-head">
            <div>
              <h2>Parámetros de cotización</h2>
              <span>Seleccione cliente y gestione los productos de la cotización.</span>
            </div>
          </div>
          <div className="quote-command-bar" aria-label="Acciones de cotización">
            <div className="quote-command-group">
              <Button variant="outline" onClick={() => setCustomerModalOpen(true)}>
                <UserSearch size={16} />
                Buscar cliente
              </Button>
              {customer ? (
                <Button variant="ghost" onClick={clearCustomer}>
                  <X size={16} />
                  Limpiar
                </Button>
              ) : null}
            </div>
            <div className="quote-command-group">
              <Button variant="outline" onClick={() => setImportModalOpen(true)}>
                <FileUp size={16} />
                Importar
              </Button>
              <Button variant="outline" onClick={() => setSkuModalOpen(true)}>
                <PackagePlus size={16} />
                Agregar SKU
              </Button>
            </div>
            <div className="quote-command-group quote-document-actions">
              <Button variant="outline" onClick={handleDownloadDraftPdf} disabled={downloadingDraft || !quote.lines.length || !!quote.pricingError} title="Descargar PDF de revisión sin emitir consecutivo">
                <Download size={16} />
                {downloadingDraft ? "Generando..." : "Borrador PDF"}
              </Button>
              <Button onClick={() => setConfirmIssueOpen(true)} disabled={issuingPdf || Boolean(issueBlocker)} title={issueBlocker || "Emitir cotización y descargar PDF"}>
                <FileCheck2 size={16} />
                Emitir cotización
              </Button>
            </div>
          </div>
          {issueBlocker ? (
            <div className="quote-requirements-alert" role="status">
              <TriangleAlert size={16} />
              <span>{issueBlocker}</span>
            </div>
          ) : null}
          {quoteFeedback ? <AppFeedback tone={quoteFeedback.tone} message={quoteFeedback.message} /> : null}
          <div className="quote-parameters">
            <QuoteDataField label="ID cliente" value={customer?.customerId} placeholder="Sin cliente" />
            <QuoteDataField label="Nombre cliente" value={customer?.displayName} placeholder="Seleccione cliente" />
            <QuoteDataField label="Dirección" value={customer?.address} placeholder="Sin dirección" wide />
            <QuoteDataField label="Teléfono" value={customer?.mobile} placeholder="Sin teléfono" />
            <QuoteDataField label="ID / Cédula" value={customer?.nationalId} placeholder="Sin ID" />
            <QuoteDataField label="Segmento base" value={segment ? `Segmento ${segment}` : undefined} placeholder="Desde cliente" wide />
          </div>
        </CardContent>
      </Card>

      <div className={compareSegment ? "quote-layout comparing" : "quote-layout"}>
        <QuoteTable
          items={items}
          quote={quote}
          segment={segment}
          isComparing={Boolean(compareSegment)}
          scrollRef={quoteScrollRef}
          onScroll={(event) => syncComparisonScroll("quote", event)}
          onChange={updateItem}
          onRemove={(index) => setItems(items.filter((_, itemIndex) => itemIndex !== index))}
          onAddSku={() => setSkuModalOpen(true)}
          onImport={() => setImportModalOpen(true)}
        />

        {compareSegment ? (
          <ComparePanel
            baseQuote={quote}
            compared={compared}
            compareSegment={compareSegment}
            scrollRef={compareScrollRef}
            onScroll={(event) => syncComparisonScroll("compare", event)}
          />
        ) : null}
      </div>

      {skuModalOpen ? (
        <SkuSearchModal
          catalog={catalog}
          customer={customer}
          segment={segment}
          inventoryEnabled={inventoryFeatureEnabled}
          onCatalogProductsFound={mergeCatalogProducts}
          onClose={() => setSkuModalOpen(false)}
          onRequestSelectCustomer={() => {
            setSkuModalOpen(false);
            setResumeSkuAfterCustomer(true);
            setCustomerModalOpen(true);
          }}
          onAddItems={(newItems) => setItems((current) => [...current, ...newItems])}
        />
      ) : null}
      {importModalOpen ? (
        <ImportQuoteModal
          onClose={() => setImportModalOpen(false)}
          onReplaceItems={setItems}
          onAppendItems={(newItems) => setItems((current) => [...current, ...newItems])}
        />
      ) : null}
      {customerModalOpen ? (
        <CustomerSearchModal
          onClose={() => {
            setCustomerModalOpen(false);
            setResumeSkuAfterCustomer(false);
          }}
          onSelect={selectCustomer}
        />
      ) : null}
      {confirmIssueOpen ? (
        <IssueConfirmModal
          customer={customer}
          loading={issuingPdf}
          quote={quote}
          segment={segment}
          onClose={() => setConfirmIssueOpen(false)}
          onConfirm={handleGeneratePdf}
        />
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "error inesperado";
}

function issueBlockerMessage(customer: Customer | null, segment: string, lineCount: number) {
  const missing: string[] = [];
  if (!customer) missing.push("seleccione un cliente");
  if (!lineCount) missing.push("agregue al menos un SKU");
  return missing.length ? `Para emitir la cotización: ${missing.join(", ")}.` : "";
}

function QuoteDataField({
  label,
  value,
  placeholder,
  wide,
}: {
  label: string;
  value?: string;
  placeholder: string;
  wide?: boolean;
}) {
  const displayValue = value || placeholder;
  return (
    <div className={wide ? "quote-data-field wide" : "quote-data-field"} aria-label={`${label}: ${displayValue}`}>
      <span>{label}</span>
      <strong className={value ? "" : "muted-value"}>{displayValue}</strong>
    </div>
  );
}

function QuoteTable({
  items,
  quote,
  segment,
  isComparing,
  scrollRef,
  onScroll,
  onChange,
  onRemove,
  onAddSku,
  onImport,
}: {
  items: QuoteItem[];
  quote: QuoteSummary;
  segment: string;
  isComparing: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  onChange: (index: number, item: Partial<QuoteItem>) => void;
  onRemove: (index: number) => void;
  onAddSku: () => void;
  onImport: () => void;
}) {
  return (
    <Card className={isComparing ? "grid-card quote-card quote-card-comparing" : "grid-card quote-card"}>
      <CardContent>
        <div className="toolbar">
          <div>
            <h2>{segment ? `Segmento base ${segment}` : "Segmento base pendiente"}</h2>
            <p>Detalle con las ofertas aplicadas al cliente seleccionado.</p>
          </div>
        </div>
        <div className="table-wrap" ref={scrollRef} onScroll={onScroll}>
          <table className="quote-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Total final</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line, index) => {
                const isKit =
                  line.appliedOffer?.type === "KIT_OFFER" ||
                  line.appliedOffer?.deal?.kind === "KIT" ||
                  line.allocations?.some((a) => a.role === "bundle" || a.offers.some((o) => o.type === "KIT_OFFER" || o.deal?.kind === "KIT"));
                const kitOffer =
                  line.appliedOffer?.type === "KIT_OFFER" || line.appliedOffer?.deal?.kind === "KIT"
                    ? line.appliedOffer
                    : line.allocations?.flatMap((a) => a.offers).find((o) => o.type === "KIT_OFFER" || o.deal?.kind === "KIT");

                return (
                  <tr key={`${line.sku}-${line.itemIndex ?? index}`} className={isKit ? "quote-row-kit" : ""}>
                    <td className="product-cell">
                      <ProductImage src={line.imageUrl} alt={line.product?.description ?? "Producto no encontrado"} />
                      <div>
                        <input value={items[line.itemIndex ?? index]?.sku ?? ""} onChange={(event) => onChange(line.itemIndex ?? index, { sku: event.target.value })} placeholder="SKU" />
                        <strong>{line.product?.description ?? "Producto no encontrado"}</strong>
                        <div className="allocation-lines">
                          {quote.pricingError ? (
                            <span className="allocation-line error">Precio pendiente de calcular</span>
                          ) : line.allocations?.length ? (
                            allocationLines(line.allocations).map((text, i) => (
                              <span key={i} className="allocation-line">{text}</span>
                            ))
                          ) : (
                            <span className="allocation-line muted">Sin oferta aplicada</span>
                          )}
                        </div>
                      </div>
                    </td>
                  <td className="quantity-cell">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event) => {
                        const raw = event.target.value;
                        const parsed = parseInt(raw, 10);
                        onChange(line.itemIndex ?? index, {
                          quantity: Number.isNaN(parsed) ? 1 : Math.max(1, parsed),
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "." || event.key === "," || event.key === "e" || event.key === "E" || event.key === "-") {
                          event.preventDefault();
                        }
                      }}
                    />
                    <span className={line.savings > 0 ? "saving-note active" : "saving-note"}>
                      Ahorro {quote.pricingError ? "—" : formatCurrency(line.savings)}
                    </span>
                  </td>
                  <td>{formatCurrency(line.unitPrice)}</td>
                  <td><strong>{quote.pricingError ? "—" : formatCurrency(line.finalTotal)}</strong></td>
                  <td><button className="icon-btn danger" title="Eliminar línea" onClick={() => onRemove(line.itemIndex ?? index)}><Trash2 size={16} /></button></td>
                </tr>
              );
            })}
              {!quote.lines.length ? (
                <tr className="quote-empty-row">
                  <td colSpan={5}>
                    <div className="quote-empty-state">
                      <strong>Sin SKU agregados</strong>
                      <span>Agregue productos para calcular precios, ofertas y totales.</span>
                      <div>
                        <Button variant="outline" onClick={onImport}>
                          <FileUp size={16} />
                          Importar SKU
                        </Button>
                        <Button onClick={onAddSku}>
                          <PackagePlus size={16} />
                          Agregar SKU
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <QuoteTotals quote={quote} label={segment ? `Resumen cotización (Segmento ${segment})` : "Resumen de cotización"} />
      </CardContent>
    </Card>
  );
}

function ComparePanel({
  baseQuote,
  compared,
  compareSegment,
  scrollRef,
  onScroll,
}: {
  baseQuote: QuoteSummary;
  compared?: QuoteSummary;
  compareSegment: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
}) {
  const difference = compared ? baseQuote.totalWithTax - compared.totalWithTax : 0;
  const differenceLabel = difference >= 0 ? "Ahorro vs segmento original" : "Incremento vs segmento original";
  if (compared?.pricingError || baseQuote.pricingError) return <AppFeedback tone="warning" message={compared?.pricingError || baseQuote.pricingError || "Precio pendiente"} />;

  return (
    <Card className="compare-panel">
      <CardContent>
        <div className="section-head">
          <div>
            <h2>Comparación segmento {compareSegment}</h2>
            <span>Precio por SKU contra el segmento base.</span>
          </div>
        </div>

        {compared ? (
          <div className="compare-table-shell">
            <div className="compare-table-head">
              <span>SKU</span>
              <span>Total final</span>
            </div>
            <div className="compare-table-body" ref={scrollRef} onScroll={onScroll}>
              {baseQuote.lines.map((baseLine, index) => {
                const line = compared.lines.find((l) => l.itemIndex === baseLine.itemIndex) ?? compared.lines.find((l) => l.sku === baseLine.sku) ?? compared.lines[index];
                return (
                  <div className="compare-table-row" key={`${compareSegment}-${baseLine.sku}-${index}`}>
                    <div>
                      <strong>{line?.sku ?? baseLine.sku}</strong>
                      <div className="allocation-lines">
                        {line?.allocations?.length ? (
                          allocationLines(line.allocations).map((text, i) => (
                            <span key={i} className="allocation-line">{text}</span>
                          ))
                        ) : (
                          <span className="allocation-line muted">Sin oferta aplicada</span>
                        )}
                      </div>
                      <small>Ahorro {formatCurrency(line?.savings ?? 0)}</small>
                    </div>
                    <p>{formatCurrency(line?.finalTotal ?? 0)}</p>
                  </div>
                );
              })}
            </div>
            <QuoteTotals quote={compared} label={`Resumen segmento ${compareSegment}`} />
            <div className={difference >= 0 ? "segment-difference positive" : "segment-difference negative"}>
              <span>{differenceLabel}</span>
              <strong>{formatCurrency(Math.abs(difference))}</strong>
            </div>
          </div>
        ) : (
          <p className="empty-copy">Seleccione un segmento para comparar.</p>
        )}
      </CardContent>
    </Card>
  );
}

function QuoteTotals({ quote, label }: { quote: QuoteSummary; label: string }) {
  if (quote.pricingError) return <AppFeedback tone="warning" message={quote.pricingError} />;
  return (
    <div className="quote-totals" aria-label={label}>
      <span>{label}</span>
      <p>Subtotal final <strong>{formatCurrency(quote.subtotalFinal)}</strong></p>
      <p>IVA <strong>{formatCurrency(quote.tax)}</strong></p>
      <p className="quote-total-savings">Total ahorrado <strong>{formatCurrency(quote.savings)}</strong></p>
      <p>Total con IVA <strong>{formatCurrency(quote.totalWithTax)}</strong></p>
    </div>
  );
}

function QuoteSummaryCard({ quote }: { quote: QuoteSummary }) {
  if (quote.pricingError) return <AppFeedback tone="warning" message={quote.pricingError} />;
  return (
    <Card className="quote-summary-card">
      <CardContent className="quote-summary-content">
        <QuoteSummaryStat title="Subtotal final" value={formatCurrency(quote.subtotalFinal)} icon={Search} />
        <QuoteSummaryStat title="Total ahorrado" value={formatCurrency(quote.savings)} icon={TrendingUp} highlight={quote.savings > 0} />
        <QuoteSummaryStat title="Líneas" value={String(quote.lines.length)} icon={FileUp} />
      </CardContent>
    </Card>
  );
}

function QuoteSummaryStat({
  highlight,
  icon: Icon,
  title,
  value,
}: {
  highlight?: boolean;
  icon: LucideIcon;
  title: string;
  value: string;
}) {
  return (
    <div className={`quote-summary-stat${highlight ? " highlight-success" : ""}`}>
      <Icon size={16} />
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IssueConfirmModal({
  customer,
  loading,
  quote,
  segment,
  onClose,
  onConfirm,
}: {
  customer: Customer | null;
  loading: boolean;
  quote: QuoteSummary;
  segment: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar emisión">
      <section className="issue-confirm-modal">
        <header className="modal-head">
          <div>
            <h2>Emitir cotización</h2>
            <span>Esta acción asigna consecutivo y descarga el PDF oficial.</span>
          </div>
          <button className="icon-btn" title="Cerrar" onClick={onClose} disabled={loading}>
            <X size={17} />
          </button>
        </header>
        <div className="issue-confirm-body">
          <div className="issue-confirm-summary">
            <span>Cliente</span>
            <strong>{customer?.displayName ?? "Sin cliente"}</strong>
            <span>Segmento</span>
            <strong>{segment || "-"}</strong>
            <span>Líneas</span>
            <strong>{quote.lines.length}</strong>
            <span>Total ahorrado</span>
            <strong style={{ color: "var(--color-success-text)" }}>{formatCurrency(quote.savings)}</strong>
            <span>Total con IVA</span>
            <strong>{formatCurrency(quote.totalWithTax)}</strong>
          </div>
          <p>Revise que el cliente, segmento y productos sean correctos antes de emitir.</p>
          <div className="modal-actions split">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button onClick={onConfirm} disabled={loading}>
              <FileCheck2 size={16} />
              {loading ? "Emitiendo..." : "Confirmar emisión"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
