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
        hostRegistry.list().map(async (host) => {
          try {
            const value = await viewRequest(
              getHostClient(host.hostId),
              { action: "catalog" },
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
    const unsubscribe = hostRegistry.subscribe(refresh);
    window.addEventListener("plugins-changed", refresh);
    return () => {
      controller.abort();
      unsubscribe();
      window.removeEventListener("plugins-changed", refresh);
    };
  }, []);
  return entries;
}
