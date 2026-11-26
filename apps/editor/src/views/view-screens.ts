import { useEffect, useState } from "react";
import { hostConnection } from "../host-client.ts";
import { viewRequest, type ViewScreen } from "./view-api.ts";
export function useViewScreens() {
  const [entries, setEntries] = useState<ViewScreen[]>([]);
  useEffect(() => {
    let controller: AbortController;
    let refreshing = false;
    const availableClient = () => hostConnection.get().state === "connected" ? hostConnection.getScreenClient() : undefined;
    const refresh = () => {
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      const client = availableClient();
      if (!client) { refreshing = false; setEntries([]); return; }
      refreshing = true;
      void viewRequest(client, { action: "screens", screenCode: false }, signal).then(value => {
        if (!signal.aborted) setEntries(value.screens ?? []);
      }).catch(() => { if (!signal.aborted) setEntries([]); }).finally(() => { if (!signal.aborted) refreshing = false; });
    };
    let previous = availableClient();
    const unsubscribe = hostConnection.subscribe(() => {
      const next = availableClient();
      if (next !== previous) { previous = next; refresh(); }
    });
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const interval = setInterval(() => { if (!refreshing && document.visibilityState === "visible") refresh(); }, 2000);
    refresh(); window.addEventListener("plugins-changed", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval); controller.abort(); unsubscribe(); window.removeEventListener("plugins-changed", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return entries;
}
