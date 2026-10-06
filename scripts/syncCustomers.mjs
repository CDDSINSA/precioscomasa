import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import * as XLSX from "xlsx";
import { selectCustomerSegments, NO_ALLOWED_CUSTOMERS, customerImportMessage } from "../src/services/customerSegments.mjs";

const DEFAULT_FILE = "documentos/Nueva_Estructura_Data_Cliente.xlsb";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const filePath = args.find((arg) => arg !== "--dry-run") || DEFAULT_FILE;
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!fs.existsSync(filePath)) {
  console.error(`No existe el archivo especificado: ${filePath}`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(filePath);
const workbook = XLSX.read(fileBuffer, { type: "buffer" });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

if (!rawRows.length) {
  console.error("El archivo está vacío.");
  process.exit(1);
}

const headerIndex = rawRows.findIndex((row) => {
  const norm = row.map(normalize);
  return norm.includes("cust_id") || norm.includes("customer_id") || norm.includes("id cliente");
});

if (headerIndex < 0) {
  console.error("No se encontró el encabezado esperado con cust_id / customer_id / id cliente.");
  process.exit(1);
}

const headers = rawRows[headerIndex].map(normalize);
const bodyRows = rawRows.slice(headerIndex + 1);

const uniqueCustomers = deduplicateCustomers(
  bodyRows
    .map((row) => rowToCustomer(row, headers))
    .filter((customer) => customer.customer_id && customer.display_name),
);
const { accepted: customers, excluded } = selectCustomerSegments(uniqueCustomers);
console.log(customerImportMessage(customers.length, excluded));

if (!customers.length) {
  console.error(NO_ALLOWED_CUSTOMERS);
  process.exit(1);
}

console.log(`Clientes validos procesados: ${customers.length}`);
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

function pickValue(row, headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.indexOf(normalize(alias));
    if (idx >= 0 && row[idx] !== undefined && row[idx] !== "") {
      return row[idx];
    }
  }
  return undefined;
}

function rowToCustomer(row, headers) {
  const customerId = clean(pickValue(row, headers, ["cust_id", "customer_id", "id cliente"]) ?? row[0]);

  const fn1 = clean(pickValue(row, headers, ["first_name", "primer nombre", "nombre"]) ?? row[2]);
  const fn2 = clean(pickValue(row, headers, ["first_name2", "segundo nombre"]) ?? row[3]);
  const ln1 = clean(pickValue(row, headers, ["last_name", "primer apellido", "apellido"]) ?? row[4]);
  const ln2 = clean(pickValue(row, headers, ["last_name2", "segundo apellido"]) ?? row[5]);

  const firstName = [fn1, fn2].filter(Boolean).join(" ").trim();
  const lastName = [ln1, ln2].filter(Boolean).join(" ").trim();
  const orgName = clean(pickValue(row, headers, ["org_name", "organizacion", "empresa"]));
  const email = cleanEmail(pickValue(row, headers, ["email_addr", "email", "correo", "correo electronico", "mail"]) ?? row[7]);
  const mobile = cleanPhone(pickValue(row, headers, ["mobile", "celular", "telefono"]));
  const nationalId = cleanNationalId(pickValue(row, headers, ["alt_cust_id", "customer_num", "cedula", "id", "identificacion id"]) ?? row[19]);
  const address = clean(pickValue(row, headers, ["address1", "municipo", "municipio", "direccion", "address"]) ?? row[9]);
  const segment = normalizeSegment(pickValue(row, headers, ["segmento", "id de segmento", "segment_id", "segment"]) ?? row[20]);
  const displayName = orgName || [firstName, lastName].filter(Boolean).join(" ").trim() || customerId;

  return {
    customer_id: customerId,
    first_name: firstName,
    last_name: lastName,
    org_name: orgName || null,
    display_name: displayName,
    email: email || null,
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
  const str = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!str || str.toUpperCase() === "NULL") return "";
  return str;
}

function cleanEmail(value) {
  const mail = clean(value).toLowerCase();
  return mail.includes("@") ? mail : "";
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

function normalizeSegment(value) {
  const raw = clean(value);
  if (!raw || raw === "-") return " - ";
  const match = raw.match(/comasa\s+(\d+)/i) ?? raw.match(/\b(1001|1002|1003|1102|1103|1104|1105)\b/);
  return match ? match[1] : raw;
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
