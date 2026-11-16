export type SyncProgressCallback = (sent: number, total: number, detail?: string) => void;

export async function uploadInChunks<T>(
  rows: T[],
  chunkSize: number,
  onProgress: SyncProgressCallback | undefined,
  detail: string,
  upload: (chunk: T[]) => Promise<{ error: { message: string } | null }>,
) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const response = await upload(chunk);
    if (response.error) return { ok: false, message: response.error.message };
    onProgress?.(Math.min(index + chunk.length, rows.length), rows.length, detail);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { ok: true, message: `Carga completada: ${rows.length} filas.` };
}

export function escapePostgrestPattern(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

export function isMissingRpcFunctionError(error: { code?: string; message: string }) {
  return error.code === "PGRST202" || error.message.toLowerCase().includes("could not find the function");
}

export function isMissingColumnError(error: { code?: string; message: string }) {
  const msg = (error.message ?? "").toLowerCase();
  if (error.code === "42703" || error.code === "PGRST204") return true;
  // Algunos mensajes llegan sin código; solo se aceptan si describen una columna inexistente.
  return msg.includes("column") && (msg.includes("does not exist") || msg.includes("could not find"));
}

export function todayIso() {
  const now = new Date();
  const localTime = now.getTime() - now.getTimezoneOffset() * 60000;
  return new Date(localTime).toISOString().slice(0, 10);
}

export function isExpired(endsAt: string | null) {
  return Boolean(endsAt && endsAt < todayIso());
}

export function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function unique<T>(values: T[]) {
  return [...new Set(values)];
}
