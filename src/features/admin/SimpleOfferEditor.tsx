import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { supabase, loadProductsBySkus, type OfferConfigurationRow } from "../../services/supabase";
import "./deal-editor.css";

type Rule = { id: string; sku: string; min_quantity: number; discount_type: string | null; discount_percent: number | null; fixed_price: number | null };
type Draft = { key: string; id: string; sku: string; benefit: string; value: string; added?: boolean; removed?: boolean };
const draft = (r: Rule): Draft => ({ key: r.id, id: r.id, sku: r.sku, benefit: /OVERRIDE/.test(r.discount_type ?? "") ? "OVERRIDE_PRICE" : "PERCENT_OFF", value: String(/OVERRIDE/.test(r.discount_type ?? "") ? r.fixed_price ?? "" : r.discount_percent ?? "") });

export function SimpleOfferEditor({ row, onClose, onSaved }: { row: OfferConfigurationRow; onClose: () => void; onSaved: () => void }) {
  const [original, setOriginal] = useState<Rule[]>([]);
  const [rows, setRows] = useState<Draft[]>([]);
  const [revision, setRevision] = useState("");
  const [reason, setReason] = useState("");
  const [sku, setSku] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLElement>(null);
  const context = { promo: row.promotionId, offer: row.offerId, target_segment: row.segment };
  useEffect(() => {
    let active = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    async function load() {
      try {
        if (!supabase) throw new Error("Supabase no está configurado.");
        const { data, error } = await supabase.rpc("edit_simple_offer", context);
        if (error) throw new Error(error.code === "PGRST202" ? "Falta instalar supabase/manual_offer_edits.sql en Supabase." : error.message);
        if (!active) return;
        setOriginal(data.rows); setRows(data.rows.map(draft)); setRevision(data.revision); setTemplate(data.rows[0]?.id ?? "");
        const products = await loadProductsBySkus(data.rows.map((r: Rule) => r.sku));
        if (active) setNames(Object.fromEntries(products.map(p => [p.sku, p.description])));
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "No se pudo abrir la oferta."); }
      finally { if (active) setBusy(false); }
    }
    void load();
    return () => { active = false; previous?.focus(); };
  }, [row.promotionId, row.offerId, row.segment]);
  const changed = rows.filter(r => r.added || r.removed || (() => { const old = original.find(o => o.id === r.id); return old && (draft(old).benefit !== r.benefit || Number(draft(old).value) !== Number(r.value)); })());
  function edit(key: string, patch: Partial<Draft>) { setRows(current => current.map(r => r.key === key ? { ...r, ...patch } : r)); setReview(false); }
  async function add() {
    setBusy(true); setError(""); setReview(false);
    try {
      const clean = sku.trim();
      if (!clean || rows.some(r => r.sku === clean)) throw new Error("Ingrese un SKU distinto de los ya incluidos.");
      const source = original.find(r => r.id === template);
      if (!source || rows.find(r => r.key === template)?.removed) throw new Error("Seleccione una fila modelo que no vaya a retirar.");
      const products = await loadProductsBySkus([clean]);
      const product = products.find(p => p.sku === clean);
      if (!product) throw new Error("El SKU no existe en el catálogo.");
      setNames(current => ({ ...current, [clean]: product.description }));
      setRows(current => [...current, { ...draft(source), key: crypto.randomUUID(), sku: clean, added: true }]); setSku("");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo agregar."); }
    finally { setBusy(false); }
  }
  async function save() {
    setError("");
    if (reason.trim().length < 3) { setError("Indique el motivo del cambio."); return; }
    if (changed.some(r => !r.removed && (!r.value.trim() || !Number.isFinite(Number(r.value)) || Number(r.value) < 0 || (r.benefit === "PERCENT_OFF" && Number(r.value) > 100)))) { setError("Revise los precios y descuentos ingresados."); return; }
    if (!review) { setReview(true); return; }
    setBusy(true);
    try {
      if (!supabase) throw new Error("Supabase no está configurado.");
      // Altas primero: su fila modelo puede cambiar o retirarse en esta operación.
      const changes = [...changed.filter(r => r.added), ...changed.filter(r => !r.added)].map(r => ({ action: r.added ? "add" : r.removed ? "remove" : "update", id: r.id, sku: r.sku, benefit: r.benefit, value: Number(r.value) }));
      const { error } = await supabase.rpc("edit_simple_offer", { ...context, changes, expected_revision: revision, reason: reason.trim() });
      if (error) throw new Error(error.message);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); setReview(false); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="simple-offer-title" onKeyDown={e => {
    if (e.key === "Escape" && !busy) onClose();
    if (e.key === "Tab") {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }}><section className="deal-editor" ref={dialog} tabIndex={-1}>
    <header><h2 id="simple-offer-title">Editar oferta {row.offerId}</h2><Button variant="ghost" disabled={busy} onClick={onClose}>Cerrar</Button></header>
    <p>Promoción {row.promotionId} · {row.promotionName} · Segmento {row.segment.trim() === "-" ? "Todos" : row.segment}</p>
    <p>La próxima carga del reporte reemplazará estas modificaciones cuando incluya esta promoción. Los precios son unitarios; no se modifica el precio de catálogo.</p>
    {new Set(original.map(r => r.sku)).size < original.length ? <p>Hay SKU con varias escalas o reglas. Cada fila se edita por separado; para retirar un SKU completo, retire todas sus filas.</p> : null}
    {busy ? <p role="status">Procesando…</p> : null}
    <fieldset disabled={busy || !revision}><legend>Productos de la oferta</legend>
      {rows.map(r => <fieldset key={r.key}><legend>{r.added ? "Nuevo · " : ""}{r.sku}{r.removed ? " · Se retirará" : ""}</legend>
        <p>{names[r.sku]} · Cantidad mínima del reporte: {original.find(o => o.id === r.id)?.min_quantity ?? 0}</p>
        {!r.removed ? <div className="deal-fields"><label>Beneficio<select value={r.benefit} onChange={e => edit(r.key, { benefit: e.target.value, value: "" })}><option value="PERCENT_OFF">Descuento (%)</option><option value="OVERRIDE_PRICE">Precio unitario (C$)</option></select></label><label>Valor<input type="number" min="0" max={r.benefit === "PERCENT_OFF" ? 100 : undefined} step="0.0001" value={r.value} onChange={e => edit(r.key, { value: e.target.value })} /></label></div> : null}
        <Button variant="outline" onClick={() => { if (r.added) { setRows(current => current.filter(x => x.key !== r.key)); setReview(false); } else edit(r.key, { removed: !r.removed }); }}>{r.removed ? "Conservar fila" : "Retirar esta fila"}</Button>
      </fieldset>)}
      <label>Fila modelo para el nuevo SKU<select value={template} onChange={e => setTemplate(e.target.value)}>{original.map(r => <option key={r.id} value={r.id}>{r.sku} · mínimo {r.min_quantity}</option>)}</select></label>
      <p>El nuevo SKU hereda las condiciones del reporte de la fila modelo. Las condiciones adicionales ya guardadas para su SKU siguen teniendo prioridad.</p>
      <label>SKU del catálogo<input value={sku} onChange={e => setSku(e.target.value)} /></label><Button variant="outline" onClick={() => void add()} disabled={!sku.trim()}>Agregar SKU</Button>
      <label>Motivo del cambio<textarea value={reason} onChange={e => { setReason(e.target.value); setReview(false); }} placeholder="Solicitud del comprador…" /></label>
    </fieldset>
    {review ? <div role="status"><strong>Revise {changed.length} cambio(s) antes de guardar:</strong><ul>{changed.map(r => { const old = original.find(o => o.id === r.id); const label = (b: string, v: string) => b === "PERCENT_OFF" ? `${v}%` : `C$ ${v} por unidad`; return <li key={r.key}>{r.sku}: {r.removed ? "retirar de esta oferta y segmento" : r.added ? `agregar con ${label(r.benefit, r.value)}` : `${old ? label(draft(old).benefit, draft(old).value) : ""} → ${label(r.benefit, r.value)}`}</li>; })}</ul>{rows.every(r => r.removed) ? <p>Se retirarán todos los SKU de este segmento de la oferta.</p> : null}</div> : null}
    {error ? <p role="alert" className="deal-error">{error}</p> : null}
    <footer><Button disabled={busy || !revision || !changed.length} onClick={() => void save()}>{review ? "Guardar cambios" : "Revisar cambios"}</Button></footer>
  </section></div>;
}
