import { useState } from "react";
import { Button } from "../../components/ui";
import type { KitSet } from "../../types/domain";

export function KitSetFields({ value, onChange, onRemove, reportBenefits = false }: { value: KitSet; onChange: (set: KitSet) => void; onRemove: () => void; reportBenefits?: boolean }) {
  const [skuText, setSkuText] = useState(value.skus.join(", "));
  return <fieldset><legend>SET {value.id}</legend>
    <label>SKU elegibles (separados por coma)<textarea value={skuText} onChange={event => {
      const text = event.target.value;
      setSkuText(text);
      onChange({ ...value, skus: [...new Set(text.split(/[\s,;]+/).map(sku => sku.trim()).filter(Boolean))] });
    }} /></label>
    <div className="deal-fields">
      <label>Unidades requeridas<input type="number" min="1" step="1" value={value.quantity} onChange={event => onChange({ ...value, quantity: Number(event.target.value) })} /></label>
      <label>Tipo de umbral<select value={value.thresholdType} onChange={event => onChange({ ...value, thresholdType: event.target.value as KitSet["thresholdType"] })}>
        <option value="EXACT">Exacta</option><option value="MINIMUM">Mínima</option>
      </select></label>
    </div>
    {reportBenefits ? <p>Beneficio de cada SKU: según el reporte de promociones.</p> : <div className="deal-fields">
      <label>Beneficio<select value={value.benefit?.type ?? "NONE"} onChange={event => onChange({ ...value, benefit: event.target.value === "NONE" ? undefined : { type: event.target.value as "PERCENT_OFF" | "OVERRIDE_PRICE", value: 0 } })}>
        <option value="NONE">Sin beneficio</option><option value="PERCENT_OFF">Porcentaje (100 = gratis)</option><option value="OVERRIDE_PRICE">Precio unitario (C$)</option>
      </select></label>
      {value.benefit ? <label>Valor del beneficio<input type="number" min="0" max={value.benefit.type === "PERCENT_OFF" ? 100 : undefined} step="any" value={value.benefit.value} onChange={event => onChange({ ...value, benefit: { ...value.benefit!, value: Number(event.target.value) } })} /></label> : null}
    </div>}
    <Button variant="ghost" onClick={onRemove}>Quitar SET</Button>
  </fieldset>;
}
