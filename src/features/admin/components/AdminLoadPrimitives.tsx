import { Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ImportedPromotionRow } from "../../../types/domain";

export type ProgressState = {
  title: string;
  detail: string;
  current: number;
  total: number;
};

export function ProcessButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "load-process active" : "load-process"} onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

export function LoadPanel({
  actions,
  children,
  className,
  subtitle,
  summary,
  title,
}: {
  actions: ReactNode;
  children: ReactNode;
  className?: string;
  subtitle: string;
  summary: Array<[string, string | number]>;
  title: string;
}) {
  return (
    <div className={`load-panel ${className ?? ""}`.trim()}>
      <div className="load-panel-head">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
        <div className="toolbar-actions">{actions}</div>
      </div>
      <div className="load-summary-grid">
        {summary.map(([label, value]) => <SummaryTile key={label} label={label} value={String(value)} />)}
      </div>
      {children}
    </div>
  );
}

export function UploadButton({ label, onFile }: { label: string; onFile: (file?: File) => void }) {
  return (
    <label className="btn btn-outline file-btn">
      <Upload size={16} />
      {label}
      <input type="file" accept=".xlsx,.xlsb,.xls,.csv,.tsv" onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

export function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function PreviewFrame({ children, title, scrollable = true }: { children: ReactNode; title: string; scrollable?: boolean }) {
  return (
    <div className="preview-frame">
      <div className="preview-head"><h3>{title}</h3></div>
      {scrollable ? <div className="table-wrap">{children}</div> : children}
    </div>
  );
}

export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return <tr><td colSpan={colSpan}>{label}</td></tr>;
}

export function uniqueRowsByPromotion(rows: ImportedPromotionRow[]) {
  const grouped = new Map<string, ImportedPromotionRow>();
  rows.forEach((row) => {
    if (row.promotionId && !grouped.has(row.promotionId)) grouped.set(row.promotionId, row);
  });
  return [...grouped.values()];
}

export function metricValue(value: number | null, loading: boolean, estimated = false) {
  if (loading && value === null) return "...";
  if (value === null) return "N/D";
  return `${estimated ? "≈ " : ""}${value.toLocaleString("es-NI")}`;
}

export function todayIso() {
  const now = new Date();
  const localTime = now.getTime() - now.getTimezoneOffset() * 60000;
  return new Date(localTime).toISOString().slice(0, 10);
}

export function SyncProgressModal({ progress }: { progress: ProgressState }) {
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="modal-backdrop" role="status" aria-live="polite">
      <div className="sync-modal">
        <div className="sync-led" />
        <div>
          <h2>{progress.title}</h2>
          <p>{progress.detail}</p>
        </div>
        <div className="sync-bar">
          <span style={{ width: `${percent}%` }} />
        </div>
        <strong>{percent}%</strong>
      </div>
    </div>
  );
}
