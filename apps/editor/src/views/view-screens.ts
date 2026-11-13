import { useEffect, useState } from "react";
import { hostConnection, getHostClient } from "../host-client.ts";
import { viewRequest, type ViewScreen } from "./view-api.ts";
export function useViewScreens() {
  const [entries, setEntries] = useState<ViewScreen[]>([]);
  useEffect(() => {
    let controller: AbortController;
    const refresh = () => {
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal;
      if (hostConnection.get().state !== "connected") { setEntries([]); return; }
      const client = getHostClient();
      void viewRequest(client, { action: "screens", screenCode: false }, signal).then(value => {
        if (!signal.aborted) setEntries(value.screens ?? []);
      }).catch(() => { if (!signal.aborted) setEntries([]); });
    };
    let previous = hostConnection.get().state;
    const unsubscribe = hostConnection.subscribe(() => {
      const next = hostConnection.get().state;
      if (next !== previous) { previous = next; refresh(); }
    });
    refresh(); window.addEventListener("plugins-changed", refresh);
    return () => { controller.abort(); unsubscribe(); window.removeEventListener("plugins-changed", refresh); };
  }, []);
  return entries;
}
