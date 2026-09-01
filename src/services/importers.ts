import type { Customer, ImportedPromotionRow, QuoteItem } from "../types/domain";

type ParseMode = "inspect" | "quote" | "promotion" | "customer";

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

export async function parsePromotionFile(file: File): Promise<ImportedPromotionRow[]> {
  return parseFileInWorker<ImportedPromotionRow[]>(file, "promotion");
}

export async function parseCustomerFile(file: File): Promise<Customer[]> {
  return parseFileInWorker<Customer[]>(file, "customer");
}
