import { FileCheck2, FileUp, PackagePlus, Search, Trash2, TrendingUp, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RefObject, UIEvent } from "react";
import { AppFeedback } from "../../../components/AppFeedback";
import { Button, Card, CardContent } from "../../../components/ui";
import { allocationLines } from "../../../services/dealEngine";
import { formatCurrency } from "../../../services/quote";
import type { Customer, QuoteItem, QuoteSummary } from "../../../types/domain";
import { ProductImage } from "../ProductImage";

export function QuoteTable({
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

export function ComparePanel({
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

export function QuoteTotals({ quote, label }: { quote: QuoteSummary; label: string }) {
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

export function QuoteSummaryCard({ quote }: { quote: QuoteSummary }) {
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

export function QuoteSummaryStat({
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

export function IssueConfirmModal({
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
