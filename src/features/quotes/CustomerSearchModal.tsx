import { Search, UserCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui";
import { searchCustomers } from "../../services/supabase";
import type { Customer } from "../../types/domain";

export function CustomerSearchModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (customer: Customer) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const helperText = useMemo(
    () => (query.trim() ? "Resultados por nombre, cedula o celular." : "Clientes recientes disponibles para cotizar."),
    [query],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);

    const timer = window.setTimeout(() => {
      searchCustomers(query).then((results) => {
        if (!active) return;
        setCustomers(results);
        setLoading(false);
      });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  function selectCustomer(customer: Customer) {
    onSelect(customer);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Buscar cliente">
      <div className="customer-modal">
        <div className="modal-head">
          <div>
            <h2>Buscar cliente</h2>
            <span>{helperText}</span>
          </div>
          <button className="icon-btn" title="Cerrar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="customer-search-body">
          <label className="search-field">
            <Search size={16} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, cedula o celular"
            />
          </label>

          <div className="customer-results">
            {customers.map((customer) => (
              <button key={customer.customerId} onClick={() => selectCustomer(customer)}>
                <div className="customer-result-main">
                  <strong>{customer.displayName || "Cliente sin nombre"}</strong>
                  <span>ID cliente {customer.customerId}</span>
                </div>
                <div className="customer-result-meta">
                  <span>{customer.mobile || "Sin telefono"}</span>
                  <span>{customer.nationalId || "Sin ID"}</span>
                  <span>Segmento {customer.segment || "-"}</span>
                </div>
                <p>{customer.address || "Sin direccion registrada"}</p>
                <UserCheck size={17} />
              </button>
            ))}

            {!loading && !customers.length ? <p className="empty-copy">No encontramos clientes con esa busqueda.</p> : null}
            {loading ? <p className="empty-copy">Buscando clientes...</p> : null}
          </div>

          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
