import { createClient } from "@supabase/supabase-js";
import readXlsxFile from "read-excel-file/node";

const DEFAULT_FILE = "C:/Users/arlen.aguilar/Downloads/Clientes Estadisticas de Compras sep26.xlsx";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filePath = args.find((arg) => arg !== "--dry-run") || DEFAULT_FILE;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const workbookData = await readXlsxFile(filePath);
const rows = normalizeWorkbookRows(workbookData);
const headerIndex = rows.findIndex((row) => normalize(row[1]) === "cust_id" && normalize(row[15]) === "segmento");

if (headerIndex < 0) {
  console.error("No se encontro el encabezado esperado con cust_id en columna B y segmento en columna P.");
  process.exit(1);
}

const customers = deduplicateCustomers(
  rows
    .slice(headerIndex + 1)
    .map(rowToCustomer)
    .filter((customer) => customer.customer_id && customer.display_name),
);

if (!customers.length) {
  console.error("No hay clientes validos para cargar. No se modifico Supabase.");
  process.exit(1);
}

console.log(`Clientes validos: ${customers.length}`);
if (dryRun) {
  console.log("Modo dry-run: no se modifico Supabase.");
  console.log(JSON.stringify(customers.slice(0, 3), null, 2));
  process.exit(0);
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

await deleteExistingCustomers();
await insertCustomers(customers);
console.log("Sincronizacion de clientes completada.");

function normalizeWorkbookRows(data) {
  if (Array.isArray(data) && data.length === 1 && data[0]?.data) return data[0].data;
  if (Array.isArray(data) && data[0]?.sheet && data[0]?.data) {
    const firstSheet = data.find((sheet) => Array.isArray(sheet.data) && sheet.data.length) || data[0];
    return firstSheet.data;
  }
  return data;
}

function rowToCustomer(row) {
  const customerId = clean(row[1]);
  const firstName = clean(row[3]);
  const lastName = clean(row[4]);
  const orgName = clean(row[5]);
  const mobile = cleanPhone(row[6]);
  const nationalId = cleanNationalId(row[8]);
  const address = clean(row[13]);
  const segment = clean(row[15]);
  const displayName = orgName || [firstName, lastName].filter(Boolean).join(" ").trim() || customerId;

  return {
    customer_id: customerId,
    first_name: firstName,
    last_name: lastName,
    org_name: orgName || null,
    display_name: displayName,
    mobile: mobile || null,
    national_id: nationalId || null,
    segment,
    address: address || null,
    updated_at: new Date().toISOString(),
  };
}

function deduplicateCustomers(customers) {
  const grouped = new Map();
  for (const customer of customers) {
    const current = grouped.get(customer.customer_id);
    grouped.set(customer.customer_id, current ? mergeCustomer(current, customer) : customer);
  }
  return [...grouped.values()];
}

function mergeCustomer(current, next) {
  return {
    ...current,
    ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== null && value !== "")),
    updated_at: next.updated_at,
  };
}

async function deleteExistingCustomers() {
  const { error } = await supabase
    .from("customers")
    .delete()
    .not("customer_id", "is", null);

  if (error) throw new Error(`No se pudo eliminar la data vieja: ${error.message}`);
  console.log("Data vieja eliminada.");
}

async function insertCustomers(customers) {
  const chunkSize = 1000;
  for (let index = 0; index < customers.length; index += chunkSize) {
    const chunk = customers.slice(index, index + chunkSize);
    const { error } = await supabase.from("customers").insert(chunk);
    if (error) throw new Error(`Error insertando lote ${index / chunkSize + 1}: ${error.message}`);
    console.log(`Insertados ${Math.min(index + chunk.length, customers.length)} de ${customers.length}`);
  }
}

function clean(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function cleanPhone(value) {
  const phone = clean(value);
  return phone === "0" ? "" : phone;
}

function cleanNationalId(value) {
  const raw = clean(value);
  if (!raw || raw === "0") return "";
  return raw.includes("|") ? raw.split("|").pop().trim() : raw;
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
