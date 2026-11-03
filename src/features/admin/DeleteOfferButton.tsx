import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Badge, Button } from "../../components/ui";
import { supabase, type OfferConfigurationRow } from "../../services/supabase";

type Preview = { revision: string; affected_rules: number };
type DeleteScope = "context" | "global";

function formatDeleteError(error: { code?: string; message: string }) {
  return error.code === "PGRST202"
    ? "Falta instalar supabase/delete_offers.sql en Supabase."
    : error.message;
}

export function DeleteOfferButton({ offerId, promotionId, segment, disabled, onBusyChange, onDeleted }: {
  offerId: string; promotionId?: string; segment?: string; disabled: boolean;
  onBusyChange: (busy: boolean) => void; onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  async function remove(confirm: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); onBusyChange(true); setError("");
    try {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { data, error } = await supabase.rpc("delete_offer", {
        offer: offerId, promo: promotionId ?? null, target_segment: segment ?? null,
        apply_changes: confirm, expected_revision: confirm ? preview?.revision : null, reason: reason.trim(),
      });
      if (error) throw new Error(formatDeleteError(error));
      if (confirm && data.applied) onDeleted();
      else setPreview(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo borrar la oferta.");
      setPreview(null);
    } finally { inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  return <div className="offer-delete-control">
    <button ref={trigger} type="button" className="btn btn-outline offer-delete-button" disabled={disabled || busy} aria-expanded={!!preview} onClick={() => void remove(false)}><Trash2 size={16} aria-hidden="true" />Borrar oferta</button>
    {preview ? <div className="offer-delete-confirm" role="group" aria-label={`Confirmar borrado de oferta ${offerId}`}>
      <strong>Borrar oferta {offerId}</strong>
      <p>{promotionId !== undefined ? `Se borrarán todos sus productos y reglas de la promoción ${promotionId}, segmento ${segment?.trim() === "-" ? "Todos" : segment}.` : "Se borrará esta oferta con todos sus productos, reglas y SET en todas las promociones y segmentos."} Son {preview.affected_rules} regla(s).</p>
      <p>Los cambios sin guardar se descartarán. Esta acción no se puede deshacer desde la app. Una nueva carga del reporte puede volver a crear la oferta.</p>
      <label>Motivo del borrado<textarea autoFocus disabled={busy} value={reason} onChange={event => setReason(event.target.value)} placeholder="Indique por qué se retira la oferta" /></label>
      <div className="offer-delete-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => { setPreview(null); setReason(""); trigger.current?.focus(); }}>Cancelar</Button><Button type="button" className="offer-delete-confirm-button" disabled={disabled || busy || reason.trim().length < 3} onClick={() => void remove(true)}>{busy ? "Borrando…" : "Confirmar borrado"}</Button></div>
    </div> : null}
    {error ? <p role="alert" className="deal-error">{error}</p> : null}
  </div>;
}

export function DeleteOfferModal({
  row,
  onClose,
  onDeleted,
}: {
  row: OfferConfigurationRow;
  onClose: () => void;
  onDeleted: (summaryMessage: string) => void;
}) {
  const [scope, setScope] = useState<DeleteScope>("context");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLElement>(null);
  const inFlight = useRef(false);

  const segmentLabel = row.segment.trim() === "-" ? "Todos" : row.segment.trim();
  const busy = loadingPreview || submitting;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      previous?.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingPreview(true);
    setPreview(null);
    setError("");

    async function fetchPreview() {
      try {
        if (!supabase) throw new Error("Supabase no está configurado.");
        const { data, error: rpcError } = await supabase.rpc("delete_offer", {
          offer: row.offerId,
          promo: scope === "context" ? row.promotionId : null,
          target_segment: scope === "context" ? row.segment : null,
          apply_changes: false,
          expected_revision: null,
          reason: null,
        });
        if (rpcError) throw new Error(formatDeleteError(rpcError));
        if (active) setPreview(data as Preview);
      } catch (failure) {
        if (active) {
          setError(failure instanceof Error ? failure.message : "No se pudo consultar el alcance de la oferta.");
        }
      } finally {
        if (active) setLoadingPreview(false);
      }
    }

    void fetchPreview();
    return () => {
      active = false;
    };
  }, [row.offerId, row.promotionId, row.segment, scope]);

  async function confirmDelete() {
    if (inFlight.current || !preview || reason.trim().length < 3) return;
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      if (!supabase) throw new Error("Supabase no está configurado.");
      const { data, error: rpcError } = await supabase.rpc("delete_offer", {
        offer: row.offerId,
        promo: scope === "context" ? row.promotionId : null,
        target_segment: scope === "context" ? row.segment : null,
        apply_changes: true,
        expected_revision: preview.revision,
        reason: reason.trim(),
      });
      if (rpcError) throw new Error(formatDeleteError(rpcError));
      if (data?.applied) {
        const count = data.affected_rules ?? preview.affected_rules;
        const msg =
          scope === "context"
            ? `Oferta ${row.offerId} eliminada de la promoción ${row.promotionId} (segmento ${segmentLabel}, ${count} regla(s) retirada(s) de la base de datos).`
            : `Oferta ${row.offerId} eliminada globalmente en todas las promociones y segmentos (${count} regla(s) retirada(s) de la base de datos).`;
        onDeleted(msg);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo borrar la oferta.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-offer-modal-title"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !submitting) onClose();
        if (event.key === "Tab") {
          const controls = dialog.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)"
          );
          if (!controls?.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <section className="deal-editor offer-delete-modal" ref={dialog} tabIndex={-1}>
        <header className="offer-delete-modal-header">
          <div className="offer-delete-modal-title-group">
            <span className="offer-delete-icon-badge" aria-hidden="true">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 id="delete-offer-modal-title">Borrar oferta {row.offerId}</h2>
              <span>Eliminación controlada en base de datos con registro de auditoría</span>
            </div>
          </div>
          <Button variant="ghost" disabled={submitting} onClick={onClose}>
            Cerrar
          </Button>
        </header>

        <div className="offer-delete-meta-grid" aria-label="Contexto de la oferta">
          <div className="offer-delete-meta-item">
            <span>Oferta</span>
            <strong>{row.offerId}</strong>
          </div>
          <div className="offer-delete-meta-item">
            <span>Promoción</span>
            <strong title={row.promotionName}>{row.promotionId} · {row.promotionName}</strong>
          </div>
          <div className="offer-delete-meta-item">
            <span>Segmento</span>
            <strong>{segmentLabel}</strong>
          </div>
          <div className="offer-delete-meta-item">
            <span>SKU seleccionado</span>
            <strong>{row.sku}</strong>
          </div>
        </div>

        <fieldset className="offer-delete-scope-fieldset" disabled={submitting}>
          <legend>Alcance del borrado</legend>
          <label className={scope === "context" ? "offer-scope-option active" : "offer-scope-option"}>
            <input
              type="radio"
              name="delete-offer-scope"
              checked={scope === "context"}
              onChange={() => setScope("context")}
            />
            <div>
              <strong>Solo en esta promoción y segmento</strong>
              <span>
                Retira todos los SKU de la oferta {row.offerId} únicamente en la promoción {row.promotionId} (segmento {segmentLabel}).
              </span>
            </div>
          </label>
          <label className={scope === "global" ? "offer-scope-option active" : "offer-scope-option"}>
            <input
              type="radio"
              name="delete-offer-scope"
              checked={scope === "global"}
              onChange={() => setScope("global")}
            />
            <div>
              <strong>En todas las promociones y segmentos (borrado total)</strong>
              <span>
                Elimina por completo la oferta {row.offerId}, todos sus SKU, reglas adicionales y configuraciones SET en toda la base de datos.
              </span>
            </div>
          </label>
        </fieldset>

        <div className="offer-delete-impact-box" role="status" aria-live="polite">
          <div className="offer-delete-impact-head">
            <strong>Impacto verificado en Base de Datos</strong>
            {loadingPreview ? (
              <Badge tone="warning">Calculando…</Badge>
            ) : preview ? (
              <Badge tone="warning">{preview.affected_rules} regla(s) / SKU</Badge>
            ) : null}
          </div>
          {loadingPreview ? (
            <p>Verificando reglas y configuraciones asociadas en Supabase…</p>
          ) : preview ? (
            <ul className="offer-delete-impact-list">
              <li>
                Se eliminarán <strong>{preview.affected_rules} fila(s) de reglas</strong> de la oferta <strong>{row.offerId}</strong>.
              </li>
              <li>
                Las <strong>cotizaciones emitidas anteriormente no se afectan</strong> y conservan sus precios históricos.
              </li>
              <li>
                Se guardará el respaldo previo y su usuario en la auditoría administrativa. Si en el futuro vuelve a publicar un reporte Excel que incluya esta oferta, volverá a crearse.
              </li>
            </ul>
          ) : null}
        </div>

        <label className="offer-delete-reason-field">
          <span>Motivo del borrado (obligatorio para auditoría)</span>
          <textarea
            autoFocus
            disabled={submitting}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Indique por qué se retira esta oferta de la base de datos (mínimo 3 caracteres)…"
          />
        </label>

        {error ? (
          <p role="alert" className="deal-error">
            {error}
          </p>
        ) : null}

        <footer className="offer-delete-modal-footer">
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="offer-delete-confirm-button"
            disabled={busy || !preview || reason.trim().length < 3}
            onClick={() => void confirmDelete()}
          >
            <Trash2 size={16} aria-hidden="true" />
            {submitting ? "Borrando de la BD…" : "Confirmar borrado"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
