import { useEffect, useState } from "react";
import { useHostClient } from "./host-context.tsx";
import type { PluginStatus } from "@litzio/plugin-sdk";
type SecretStatus = { supported: boolean; declarations: { id: string; configured: boolean; error?: string }[] };
export type Plugin = { secrets?: SecretStatus; id: string; name?: string; description?: string; version?: string; digest?: string; official?: boolean; bundled?: boolean; publisher?: { id: string; name: string }; trusted?: boolean; enabled: boolean; running: boolean; error?: string; status?: PluginStatus | null; settings?: Record<string, unknown>; settingsSchema?: { properties?: Record<string, { type?: string; title?: string }> } };
export function usePlugins(active = true) {
  const client = useHostClient(), [plugins, setPlugins] = useState<Plugin[]>([]), [error, setError] = useState("");
  const refresh = async () => {
    try { const response = await client.request("/api/plugins"); const value = await response.json(); if (!response.ok) throw new Error(value.error); setPlugins(value.plugins); setError(""); } catch (e) { setError(String(e)); }
  };
  useEffect(() => { if (!active) return; void refresh(); const listener = () => void refresh(); window.addEventListener("plugins-changed", listener); return () => window.removeEventListener("plugins-changed", listener); }, [client, active]);
  return { plugins, error, async change(action: string, args: Record<string, unknown>) {
    const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...args }) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Plugin operation failed"); window.dispatchEvent(new Event("plugins-changed")); await refresh();
  } };
}
