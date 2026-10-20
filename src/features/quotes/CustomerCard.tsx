import { Phone, UserRound, UserSearch, X } from "lucide-react";
import { Button } from "../../components/ui";
import type { Customer } from "../../types/domain";
import "./customer-card.css";

type CustomerCardProps = {
  customer: Customer | null;
  onChange: () => void;
  onClear: () => void;
};

export function CustomerCard({ customer, onChange, onClear }: CustomerCardProps) {
  return (
    <section className="quote-customer-card" aria-label="Cliente de la cotización">
      <div className="quote-customer-summary">
        <div className="quote-customer-avatar" aria-hidden="true"><UserRound size={22} /></div>
        <div className="quote-customer-info">
          <span className="quote-customer-label">Cliente</span>
          <div className="quote-customer-identity">
            <strong>{customer ? customer.displayName || "Cliente sin nombre" : "Seleccione un cliente"}</strong>
            {customer ? (
              <span className="quote-customer-segment">
                {customer.segment ? `Segmento ${customer.segment}` : "Sin segmento"}
              </span>
            ) : null}
          </div>
          <span className="quote-customer-contact">
            {customer ? <><Phone size={14} aria-hidden="true" />{customer.mobile || "Sin teléfono"}</> : "Busque un cliente para aplicar su segmento comercial."}
          </span>
        </div>
        <div className="quote-customer-actions">
          <Button type="button" variant="outline" onClick={onChange} aria-label={customer ? "Cambiar cliente" : "Buscar cliente"}>
            <UserSearch size={16} aria-hidden="true" />
            {customer ? "Cambiar" : "Buscar cliente"}
          </Button>
          {customer ? (
            <Button type="button" variant="ghost" onClick={onClear} aria-label="Limpiar cliente" title="Limpiar cliente">
              <X size={16} aria-hidden="true" />
              Limpiar
            </Button>
          ) : null}
        </div>
      </div>
      {customer ? (
        <details className="quote-customer-details" key={customer.customerId}>
          <summary>Ver datos</summary>
          <dl>
            <div><dt>ID cliente</dt><dd>{customer.customerId || "Sin ID"}</dd></div>
            <div><dt>Correo</dt><dd>{customer.email || "Sin correo"}</dd></div>
            <div><dt>ID / Cédula</dt><dd>{customer.nationalId || "Sin ID"}</dd></div>
            <div><dt>Dirección</dt><dd>{customer.address || "Sin dirección"}</dd></div>
          </dl>
        </details>
      ) : null}
    </section>
  );
}
