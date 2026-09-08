import { useState } from "react";
import { Button } from "../../components/ui";
import { validateDealConfig } from "../../services/dealConfig";
import { saveOfferDeal, type OfferConfigurationRow } from "../../services/supabase";
import type { DealBenefit, DealConfig } from "../../types/domain";
import "./deal-editor.css";

const splitSkus = (value: string) => [...new Set(value.split(/[\s,;]+/).map(sku => sku.trim()).filter(Boolean))];
const defaultBenefit: DealBenefit = { type: "PERCENT_OFF", value: 100 };

export function DealEditor({ row, onClose, onSaved }: { row: OfferConfigurationRow; onClose: () => void; onSaved: () => void }) {
  const [config, setConfig] = useState<DealConfig>(row.deal ?? { kind: "UNIT" });
  const [skuText, setSkuText] = useState(row.deal?.kind === "MIX_MATCH" ? row.deal.skus.join(", ") : row.deal?.kind === "BUY_GET" ? row.deal.buySkus.join(", ") : row.sku);
  const [rewardText, setRewardText] = useState(row.deal?.kind === "BUY_GET" ? row.deal.getSkus.join(", ") : row.sku);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function changeKind(kind: DealConfig["kind"]) {
    setError("");
    switch (kind) {
      case "UNIT": setConfig({ kind }); break;
      case "PACK": setConfig({ kind, quantity: 8, price: row.fixedPrice ?? 1000 }); break;
      case "KIT": setConfig({ kind, items: [{ sku: row.sku, quantity: 1, benefit: { type: "PERCENT_OFF", value: row.discountPercent ?? 0 } }, { sku: "", quantity: 1, benefit: defaultBenefit }] }); break;
      case "MIX_MATCH": setConfig({ kind, skus: [row.sku], quantity: 3, benefit: { type: "PERCENT_OFF", value: 10 } }); break;
      case "BUY_GET": setConfig({ kind, buySkus: [row.sku], buyQuantity: 3, getSkus: [row.sku], getQuantity: 1, benefit: defaultBenefit, discountTriggers: true }); break;
    }
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const next = config.kind === "MIX_MATCH" ? { ...config, skus: splitSkus(skuText) }
        : config.kind === "BUY_GET" ? { ...config, buySkus: splitSkus(skuText), getSkus: splitSkus(rewardText) } : config;
      await saveOfferDeal(row, validateDealConfig(next));
      onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo guardar la regla."); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="deal-editor-title">
    <section className="deal-editor">
      <header><h2 id="deal-editor-title">Regla de oferta {row.offerId}</h2><Button variant="ghost" onClick={onClose} disabled={saving}>Cerrar</Button></header>
      <p>{row.promotionName} · Segmento {row.segment.trim() === "-" ? "general" : row.segment}</p>
      <p>La regla se aplica a esta oferta y segmento. Las unidades consumidas no califican en otro paquete.</p>
      <label>Modalidad<select value={config.kind} onChange={e => changeKind(e.target.value as DealConfig["kind"])}>
        <option value="UNIT">Precio o descuento unitario importado</option><option value="PACK">Paquete de un SKU a precio total</option>
        <option value="KIT">Kit completo con proporciones por SKU</option><option value="MIX_MATCH">Cantidad de unidades mezcladas de una lista</option>
        <option value="BUY_GET">Compra X y recibe beneficio en Y</option>
      </select></label>
      {config.kind === "UNIT" ? <p>Utiliza el beneficio importado. Las escalas compiten por su precio y mínimo de unidades.</p> : null}
      {config.kind === "PACK" ? <div className="deal-fields"><NumberField label="Unidades por paquete" value={config.quantity} onChange={quantity => setConfig({ ...config, quantity })} /><NumberField label="Precio TOTAL del paquete (C$)" value={config.price} onChange={price => setConfig({ ...config, price })} /></div> : null}
      {config.kind === "MIX_MATCH" ? <>
        <label>SKU elegibles (separados por coma)<textarea value={skuText} onChange={e => setSkuText(e.target.value)} /></label>
        <NumberField label="Unidades mezcladas por grupo" value={config.quantity} onChange={quantity => setConfig({ ...config, quantity })} />
        <p>Se permiten varias unidades del mismo código. El beneficio aplica a cada unidad del grupo completo.</p>
        <BenefitField value={config.benefit} onChange={benefit => setConfig({ ...config, benefit })} />
      </> : null}
      {config.kind === "BUY_GET" ? <>
        <label>SKU de compra (X)<textarea value={skuText} onChange={e => setSkuText(e.target.value)} /></label>
        <NumberField label="Unidades de compra por grupo" value={config.buyQuantity} onChange={buyQuantity => setConfig({ ...config, buyQuantity })} />
        <label>SKU de recompensa (Y)<textarea value={rewardText} onChange={e => setRewardText(e.target.value)} /></label>
        <NumberField label="Máximo de unidades de recompensa" value={config.getQuantity} onChange={getQuantity => setConfig({ ...config, getQuantity })} />
        <BenefitField value={config.benefit} onChange={benefit => setConfig({ ...config, benefit })} />
        <label className="deal-checkbox"><input type="checkbox" checked={config.discountTriggers} onChange={e => setConfig({ ...config, discountTriggers: e.target.checked })} />Permitir descuento en X cuando ambas ofertas permiten combinar</label>
        <p>La recompensa debe estar en la cotización. X e Y consumen unidades diferentes aunque sus listas compartan códigos. Se selecciona la combinación de mayor ahorro.</p>
      </> : null}
      {config.kind === "KIT" ? <>
        {config.items.map((item, i) => <fieldset key={i}><legend>Componente {i + 1}</legend>
          <label>SKU<input value={item.sku} onChange={e => setConfig({ ...config, items: config.items.map((part, n) => n === i ? { ...part, sku: e.target.value.trim() } : part) })} /></label>
          <NumberField label="Unidades requeridas" value={item.quantity} onChange={quantity => setConfig({ ...config, items: config.items.map((part, n) => n === i ? { ...part, quantity } : part) })} />
          <BenefitField value={item.benefit} onChange={benefit => setConfig({ ...config, items: config.items.map((part, n) => n === i ? { ...part, benefit } : part) })} />
          <Button variant="ghost" onClick={() => setConfig({ ...config, items: config.items.filter((_, n) => n !== i) })}>Quitar componente</Button>
        </fieldset>)}
        <Button variant="outline" onClick={() => setConfig({ ...config, items: [...config.items, { sku: "", quantity: 1, benefit: defaultBenefit }] })}>Agregar componente</Button>
      </> : null}
      <p>{row.allowStacking ? "Combinable: admite porcentajes adicionales de otras ofertas combinables." : "Excluyente: compite contra las otras ofertas por el menor total."}</p>
      {error ? <p role="alert" className="deal-error">{error}</p> : null}
      <footer><Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar regla"}</Button></footer>
    </section>
  </div>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label>{label}<input type="number" min="0" step="any" value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

function BenefitField({ value, onChange }: { value: DealBenefit; onChange: (value: DealBenefit) => void }) {
  return <div className="deal-fields"><label>Beneficio<select value={value.type} onChange={e => onChange({ type: e.target.value as DealBenefit["type"], value: value.value })}>
    <option value="PERCENT_OFF">Porcentaje (100 = gratis)</option><option value="OVERRIDE_PRICE">Precio unitario (C$)</option>
  </select></label><NumberField label="Valor del beneficio" value={value.value} onChange={amount => onChange({ ...value, value: amount })} /></div>;
}
