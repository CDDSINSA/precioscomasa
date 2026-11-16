import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Filter, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button } from "../../../components/ui";
import { isPendingKit } from "../../../services/dealConfig";
import { readOfferDetails } from "../../../services/offerConfigurationStore";
import {
  supabase,
  type OfferConfigurationFilters,
  type OfferConfigurationMetrics,
  type OfferConfigurationRow,
} from "../../../services/supabase";
import type { ThresholdType } from "../../../types/domain";
import { DealEditor } from "../DealEditor";
import { DeleteOfferModal } from "../DeleteOfferButton";
import { OfferConfigurationImport, downloadConfigurationTemplate } from "../OfferConfigurationImport";
import { OfferSetEditor } from "../OfferSetEditor";
import { SimpleOfferEditor } from "../SimpleOfferEditor";
import { EmptyRow, LoadPanel, PreviewFrame } from "./AdminLoadPrimitives";

export function OfferConfigurationPanel({
  filters,
  loading,
  metrics,
  metricsLoading,
  metricsError,
  rows,
  savingKey,
  onFilterChange,
  onSearch,
  onClear,
  onSaved,
  onStackingChange,
  onThresholdChange,
  onThresholdSave,
}: {
  filters: OfferConfigurationFilters;
  loading: boolean;
  metrics: OfferConfigurationMetrics | null;
  metricsLoading: boolean;
  metricsError: string;
  rows: OfferConfigurationRow[];
  savingKey: string;
  onFilterChange: (key: keyof OfferConfigurationFilters, value: any) => void;
  onSearch: () => void;
  onClear?: () => void;
  onSaved: () => void;
  onStackingChange: (row: OfferConfigurationRow, allowStacking: boolean) => void;
  onThresholdChange: (ruleId: string, patch: Partial<OfferConfigurationRow>) => void;
  onThresholdSave: (row: OfferConfigurationRow) => void;
}) {
  const [editing, setEditing] = useState<OfferConfigurationRow | null>(null);
  const [editingOffer, setEditingOffer] = useState<string | null>(null);
  const [editingSimple, setEditingSimple] = useState<OfferConfigurationRow | null>(null);
  const [deletingOffer, setDeletingOffer] = useState<OfferConfigurationRow | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [clientFilter, setClientFilter] = useState("");
  const pendingMetric = metricsLoading ? "…" : "—";

  useEffect(() => {
    setPage(0);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = clientFilter.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      row.offerId.toLowerCase().includes(term) ||
      row.sku.toLowerCase().includes(term) ||
      row.promotionId.toLowerCase().includes(term) ||
      row.promotionName.toLowerCase().includes(term) ||
      row.segment.toLowerCase().includes(term)
    );
  }, [rows, clientFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const paginatedRows = useMemo(() => {
    return filteredRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  }, [filteredRows, currentPage, pageSize]);

  return (
    <LoadPanel
      className="offer-load-panel"
      title="Configuración de ofertas"
      subtitle="Configure condiciones y SET, edite beneficios y productos, o elimine ofertas vigentes."
      actions={
        <div className="offer-toolbar-actions">
          <div className="offer-search-inputs">
            <label className="filter-field compact">
              <span>ID promo</span>
              <input
                value={filters.promotionId ?? ""}
                onChange={(event) => onFilterChange("promotionId", event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }}
                placeholder="Ej. 1821"
              />
            </label>
            <label className="filter-field compact">
              <span>ID oferta</span>
              <input
                value={filters.offerId ?? ""}
                onChange={(event) => onFilterChange("offerId", event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }}
                placeholder="Ej. 62010"
              />
            </label>
            <label className="filter-field compact">
              <span>SKU</span>
              <input
                value={filters.sku ?? ""}
                onChange={(event) => onFilterChange("sku", event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }}
                placeholder="Código exacto"
              />
            </label>
            <label className="filter-field compact">
              <span>Límite</span>
              <select
                value={filters.limit ?? 100}
                onChange={(event) => onFilterChange("limit", Number(event.target.value) || undefined)}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={0}>Todos</option>
              </select>
            </label>
            <Button onClick={onSearch} disabled={loading}>
              <Search size={16} />
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            {onClear ? (
              <Button variant="outline" onClick={onClear} disabled={loading} title="Restablecer filtros">
                <RefreshCw size={14} />
                Limpiar
              </Button>
            ) : null}
          </div>
          <Button
            variant="outline"
            disabled={loading || !rows.length}
            onClick={async () => {
              if (!supabase) return;
              try {
                const details = await readOfferDetails(supabase, rows.map((row) => row.offerId));
                await downloadConfigurationTemplate(details ?? []);
                setExportMessage(details?.length ? "Plantilla de condiciones guardadas descargada." : "Sin condiciones globales guardadas; se descargó una plantilla vacía.");
              } catch (error) {
                setExportMessage(error instanceof Error ? error.message : "No se pudo exportar.");
              }
            }}
          >
            <Download size={16} />
            Exportar condiciones guardadas
          </Button>
        </div>
      }
      summary={[
        ["Ofertas", metrics?.offers ?? pendingMetric],
        ["Oferta-SKU", metrics?.offerSkus ?? pendingMetric],
        ["Combinables", metrics?.combinable ?? pendingMetric],
      ]}
    >
      {metricsError ? <div className="offer-export-message" role="status">{metricsError}</div> : null}
      <OfferConfigurationImport onSaved={onSaved} />
      {exportMessage ? <div className="offer-export-message" role="status">{exportMessage}</div> : null}
      {editingOffer ? <OfferSetEditor offerId={editingOffer} onClose={() => setEditingOffer(null)} onSaved={() => { setEditingOffer(null); onSaved(); }} /> : null}
      {editingSimple ? <SimpleOfferEditor row={editingSimple} onClose={() => setEditingSimple(null)} onSaved={() => { setEditingSimple(null); setExportMessage("Oferta actualizada. La próxima carga del reporte reemplazará estos cambios si incluye esta promoción."); onSaved(); }} /> : null}
      {editing ? <DealEditor row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); }} /> : null}
      {deletingOffer ? <DeleteOfferModal row={deletingOffer} onClose={() => setDeletingOffer(null)} onDeleted={(msg) => { setDeletingOffer(null); setExportMessage(msg); onSaved(); }} /> : null}
      <PreviewFrame title="Ofertas y condiciones" scrollable={false}>
        {rows.length > 0 ? (
          <div className="offer-table-toolbar">
            <div className="offer-table-search">
              <Filter size={15} />
              <input
                type="text"
                placeholder="Filtrar en resultados (SKU, Oferta, Promo)..."
                value={clientFilter}
                onChange={(e) => {
                  setClientFilter(e.target.value);
                  setPage(0);
                }}
              />
              {clientFilter ? (
                <button
                  type="button"
                  className="clear-filter-btn"
                  onClick={() => { setClientFilter(""); setPage(0); }}
                  title="Limpiar filtro"
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="offer-table-pagination">
              <span className="pagination-count">
                {filteredRows.length === rows.length
                  ? `Mostrando ${filteredRows.length ? currentPage * pageSize + 1 : 0}–${Math.min((currentPage + 1) * pageSize, filteredRows.length)} de ${rows.length}`
                  : `Mostrando ${filteredRows.length ? currentPage * pageSize + 1 : 0}–${Math.min((currentPage + 1) * pageSize, filteredRows.length)} de ${filteredRows.length} filtrados (${rows.length} total)`}
              </span>
              <label className="pagination-size-label">
                <span>Filas:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </label>
              <div className="pagination-buttons">
                <Button
                  variant="ghost"
                  disabled={currentPage === 0}
                  onClick={() => setPage(0)}
                  title="Primera página"
                >
                  <ChevronsLeft size={16} />
                </Button>
                <Button
                  variant="ghost"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  title="Página anterior"
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="pagination-page-indicator">
                  {currentPage + 1} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  title="Página siguiente"
                >
                  <ChevronRight size={16} />
                </Button>
                <Button
                  variant="ghost"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage(totalPages - 1)}
                  title="Última página"
                >
                  <ChevronsRight size={16} />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        <div className="table-wrap offer-table-scroll" role="region" aria-label="Ofertas y condiciones: tabla desplazable" tabIndex={0}>
          <table className="settings-table offer-settings-table">
            <thead>
              <tr>
                <th scope="col" className="offer-action-cell">Acción</th>
                <th scope="col">Promoción</th>
                <th scope="col">Oferta</th>
                <th scope="col">SKU</th>
                <th scope="col">Tipo de oferta</th>
                <th scope="col">Segmento</th>
                <th scope="col" className="offer-benefit-cell">Beneficio</th>
                <th scope="col">Configuración / SET</th>
                <th scope="col">Combina</th>
                <th scope="col">Cantidad requerida</th>
                <th scope="col">Umbral</th>
                <th scope="col">Guardar condición</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => {
                const combineKey = `combine-${row.promotionId}-${row.offerId}`;
                const thresholdKey = `threshold-${row.ruleId}`;
                const minimumThreshold = row.globalDetails ? 1 : zeroThresholdAllowed(row.type) ? 0 : 1;
                return (
                  <tr key={row.ruleId}>
                    <td className="offer-action-cell">
                      <div className="offer-row-actions">
                        {row.type !== "KIT_OFFER" && (!row.deal || row.deal.kind === "UNIT") ? <Button variant="outline" onClick={() => setEditingSimple(row)} aria-label={`Editar oferta ${row.offerId}, promoción ${row.promotionId}, segmento ${row.segment.trim() === "-" ? "Todos" : row.segment}`}>Editar oferta</Button> : <small>Ver configuración</small>}
                        <button type="button" className="btn btn-outline offer-row-delete-btn" onClick={() => setDeletingOffer(row)} title={`Borrar oferta ${row.offerId}`} aria-label={`Borrar oferta ${row.offerId}, promoción ${row.promotionId}, segmento ${row.segment.trim() === "-" ? "Todos" : row.segment}`}><Trash2 size={14} aria-hidden="true" /><span>Borrar</span></button>
                      </div>
                    </td>
                    <td className="offer-promotion-cell">
                      <strong>{row.promotionId}</strong>
                      <span title={row.promotionName}>{row.promotionName}</span>
                      <span>{row.startsAt ?? "Sin inicio"} — {row.endsAt ?? "Sin vencimiento"}</span>
                    </td>
                    <td>{row.offerId}</td>
                    <td>{row.sku}</td>
                    <td><Badge tone="info">{offerTypeLabel(row.type)}</Badge></td>
                    <td title={`Segmento almacenado: ${JSON.stringify(row.segment)}`}>{row.segment.trim() === "-" ? "Todos" : row.segment}</td>
                    <td className="offer-benefit-cell"><strong>{offerValueLabel(row)}</strong></td>
                    <td className="offer-condition-cell">
                      <div className="offer-condition-content">
                        {row.deal?.kind === "KIT" && row.deal.sets ? row.deal.sets.filter(set => set.skus.includes(row.sku)).map(set => <small key={set.id}>SET {set.id} · {set.quantity} · {set.thresholdType === "EXACT" ? "Exacto" : "Mínimo"}</small>) : null}
                        {row.globalDetails ? row.type === "KIT_OFFER" ? <Button variant="outline" onClick={() => setEditingOffer(row.offerId)}>Configurar SET</Button> : <small>Por cantidad y umbral</small> : <Button variant="outline" onClick={() => setEditing(row)}>{row.deal ? "Editar regla anterior" : "Definir regla anterior"}</Button>}
                        {isPendingKit(row) ? <small className="offer-pending-note">Pendiente de configurar SET</small> : null}
                      </div>
                    </td>
                    <td>
                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          aria-label={`Combinar oferta ${row.offerId}`}
                          checked={row.allowStacking}
                          disabled={savingKey === combineKey}
                          onChange={(event) => onStackingChange(row, event.target.checked)}
                        />
                        <span>{row.allowStacking ? "Sí" : "No"}</span>
                      </label>
                    </td>
                    <td className="offer-quantity-cell">
                      <input
                        type="number"
                        aria-label={`Cantidad para oferta ${row.offerId}, SKU ${row.sku}`}
                        step={row.globalDetails ? 1 : "any"}
                        min={minimumThreshold}
                        disabled={row.type === "KIT_OFFER" || row.deal?.kind === "KIT"}
                        value={row.thresholdQuantity}
                        onChange={(event) => onThresholdChange(row.ruleId, { thresholdQuantity: Math.max(minimumThreshold, Number(event.target.value) || 0) })}
                      />
                      <small>{row.type === "KIT_OFFER" || row.deal?.kind === "KIT" ? "Configurar cantidades en cada SET" : `Reporte: ${row.importedQuantity ?? "-"}`}</small>
                    </td>
                    <td className="offer-threshold-cell">
                      <select
                        aria-label={`Umbral para oferta ${row.offerId}, SKU ${row.sku}`}
                        value={!row.globalDetails && zeroThresholdAllowed(row.type) ? "MINIMUM" : row.thresholdType}
                        disabled={(!row.globalDetails && zeroThresholdAllowed(row.type)) || row.type === "KIT_OFFER" || row.deal?.kind === "KIT"}
                        onChange={(event) => onThresholdChange(row.ruleId, { thresholdType: event.target.value as ThresholdType })}
                      >
                        <option value="EXACT">Exacta</option>
                        <option value="MINIMUM">Mínima</option>
                      </select>
                    </td>
                    <td className="offer-save-cell">
                      <Button
                        variant="outline"
                        aria-label={`Guardar condición de oferta ${row.offerId}, SKU ${row.sku}`}
                        onClick={() => onThresholdSave(row)}
                        disabled={savingKey === thresholdKey || row.type === "KIT_OFFER" || row.deal?.kind === "KIT"}
                      >
                        <Save size={16} />
                        {savingKey === thresholdKey ? "Guardando" : "Guardar"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? <EmptyRow colSpan={12} label={loading ? "Buscando ofertas..." : "Busque por ID de promo u oferta para configurar."} /> : null}
              {rows.length > 0 && filteredRows.length === 0 ? <EmptyRow colSpan={12} label="No hay filas que coincidan con el filtro en resultados." /> : null}
            </tbody>
          </table>
        </div>
        {totalPages > 1 ? (
          <div className="offer-table-bottom-pagination">
            <span className="pagination-count">
              Página {currentPage + 1} de {totalPages} ({filteredRows.length} filas)
            </span>
            <div className="pagination-buttons">
              <Button
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(0)}
              >
                Primera
              </Button>
              <Button
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="pagination-page-indicator">
                {currentPage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Siguiente
              </Button>
              <Button
                variant="outline"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
              >
                Última
              </Button>
            </div>
          </div>
        ) : null}
      </PreviewFrame>
    </LoadPanel>
  );
}

export function offerTypeLabel(type: string) {
  const labels: Record<string, string> = {
    LINE_ITEM_DISCOUNT: "Descuento línea",
    TIERED_DISCOUNT: "Escalonada",
    FIXED_QTY_PRICE: "Precio fijo",
    KIT_OFFER: "Kit",
  };
  return labels[type] ?? type;
}

export function zeroThresholdAllowed(type: string) {
  return type === "LINE_ITEM_DISCOUNT" || type === "FIXED_QTY_PRICE";
}

export function offerValueLabel(row: OfferConfigurationRow) {
  if (row.fixedPrice !== undefined) return `Precio ${row.fixedPrice.toLocaleString("es-NI")}`;
  if (row.discountPercent !== undefined) return `${row.discountPercent}%`;
  return row.discountType || "-";
}
