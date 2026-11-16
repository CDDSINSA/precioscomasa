import type { Customer } from "../../types/domain";
import { NO_ALLOWED_CUSTOMERS, selectCustomerSegments } from "../customerSegments.mjs";
import { supabase } from "./client";
import {
  type SyncProgressCallback,
  escapePostgrestPattern,
  isMissingRpcFunctionError,
  uploadInChunks,
} from "./shared";

type CustomerRow = {
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  org_name: string | null;
  display_name: string | null;
  email: string | null;
  mobile: string | null;
  national_id: string | null;
  segment: string | null;
  address: string | null;
};

export const sampleCustomers: Customer[] = [
  {
    customerId: "267637",
    firstName: "Ferreteria",
    lastName: "Dua",
    displayName: "Ferreteria Dua",
    mobile: "84695915",
    segment: "1002",
    address: "DE LA IGLESIA EL CALVARIO 2C ABAJO MEDIA AL LAGO SAN JOSE ORIENTAL",
  },
  {
    customerId: "528700",
    firstName: "Eduardo",
    lastName: "Calderon",
    orgName: "Eduardo Ariel Calderon Centeno",
    displayName: "Eduardo Ariel Calderon Centeno",
    mobile: "89457522",
    segment: "1003",
    address: "MANAGUA - SEMAFORO ROLTER 2C SUR 1C ESTE CASA NO KI14 CENTRAL",
  },
];

export async function searchCustomers(term: string, limit = 30): Promise<Customer[]> {
  const query = term.trim();
  if (!supabase) return filterSampleCustomers(query, limit);

  let request = supabase
    .from("customers")
    .select("customer_id,first_name,last_name,org_name,display_name,email,mobile,national_id,segment,address")
    .order("display_name", { ascending: true })
    .limit(limit);

  if (query) {
    const pattern = `%${escapePostgrestPattern(query)}%`;
    request = request.or(
      [
        `display_name.ilike.${pattern}`,
        `customer_id.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `mobile.ilike.${pattern}`,
        `national_id.ilike.${pattern}`,
      ].join(","),
    );
  }

  const { data, error } = await request;
  if (error || !data) return [];
  return (data as CustomerRow[]).map(mapCustomer);
}

export async function syncCustomersToSupabase(
  customers: Customer[],
  onProgress?: SyncProgressCallback,
) {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const client = supabase;
  const identifiedCustomers = customers.filter((customer) => customer.customerId && customer.displayName);
  const uniqueCustomers = deduplicateCustomers(identifiedCustomers);
  const { accepted: validCustomers, excluded } = selectCustomerSegments(uniqueCustomers);
  if (!validCustomers.length) {
    return { ok: false, message: NO_ALLOWED_CUSTOMERS };
  }

  onProgress?.(0, validCustomers.length, "Limpiando clientes anteriores");
  const prepared = await prepareCustomerSync();
  if (!prepared.ok) return prepared;

  const uploaded = await uploadInChunks(validCustomers, 500, onProgress, "Cargando clientes vigentes", async (chunk) =>
    client.from("customers").insert(chunk.map(customerPayload)),
  );
  if (!uploaded.ok) return uploaded;

  const duplicates = identifiedCustomers.length - uniqueCustomers.length;
  return {
    ok: true,
    message:
      `Sincronización de clientes completada: ${validCustomers.length} clientes publicados.` +
      (excluded ? ` ${excluded} clientes excluidos por segmento.` : "") +
      (duplicates ? ` ${duplicates} duplicados consolidados.` : ""),
  };
}

async function prepareCustomerSync() {
  if (!supabase) {
    return { ok: false, message: "Supabase no esta configurado en este entorno." };
  }

  const prepared = await supabase.rpc("prepare_customer_sync");
  if (!prepared.error) return { ok: true, message: "Clientes anteriores limpiados." };

  if (isMissingRpcFunctionError(prepared.error)) {
    return {
      ok: false,
      message:
        "Falta ejecutar la funcion prepare_customer_sync en Supabase. Ejecute supabase/customer_sync.sql en el SQL Editor de Supabase y vuelva a intentar la carga de clientes.",
    };
  }

  return { ok: false, message: prepared.error.message };
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    customerId: row.customer_id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    orgName: row.org_name ?? undefined,
    displayName: row.display_name || row.org_name || [row.first_name, row.last_name].filter(Boolean).join(" "),
    email: row.email ?? undefined,
    mobile: row.mobile ?? undefined,
    nationalId: row.national_id ?? undefined,
    segment: row.segment ?? "",
    address: row.address ?? undefined,
  };
}

function customerPayload(customer: Customer) {
  return {
    customer_id: customer.customerId,
    first_name: customer.firstName,
    last_name: customer.lastName,
    org_name: customer.orgName ?? null,
    display_name: customer.displayName,
    email: customer.email ?? null,
    mobile: customer.mobile ?? null,
    national_id: customer.nationalId ?? null,
    segment: customer.segment,
    address: customer.address ?? null,
    updated_at: new Date().toISOString(),
  };
}

function deduplicateCustomers(customers: Customer[]) {
  const grouped = new Map<string, Customer>();
  customers.forEach((customer) => {
    const current = grouped.get(customer.customerId);
    grouped.set(customer.customerId, current ? { ...current, ...withoutEmptyCustomerValues(customer) } : customer);
  });
  return [...grouped.values()];
}

function withoutEmptyCustomerValues(customer: Customer) {
  return Object.entries(customer).reduce<Partial<Customer>>((acc, [key, value]) => {
    if (value !== undefined && value !== "") acc[key as keyof Customer] = value;
    return acc;
  }, {});
}

function filterSampleCustomers(term: string, limit: number) {
  const query = term.toLowerCase();
  return sampleCustomers
    .filter((customer) => {
      if (!query) return true;
      return [customer.customerId, customer.displayName, customer.email, customer.mobile, customer.nationalId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    })
    .slice(0, limit);
}
