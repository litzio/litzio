import { DangerConfirmation } from "./components/ui/danger-confirmation.tsx";
import { PluginSettingsError } from "../shared/plugin-settings-error.ts";
import { PluginIcon } from "./PluginIcon.tsx";
import { FolderDialog } from "./shell/FolderDialog.tsx";
import { i18n } from "./i18n.ts";
import { FieldError, Notice } from "./ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.tsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PLUGIN_REGISTRATION_CHANGED, healthCheckResultSchema, type HealthCheckResult } from "@litzio/plugin-sdk";
import { Info, Settings } from "lucide-react";
import { useHostClient } from "./host-context.tsx";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { SettingsSwitch } from "./components/ui/settings.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog.tsx";
import { usePlugins, type Plugin } from "./plugin-state.ts";
export { usePlugins } from "./plugin-state.ts";
export function PluginSettings() {
  const { plugins, error, change } = usePlugins(), [choosing, setChoosing] = useState(false), [problem, setProblem] = useState(""), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string>(), [trust, setTrust] = useState<Plugin>();
  const [removing, setRemoving] = useState(false);
  const removeButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const client = useHostClient();
  // FolderDialog initializes its draft when the Host changes, not on list refresh.
  const browse = useCallback(async (path: string) => { const r = await client.request(`/api/folder-browse?path=${encodeURIComponent(path)}`); const v = await r.json(); if (!r.ok) throw new Error(v.error); return v; }, [client]);
  const places = useCallback(async () => { const r = await client.request("/api/folder-places"); const v = await r.json(); if (!r.ok) throw new Error(v.error); return v.places; }, [client]);
  const current = plugins.find(p => p.id === selected);
  useEffect(() => {
    if (busy || error) return;
    if (selected && !plugins.some(plugin => plugin.id === selected) || trust && !plugins.some(plugin => plugin.id === trust.id)) {
      setSelected(undefined); setTrust(undefined); setRemoving(false);
      setProblem(i18n.t("The selected plugin is no longer available."));
    }
  }, [plugins, selected, trust, busy, error]);
  const run = async (action: string, args: Record<string, unknown>) => { setBusy(true); setProblem(""); try { await change(action, args); } catch (e) { setProblem(String(e)); } finally { setBusy(false); } };
  return <section className="settings-group" aria-label={i18n.t("Plugins")}>
    <Notice tone="warning" className="host-access-warning"><span>{i18n.t("Plugins use Host OS permissions")}</span>
      <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Plugin access details")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Plugins run on this Host with its OS permissions. Enable only code you trust.")}</TooltipContent></Tooltip>
    </Notice>
    <Button ref={addButton} size="sm" variant="secondary" disabled={busy} onClick={() => setChoosing(true)}>{i18n.t("Add plugin…")}</Button>
    <FolderDialog open={choosing} title={i18n.t("Add plugin…")} showSidebarHint={false} initialPath="" recent={[]}
      browse={browse} places={places}
      onClose={() => setChoosing(false)} onOpen={async directory => { try { await change("register", { directory }); setChoosing(false); return ""; } catch (e) { return String(e); } }} />
    {error || problem && !current && !trust ? <Notice tone="error">{error || problem}</Notice> : null}
    {plugins.map(plugin => <section key={plugin.id} className="settings-section settings-section--stacked host-registration" aria-label={plugin.name ?? plugin.id}>
      <div className="plugin-summary-row">
        <div className="host-summary">
          <div className="plugin-heading">
            <PluginIcon client={client} plugin={plugin.id} digest={plugin.iconDigest} />
            <h3 className="settings-heading">{plugin.name ?? plugin.id}</h3>
          </div>
          <p className="settings-description">{plugin.description}</p>
        </div>
        <div className="plugin-controls">
          <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("{{name}} settings", { name: plugin.name ?? plugin.id })} onClick={() => setSelected(plugin.id)} />}><Settings aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Settings")}</TooltipContent></Tooltip>
          <input className="settings-switch" type="checkbox" role="switch" aria-label={i18n.t("Enable {{name}}", { name: plugin.name ?? plugin.id })} checked={plugin.enabled} disabled={busy} onChange={event => { if (event.target.checked && !plugin.trusted) setTrust(plugin); else void run(event.target.checked ? "enable" : "disable", { id: plugin.id }); }} />
        </div>
      </div>
      <div className="plugin-states">
        {plugin.error || plugin.enabled && !plugin.running ? <PluginState tone={plugin.error ? "danger" : "muted"} label={i18n.t(plugin.error ? "Plugin error" : "Plugin unavailable")} detail={plugin.error} /> : null}
      </div>
    </section>)}
    <Dialog open={!!trust} onOpenChange={open => { if (!open && !busy) setTrust(undefined); }}><DialogContent className="plugin-settings-dialog"><DialogHeader><DialogTitle>{i18n.t("Trust and enable {{name}}?", { name: trust?.name ?? trust?.id ?? "" })}</DialogTitle><DialogDescription>{i18n.t("This plugin runs with the Host OS permissions. Updates will not ask for trust again.")}</DialogDescription></DialogHeader><div className="settings-actions"><Button disabled={busy} onClick={async () => { if (!trust) return; setBusy(true); setProblem(""); try { await change("enable", { id: trust.id, registrationId: trust.registrationId, trust: true }); setTrust(undefined); } catch (e) { if (e instanceof Error && e.message === PLUGIN_REGISTRATION_CHANGED) { setTrust(undefined); setProblem(i18n.t(PLUGIN_REGISTRATION_CHANGED)); } else setProblem(String(e)); } finally { setBusy(false); } }}>{i18n.t("Trust and enable")}</Button><Button disabled={busy} variant="secondary" onClick={() => setTrust(undefined)}>{i18n.t("Cancel")}</Button></div>{trust && problem ? <Notice tone="error">{problem}</Notice> : null}</DialogContent></Dialog>
    <Dialog open={!!current} onOpenChange={open => { if (!open && !busy) setSelected(undefined); }}>
      <DialogContent className="plugin-settings-dialog" finalFocus={addButton}>
        <DialogHeader>
          <DialogTitle>{current?.name ?? current?.id}</DialogTitle>
          <DialogDescription>{current?.description}</DialogDescription>
        </DialogHeader>
        {current && problem ? <Notice tone="error">{problem}</Notice> : null}
        {current ? <ConnectionSettings key={current.id} plugin={current} change={change} busy={busy} run={run} /> : null}
        {current ? <div className="settings-actions"><Button ref={removeButton} size="sm" variant="destructive" disabled={busy} onClick={() => { setProblem(""); setRemoving(true); }}>{i18n.t("Remove")}</Button></div> : null}
        <details><summary>{i18n.t("Details")}</summary><p className="settings-description">{i18n.t(current?.trusted ? "Trusted plugin" : "Trust required")}</p><p className="settings-status" style={{ overflowWrap: "anywhere" }}>{current?.digest}</p></details>
      </DialogContent>
    </Dialog>
    {removing && current ? <DangerConfirmation
      title={i18n.t("Remove {{name}}?", { name: current.name ?? current.id })}
      description={i18n.t("The plugin will be disabled and its settings and secrets deleted. Its folder stays on disk. Adding it again requires trust confirmation.")}
      action={i18n.t("Remove")} pending={busy} error={problem} returnFocus={removeButton}
      onClose={() => setRemoving(false)} onConfirm={async () => {
        setBusy(true); setProblem("");
        try { await change("unregister", { id: current.id }); setRemoving(false); setSelected(undefined); }
        catch (e) { setProblem(String(e)); }
        finally { setBusy(false); }
      }} /> : null}
  </section>;
}
function PluginState({ tone, label, detail }: { tone: string; label: string; detail?: string }) {
  return <span className="host-status" data-tone={tone} role="status"><span className="agent-dot" aria-hidden="true" />{label}{detail ? <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Plugin status details")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{detail}</TooltipContent></Tooltip> : null}</span>;
}
/** Dialog-owned drafts; Host remains the owner of saved settings. */
function ConnectionSettings({ plugin, change, busy, run }: { plugin: Plugin; change: (action: string, args: Record<string, unknown>) => Promise<void>; busy: boolean; run: (action: string, args: Record<string, unknown>) => Promise<void> }) {
  const prefix = useId();
  const [draft, setDraft] = useState(plugin.settings ?? {});
  const [states, setStates] = useState<Record<string, { status?: "Saving…" | "Saved"; error?: string }>>({});
  const edits = useRef<Record<string, number>>({});
  const saved = useRef(plugin.settings ?? {});
  const dirty = useRef(new Set<string>());
  const pendingSaves = useRef(0);
  useEffect(() => {
    const settings = plugin.settings ?? {};
    if (!pendingSaves.current) saved.current = settings;
    setDraft(d => {
      const next = { ...d };
      for (const key of new Set([...Object.keys(d), ...Object.keys(settings)])) {
        if (!dirty.current.has(key)) next[key] = settings[key];
      }
      return next;
    });
  }, [plugin.settings]);
  const errors = useRef<Record<string, string>>({});
  const queue = useRef(Promise.resolve());
  const save = (key: string, value: unknown) => {
    const edit = edits.current[key];
    ++pendingSaves.current;
    setStates(s => ({ ...s, [key]: { status: "Saving…" } }));
    queue.current = queue.current.then(async () => {
      const settings = { ...saved.current, [key]: value };
      try {
        await change("settings", { id: plugin.id, settings });
        saved.current = settings;
        for (const field of Object.keys(errors.current)) {
          if (field === key || !dirty.current.has(field)) delete errors.current[field];
        }
        setStates(s => Object.fromEntries(Object.entries(s).map(([field, state]) => [field, state.error && !errors.current[field] ? {} : state])));
        if (edits.current[key] === edit) dirty.current.delete(key);
        if (edits.current[key] === edit) setStates(s => ({ ...s, [key]: { status: "Saved" } }));
      } catch (e) {
        const issues = e instanceof PluginSettingsError ? e.settingsIssues : [];
        const messages: Record<string, string> = {};
        for (const issue of issues) {
          const field = issue.path.split("/")[1]?.replaceAll("~1", "/").replaceAll("~0", "~");
          const target = field && Object.hasOwn(plugin.settingsSchema?.properties ?? {}, field) ? field : key;
          messages[target] ??= i18n.t(settingsErrorMessage(issue.keyword));
        }
        if (!Object.keys(messages).length) messages[key] = i18n.t(settingsErrorMessage("unknown"));
        Object.assign(errors.current, messages);
        if (edits.current[key] === edit) setStates(s => {
          const next = { ...s, [key]: {} };
          for (const [field, error] of Object.entries(messages)) next[field] = { error };
          return next;
        });
      } finally { --pendingSaves.current; }
    });
  };
  const ready = async () => { let pending; do { pending = queue.current; await pending; } while (pending !== queue.current); return Object.keys(errors.current).length ? false : JSON.stringify(saved.current); };
  return <>
    {Object.entries(plugin.settingsSchema?.properties ?? {}).map(([key, field]) => {
      const id = `${prefix}-${key}`, state = states[key];
      const common = { id, "aria-invalid": !!state?.error, "aria-describedby": state?.error ? `${id}-error` : state?.status ? `${id}-status` : undefined };
      return <div key={key}>
        {field.type === "boolean" ? <SettingsSwitch label={<SettingLabel title={field.title ?? key} description={field.description} />} disabled={busy} checked={draft[key] === true}
          invalid={!!state?.error} describedBy={common["aria-describedby"]} onChange={value => { dirty.current.add(key); edits.current[key] = (edits.current[key] ?? 0) + 1; setDraft(d => ({ ...d, [key]: value })); save(key, value); }} /> :
          ["string", "number", "integer"].includes(field.type ?? "") ? <><label htmlFor={id}><SettingLabel title={field.title ?? key} description={field.description} /></label>
            <Input {...common} disabled={busy} type={field.type === "string" ? "text" : "number"} value={String(draft[key] ?? "")} onChange={event => { const value = event.target.value; dirty.current.add(key); edits.current[key] = (edits.current[key] ?? 0) + 1; setDraft(d => ({ ...d, [key]: value })); setStates(s => ({ ...s, [key]: {} })); }} onBlur={event => {
              const value = field.type === "string" ? event.target.value : Number(event.target.value);
              if (saved.current[key] !== value || errors.current[key]) save(key, value);
              else dirty.current.delete(key);
            }} /></> : null}
        {state?.error ? <FieldError id={`${id}-error`}>{i18n.t("Save failed")}: {state.error}</FieldError> : state?.status ? <p id={`${id}-status`} className="settings-status" role="status">{i18n.t(state.status)}</p> : null}
      </div>;
    })}
    <PluginSecrets plugin={plugin} busy={busy} run={run} />
    <PluginHealthCheck plugin={plugin} busy={busy} ready={ready} />
  </>;
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
      <label><SettingLabel title={secret.title} description={secret.description} />: {i18n.t(secret.error ? "Unavailable or damaged" : secret.configured ? "Configured" : "Not configured")}<Input type="password" autoComplete="new-password" disabled={!supported || busy || saving} value={values[secret.id] ?? ""} onChange={e => setValues(v => ({ ...v, [secret.id]: e.target.value }))} /></label>
      {secret.error ? <Notice tone="error">{i18n.t("Unable to read this secret. Delete or replace it.")}</Notice> : null}
      <div className="settings-actions"><Button type="submit" size="sm" variant="secondary" disabled={!supported || busy || saving || !values[secret.id]}>{i18n.t("Save secret")}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={!supported || busy || saving || !secret.configured && !secret.error} onClick={() => void run("secret-delete", { id: plugin.id, name: secret.id })}>{i18n.t("Delete secret")}</Button></div>
    </form>)}
  </section>;
}

function SettingLabel({ title, description }: { title: string; description?: string }) {
  return description ? <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>{title}</TooltipTrigger><TooltipContent>{description}</TooltipContent></Tooltip> : <>{title}</>;
}
function PluginHealthCheck({ plugin, busy, ready }: { plugin?: Plugin; busy: boolean; ready: () => Promise<string | false> }) {
  const client = useHostClient();
  const [checking, setChecking] = useState(false), [result, setResult] = useState<HealthCheckResult>();
  const request = useRef<AbortController | undefined>(undefined);
  const waiting = useRef(false);
  const generation = useRef(0);
  const checkedSettings = useRef<string | undefined>(undefined);
  const settingsKey = JSON.stringify(plugin?.settings);
  useEffect(() => { setResult(undefined); setChecking(false); return () => { ++generation.current; request.current?.abort(); request.current = undefined; }; }, [client, plugin?.digest, plugin?.healthCheck]);
  useEffect(() => {
    if (checkedSettings.current === settingsKey) return;
    request.current?.abort(); request.current = undefined; setResult(undefined); setChecking(false);
  }, [settingsKey]);
  useEffect(() => {
    if (!plugin?.enabled || !plugin.running) { request.current?.abort(); request.current = undefined; setChecking(false); }
  }, [plugin?.enabled, plugin?.running]);
  if (!plugin?.healthCheck) return null;
  const disabled = !plugin.enabled || !plugin.running;
  const reason = i18n.t(!plugin.enabled ? "Plugin disabled" : "Plugin unavailable");
  return <section className="settings-section settings-section--stacked" aria-label={i18n.t("Check connection")}>
    <div className="settings-actions"><Tooltip><TooltipTrigger render={<span tabIndex={disabled ? 0 : undefined} />}><Button size="sm" variant="secondary" disabled={disabled || busy || checking} onClick={async () => {
      if (waiting.current) return;
      waiting.current = true;
      const epoch = generation.current;
      const savedSettings = await ready();
      if (savedSettings === false || epoch !== generation.current) { waiting.current = false; return; }
      checkedSettings.current = savedSettings;
      waiting.current = false;
      const controller = new AbortController(); request.current = controller;
      const timer = setTimeout(() => controller.abort(), 15000);
      setChecking(true); setResult(undefined);
      try {
        const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "invoke", operation: `${plugin.id}.${plugin.healthCheck}`, input: {} }), signal: controller.signal });
        const value = await response.json();
        if (!response.ok || value.receipt?.outcome !== "success") throw new Error();
        if (!controller.signal.aborted) setResult(healthCheckResultSchema.parse(value.result));
      } catch { if (request.current === controller) setResult({ ok: false, message: i18n.t("Connection check failed. Check settings and try again.") }); }
      finally {
        clearTimeout(timer);
        if (request.current === controller) { setChecking(false); window.dispatchEvent(new Event("plugins-changed")); }
      }
    }}>{i18n.t(checking ? "Checking…" : "Check connection")}</Button></TooltipTrigger><TooltipContent>{disabled ? reason : i18n.t("Uses saved settings")}</TooltipContent></Tooltip></div>
    {result ? <><PluginState tone={result.ok ? "connected" : "danger"} label={i18n.t(result.ok ? "Connected" : "Error")} /><p className="settings-description" role="status">{result.message}</p></> : null}
  </section>;
}

function settingsErrorMessage(keyword: string) {
  switch (keyword) {
    case "required": return "Enter a value.";
    case "minLength": return "This value is too short. Enter a longer value.";
    case "maxLength": return "This value is too long. Enter a shorter value.";
    case "format": case "pattern": return "Check the format of this value.";
    case "minimum": case "exclusiveMinimum": return "This number is too small. Enter a larger number.";
    case "maximum": case "exclusiveMaximum": return "This number is too large. Enter a smaller number.";
    case "type": return "Enter a value of the expected type.";
    case "enum": case "const": return "Choose an allowed value.";
    default: return "Could not save settings. Check the values and try again.";
  }
}
