import { useEffect, useState } from "react";
import {
  readStoredDataStatuses,
  subscribeDataStatus,
  type DataStatusItem,
} from "../services/dataStatus";
import { testSupabaseConnection } from "../services/supabase";

function Led({ item }: { item: DataStatusItem }) {
  return (
    <span className="status-led-item" title={`${item.label}: ${item.detail}`}>
      <i className={`status-led ${item.value}`} />
      <span>{item.label}</span>
    </span>
  );
}

export function SystemStatusIndicator() {
  const [items, setItems] = useState<DataStatusItem[]>([
    { key: "supabase", label: "Supabase", value: "pending", detail: "Verificando" },
    ...readStoredDataStatuses(),
  ]);

  useEffect(() => {
    let active = true;
    testSupabaseConnection().then((result) => {
      if (!active) return;
      setItems([{ key: "supabase", label: "Supabase", value: result.ok ? "ok" : "warning", detail: result.label }, ...readStoredDataStatuses()]);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => subscribeDataStatus(() => {
    setItems((current) => [current[0], ...readStoredDataStatuses()]);
  }), []);

  return (
    <div className="system-status" aria-label="Estado operativo">
      {items.map((item) => <Led item={item} key={item.key} />)}
    </div>
  );
}
