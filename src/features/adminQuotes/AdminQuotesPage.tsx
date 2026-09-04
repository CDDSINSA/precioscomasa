import { Banknote, PackageSearch, ReceiptText, RefreshCw, Search, TrendingUp } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Badge, Button, Card, CardContent, Header, Metric } from "../../components/ui";
import { formatCurrency } from "../../services/quote";
import {
  searchIssuedQuotes,
  type AdminQuoteSearchField,
  type AdminQuoteSearchFilters,
} from "../../services/supabase";
import type { AdminQuote } from "../../types/domain";
import "./adminQuotes.css";

type FilterState = {
  field: AdminQuoteSearchField;
  query: string;
  dateFrom: string;
  dateTo: string;
};

const emptyFilters: FilterState = {
  field: "all",
  query: "",
  dateFrom: "",
  dateTo: "",
};

export function AdminQuotesPage() {
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();

  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId) ?? quotes[0];
  const metrics = useMemo(() => buildQuoteMetrics(quotes), [quotes]);

  useEffect(() => {
    loadQuotes(emptyFilters);
  }, []);

  async function loadQuotes(nextFilters = filters) {
    setLoading(true);
    const result = await searchIssuedQuotes(toSearchFilters(nextFilters));
    setLoading(false);

    if (!result.ok) {
      setMessage(result.message);
      setQuotes([]);
      setSelectedQuoteId("");
      return;
    }

    setQuotes(result.quotes);
    setSelectedQuoteId((current) =>
      result.quotes.some((quote) => quote.id === current) ? current : result.quotes[0]?.id ?? "",
    );
    setMessage(
      result.quotes.length
        ? `${result.quotes.length} cotizaciones encontradas.`
        : "No se encontraron cotizaciones con esos filtros.",
    );
  }

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function search(event: FormEvent) {
    event.preventDefault();
    loadQuotes();
  }

  function clearFilters() {
    setFilters(emptyFilters);
    loadQuotes(emptyFilters);
  }

  return (
    <div className="admin-quotes-page">
      <Header title="Gestión de cotizaciones" subtitle="Consulta administrativa de cotizaciones emitidas." />

      {message ? <AppFeedback tone={message.includes("No se") ? "warning" : "info"} message={message} /> : null}

      <Card className="quote-query-card">
        <CardContent>
          <form className="quote-query-form" onSubmit={search}>
            <label className="filter-field quote-query-text">
              <span>Búsqueda</span>
              <input
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
                placeholder="ID, cliente, usuario o segmento"
              />
            </label>
            <label className="filter-field">
              <span>Buscar en</span>
              <select value={filters.field} onChange={(event) => updateFilter("field", event.target.value as AdminQuoteSearchField)}>
                <option value="all">Todo</option>
                <option value="quote">ID cotización</option>
                <option value="customer">Cliente</option>
                <option value="user">Usuario</option>
                <option value="segment">Segmento</option>
              </select>
            </label>
            <label className="filter-field compact">
              <span>Desde</span>
              <input type="date" value={filters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} />
            </label>
            <label className="filter-field compact">
              <span>Hasta</span>
              <input type="date" value={filters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} />
            </label>
            <div className="quote-query-actions">
              <Button type="submit" disabled={loading}>
                <Search size={16} />
                {loading ? "Buscando" : "Buscar"}
              </Button>
              <Button type="button" variant="outline" onClick={clearFilters} disabled={loading}>
                <RefreshCw size={16} />
                Limpiar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="metrics quote-admin-metrics">
        <Metric title="Cotizaciones" value={metrics.quoteCount.toLocaleString("es-NI")} icon={ReceiptText} />
        <Metric title="Total vendido" value={formatCompactCurrency(metrics.totalWithTax)} icon={Banknote} />
        <Metric title="Ahorro" value={formatCompactCurrency(metrics.savings)} icon={TrendingUp} />
        <Metric title="SKU" value={metrics.lineCount.toLocaleString("es-NI")} icon={PackageSearch} />
      </div>

      <div className="quote-admin-layout">
        <Card className="grid-card quote-admin-results">
          <CardContent>
            <div className="toolbar">
              <div>
                <h2>Resultados</h2>
                <p>{loading ? "Cargando cotizaciones..." : "Seleccione una fila para ver el detalle."}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="quote-admin-table">
                <thead>
                  <tr>
                    <th>Cotización</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Segmento</th>
                    <th>Usuario</th>
                    <th>Total</th>
                    <th>Líneas</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote) => (
                    <tr
                      className={quote.id === selectedQuote?.id ? "selected" : ""}
                      key={quote.id}
                      onClick={() => setSelectedQuoteId(quote.id)}
                    >
                      <td>
                        <strong>{quote.quoteCode ?? quote.id.slice(0, 8)}</strong>
                        <span>{quote.quoteNumber ? `No. ${quote.quoteNumber}` : quote.id}</span>
                      </td>
                      <td>{formatDateTime(quote.createdAt)}</td>
                      <td>
                        <strong>{quote.customerName ?? "Sin cliente"}</strong>
                        <span>{quote.customerId ?? "-"}</span>
                      </td>
                      <td>
                        <Badge tone="info">{quote.originalSegment || "-"}</Badge>
                      </td>
                      <td>
                        <strong>{quote.generatedByName ?? "Usuario"}</strong>
                        <span>{quote.generatedByEmail ?? "-"}</span>
                      </td>
                      <td>{formatCurrency(quote.totalWithTax)}</td>
                      <td>{quote.lines.length}</td>
                    </tr>
                  ))}
                  {!quotes.length ? (
                    <tr>
                      <td colSpan={7}>{loading ? "Cargando cotizaciones..." : "No hay cotizaciones para mostrar."}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <QuoteDetailPanel quote={selectedQuote} />
      </div>
    </div>
  );
}

function QuoteDetailPanel({ quote }: { quote?: AdminQuote }) {
  if (!quote) {
    return (
      <Card className="quote-admin-detail">
        <CardContent>
          <p className="empty-copy">Seleccione una cotización para revisar sus líneas.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="quote-admin-detail">
      <CardContent>
        <div className="section-head">
          <div>
            <h2>{quote.quoteCode ?? "Cotización"}</h2>
            <span>{formatDateTime(quote.createdAt)}</span>
          </div>
          <Badge tone={quote.savings > 0 ? "success" : "neutral"}>{quote.lines.length} líneas</Badge>
        </div>

        <div className="quote-detail-grid">
          <DetailItem label="Cliente" value={quote.customerName ?? "Sin cliente"} helper={quote.customerId} />
          <DetailItem label="Usuario" value={quote.generatedByName ?? "Usuario"} helper={quote.generatedByEmail} />
          <DetailItem label="Segmento" value={quote.originalSegment || "-"} helper={quote.comparedSegment ? `Comparado ${quote.comparedSegment}` : undefined} />
          <DetailItem label="Total con IVA" value={formatCurrency(quote.totalWithTax)} strong />
        </div>

        <div className="quote-detail-totals">
          <span>Subtotal lista <strong>{formatCurrency(quote.subtotalList)}</strong></span>
          <span>Subtotal final <strong>{formatCurrency(quote.subtotalFinal)}</strong></span>
          <span>IVA <strong>{formatCurrency(quote.tax)}</strong></span>
          <span>Ahorro <strong>{formatCurrency(quote.savings)}</strong></span>
        </div>

        <div className="quote-lines-list">
          {quote.lines.map((line) => (
            <div className="quote-line-row" key={`${quote.id}-${line.lineNumber}-${line.sku}`}>
              <div>
                <strong>{line.sku}</strong>
                <span>{line.productDescription ?? "Producto sin descripción guardada"}</span>
                <small>{line.appliedOfferId ? `${line.appliedOfferId} · ${line.appliedPromotionName ?? "Promoción"}` : "Sin oferta aplicada"}</small>
              </div>
              <p>{line.quantity.toLocaleString("es-NI")} un.</p>
              <p>{formatCurrency(line.finalTotal)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailItem({
  helper,
  label,
  strong,
  value,
}: {
  helper?: string;
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className={strong ? "detail-item strong" : "detail-item"}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <small>{helper}</small> : null}
    </div>
  );
}

function toSearchFilters(filters: FilterState): AdminQuoteSearchFilters {
  return {
    field: filters.field,
    query: filters.query,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    limit: 100,
  };
}

function buildQuoteMetrics(quotes: AdminQuote[]) {
  return quotes.reduce(
    (metrics, quote) => ({
      quoteCount: metrics.quoteCount + 1,
      totalWithTax: metrics.totalWithTax + quote.totalWithTax,
      savings: metrics.savings + quote.savings,
      lineCount: metrics.lineCount + quote.lines.length,
    }),
    { quoteCount: 0, totalWithTax: 0, savings: 0, lineCount: 0 },
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1000000 ? "compact" : "standard",
  }).format(value);
}
