import { Download, FileUp, GitCompareArrows, PackagePlus, ReceiptText, Search, Trash2, UserSearch, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent, Header, Metric } from "../../components/ui";
import { loadCatalog, sampleCatalog } from "../../services/catalog";
import { parseQuoteFile } from "../../services/importers";
import { exportQuotePdf } from "../../services/pdf";
import { segments, sampleOfferRules } from "../../services/promotions";
import { buildQuote, formatCurrency } from "../../services/quote";
import { loadOfferRulesForSkus } from "../../services/supabase";
import type { Customer, OfferRule } from "../../types/domain";
import type { QuoteItem, QuoteSummary } from "../../types/domain";
import { CustomerSearchModal } from "./CustomerSearchModal";
import { ProductImage } from "./ProductImage";
import { SkuSearchModal } from "./SkuSearchModal";
import "./quotes.css";

const initialItems: QuoteItem[] = [
  { sku: "100634895", quantity: 8 },
  { sku: "152281753", quantity: 1 },
  { sku: "140862737", quantity: 2 },
];

export function QuotePage() {
  const [segment, setSegment] = useState("");
  const [compareSegment, setCompareSegment] = useState("");
  const [items, setItems] = useState<QuoteItem[]>(initialItems);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [catalog, setCatalog] = useState(sampleCatalog);
  const [offerRules, setOfferRules] = useState<OfferRule[]>(sampleOfferRules);
  const skuList = useMemo(() => items.map((item) => item.sku.trim()).filter(Boolean).join("|"), [items]);
  const quote = useMemo(() => buildQuote(items, segment, offerRules, catalog), [catalog, items, offerRules, segment]);
  const compared = useMemo(
    () => (compareSegment ? buildQuote(items, compareSegment, offerRules, catalog) : undefined),
    [catalog, compareSegment, items, offerRules],
  );

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

    loadOfferRulesForSkus(skus, quoteSegments).then((loadedRules) => {
      if (!active || loadedRules === null) return;
      setOfferRules(loadedRules);
    });

    return () => {
      active = false;
    };
  }, [compareSegment, segment, skuList]);

  function updateItem(index: number, item: Partial<QuoteItem>) {
    setItems((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...item } : row)));
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setItems(await parseQuoteFile(file));
  }

  function selectCustomer(selectedCustomer: Customer) {
    setCustomer(selectedCustomer);
    setSegment(selectedCustomer.segment);
    if (compareSegment === selectedCustomer.segment) setCompareSegment("");
  }

  function clearCustomer() {
    setCustomer(null);
    setSegment("");
    setCompareSegment("");
  }

  return (
    <div>
      <Header title="Cotizacion" subtitle="Calculo de precio final por SKU, cantidad y segmento comercial." />

      <div className="metrics">
        <Metric title="Subtotal lista" value={formatCurrency(quote.subtotalList)} icon={ReceiptText} />
        <Metric title="Subtotal final" value={formatCurrency(quote.subtotalFinal)} icon={Search} />
        <Metric title="Ahorro" value={formatCurrency(quote.savings)} icon={GitCompareArrows} />
        <Metric title="Lineas" value={String(quote.lines.length)} icon={FileUp} />
      </div>

      <Card className="form-card">
        <CardContent>
          <div className="section-head">
            <div>
              <h2>Parametros de cotizacion</h2>
              <span>Seleccione cliente y compare contra otro segmento cuando sea necesario.</span>
            </div>
            <div className="toolbar-actions">
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
              <label className="btn btn-outline file-btn">
                <FileUp size={16} />
                Importar
                <input type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => handleFile(event.target.files?.[0])} />
              </label>
              <Button variant="outline" onClick={() => setSkuModalOpen(true)}>
                <PackagePlus size={16} />
                Agregar SKU
              </Button>
              <Button onClick={() => exportQuotePdf(quote, segment)}>
                <Download size={16} />
                PDF
              </Button>
            </div>
          </div>
          <div className="quote-parameters">
            <ReadOnlyField label="ID cliente" value={customer?.customerId} placeholder="Sin cliente" />
            <ReadOnlyField label="Nombre cliente" value={customer?.displayName} placeholder="Seleccione cliente" />
            <ReadOnlyField label="Direccion" value={customer?.address} placeholder="Sin direccion" wide />
            <ReadOnlyField label="Telefono" value={customer?.mobile} placeholder="Sin telefono" />
            <ReadOnlyField label="ID / Cedula" value={customer?.nationalId} placeholder="Sin ID" />
            <ReadOnlyField label="Segmento base" value={segment ? `Segmento ${segment}` : undefined} placeholder="Desde cliente" />
            <label className="filter-field">
              <span>Segmento a comparar</span>
              <select value={compareSegment} onChange={(event) => setCompareSegment(event.target.value)}>
                <option value="">Sin comparar</option>
                {segments.filter((item) => item.id.trim() !== "-" && item.id !== segment).map((item) => (
                  <option value={item.id} key={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className={compareSegment ? "quote-layout comparing" : "quote-layout"}>
        <QuoteTable
          items={items}
          quote={quote}
          segment={segment}
          onChange={updateItem}
          onRemove={(index) => setItems(items.filter((_, itemIndex) => itemIndex !== index))}
        />

        {compareSegment ? (
          <ComparePanel
            baseQuote={quote}
            compared={compared}
            compareSegment={compareSegment}
          />
        ) : null}
      </div>

      {skuModalOpen ? (
        <SkuSearchModal
          catalog={catalog}
          segment={segment}
          onClose={() => setSkuModalOpen(false)}
          onAddItems={(newItems) => setItems((current) => [...current, ...newItems])}
        />
      ) : null}
      {customerModalOpen ? <CustomerSearchModal onClose={() => setCustomerModalOpen(false)} onSelect={selectCustomer} /> : null}
    </div>
  );
}

function ReadOnlyField({
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
  return (
    <label className={wide ? "quote-field wide" : "quote-field"}>
      <span>{label}</span>
      <input readOnly value={value || placeholder} className={value ? "" : "muted-input"} />
    </label>
  );
}

function QuoteTable({
  items,
  quote,
  segment,
  onChange,
  onRemove,
}: {
  items: QuoteItem[];
  quote: QuoteSummary;
  segment: string;
  onChange: (index: number, item: Partial<QuoteItem>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Card className="grid-card quote-card">
      <CardContent>
        <div className="toolbar">
          <div>
            <h2>{segment ? `Segmento base ${segment}` : "Segmento base pendiente"}</h2>
            <p>Detalle con las ofertas aplicadas al cliente seleccionado.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="quote-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio lista</th>
                <th>Total final</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line, index) => (
                <tr key={`${line.sku}-${index}`}>
                  <td className="product-cell">
                    <ProductImage src={line.imageUrl} alt={line.product?.description ?? "Producto no encontrado"} />
                    <div>
                      <input value={items[index]?.sku ?? ""} onChange={(event) => onChange(index, { sku: event.target.value })} placeholder="SKU" />
                      <strong>{line.product?.description ?? "Producto no encontrado"}</strong>
                      <span>{line.appliedOffer ? `${line.appliedOffer.id} · ${line.appliedOffer.promotionName}` : "Sin oferta aplicada"}</span>
                    </div>
                  </td>
                  <td className="quantity-cell">
                    <input type="number" min="1" value={line.quantity} onChange={(event) => onChange(index, { quantity: Number(event.target.value) })} />
                    <span className={line.savings > 0 ? "saving-note active" : "saving-note"}>
                      Ahorro {formatCurrency(line.savings)}
                    </span>
                  </td>
                  <td>{formatCurrency(line.unitPrice)}</td>
                  <td><strong>{formatCurrency(line.finalTotal)}</strong></td>
                  <td><button className="icon-btn" title="Eliminar linea" onClick={() => onRemove(index)}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <QuoteTotals quote={quote} label="Resumen segmento original" />
      </CardContent>
    </Card>
  );
}

function ComparePanel({
  baseQuote,
  compared,
  compareSegment,
}: {
  baseQuote: QuoteSummary;
  compared?: QuoteSummary;
  compareSegment: string;
}) {
  const difference = compared ? baseQuote.totalWithTax - compared.totalWithTax : 0;
  const differenceLabel = difference >= 0 ? "Ahorro vs segmento original" : "Incremento vs segmento original";

  return (
    <Card className="compare-panel">
      <CardContent>
        <div className="section-head">
          <div>
            <h2>Comparacion segmento {compareSegment}</h2>
            <span>Precio por SKU contra el segmento base.</span>
          </div>
        </div>

        {compared ? (
          <>
            <div className="compare-lines">
              {compared.lines.map((line) => (
                <div className="compare-line" key={`${compareSegment}-${line.sku}`}>
                  <div>
                    <strong>{line.sku}</strong>
                    <span>{line.appliedOffer ? line.appliedOffer.promotionName : "Sin oferta aplicada"}</span>
                  </div>
                  <p>{formatCurrency(line.finalTotal)}</p>
                  <small>Ahorro {formatCurrency(line.savings)}</small>
                </div>
              ))}
            </div>
            <QuoteTotals quote={compared} label={`Resumen segmento ${compareSegment}`} />
            <div className={difference >= 0 ? "segment-difference positive" : "segment-difference negative"}>
              <span>{differenceLabel}</span>
              <strong>{formatCurrency(Math.abs(difference))}</strong>
            </div>
          </>
        ) : (
          <p className="empty-copy">Seleccione un segmento para comparar.</p>
        )}
      </CardContent>
    </Card>
  );
}

function QuoteTotals({ quote, label }: { quote: QuoteSummary; label: string }) {
  return (
    <div className="quote-totals" aria-label={label}>
      <span>{label}</span>
      <p>Subtotal <strong>{formatCurrency(quote.subtotalFinal)}</strong></p>
      <p>IVA <strong>{formatCurrency(quote.tax)}</strong></p>
      <p>Total con IVA <strong>{formatCurrency(quote.totalWithTax)}</strong></p>
    </div>
  );
}
