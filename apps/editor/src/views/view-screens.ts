import { useEffect, useState } from "react";
import { hostRegistry, getHostClient } from "../host-client.ts";
import { viewRequest, type ViewScreen } from "./view-api.ts";
export function useViewScreens() {
  const [entries, setEntries] = useState<(ViewScreen & { hostId: string })[]>(
    [],
  );
  useEffect(() => {
    let controller: AbortController;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void Promise.all(
        hostRegistry.list().filter(host=>hostRegistry.get(host.hostId).state === "connected").map(async (host) => {
          try {
            const value = await viewRequest(
              getHostClient(host.hostId),
              { action: "catalog", screenCode: false },
              signal,
            );
            return (value.screens ?? []).map((screen) => ({
              ...screen,
              hostId: host.hostId,
            }));
          } catch {
            return [];
          }
        }),
      ).then((value) => {
        if (!signal.aborted) setEntries(value.flat());
      });
    };
    refresh();
    const states=()=>JSON.stringify(hostRegistry.list().map(host=>[host.hostId,hostRegistry.get(host.hostId).state]));
    let previous=states();
    const unsubscribe = hostRegistry.subscribe(()=>{const next=states();if(next!==previous){previous=next;refresh();}});
    window.addEventListener("plugins-changed", refresh);
    return () => {
      controller.abort();
      unsubscribe();
      window.removeEventListener("plugins-changed", refresh);
    };
  }, []);
  return entries;
}
