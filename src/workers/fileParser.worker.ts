import { readSheet } from "read-excel-file/web-worker";
import type { Customer, ImportedPromotionRow, OfferType, QuoteItem } from "../types/domain";

type ParseMode = "inspect" | "quote" | "promotion" | "customer";

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function tableToObjects(table: unknown[][]) {
  const headerIndex = findHeaderIndex(table);
  const headers = table[headerIndex] ?? [];
  const secondaryHeaders = table[headerIndex + 1] ?? [];
  const body = table.slice(headerIndex + 1);
  const cleanHeaders = headers.map((header, index) => header || secondaryHeaders[index] || index);

  return body.map((row) =>
    row.reduce<Record<string, unknown>>((acc, value, index) => {
      acc[String(cleanHeaders[index] ?? index)] = value ?? "";
      return acc;
    }, {}),
  );
}

function findHeaderIndex(table: unknown[][]) {
  const required = ["id de oferta", "id de promo", "articulo", "tipo oferta"];
  const index = table.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return required.every((name) => headers.includes(name));
  });

  return index >= 0 ? index : 0;
}

function parseDelimited(text: string, delimiter: "," | "\t") {
  const rows = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")));
  return tableToObjects(rows);
}

async function rowsFromFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv" || extension === "tsv") {
    return parseDelimited(await file.text(), extension === "tsv" ? "\t" : ",");
  }

  return tableToObjects(await readSheet(file));
}

function normalizeRow(row: Record<string, unknown>) {
  return Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[normalizeHeader(key)] = value;
    return acc;
  }, {});
}

function pick(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && value !== "") return value;
  }

  return undefined;
}

function normalizeSegment(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return " - ";

  const match = raw.match(/comasa\s+(\d+)/i) ?? raw.match(/\b(1001|1002|1003|1102|1103|1104|1105)\b/);
  return match?.[1] ?? raw;
}

function toDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function parseQuoteRows(rows: Record<string, unknown>[]): QuoteItem[] {
  return rows.map((row) => {
    const data = normalizeRow(row);
    return {
      sku: String(data.sku ?? data.item ?? data.articulo ?? "").trim(),
      quantity: toNumber(data.cantidad ?? data.quantity ?? data.qty) ?? 1,
    };
  });
}

function parsePromotionRows(rows: Record<string, unknown>[]): ImportedPromotionRow[] {
  const validTypes: OfferType[] = ["LINE_ITEM_DISCOUNT", "TIERED_DISCOUNT", "FIXED_QTY_PRICE", "KIT_OFFER"];

  return rows.flatMap((row) => {
    const data = normalizeRow(row);
    const type = String(pick(data, ["tipo oferta"]) ?? "LINE_ITEM_DISCOUNT").trim() as OfferType;
    if (!validTypes.includes(type)) return [];

    const discountType = String(pick(data, ["tipo de descuento"]) ?? "").trim();
    const detailAmount = toNumber(pick(data, ["detail change amount"]));
    const sellingUnitRetail = toNumber(pick(data, ["selling unit retail"]));

    return {
      offerId: String(pick(data, ["id de oferta"]) ?? "").trim(),
      promotionId: String(pick(data, ["id de promo"]) ?? "").trim(),
      promotionName: String(pick(data, ["descripcion", "descripci n"]) ?? "").trim(),
      startsAt: toDate(pick(data, ["fecha inicial"])),
      endsAt: toDate(pick(data, ["fecha final"])),
      storeId: String(pick(data, ["ubicacion"]) ?? "").trim(),
      sku: String(pick(data, ["articulo"]) ?? "").trim(),
      description: String(pick(data, ["descripcion de articulo", "descripci n de articulo"]) ?? "").trim(),
      type,
      quantity: toNumber(pick(data, ["cantidad"])),
      fixedPrice: discountType === "OVERRIDE_PRICE" ? detailAmount ?? sellingUnitRetail : sellingUnitRetail,
      discountPercent: toNumber(pick(data, ["detail change percent"])),
      discountType,
      segment: normalizeSegment(pick(data, ["segmento"])),
    };
  });
}

function parseCustomerRows(rows: Record<string, unknown>[]): Customer[] {
  return deduplicateCustomers(
    rows
      .map((row) => {
        const data = normalizeRow(row);
        const customerId = String(pick(data, ["cust_id", "customer_id", "id cliente"]) ?? "").trim();
        const firstName = String(pick(data, ["first_name", "nombre"]) ?? "").trim();
        const lastName = String(pick(data, ["last_name", "apellido"]) ?? "").trim();
        const orgName = String(pick(data, ["org_name", "organizacion", "empresa"]) ?? "").trim();
        const mobile = cleanPhone(pick(data, ["mobile", "celular", "telefono"]));
        const nationalId = cleanNationalId(pick(data, ["customer_num", "cedula", "id"]));
        const segment = normalizeSegment(pick(data, ["segmento"]));
        const address = String(pick(data, ["municipo", "municipio", "direccion"]) ?? "").trim();
        const displayName = orgName || [firstName, lastName].filter(Boolean).join(" ").trim() || customerId;

        return {
          customerId,
          firstName,
          lastName,
          orgName: orgName || undefined,
          displayName,
          mobile: mobile || undefined,
          nationalId: nationalId || undefined,
          segment,
          address: address || undefined,
        };
      })
      .filter((customer) => customer.customerId && customer.displayName),
  );
}

function deduplicateCustomers(customers: Customer[]) {
  const grouped = new Map<string, Customer>();

  customers.forEach((customer) => {
    const current = grouped.get(customer.customerId);
    grouped.set(customer.customerId, current ? { ...current, ...withoutEmptyValues(customer) } : customer);
  });

  return [...grouped.values()];
}

function withoutEmptyValues(customer: Customer) {
  return Object.entries(customer).reduce<Partial<Customer>>((acc, [key, value]) => {
    if (value !== undefined && value !== "") acc[key as keyof Customer] = value;
    return acc;
  }, {});
}

function cleanPhone(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw === "0" ? "" : raw;
}

function cleanNationalId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "0") return "";
  return raw.includes("|") ? raw.split("|").pop()?.trim() ?? "" : raw;
}

self.onmessage = async (event: MessageEvent<{ id: string; file: File; mode: ParseMode }>) => {
  const { id, file, mode } = event.data;
  try {
    const rows = await rowsFromFile(file);
    const result =
      mode === "inspect"
        ? { rows: rows.length, headers: Object.keys(rows[0] ?? {}).map(normalizeHeader) }
        : mode === "quote"
          ? parseQuoteRows(rows)
          : mode === "customer"
            ? parseCustomerRows(rows)
            : parsePromotionRows(rows);

    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : "No se pudo leer el archivo." });
  }
};
