import { useEffect, useState } from "react";
import type { HostClient } from "../host-client.ts";
import type { ComparisonTarget } from "./GeneratedComparison.tsx";

export type GeneratedConnection = ComparisonTarget & { source: string; plugin: string; job: string; match?: "document" | "source" };
/** Host-owned connection discovery; no filename inference or plugin execution. */
export function useGeneratedConnections(client: HostClient, root: string, refresh?: unknown, path?: string) {
  const [result, setResult] = useState<{ client: HostClient; root: string; path?: string; connections: GeneratedConnection[] }>();
  useEffect(() => {
    const controller = new AbortController();
    let generation = 0;
    const publish = (connections: GeneratedConnection[]) => setResult({ client, root, path, connections });
    const load = () => {
      const current = ++generation;
      if (!root) return;
      void client.request("/api/reviews", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generated-find", root, ...(path ? { path } : {}) }), signal: controller.signal
      }).then(async response => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted && current === generation) publish(result.documents);
      }).catch(() => { if (!controller.signal.aborted && current === generation) publish([]); });
    };
    load(); window.addEventListener("plugins-changed", load);
    return () => { controller.abort(); window.removeEventListener("plugins-changed", load); };
  }, [client, root, refresh, path]);
  return result?.client === client && result.root === root && result.path === path ? result.connections : [];
}
