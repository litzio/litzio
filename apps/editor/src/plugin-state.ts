import { useEffect, useRef, useState } from "react";
import { useHostClient } from "./host-context.tsx";
import type { PluginStatus } from "@litzio/plugin-sdk";
type SecretStatus = { supported: boolean; declarations: { id: string; configured: boolean; error?: string }[] };
export type Plugin = { registrationId?: string; folderSources?: unknown[]; iconDigest?: string; healthCheck?: string; secrets?: SecretStatus; id: string; name?: string; description?: string; version?: string; digest?: string; official?: boolean; bundled?: boolean; publisher?: { id: string; name: string }; trusted?: boolean; enabled: boolean; running: boolean; error?: string; status?: PluginStatus | null; settings?: Record<string, unknown>; settingsSchema?: { properties?: Record<string, { type?: string; title?: string; description?: string }> } };
export function usePlugins(active = true) {
  const client = useHostClient(), [plugins, setPlugins] = useState<Plugin[]>([]), [error, setError] = useState("");
  const latestRequest = useRef(0);
  const refresh = async () => {
    const request = ++latestRequest.current;
    try {
      const response = await client.request("/api/plugins");
      const value = await response.json();
      if (request !== latestRequest.current) return;
      if (!response.ok) throw new Error(value.error);
      setPlugins(value.plugins); setError("");
    } catch (e) { if (request === latestRequest.current) setError(String(e)); }
  };
  useEffect(() => { if (!active) return; void refresh(); const listener = (event: Event) => {
    const result = (event as CustomEvent<{ client: typeof client; plugins: Plugin[] }>).detail;
    if (result?.client === client) { ++latestRequest.current; setPlugins(result.plugins); setError(""); }
    else void refresh();
  }; window.addEventListener("plugins-changed", listener); return () => { ++latestRequest.current; window.removeEventListener("plugins-changed", listener); }; }, [client, active]);
  return { plugins, error, async change(action: string, args: Record<string, unknown>) {
    ++latestRequest.current;
    const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...args }) });
    const value = await response.json();
    if (!response.ok) {
      if (["enable", "settings", "secret-delete"].includes(action)) window.dispatchEvent(new Event("plugins-changed"));
      throw new Error(value.error ?? "Plugin operation failed");
    }
    window.dispatchEvent(new CustomEvent("plugins-changed", { detail: { client, plugins: value.plugins } }));
  } };
}
