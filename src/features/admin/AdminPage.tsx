import { Database, PackageCheck, Save, Settings2, Tags, Upload, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AppFeedback } from "../../components/AppFeedback";
import { Badge, Button, Card, CardContent, Header, Metric } from "../../components/ui";
import { inspectDataFile, parseCustomerFile, parsePromotionFile } from "../../services/importers";
import { updateStoredDataStatus } from "../../services/dataStatus";
import { syncCustomersToSupabase, syncPromotionsToSupabase, type PromotionSyncMode } from "../../services/supabase";
import type { Customer, ImportedPromotionRow } from "../../types/domain";

type ProgressState = {
  title: string;
  detail: string;
  current: number;
  total: number;
};

type ActiveLoad = "promotions" | "customers" | "references";

type ReferenceStatus = {
  value: "Pendiente" | "Validado" | "Revisar";
  detail: string;
};

export function AdminPage() {
  const [activeLoad, setActiveLoad] = useState<ActiveLoad>("promotions");
  const [rows, setRows] = useState<ImportedPromotionRow[]>([]);
  const [customerRows, setCustomerRows] = useState<Customer[]>([]);
  const [referenceStatus, setReferenceStatus] = useState<Record<"master" | "inventory", ReferenceStatus>>({
    master: { value: "Pendiente", detail: "Sin archivo" },
    inventory: { value: "Pendiente", detail: "Sin archivo" },
  });
  const [message, setMessage] = useState<string>();
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [syncMode, setSyncMode] = useState<PromotionSyncMode>("full");
  const uniqueOffers = useMemo(() => new Set(rows.map((row) => row.offerId)).size, [rows]);
  const uniquePromotions = useMemo(() => new Set(rows.map((row) => row.promotionId)).size, [rows]);
  const uniqueCustomers = useMemo(() => new Set(customerRows.map((row) => row.customerId)).size, [customerRows]);
  const promotionPreview = useMemo(() => uniqueRowsByPromotion(rows).slice(0, 20), [rows]);
  const customerPreview = useMemo(() => customerRows.slice(0, 20), [customerRows]);
  const customerSegments = useMemo(() => new Set(customerRows.map((row) => row.segment).filter(Boolean)).size, [customerRows]);
  const customerPhones = useMemo(() => customerRows.filter((row) => row.mobile).length, [customerRows]);

  async function handlePromotionFile(file?: File) {
    if (!file) return;
    setActiveLoad("promotions");
    setProgress({ title: "Leyendo promociones", detail: file.name, current: 0, total: 1 });
    try {
      const parsedRows = await parsePromotionFile(file);
      setRows(parsedRows.filter((row) => row.offerId && row.sku));
      updateStoredDataStatus("promotions", parsedRows.length ? "ok" : "error", `${parsedRows.length} filas`);
      setMessage(`Archivo de promociones cargado: ${parsedRows.length} filas detectadas.`);
    } catch (error) {
      updateStoredDataStatus("promotions", "error", "No cargado");
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el archivo.");
    } finally {
      setProgress(null);
    }
  }

  async function handleCustomerFile(file?: File) {
    if (!file) return;
    setActiveLoad("customers");
    setProgress({ title: "Leyendo clientes", detail: file.name, current: 0, total: 1 });
    try {
      const parsedRows = await parseCustomerFile(file);
      setCustomerRows(parsedRows);
      updateStoredDataStatus("customers", parsedRows.length ? "ok" : "error", `${parsedRows.length} clientes`);
      setMessage(`Archivo de clientes cargado: ${parsedRows.length} clientes detectados.`);
    } catch (error) {
      updateStoredDataStatus("customers", "error", "No cargado");
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el archivo de clientes.");
    } finally {
      setProgress(null);
    }
  }

  async function handleReferenceFile(kind: "master" | "inventory", file?: File) {
    if (!file) return;
    setActiveLoad("references");
    const summary = await inspectDataFile(file);
    const hasSku = summary.headers.some((header) => ["sku", "item", "articulo"].includes(header));
    const hasDescription = summary.headers.some((header) => ["descripcion", "item_desc", "description"].includes(header));
    const hasQuantity = summary.headers.some((header) => ["cantidad", "qty", "inventario", "available", "disponible"].includes(header));
    const valid = kind === "master" ? hasSku && hasDescription : hasSku && hasQuantity;
    const detail = valid ? `${summary.rows} filas` : "Revisar columnas";

    setReferenceStatus((current) => ({
      ...current,
      [kind]: { value: valid ? "Validado" : "Revisar", detail },
    }));
    updateStoredDataStatus(kind, valid ? "ok" : "warning", detail);
    setMessage(valid ? `Archivo ${kind === "master" ? "maestro" : "inventario"} validado.` : "El archivo requiere revision de columnas.");
  }

  async function syncRows() {
    setProgress({ title: "Sincronizando promociones", detail: "Preparando lotes", current: 0, total: rows.length });
    try {
      const result = await syncPromotionsToSupabase(rows, syncMode, (current, total, detail) => {
        setProgress({ title: "Sincronizando promociones", detail: detail ?? `${current} de ${total} filas`, current, total });
      });
      setMessage(result.message);
    } finally {
      setProgress(null);
    }
  }

  async function syncCustomerRows() {
    setProgress({ title: "Sincronizando clientes", detail: "Preparando reemplazo total", current: 0, total: customerRows.length });
    try {
      const result = await syncCustomersToSupabase(customerRows, (current, total, detail) => {
        setProgress({ title: "Sincronizando clientes", detail: detail ?? `${current} de ${total} clientes`, current, total });
      });
      updateStoredDataStatus("customers", result.ok ? "ok" : "error", result.ok ? `${uniqueCustomers} clientes` : "Error");
      setMessage(result.message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <Header title="Administracion" subtitle="Carga, revision y configuracion comercial de promociones." />

      <div className="metrics">
        <Metric title="Promos" value={String(uniquePromotions)} icon={Tags} />
        <Metric title="Ofertas" value={String(uniqueOffers)} icon={Settings2} />
        <Metric title="Clientes" value={String(uniqueCustomers)} icon={UsersRound} />
        <Metric title="Proceso" value={loadLabel(activeLoad)} icon={Database} />
      </div>

      {message ? <AppFeedback tone={message.includes("completada") ? "success" : "info"} message={message} /> : null}

      <Card className="load-center">
        <CardContent>
          <div className="load-shell">
            <div className="load-process-list" aria-label="Procesos de carga">
              <ProcessButton
                active={activeLoad === "promotions"}
                count={rows.length}
                icon={Tags}
                label="Promociones"
                onClick={() => setActiveLoad("promotions")}
              />
              <ProcessButton
                active={activeLoad === "customers"}
                count={customerRows.length}
                icon={UsersRound}
                label="Clientes"
                onClick={() => setActiveLoad("customers")}
              />
              <ProcessButton
                active={activeLoad === "references"}
                count={referenceStatus.master.value === "Validado" || referenceStatus.inventory.value === "Validado" ? 1 : 0}
                icon={PackageCheck}
                label="Referencias"
                onClick={() => setActiveLoad("references")}
              />
            </div>

            <div className="load-workspace">
              {activeLoad === "promotions" ? (
                <PromotionLoadPanel
                  rows={rows}
                  syncMode={syncMode}
                  uniqueOffers={uniqueOffers}
                  uniquePromotions={uniquePromotions}
                  preview={promotionPreview}
                  onFile={handlePromotionFile}
                  onModeChange={setSyncMode}
                  onSync={syncRows}
                />
              ) : null}

              {activeLoad === "customers" ? (
                <CustomerLoadPanel
                  rows={customerRows}
                  uniqueCustomers={uniqueCustomers}
                  uniqueSegments={customerSegments}
                  rowsWithPhone={customerPhones}
                  preview={customerPreview}
                  onFile={handleCustomerFile}
                  onSync={syncCustomerRows}
                />
              ) : null}

              {activeLoad === "references" ? (
                <ReferenceLoadPanel status={referenceStatus} onFile={handleReferenceFile} />
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {progress ? <SyncProgressModal progress={progress} /> : null}
    </div>
  );
}

function ProcessButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: typeof Tags;
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

function PromotionLoadPanel({
  rows,
  syncMode,
  uniqueOffers,
  uniquePromotions,
  preview,
  onFile,
  onModeChange,
  onSync,
}: {
  rows: ImportedPromotionRow[];
  syncMode: PromotionSyncMode;
  uniqueOffers: number;
  uniquePromotions: number;
  preview: ImportedPromotionRow[];
  onFile: (file?: File) => void;
  onModeChange: (mode: PromotionSyncMode) => void;
  onSync: () => void;
}) {
  return (
    <div className="load-panel">
      <div className="load-panel-head">
        <div>
          <h2>Promociones</h2>
          <span>Ofertas comerciales de tienda 5.</span>
        </div>
        <div className="toolbar-actions">
          <label className="btn btn-outline file-btn">
            <Upload size={16} />
            Cargar archivo
            <input type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => onFile(event.target.files?.[0])} />
          </label>
          <label className="filter-field compact">
            <span>Modo</span>
            <select value={syncMode} onChange={(event) => onModeChange(event.target.value as PromotionSyncMode)}>
              <option value="full">Carga total</option>
              <option value="partial">Actualizacion</option>
            </select>
          </label>
          <Button disabled={!rows.length} onClick={onSync}>
            <Save size={16} />
            Sincronizar
          </Button>
        </div>
      </div>

      <div className="load-summary-grid">
        <SummaryTile label="Promociones" value={String(uniquePromotions)} />
        <SummaryTile label="Ofertas" value={String(uniqueOffers)} />
        <SummaryTile label="Filas" value={String(rows.length)} />
      </div>

      <PreviewFrame title="Promociones detectadas">
        <table>
          <thead>
            <tr>
              <th>Promo</th>
              <th>Nombre</th>
              <th>Familia</th>
              <th>Vigencia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((promo) => (
              <tr key={promo.promotionId}>
                <td>{promo.promotionId}</td>
                <td>{promo.promotionName}</td>
                <td>{promo.segment.trim() === "-" ? "fidelizacion" : "estrategica"}</td>
                <td>{promo.startsAt || "-"} / {promo.endsAt || "-"}</td>
                <td><Badge tone={promo.endsAt && promo.endsAt < todayIso() ? "warning" : "success"}>{promo.endsAt && promo.endsAt < todayIso() ? "Vencida" : "Publicable"}</Badge></td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={5} label="No hay promociones cargadas." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </div>
  );
}

function CustomerLoadPanel({
  rows,
  uniqueCustomers,
  uniqueSegments,
  rowsWithPhone,
  preview,
  onFile,
  onSync,
}: {
  rows: Customer[];
  uniqueCustomers: number;
  uniqueSegments: number;
  rowsWithPhone: number;
  preview: Customer[];
  onFile: (file?: File) => void;
  onSync: () => void;
}) {
  return (
    <div className="load-panel">
      <div className="load-panel-head">
        <div>
          <h2>Clientes</h2>
          <span>Base usada por busqueda y segmento base del cotizador.</span>
        </div>
        <div className="toolbar-actions">
          <label className="btn btn-outline file-btn">
            <Upload size={16} />
            Cargar archivo
            <input type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => onFile(event.target.files?.[0])} />
          </label>
          <Button disabled={!rows.length} onClick={onSync}>
            <Database size={16} />
            Actualizar clientes
          </Button>
        </div>
      </div>

      <div className="load-summary-grid">
        <SummaryTile label="Clientes" value={String(uniqueCustomers)} />
        <SummaryTile label="Segmentos" value={String(uniqueSegments)} />
        <SummaryTile label="Con telefono" value={String(rowsWithPhone)} />
      </div>

      <PreviewFrame title="Clientes detectados">
        <table>
          <thead>
            <tr>
              <th>ID cliente</th>
              <th>Nombre</th>
              <th>Telefono</th>
              <th>ID / Cedula</th>
              <th>Segmento</th>
              <th>Direccion</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((customer) => (
              <tr key={customer.customerId}>
                <td>{customer.customerId}</td>
                <td>{customer.displayName}</td>
                <td>{customer.mobile ?? "-"}</td>
                <td>{customer.nationalId ?? "-"}</td>
                <td>{customer.segment || "-"}</td>
                <td>{customer.address ?? "-"}</td>
              </tr>
            ))}
            {!preview.length ? <EmptyRow colSpan={6} label="No hay clientes cargados." /> : null}
          </tbody>
        </table>
      </PreviewFrame>
    </div>
  );
}

function ReferenceLoadPanel({
  status,
  onFile,
}: {
  status: Record<"master" | "inventory", ReferenceStatus>;
  onFile: (kind: "master" | "inventory", file?: File) => void;
}) {
  return (
    <div className="load-panel">
      <div className="load-panel-head">
        <div>
          <h2>Referencias</h2>
          <span>Archivos maestro e inventario para control operativo.</span>
        </div>
      </div>

      <div className="reference-grid">
        <ReferenceBox
          detail={status.master.detail}
          label="Maestro"
          status={status.master.value}
          onFile={(file) => onFile("master", file)}
        />
        <ReferenceBox
          detail={status.inventory.detail}
          label="Inventario"
          status={status.inventory.value}
          onFile={(file) => onFile("inventory", file)}
        />
      </div>
    </div>
  );
}

function ReferenceBox({
  detail,
  label,
  status,
  onFile,
}: {
  detail: string;
  label: string;
  status: ReferenceStatus["value"];
  onFile: (file?: File) => void;
}) {
  const tone = status === "Validado" ? "success" : status === "Revisar" ? "warning" : "neutral";

  return (
    <div className="reference-box">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <Badge tone={tone}>{status}</Badge>
      <label className="btn btn-outline file-btn">
        <Upload size={16} />
        Cargar
        <input type="file" accept=".xlsx,.csv,.tsv" onChange={(event) => onFile(event.target.files?.[0])} />
      </label>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PreviewFrame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="preview-frame">
      <div className="preview-head">
        <h3>{title}</h3>
      </div>
      <div className="table-wrap">{children}</div>
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function uniqueRowsByPromotion(rows: ImportedPromotionRow[]) {
  const grouped = new Map<string, ImportedPromotionRow>();
  rows.forEach((row) => {
    if (row.promotionId && !grouped.has(row.promotionId)) grouped.set(row.promotionId, row);
  });
  return [...grouped.values()];
}

function loadLabel(load: ActiveLoad) {
  if (load === "customers") return "Clientes";
  if (load === "references") return "Referencias";
  return "Promos";
}

function todayIso() {
  const now = new Date();
  const localTime = now.getTime() - now.getTimezoneOffset() * 60000;
  return new Date(localTime).toISOString().slice(0, 10);
}

function SyncProgressModal({ progress }: { progress: ProgressState }) {
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
