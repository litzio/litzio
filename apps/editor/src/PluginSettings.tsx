import { useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { useHostClient } from "./host-context.tsx";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { SettingsSwitch } from "./components/ui/settings.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog.tsx";
import type { PluginStatus } from "@litzio/plugin-sdk";
type Plugin = { id: string; name?: string; description?: string; version?: string; digest?: string; official?: boolean; trusted?: boolean; enabled: boolean; running: boolean; error?: string; status?: PluginStatus | null; settings?: Record<string, unknown>; settingsSchema?: { properties?: Record<string, { type?: string; title?: string }> } };
export function usePlugins() {
  const client = useHostClient(), [plugins, setPlugins] = useState<Plugin[]>([]), [error, setError] = useState("");
  const refresh = async () => {
    try { const response = await client.request("/api/plugins"); const value = await response.json(); if (!response.ok) throw new Error(value.error); setPlugins(value.plugins); setError(""); } catch (e) { setError(String(e)); }
  };
  useEffect(() => { void refresh(); const listener = () => void refresh(); window.addEventListener("plugins-changed", listener); return () => window.removeEventListener("plugins-changed", listener); }, [client]);
  return { plugins, error, async change(action: string, args: Record<string, unknown>) {
    const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...args }) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Plugin operation failed"); window.dispatchEvent(new Event("plugins-changed")); await refresh();
  } };
}
export function PluginSettings() {
  const { plugins, error, change } = usePlugins(), [directory, setDirectory] = useState(""), [problem, setProblem] = useState(""), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string>(), [trust, setTrust] = useState<Plugin>();
  const current = plugins.find(p => p.id === selected);
  const run = async (action: string, args: Record<string, unknown>) => { setBusy(true); setProblem(""); try { await change(action, args); } catch (e) { setProblem(String(e)); } finally { setBusy(false); } };
  return <section className="settings-group" aria-label="Plugins">
    <p className="settings-status">Plugins run on this Host with its OS permissions. Every plugin requires explicit activation.</p>
    <label className="settings-heading" htmlFor="plugin-directory">Local plugin artifact</label>
    <Input id="plugin-directory" value={directory} onChange={e => setDirectory(e.target.value)} />
    <Button variant="secondary" disabled={busy || !directory.trim()} onClick={() => void run("register", { directory })}>Register plugin</Button>
    {error || problem ? <p role="alert">{error || problem}</p> : null}
    {plugins.map(plugin => <div key={plugin.id} className="settings-section">
      <Button variant="ghost" className="justify-start" onClick={() => setSelected(plugin.id)}>{plugin.name ?? plugin.id}</Button>
      <p className="settings-status">{plugin.running ? "Running" : plugin.enabled ? "Unavailable" : "Disabled"} · {plugin.official ? "Official" : "Community"} · {plugin.trusted ? "Trusted" : "Trust required"}</p>
      {plugin.error ? <p role="alert">{plugin.error}</p> : null}
      <SettingsSwitch label={`Enable ${plugin.name ?? plugin.id}`} checked={plugin.enabled} disabled={busy || !plugin.trusted && !plugin.enabled} onChange={enabled => void run(enabled ? "enable" : "disable", { id: plugin.id })} />
      {!plugin.trusted && plugin.digest ? <Button variant="secondary" disabled={busy} onClick={() => { setTrust(plugin); }}>Trust this artifact</Button> : null}
      <p className="settings-status">{plugin.status ? `${plugin.status.available ? "Available" : "Unsupported or unavailable"} · ${plugin.status.message}` : ""}</p>
      {plugin.status?.accounts.map(account => <p key={account.id} className="settings-status" title={account.source}>{account.label} · {account.source}</p>)}
    </div>)}
    <Dialog open={!!trust} onOpenChange={open => { if (!open) setTrust(undefined); }}><DialogContent><DialogHeader><DialogTitle>Trust {trust?.name ?? trust?.id}?</DialogTitle><DialogDescription>This code runs with the Host OS account permissions. Trust only an artifact you have reviewed.</DialogDescription></DialogHeader><p style={{ overflowWrap: "anywhere" }}>{trust?.digest}</p><Button disabled={busy} onClick={() => { if (trust) void run("trust", { id: trust.id, digest: trust.digest }).then(() => setTrust(undefined)); }}>Trust this artifact</Button><Button variant="secondary" onClick={() => setTrust(undefined)}>Cancel</Button></DialogContent></Dialog>
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(undefined); }}><DialogContent><DialogHeader><DialogTitle>{current?.name ?? current?.id}</DialogTitle><DialogDescription>{current?.description}</DialogDescription></DialogHeader><p>{current?.version}</p>{Object.entries(current?.settingsSchema?.properties ?? {}).map(([key, field]) => field.type === "boolean" ? <SettingsSwitch key={key} label={field.title ?? key} disabled={busy || current?.enabled} checked={current?.settings?.[key] === true} onChange={value => void run("settings", { id: current?.id, settings: { ...current?.settings, [key]: value } })} /> : ["string", "number", "integer"].includes(field.type ?? "") ? <label key={key}>{field.title ?? key}<Input disabled={busy || current?.enabled} type={field.type === "string" ? "text" : "number"} defaultValue={String(current?.settings?.[key] ?? "")} onBlur={event => { const value = field.type === "string" ? event.target.value : Number(event.target.value); if (current?.settings?.[key] !== value) void run("settings", { id: current?.id, settings: { ...current?.settings, [key]: value } }); }} /></label> : <p key={key}>Use plugins settings for {key}.</p>)}<p className="settings-status" style={{ overflowWrap: "anywhere" }}>{current?.digest}</p></DialogContent></Dialog>
  </section>;
}
export function OneDriveIcon() { return <Cloud className="sidebar-tree-icon" aria-label="OneDrive" />; }
export function defaultFolderCandidate(plugins: Plugin[], existing: { folders: number; recent: number; documentPath?: string | null }) {
  if (existing.folders || existing.recent || existing.documentPath) return undefined;
  const candidates = plugins.flatMap(p => p.running ? p.status?.folders.filter(f => f.defaultCandidate) ?? [] : []);
  return candidates.length === 1 ? candidates[0] : undefined;
}
