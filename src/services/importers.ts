import type { Customer, ImportedPromotionRow, InventoryRecord, Product, QuoteItem, StoreLocation } from "../types/domain";

type ParseMode = "inspect" | "quote" | "promotion" | "customer" | "catalog" | "inventory" | "store";

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function splitPastedLine(line: string) {
  return line
    .trim()
    .split(/\t|,|;|\s+/)
    .map((cell) => cell.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function parseFileInWorker<T>(file: File, mode: ParseMode) {
  return new Promise<T>((resolve, reject) => {
    const id = crypto.randomUUID();
    const worker = new Worker(new URL("../workers/fileParser.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; result?: T; error?: string }>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.ok) resolve(event.data.result as T);
      else reject(new Error(event.data.error ?? "No se pudo leer el archivo."));
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage({ id, file, mode });
  });
}

export async function inspectDataFile(file: File) {
  return parseFileInWorker<{ rows: number; headers: string[] }>(file, "inspect");
}

export async function parseQuoteFile(file: File): Promise<QuoteItem[]> {
  return parseFileInWorker<QuoteItem[]>(file, "quote");
}

export function parseQuoteText(text: string): QuoteItem[] {
  const rows = text
    .split(/\r?\n/)
    .map(splitPastedLine)
    .filter((row) => row.length > 0);

  if (!rows.length) return [];

  const header = rows[0].map(normalizeHeader);
  const skuIndex = header.findIndex((key) => ["sku", "item", "articulo", "codigo", "cod"].includes(key));
  const quantityIndex = header.findIndex((key) => ["cantidad", "quantity", "qty", "cant"].includes(key));
  const hasHeader = skuIndex >= 0;
  const body = hasHeader ? rows.slice(1) : rows;

  return body
    .map((row) => {
      const rawSku = row[hasHeader ? skuIndex : 0] ?? "";
      const rawQuantity = hasHeader ? row[quantityIndex] : row[1];
      return {
        sku: String(rawSku).trim(),
        quantity: Math.max(1, toNumber(rawQuantity) ?? 1),
      };
    })
    .filter((item) => item.sku);
}

export async function parsePromotionFile(file: File): Promise<ImportedPromotionRow[]> {
  return parseFileInWorker<ImportedPromotionRow[]>(file, "promotion");
}

export async function parseCustomerFile(file: File): Promise<Customer[]> {
  return parseFileInWorker<Customer[]>(file, "customer");
}

export async function parseCatalogFile(file: File): Promise<Product[]> {
  return parseFileInWorker<Product[]>(file, "catalog");
}

export async function parseInventoryFile(file: File): Promise<InventoryRecord[]> {
  return parseFileInWorker<InventoryRecord[]>(file, "inventory");
}

export async function parseStoreFile(file: File): Promise<StoreLocation[]> {
  return parseFileInWorker<StoreLocation[]>(file, "store");
}
