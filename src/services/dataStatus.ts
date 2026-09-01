export type DataStatusKey = "supabase" | "promotions" | "customers" | "master" | "inventory";
export type DataStatusValue = "ok" | "warning" | "pending" | "error";

export type DataStatusItem = {
  key: DataStatusKey;
  label: string;
  value: DataStatusValue;
  detail: string;
};

const storageKey = "comasa:data-status";
const eventName = "comasa:data-status-change";

const defaults: Record<Exclude<DataStatusKey, "supabase">, Omit<DataStatusItem, "key">> = {
  promotions: { label: "Promos", value: "pending", detail: "Pendiente" },
  customers: { label: "Clientes", value: "pending", detail: "Pendiente" },
  master: { label: "Maestro", value: "pending", detail: "Pendiente" },
  inventory: { label: "Inventario", value: "pending", detail: "Pendiente" },
};

export function readStoredDataStatuses() {
  const stored = localStorage.getItem(storageKey);
  const parsed = stored ? JSON.parse(stored) as Partial<Record<DataStatusKey, DataStatusItem>> : {};
  return Object.entries(defaults).map(([key, item]) => ({
    key: key as DataStatusKey,
    ...item,
    ...parsed[key as DataStatusKey],
  }));
}

export function updateStoredDataStatus(key: Exclude<DataStatusKey, "supabase">, value: DataStatusValue, detail: string) {
  const stored = localStorage.getItem(storageKey);
  const parsed = stored ? JSON.parse(stored) as Partial<Record<DataStatusKey, DataStatusItem>> : {};
  parsed[key] = { key, label: defaults[key].label, value, detail };
  localStorage.setItem(storageKey, JSON.stringify(parsed));
  window.dispatchEvent(new Event(eventName));
}

export function subscribeDataStatus(listener: () => void) {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
