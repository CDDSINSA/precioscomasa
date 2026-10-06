// Shared by the browser importer, Supabase sync and the administrative CLI.
export const CUSTOMER_SEGMENTS = Object.freeze(["1104", "1103", "1002", "1003", "1102", "1105"]);
const allowedSegments = new Set(CUSTOMER_SEGMENTS);

export function selectCustomerSegments(customers) {
  const accepted = customers.filter(customer => allowedSegments.has(String(customer.segment ?? "").trim()));
  return { accepted, excluded: customers.length - accepted.length };
}

export const CUSTOMER_SEGMENTS_LABEL = CUSTOMER_SEGMENTS.join(", ");
export const NO_ALLOWED_CUSTOMERS = `No hay clientes de los segmentos permitidos (${CUSTOMER_SEGMENTS_LABEL}). No se modificó Supabase.`;

export function customerImportMessage(accepted, excluded) {
  const summary = `${accepted} clientes aceptados; ${excluded} excluidos por segmento.`;
  return accepted ? `Archivo de clientes cargado: ${summary}` : `${summary} ${NO_ALLOWED_CUSTOMERS}`;
}
