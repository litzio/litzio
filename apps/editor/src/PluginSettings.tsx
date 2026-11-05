import { i18n } from "./i18n.ts";
import { Notice } from "./ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.tsx";
import "./shell/host-settings.css";
import "./plugin-settings.css";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useHostClient } from "./host-context.tsx";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { SettingsSwitch } from "./components/ui/settings.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog.tsx";
export { OneDriveIcon } from "./OneDriveIcon.tsx";
import type { PluginStatus } from "@litzio/plugin-sdk";
type Plugin = { id: string; name?: string; description?: string; version?: string; digest?: string; official?: boolean; publisher?: { id: string; name: string }; trusted?: boolean; enabled: boolean; running: boolean; error?: string; status?: PluginStatus | null; settings?: Record<string, unknown>; settingsSchema?: { properties?: Record<string, { type?: string; title?: string }> } };
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
  return <section className="settings-group" aria-label={i18n.t("Plugins")}>
    <Notice tone="warning" className="host-access-warning"><span>{i18n.t("Plugins use Host OS permissions")}</span>
      <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Plugin access details")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Plugins run on this Host with its OS permissions. Enable only code you trust.")}</TooltipContent></Tooltip>
    </Notice>
    <form className="settings-section settings-section--stacked" onSubmit={event => { event.preventDefault(); void run("register", { directory }); }}>
      <label className="settings-heading" htmlFor="plugin-directory">{i18n.t("Local plugin artifact")}</label>
      <Input id="plugin-directory" placeholder="C:\plugins\onedrive\artifact" value={directory} onChange={e => setDirectory(e.target.value)} />
      <Button type="submit" size="sm" variant="secondary" disabled={busy || !directory.trim()}>{i18n.t("Register plugin")}</Button>
    </form>
    {error || problem ? <Notice tone="error">{error || problem}</Notice> : null}
    {plugins.map(plugin => <section key={plugin.id} className="settings-section settings-section--stacked host-registration" aria-label={plugin.name ?? plugin.id}>
      <div className="plugin-summary-row">
        <div className="host-summary">
          <div className="plugin-heading">
            <h3 className="settings-heading"><Button size="sm" variant="ghost" className="plugin-name" onClick={() => setSelected(plugin.id)}>{plugin.name ?? plugin.id}</Button></h3>
            <div className="plugin-badges">
              <span className="plugin-badge">{plugin.publisher?.name ?? plugin.id}</span>
              <span className="plugin-badge">{i18n.t(plugin.official ? "Official plugin" : "Community plugin")}</span>
              <span className="plugin-badge">{i18n.t(plugin.trusted ? "Trusted artifact" : "Trust required")}</span>
            </div>
          </div>
          <p className="settings-description">{plugin.description}</p>
        </div>
        <input className="settings-switch" type="checkbox" role="switch" aria-label={i18n.t("Enable {{name}}", { name: plugin.name ?? plugin.id })} checked={plugin.enabled} disabled={busy || !plugin.trusted && !plugin.enabled} onChange={event => void run(event.target.checked ? "enable" : "disable", { id: plugin.id })} />
      </div>
      <div className="plugin-states">
        <PluginState tone={plugin.error ? "danger" : plugin.running ? "connected" : "muted"} label={i18n.t(plugin.error ? "Plugin error" : plugin.running ? "Plugin running" : plugin.enabled ? "Plugin unavailable" : "Plugin disabled")} detail={plugin.error} />
        {plugin.status ? <PluginState tone={plugin.status.available ? "connected" : "warning"} label={i18n.t(!plugin.status.available ? "Detection unsupported" : plugin.status.folders.length ? "Folder detected" : "No folder detected")} detail={plugin.status.message} /> : null}
      </div>
      {!plugin.trusted && plugin.digest ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => setTrust(plugin)}>{i18n.t("Trust this artifact")}</Button> : null}
      {plugin.status?.accounts.map(account => <p key={account.id} className="settings-description plugin-account">{i18n.t("Account: {{label}} ({{source}})", { label: account.label, source: account.source })}</p>)}
    </section>)}
    <Dialog open={!!trust} onOpenChange={open => { if (!open) setTrust(undefined); }}><DialogContent><DialogHeader><DialogTitle>Trust {trust?.name ?? trust?.id}?</DialogTitle><DialogDescription>This code runs with the Host OS account permissions. Trust only an artifact you have reviewed.</DialogDescription></DialogHeader><p style={{ overflowWrap: "anywhere" }}>{trust?.digest}</p><Button disabled={busy} onClick={() => { if (trust) void run("trust", { id: trust.id, digest: trust.digest }).then(() => setTrust(undefined)); }}>Trust this artifact</Button><Button variant="secondary" onClick={() => setTrust(undefined)}>Cancel</Button></DialogContent></Dialog>
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(undefined); }}><DialogContent><DialogHeader><DialogTitle>{current?.name ?? current?.id}</DialogTitle><DialogDescription>{current?.description}</DialogDescription></DialogHeader><p>{current?.version}</p>{Object.entries(current?.settingsSchema?.properties ?? {}).map(([key, field]) => field.type === "boolean" ? <SettingsSwitch key={key} label={field.title ?? key} disabled={busy || current?.enabled} checked={current?.settings?.[key] === true} onChange={value => void run("settings", { id: current?.id, settings: { ...current?.settings, [key]: value } })} /> : ["string", "number", "integer"].includes(field.type ?? "") ? <label key={key}>{field.title ?? key}<Input disabled={busy || current?.enabled} type={field.type === "string" ? "text" : "number"} defaultValue={String(current?.settings?.[key] ?? "")} onBlur={event => { const value = field.type === "string" ? event.target.value : Number(event.target.value); if (current?.settings?.[key] !== value) void run("settings", { id: current?.id, settings: { ...current?.settings, [key]: value } }); }} /></label> : <p key={key}>Use plugins settings for {key}.</p>)}<p className="settings-status" style={{ overflowWrap: "anywhere" }}>{current?.digest}</p></DialogContent></Dialog>
  </section>;
}
function PluginState({ tone, label, detail }: { tone: string; label: string; detail?: string }) {
  return <span className="host-status" data-tone={tone} role="status"><span className="agent-dot" aria-hidden="true" />{label}{detail ? <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Plugin status details")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{detail}</TooltipContent></Tooltip> : null}</span>;
}
export function defaultFolderCandidate(plugins: Plugin[], existing: { folders: number; recent: number; documentPath?: string | null }) {
  if (existing.folders || existing.recent || existing.documentPath) return undefined;
  const candidates = plugins.flatMap(p => p.running ? p.status?.folders.filter(f => f.defaultCandidate) ?? [] : []);
  return candidates.length === 1 ? candidates[0] : undefined;
}
