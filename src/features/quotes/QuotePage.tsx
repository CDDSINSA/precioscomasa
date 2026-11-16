import { Download, FileCheck2, FileUp, PackagePlus, TriangleAlert } from "lucide-react";
import { type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Button, Card, CardContent, Header } from "../../components/ui";
import { inventoryFeatureEnabled } from "../../config/features";
import { canIssueQuotes } from "../../constants/permissions";
import { CUSTOMER_SEGMENTS } from "../../services/customerSegments.mjs";
import { PEINSA_SUPPLIER_ID, isSupplierRestrictedRole } from "../../constants/suppliers";
import { loadCatalog, sampleCatalog } from "../../services/catalog";
import { exportQuotePdf } from "../../services/pdf";
import { sampleOfferRules } from "../../services/promotions";
import { buildQuote } from "../../services/quote";
import { issueQuote, loadOfferRulesForSkus, loadProductsBySkus } from "../../services/supabase";
import type { AppProfile, Customer, OfferRule, Product, QuoteItem } from "../../types/domain";
import { CustomerCard } from "./CustomerCard";
import { CustomerSearchModal } from "./CustomerSearchModal";
import { ImportQuoteModal } from "./ImportQuoteModal";
import { SkuSearchModal } from "./SkuSearchModal";
import {
  ComparePanel,
  IssueConfirmModal,
  QuoteSummaryCard,
  QuoteTable,
} from "./components/QuoteWorkspacePanels";
import "./quotes.css";

const initialItems: QuoteItem[] = [];

export function QuotePage({ profile }: { profile?: AppProfile }) {
  // Rol "oper": solo consulta. Sin clientes, sin emitir y sin PDF; el segmento se elige directamente.
  const readOnly = !canIssueQuotes(profile?.role);
  const [segment, setSegment] = useState("");
  const [compareSegment, setCompareSegment] = useState("");
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [confirmIssueOpen, setConfirmIssueOpen] = useState(false);
  const [resumeSkuAfterCustomer, setResumeSkuAfterCustomer] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [catalog, setCatalog] = useState<Product[]>(() => profile?.role === "asesor-peinsa" ? [] : sampleCatalog);
  const [offerRules, setOfferRules] = useState<OfferRule[]>(sampleOfferRules);
  const [loadedRulesKey, setLoadedRulesKey] = useState("");
  const [offerLoadError, setOfferLoadError] = useState("");
  const [issuingPdf, setIssuingPdf] = useState(false);
  const [downloadingDraft, setDownloadingDraft] = useState(false);
  const [restrictedSkus, setRestrictedSkus] = useState<Set<string>>(new Set());
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
  const blockedSkus = items.map((item) => item.sku.trim()).filter((sku) => sku && restrictedSkus.has(sku));
  const restrictedMessage = blockedSkus.length
    ? `Los SKU ${[...new Set(blockedSkus)].join(", ")} no están disponibles para su perfil (solo proveedor PEINSA ${PEINSA_SUPPLIER_ID}). Elimínelos para continuar.`
    : "";
  const issueBlocker = restrictedMessage || quote.pricingError || issueBlockerMessage(customer, segment, quote.lines.length);
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
    loadCatalog(profile?.role).then((loadedCatalog) => {
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
    const missingSkus = skuList.split("|").filter(Boolean).filter((sku) => !knownSkus.has(sku) && !restrictedSkus.has(sku));

    if (!missingSkus.length) return () => {
      active = false;
    };

    loadProductsBySkus(missingSkus, profile?.role).then((products) => {
      if (!active) return;
      mergeCatalogProducts(products);
      if (isSupplierRestrictedRole(profile?.role)) {
        // SKU importados/pegados que no son de PEINSA: RLS no los devuelve.
        const found = new Set(products.map((product) => product.sku));
        const notAllowed = missingSkus.filter((sku) => !found.has(sku));
        if (notAllowed.length) {
          setRestrictedSkus((current) => new Set([...current, ...notAllowed]));
        }
      }
    });

    return () => {
      active = false;
    };
  }, [catalog, mergeCatalogProducts, profile?.role, restrictedSkus, skuList]);

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
    if (readOnly || issuingPdf) return;
    if (issueBlocker) {
      setQuoteFeedback({ tone: "warning", message: issueBlocker });
      return;
    }

    setIssuingPdf(true);
    setQuoteFeedback({ tone: "info", message: "Emitiendo cotización y reservando consecutivo..." });

    // Una oferta puede haberse editado mientras el asesor tenía abierta la cotización.
    try {
      const refreshed = await loadOfferRulesForSkus(items.map(item => item.sku.trim()).filter(Boolean), compareSegment ? [segment, compareSegment] : [segment]);
      if (!refreshed) throw new Error("No se pudieron verificar las ofertas vigentes.");
      const current = buildQuote(items, segment, refreshed, catalog);
      if (current.pricingError) throw new Error(current.pricingError);
      if (JSON.stringify(current) !== JSON.stringify(quote)) {
        setOfferRules(refreshed);
        setLoadedRulesKey(requestedRulesKey);
        setOfferLoadError("");
        setQuoteFeedback({ tone: "warning", message: "Las ofertas cambiaron. Se recalculó la cotización; revise los precios y vuelva a emitir." });
        setIssuingPdf(false);
        setConfirmIssueOpen(false);
        return;
      }
    } catch (error) {
      setQuoteFeedback({ tone: "warning", message: errorMessage(error) });
      setIssuingPdf(false);
      setConfirmIssueOpen(false);
      return;
    }

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
    if (readOnly || downloadingDraft) return;
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
              <span>{readOnly ? "Seleccione el segmento comercial y consulte precios por producto." : "Seleccione cliente y gestione los productos de la cotización."}</span>
            </div>
          </div>
          {readOnly ? (
            <label className="quote-segment-select">
              <span>Segmento comercial</span>
              <select
                value={segment}
                onChange={(event) => {
                  setSegment(event.target.value);
                  if (compareSegment === event.target.value) setCompareSegment("");
                }}
              >
                <option value="">Sin segmento (precio de lista)</option>
                {CUSTOMER_SEGMENTS.map((value) => (
                  <option key={value} value={value}>Segmento {value}</option>
                ))}
              </select>
            </label>
          ) : (
            <CustomerCard customer={customer} onChange={() => setCustomerModalOpen(true)} onClear={clearCustomer} />
          )}
          <div className="quote-command-bar" aria-label="Acciones de cotización">
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
            {readOnly ? null : (
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
            )}
          </div>
          {readOnly ? (
            restrictedMessage || quote.pricingError ? (
              <div className="quote-requirements-alert" role="status">
                <TriangleAlert size={16} />
                <span>{restrictedMessage || quote.pricingError}</span>
              </div>
            ) : null
          ) : issueBlocker ? (
            <div className="quote-requirements-alert" role="status">
              <TriangleAlert size={16} />
              <span>{issueBlocker}</span>
            </div>
          ) : null}
          {quoteFeedback ? <AppFeedback tone={quoteFeedback.tone} message={quoteFeedback.message} /> : null}
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
          role={profile?.role}
          currentItems={items.map((item) => ({ ...item, sku: item.sku.trim() })).filter((item) => item.sku)}
          inventoryEnabled={inventoryFeatureEnabled}
          onCatalogProductsFound={mergeCatalogProducts}
          onClose={() => setSkuModalOpen(false)}
          onRequestSelectCustomer={readOnly ? undefined : () => {
            setSkuModalOpen(false);
            setResumeSkuAfterCustomer(true);
            setCustomerModalOpen(true);
          }}
          onAddItems={(newItems) => setItems((current) => [...current, ...newItems.map((i) => ({ ...i, sku: i.sku.trim() }))])}
        />
      ) : null}
      {importModalOpen ? (
        <ImportQuoteModal
          onClose={() => setImportModalOpen(false)}
          onReplaceItems={setItems}
          onAppendItems={(newItems) => setItems((current) => [...current, ...newItems])}
        />
      ) : null}
      {customerModalOpen && !readOnly ? (
        <CustomerSearchModal
          onClose={() => {
            setCustomerModalOpen(false);
            setResumeSkuAfterCustomer(false);
          }}
          onSelect={selectCustomer}
        />
      ) : null}
      {confirmIssueOpen && !readOnly ? (
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
