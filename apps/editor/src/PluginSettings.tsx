import { FolderDialog } from "./shell/FolderDialog.tsx";
import { i18n } from "./i18n.ts";
import { Notice } from "./ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.tsx";
import { useEffect, useRef, useState } from "react";
import { healthCheckResultSchema, type HealthCheckResult } from "@litzio/plugin-sdk";
import { Info, Settings } from "lucide-react";
import { useHostClient } from "./host-context.tsx";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { SettingsSwitch } from "./components/ui/settings.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog.tsx";
export { OneDriveIcon } from "./OneDriveIcon.tsx";
import { usePlugins, type Plugin } from "./plugin-state.ts";
export { usePlugins } from "./plugin-state.ts";
export function PluginSettings() {
  const { plugins, error, change } = usePlugins(), [choosing, setChoosing] = useState(false), [problem, setProblem] = useState(""), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string>(), [trust, setTrust] = useState<Plugin>();
  const client = useHostClient();
  const current = plugins.find(p => p.id === selected);
  const run = async (action: string, args: Record<string, unknown>) => { setBusy(true); setProblem(""); try { await change(action, args); } catch (e) { setProblem(String(e)); } finally { setBusy(false); } };
  return <section className="settings-group" aria-label={i18n.t("Plugins")}>
    <Notice tone="warning" className="host-access-warning"><span>{i18n.t("Plugins use Host OS permissions")}</span>
      <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Plugin access details")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Plugins run on this Host with its OS permissions. Enable only code you trust.")}</TooltipContent></Tooltip>
    </Notice>
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setChoosing(true)}>{i18n.t("Add plugin…")}</Button>
    <FolderDialog open={choosing} title={i18n.t("Add plugin…")} showSidebarHint={false} initialPath="" recent={[]}
      browse={async path => { const r = await client.request(`/api/folder-browse?path=${encodeURIComponent(path)}`); const v = await r.json(); if (!r.ok) throw new Error(v.error); return v; }}
      places={async () => { const r = await client.request("/api/folder-places"); const v = await r.json(); if (!r.ok) throw new Error(v.error); return v.places; }}
      onClose={() => setChoosing(false)} onOpen={async directory => { try { await change("register", { directory }); setChoosing(false); return ""; } catch (e) { return String(e); } }} />
    {error || problem && !current ? <Notice tone="error">{error || problem}</Notice> : null}
    {plugins.map(plugin => <section key={plugin.id} className="settings-section settings-section--stacked host-registration" aria-label={plugin.name ?? plugin.id}>
      <div className="plugin-summary-row">
        <div className="host-summary">
          <div className="plugin-heading">
            <h3 className="settings-heading">{plugin.name ?? plugin.id}</h3>
            <div className="plugin-badges">
              <span className="plugin-badge">{plugin.publisher?.name ?? plugin.id}</span>
              <span className="plugin-badge">{i18n.t(plugin.official ? "Official plugin" : "Community plugin")}</span>
              <span className="plugin-badge">{i18n.t(plugin.trusted ? "Trusted artifact" : "Trust required")}</span>
            </div>
          </div>
          <p className="settings-description">{plugin.description}</p>
        </div>
        <div className="plugin-controls">
          <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("{{name}} settings", { name: plugin.name ?? plugin.id })} onClick={() => setSelected(plugin.id)} />}><Settings aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Settings")}</TooltipContent></Tooltip>
          <input className="settings-switch" type="checkbox" role="switch" aria-label={i18n.t("Enable {{name}}", { name: plugin.name ?? plugin.id })} checked={plugin.enabled} disabled={busy || !plugin.trusted && !plugin.enabled} onChange={event => void run(event.target.checked ? "enable" : "disable", { id: plugin.id })} />
        </div>
      </div>
      <div className="plugin-states">
        <PluginState tone={plugin.error ? "danger" : plugin.running ? "connected" : "muted"} label={i18n.t(plugin.error ? "Plugin error" : plugin.running ? "Plugin running" : plugin.enabled ? "Plugin unavailable" : "Plugin disabled")} detail={plugin.error} />
        {plugin.status ? <PluginState tone={plugin.status.available ? "connected" : "warning"} label={i18n.t(!plugin.status.available ? "Detection unsupported" : plugin.status.folders.length ? "Folder detected" : "No folder detected")} detail={plugin.status.message} /> : null}
      </div>
      {!plugin.bundled && !plugin.trusted && plugin.digest ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => setTrust(plugin)}>{i18n.t("Trust this artifact")}</Button> : null}
      {plugin.status?.accounts.map(account => <p key={account.id} className="settings-description plugin-account">{i18n.t("Account: {{label}} ({{source}})", { label: account.label, source: account.source })}</p>)}
    </section>)}
    <Dialog open={!!trust} onOpenChange={open => { if (!open) setTrust(undefined); }}><DialogContent><DialogHeader><DialogTitle>Trust {trust?.name ?? trust?.id}?</DialogTitle><DialogDescription>This code runs with the Host OS account permissions. Trust only an artifact you have reviewed.</DialogDescription></DialogHeader><p style={{ overflowWrap: "anywhere" }}>{trust?.digest}</p><Button disabled={busy} onClick={() => { if (trust) void run("trust", { id: trust.id, digest: trust.digest }).then(() => setTrust(undefined)); }}>Trust this artifact</Button><Button variant="secondary" onClick={() => setTrust(undefined)}>Cancel</Button></DialogContent></Dialog>
    <Dialog open={!!current} onOpenChange={open => { if (!open) setSelected(undefined); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{current?.name ?? current?.id}</DialogTitle>
          <p className="settings-status">{current?.version}</p>
          <DialogDescription>{current?.description}</DialogDescription>
        </DialogHeader>
        {problem ? <Notice tone="error">{problem}</Notice> : null}
        {Object.entries(current?.settingsSchema?.properties ?? {}).map(([key, field]) => field.type === "boolean" ?
          <SettingsSwitch key={key} label={<SettingLabel title={field.title ?? key} description={field.description} />} disabled={busy} checked={current?.settings?.[key] === true}
            onChange={value => void run("settings", { id: current?.id, settings: { ...current?.settings, [key]: value } })} /> :
          ["string", "number", "integer"].includes(field.type ?? "") ?
            <label key={key}><SettingLabel title={field.title ?? key} description={field.description} />
              <Input disabled={busy} type={field.type === "string" ? "text" : "number"} defaultValue={String(current?.settings?.[key] ?? "")} onBlur={event => {
                if (String(current?.settings?.[key] ?? "") === event.target.value) return;
                const value = field.type === "string" ? event.target.value : Number(event.target.value);
                if (current?.settings?.[key] !== value) void run("settings", { id: current?.id, settings: { ...current?.settings, [key]: value } });
              }} />
            </label> : <p key={key}>Use plugins settings for {key}.</p>)}
        <PluginSecrets key={`secrets:${current?.id}`} plugin={current} busy={busy} run={run} />
        <PluginHealthCheck key={`health:${current?.id}`} plugin={current} busy={busy} />
        <details><summary>{i18n.t("Details")}</summary><p className="settings-status" style={{ overflowWrap: "anywhere" }}>{current?.digest}</p></details>
      </DialogContent>
    </Dialog>
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

function PluginSecrets({ plugin, busy, run }: { plugin?: Plugin; busy: boolean; run: (action: string, args: Record<string, unknown>) => Promise<void> }) {
  const client = useHostClient();
  const [values, setValues] = useState<Record<string, string>>({}), [problem, setProblem] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => { setValues({}); setProblem(""); }, [client, plugin?.id]);
  if (!plugin?.secrets?.declarations.length) return null;
  const supported = plugin.secrets.supported;
  return <section className="settings-section settings-section--stacked" aria-label={i18n.t("Plugin secrets")}>
    {!supported ? <Notice tone="warning">{i18n.t("Plugin secrets require a Windows Host")}</Notice> : null}
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    {plugin.secrets.declarations.map(secret => <form key={secret.id} className="plugin-secret-form" onSubmit={async event => {
      event.preventDefault(); setSaving(true); setProblem(""); const value = values[secret.id]; setValues(v => ({ ...v, [secret.id]: "" }));
      try {
        const response = await client.request("/api/plugins/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plugin.id, name: secret.id, value }) });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? i18n.t("Unable to store plugin secret")); }
      } catch (error) { setProblem(error instanceof Error ? error.message : i18n.t("Unable to store plugin secret")); } finally { window.dispatchEvent(new Event("plugins-changed")); setSaving(false); }
    }}>
      <label>{secret.id}: {i18n.t(secret.error ? "Unavailable or damaged" : secret.configured ? "Configured" : "Not configured")}<Input type="password" autoComplete="new-password" disabled={!supported || busy || saving} value={values[secret.id] ?? ""} onChange={e => setValues(v => ({ ...v, [secret.id]: e.target.value }))} /></label>
      {secret.error ? <Notice tone="error">{i18n.t("Unable to read this secret. Delete or replace it.")}</Notice> : null}
      <div className="settings-actions"><Button type="submit" size="sm" variant="secondary" disabled={!supported || busy || saving || !values[secret.id]}>{i18n.t("Save secret")}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={!supported || busy || saving || !secret.configured && !secret.error} onClick={() => void run("secret-delete", { id: plugin.id, name: secret.id })}>{i18n.t("Delete secret")}</Button></div>
    </form>)}
  </section>;
}

function SettingLabel({ title, description }: { title: string; description?: string }) {
  return description ? <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>{title}</TooltipTrigger><TooltipContent>{description}</TooltipContent></Tooltip> : <>{title}</>;
}
function PluginHealthCheck({ plugin, busy }: { plugin?: Plugin; busy: boolean }) {
  const client = useHostClient();
  const [checking, setChecking] = useState(false), [result, setResult] = useState<HealthCheckResult>();
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => { setResult(undefined); setChecking(false); return () => { request.current?.abort(); request.current = undefined; }; }, [client, plugin?.settings, plugin?.running, plugin?.digest, plugin?.healthCheck]);
  if (!plugin?.healthCheck) return null;
  const disabled = !plugin.enabled || !plugin.running;
  const reason = i18n.t(!plugin.enabled ? "Plugin disabled" : "Plugin unavailable");
  return <section className="settings-section settings-section--stacked" aria-label={i18n.t("Check connection")}>
    <div className="settings-actions"><Tooltip><TooltipTrigger render={<span tabIndex={disabled ? 0 : undefined} />}><Button size="sm" variant="secondary" disabled={disabled || busy || checking} onClick={async () => {
      const controller = new AbortController(); request.current = controller;
      const timer = setTimeout(() => controller.abort(), 15000);
      setChecking(true); setResult(undefined);
      try {
        const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invoke", operation: `${plugin.id}.${plugin.healthCheck}`, input: {} }), signal: controller.signal });
        const value = await response.json();
        if (!response.ok || value.receipt?.outcome !== "success") throw new Error();
        if (!controller.signal.aborted) setResult(healthCheckResultSchema.parse(value.result));
      } catch { if (request.current === controller) setResult({ ok: false, message: i18n.t("Connection check failed. Check settings and try again.") }); }
      finally { clearTimeout(timer); if (request.current === controller) setChecking(false); }
    }}>{i18n.t(checking ? "Checking…" : "Check connection")}</Button></TooltipTrigger><TooltipContent>{disabled ? reason : i18n.t("Uses saved settings")}</TooltipContent></Tooltip></div>
    {result ? <><PluginState tone={result.ok ? "connected" : "danger"} label={i18n.t(result.ok ? "Connected" : "Error")} /><p className="settings-description" role="status">{result.message}</p></> : null}
  </section>;
}
