import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import type { KitSet } from "../../types/domain";
import { supabase } from "../../services/supabase";
import { readKitEditorData, submitOfferDetails, type ConfigurationPreview } from "../../services/offerConfigurationStore";
import { KitSetFields } from "./KitSetFields";
import "./deal-editor.css";

export function OfferSetEditor({ offerId, onClose, onSaved }: { offerId: string; onClose: () => void; onSaved: () => void }) {
  const [sets, setSets] = useState<KitSet[]>([]);
  const [skus, setSkus] = useState<string[]>([]);
  const [preview, setPreview] = useState<ConfigurationPreview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    let cancelled = false;
    if (supabase) readKitEditorData(supabase, offerId).then(result => {
      if (cancelled) return;
      setSkus(result.skus);
      const groups = new Map<string, KitSet>();
      result.details.filter(row => row.set_id).forEach(row => {
        const set = groups.get(row.set_id) ?? { id: row.set_id, skus: [], quantity: row.quantity, thresholdType: row.threshold_type };
        set.skus.push(row.sku); groups.set(row.set_id, set);
      });
      setSets([...groups.values()]);
    }).catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setBusy(false); });
    else { setError("Supabase no está configurado."); setBusy(false); }
    return () => { cancelled = true; previous?.focus(); };
  }, [offerId]);
  function change(next: KitSet[]) { setSets(next); setPreview(null); setError(""); }
  async function save() {
    if (!supabase) return;
    setBusy(true); setError("");
    try {
      if (!sets.length || sets.some(set => !set.skus.length)) throw new Error("Cada SET debe contener al menos un SKU.");
      const rows = sets.flatMap(set => set.skus.map(sku => ({ offer_id: offerId, sku, set_id: set.id, quantity: set.quantity, threshold_type: set.thresholdType })));
      const result = await submitOfferDetails(supabase, rows, preview?.revision);
      if (result.applied) onSaved(); else setPreview(result);
    } catch (error) { setPreview(null); setError(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="offer-set-title" onKeyDown={event => {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key === "Tab") {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <section ref={dialog} tabIndex={-1} className="deal-editor">
      <header><h2 id="offer-set-title">SET de la oferta {offerId}</h2><button ref={close} className="btn btn-ghost" disabled={busy} onClick={onClose}>Cerrar</button></header>
      <p>Estas condiciones se comparten en todas las promociones y segmentos de la oferta. Cada SKU conserva el beneficio de su reporte.</p>
      <p>Todos los SET deben completarse. Una cantidad de 1 requiere una unidad de cualquiera de los SKU del SET; las cantidades no se suman entre filas.</p>
      <details><summary>SKU de la oferta ({skus.length})</summary><p>{skus.join(", ")}</p></details>
      <fieldset disabled={busy}>
        {sets.map((set, index) => <KitSetFields key={set.id} reportBenefits value={set} onChange={next => change(sets.map((item, at) => at === index ? next : item))} onRemove={() => change(sets.filter((_, at) => at !== index))} />)}
        <Button variant="outline" onClick={() => {
          let id = 1; while (sets.some(set => set.id === String(id))) id++;
          change([...sets, { id: String(id), skus: [], quantity: 1, thresholdType: "EXACT" }]);
        }}>Agregar SET</Button>
      </fieldset>
      {preview ? <p role="status">Validación completa. Al guardar se reemplazan todos los SET de esta oferta. Se conservará una copia de los anteriores.{preview.legacy_count ? ` ${preview.legacy_count} reglas anteriores quedarán subordinadas a esta configuración.` : ""}</p> : null}
      {error ? <p role="alert" className="deal-error">{error}</p> : null}
      <footer><Button disabled={busy || !sets.length} onClick={() => void save()}>{busy ? "Procesando…" : preview ? "Guardar SET" : "Validar SET"}</Button></footer>
    </section>
  </div>;
}
