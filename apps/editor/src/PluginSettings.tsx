import { GITHUB_LOGIN_HINT, GITHUB_RATE_LIMIT, GITHUB_RETRY_AFTER, GITHUB_RETRY_LATER } from "../shared/github-source-error.ts";
import { Row } from "./components/ui/row.tsx";
import { Status } from "./components/ui/status.tsx";
import { DangerConfirmation } from "./components/ui/danger-confirmation.tsx";
import { PluginSettingsError } from "../shared/plugin-settings-error.ts";
import { PluginArtifactChangedError } from "../shared/plugin-artifact-error.ts";
import { PLUGIN_MANIFEST_MISSING, PLUGIN_SOURCE_READD_REQUIRED, PLUGIN_SOURCE_UNAVAILABLE } from "../shared/plugin-registration-error.ts";
import { PluginIcon } from "./PluginIcon.tsx";
import { FolderDialog } from "./shell/FolderDialog.tsx";
import { i18n } from "./i18n.ts";
import { FieldError, Notice } from "./ui/primitives.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.tsx";
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { PLUGIN_REGISTRATION_CHANGED, healthCheckResultSchema, parseGitHubSource, type GitHubTrack, type HealthCheckResult } from "@litzio/plugin-sdk";
import { ChoiceGroup } from "./components/ui/choice-group.tsx";
import { Info, Settings } from "lucide-react";
import { useHostClient } from "./host-context.tsx";
import { Button } from "./components/ui/button.tsx";
import { Input } from "./components/ui/input.tsx";
import { SettingsSwitch } from "./components/ui/settings.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./components/ui/dialog.tsx";
import { usePlugins, type Plugin } from "./plugin-state.ts";

const ARTIFACT_CHANGED_HINT = "The installed files differ from when the plugin was installed. Reinstall to restore it from its source.";

export function PluginSettings() {
  const { plugins, error, change } = usePlugins(), [choosing, setChoosing] = useState(false), [problem, setProblem] = useState(""), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string>(), [trust, setTrust] = useState<Plugin>();
  const [removing, setRemoving] = useState(false), [checking, setChecking] = useState<string | true>(), [fromGitHub, setFromGitHub] = useState(false);
  const [listProblem, setListProblem] = useState("");
  const [rowProblems, setRowProblems] = useState(new Map<string, string>());
  const [reinstalling, setReinstalling] = useState<string>();
  const githubButton = useRef<HTMLButtonElement>(null);
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
      setListProblem(i18n.t("The selected plugin is no longer available."));
    }
  }, [plugins, selected, trust, busy, error]);
  const run = async (action: string, args: Record<string, unknown>, report = setListProblem) => {
    setBusy(true);
    report("");
    try { await change(action, args); }
    catch (error) { report(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const runRow = async (plugin: Plugin, action: "enable" | "disable" | "reload" | "update", confirmTrust = false) => {
    const key = plugin.registrationId ?? plugin.id;
    const report = (message: string) => setRowProblems(previous => {
      const next = new Map(previous);
      if (message) next.set(key, message);
      else next.delete(key);
      return next;
    });
    setBusy(true);
    report("");
    if (action === "reload") setReinstalling(plugin.id);
    try {
      await change(action, { id: plugin.id, ...(confirmTrust ? { registrationId: plugin.registrationId, trust: true } : {}) });
    } catch (error) {
      if (confirmTrust && error instanceof Error && error.message === PLUGIN_REGISTRATION_CHANGED) {
        setListProblem(i18n.t(PLUGIN_REGISTRATION_CHANGED));
      } else {
        report(error instanceof PluginArtifactChangedError
          ? ARTIFACT_CHANGED_HINT
          : error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (confirmTrust) setTrust(undefined);
      if (action === "reload") setReinstalling(undefined);
      setBusy(false);
    }
  };
  return <section className="settings-group" aria-label={i18n.t("Plugins")}>
    <Notice tone="warning" className="host-access-warning"><span>{i18n.t("Plugins use Host OS permissions")}</span>
      <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("Plugin access details")} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Plugins run on this Host with its OS permissions. Enable only code you trust.")}</TooltipContent></Tooltip>
    </Notice>
    <div className="settings-actions plugin-actions">
      <Button ref={addButton} size="sm" variant="outline" disabled={busy} onClick={() => { setListProblem(""); setChoosing(true); }}>{i18n.t("Add plugin…")}</Button>
      <Button ref={githubButton} size="sm" variant="outline" disabled={busy} onClick={() => { setListProblem(""); setFromGitHub(true); }}>{i18n.t("Add from GitHub…")}</Button>
      <Button size="sm" variant="outline" disabled={busy || !plugins.length} onClick={async () => { setChecking(true); await run("check-updates", {}); setChecking(undefined); }}>{i18n.t(checking === true ? "Checking…" : "Check for updates")}</Button>
      {/* Every status here and in the plugin dialog comes from the Host's last check (plugin.update). */}
      {!checking && plugins.length && plugins.every(plugin => plugin.update && !plugin.update.available && !plugin.update.error) ? <PluginState tone="ok" label={i18n.t("Up to date")} /> : null}
    </div>
    <FolderDialog open={choosing} title={i18n.t("Add plugin…")} initialPath="" recent={[]}
      browse={browse} places={places} returnFocus={addButton} pendingLabel={i18n.t("Adding…")}
      onClose={() => setChoosing(false)} onOpen={async directory => {
        try {
          await change("register", { directory });
          return "";
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return message === PLUGIN_MANIFEST_MISSING ? i18n.t(PLUGIN_MANIFEST_MISSING) : message;
        }
      }} />
    <GitHubPluginDialog open={fromGitHub} returnFocus={githubButton} onClose={() => setFromGitHub(false)} add={async (source, track) => { await run("register", { source, track }); }} />
    {error || listProblem ? <Notice tone="error" className="plugin-list-error"><GitHubError message={error || listProblem} /></Notice> : null}
    {plugins.map(plugin => {
      const rowProblem = rowProblems.get(plugin.registrationId ?? plugin.id);
      const hasError = !!(rowProblem || plugin.error);
      const reinstallHint = plugin.artifactChanged ? i18n.t(ARTIFACT_CHANGED_HINT) : undefined;
      const rowDetail = rowProblem ? githubErrorText(rowProblem) : undefined;
      const detail = rowDetail ? [rowDetail.text, rowDetail.hint].filter(Boolean).join(" ") : reinstallHint ??
        (plugin.error === PLUGIN_SOURCE_READD_REQUIRED ? i18n.t(PLUGIN_SOURCE_READD_REQUIRED) : plugin.error);
      const version = plugin.artifactChanged ? undefined : plugin.version ? i18n.t("Version {{version}}", { version: plugin.version }) : i18n.t("No version");
      return <section key={plugin.id} aria-label={plugin.name ?? plugin.id}>
        <Row label={<span className="plugin-heading"><PluginIcon client={client} plugin={plugin.id} digest={plugin.iconDigest} />{plugin.name ?? plugin.id}</span>} description={<>{[version, sourceLabel(plugin), plugin.description].filter(Boolean).join(" · ")}<PluginUpdateState plugin={plugin} /></>}>
          {plugin.artifactChanged ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void runRow(plugin, "reload")}>{i18n.t(reinstalling === plugin.id ? "Reinstalling…" : "Reinstall")}</Button> : null}
          {plugin.update?.available ? <Button size="sm" variant="outline" disabled={busy} aria-label={i18n.t("Update {{name}}", { name: plugin.name ?? plugin.id })} onClick={() => void runRow(plugin, "update")}>{i18n.t("Update")}</Button> : null}
          <PluginState tone={hasError ? "error" : plugin.enabled && !plugin.running ? "warning" : plugin.running ? "ok" : "neutral"} label={i18n.t(hasError ? "Plugin error" : plugin.enabled && !plugin.running ? "Plugin unavailable" : plugin.running ? "Running" : "Installed")} detail={detail} />
          <Tooltip><TooltipTrigger render={<Button size="icon-sm" variant="ghost" aria-label={i18n.t("{{name}} settings", { name: plugin.name ?? plugin.id })} onClick={() => { setProblem(""); setSelected(plugin.id); }} />}><Settings aria-hidden="true" /></TooltipTrigger><TooltipContent>{i18n.t("Settings")}</TooltipContent></Tooltip>
          <input className="settings-switch" type="checkbox" role="switch" aria-label={i18n.t("Enable {{name}}", { name: plugin.name ?? plugin.id })} checked={plugin.enabled} disabled={busy} onChange={event => { if (event.target.checked && !plugin.trusted) setTrust(plugin); else void runRow(plugin, event.target.checked ? "enable" : "disable"); }} />
        </Row>
      </section>;
    })}
    <Dialog open={!!trust} onOpenChange={open => { if (!open && !busy) setTrust(undefined); }}><DialogContent className="plugin-settings-dialog"><DialogHeader><DialogTitle>{i18n.t("Trust and enable {{name}}?", { name: trust?.name ?? trust?.id ?? "" })}</DialogTitle><DialogDescription>{i18n.t("This plugin runs with the Host OS permissions. Updates will not ask for trust again.")}</DialogDescription></DialogHeader><div className="settings-actions"><Button disabled={busy} onClick={() => { if (trust) void runRow(trust, "enable", true); }}>{i18n.t("Trust and enable")}</Button><Button disabled={busy} variant="outline" onClick={() => setTrust(undefined)}>{i18n.t("Cancel")}</Button></div></DialogContent></Dialog>
    <Dialog open={!!current} onOpenChange={open => { if (!open && !busy) setSelected(undefined); }}>
      <DialogContent className="plugin-settings-dialog" finalFocus={addButton}>
        <DialogHeader>
          <DialogTitle>{current?.name ?? current?.id}</DialogTitle>
          <DialogDescription>{current?.description}</DialogDescription>
        </DialogHeader>
        {current && problem ? <Notice tone="error"><GitHubError message={problem} /></Notice> : null}
        {current ? <ConnectionSettings key={current.id} plugin={current} change={change} busy={busy} /> : null}
        {current ? <div className="settings-actions plugin-actions">
          {checking !== current.id ? <PluginUpdateState plugin={current} upToDate /> : null}
          {current.update?.available ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("update", { id: current.id }, setProblem)}>{i18n.t("Update")}</Button> : null}
          <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setChecking(current.id); await run("check-updates", { id: current.id }, setProblem); setChecking(undefined); }}>{i18n.t(checking === current.id ? "Checking…" : "Check for updates")}</Button>
          <Button ref={removeButton} size="sm" variant="destructive" disabled={busy} onClick={() => { setProblem(""); setRemoving(true); }}>{i18n.t("Remove")}</Button>
        </div> : null}
        <details><summary>{i18n.t("Details")}</summary><p className="settings-description">{i18n.t(current?.trusted ? "Trusted plugin" : "Trust required")}</p><p className="settings-status" style={{ overflowWrap: "anywhere" }}>{current?.digest}</p></details>
      </DialogContent>
    </Dialog>
    {removing && current ? <DangerConfirmation
      title={i18n.t("Remove {{name}}?", { name: current.name ?? current.id })}
      description={i18n.t("The plugin will be disabled and its settings and secrets deleted. Its source folder stays on disk. Adding it again requires trust confirmation.")}
      action={i18n.t("Remove")} pending={busy} error={problem} returnFocus={removeButton}
      onClose={() => setRemoving(false)} onConfirm={async () => {
        setBusy(true); setProblem("");
        try { await change("unregister", { id: current.id }); setRemoving(false); setSelected(undefined); }
        catch (e) { setProblem(String(e)); }
        finally { setBusy(false); }
      }} /> : null}
  </section>;
}
/** Show the source used by the action available in the row. */
function sourceLabel(plugin: Plugin) {
  const source = plugin.source;
  if (source?.kind !== "github") return source ? i18n.t("Local folder") : undefined;
  if (plugin.artifactChanged && source.local) return i18n.t("Local folder");
  const parsed = parseGitHubSource(source.url);
  const folder = source.path ?? parsed?.tree.slice(1).join("/");
  const track = source.track ?? plugin.update?.track;
  return [`GitHub ${parsed?.owner}/${parsed?.repo}${folder ? `/${folder}` : ""}`, track ? i18n.t(track === "release" ? "Release" : "Branch") : undefined].filter(Boolean).join(" · ");
}
/** Last source check; the installed copy keeps running until Update succeeds. */
function PluginUpdateState({ plugin, upToDate = false }: { plugin: Plugin; upToDate?: boolean }) {
  const update = plugin.update, github = plugin.source?.kind === "github";
  if (upToDate && update && !update.available && !update.error) return <PluginState tone="ok" label={i18n.t("Up to date")} />;
  if (update?.error) {
    const { text, hint } = githubErrorText(github ? update.error : PLUGIN_SOURCE_UNAVAILABLE);
    return <div><PluginState tone="error" label={i18n.t("Update check failed")} detail={hint ? `${text} ${hint}` : text} /></div>;
  }
  if (!update?.available) return null;
  const versions = update.currentVersion && update.sourceVersion ? i18n.t(github ? "Installed {{current}} → GitHub {{source}}" : "Installed {{current}} → source {{source}}", { current: update.currentVersion, source: update.sourceVersion })
    : i18n.t(github ? "GitHub has new content for this plugin folder." : "The source folder changed after this plugin was applied.");
  return <div><PluginState tone="warning" label={i18n.t(update.sourceVersion && update.sourceVersion !== update.currentVersion ? "Update available" : "New content available")} detail={versions} /></div>;
}
type GitHubPlugin = { path: string; source: string; id?: string; name?: string; version?: string | null; release: boolean; branch: boolean };
/** Find plugin folders at a public GitHub address, choose one and its track, then register it like a local folder. */
function GitHubPluginDialog({ open, returnFocus, onClose, add }: { open: boolean; returnFocus: RefObject<HTMLButtonElement | null>; onClose(): void; add(source: string, track: GitHubTrack): Promise<void> }) {
  const client = useHostClient(), id = useId();
  const [address, setAddress] = useState(""), [found, setFound] = useState<GitHubPlugin[]>(), [chosen, setChosen] = useState<GitHubPlugin>(), [track, setTrack] = useState<GitHubTrack>("branch");
  const [pending, setPending] = useState(false), [problem, setProblem] = useState("");
  useEffect(() => { if (open) { setAddress(""); setFound(undefined); setChosen(undefined); setProblem(""); } }, [open]);
  const choose = (plugin: GitHubPlugin) => { setChosen(plugin); setTrack(plugin.release ? "release" : "branch"); };
  const failed = (error: unknown) => setProblem(error instanceof Error ? error.message : String(error));
  const find = async () => {
    setPending(true); setProblem(""); setFound(undefined); setChosen(undefined);
    try {
      const response = await client.request("/api/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "source-plugins", source: address.trim() }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Plugin operation failed");
      const plugins = (value.plugins as (GitHubPlugin & { error?: string })[]).filter(plugin => !plugin.error);
      if (!plugins.length) throw new Error("No plugins found at this address.");
      const folder = parseGitHubSource(address.trim())?.tree.slice(1).join("/") ?? "";
      setFound(plugins); choose(plugins.find(plugin => plugin.path === folder) ?? plugins[0]!);
    } catch (error) { failed(error); } finally { setPending(false); }
  };
  return <Dialog open={open} onOpenChange={next => { if (!next && !pending) onClose(); }}>
    <DialogContent className="plugin-settings-dialog" finalFocus={returnFocus}>
      <DialogHeader><DialogTitle>{i18n.t("Add plugin from GitHub")}</DialogTitle><DialogDescription>{i18n.t("Public repository or plugin folder address")}</DialogDescription></DialogHeader>
      <form className="plugin-github-address" onSubmit={event => { event.preventDefault(); if (address.trim() && !pending) void find(); }}>
        <Input aria-label={i18n.t("GitHub address")} placeholder="https://github.com/owner/repo" value={address} disabled={pending} spellCheck={false} autoComplete="off"
          aria-invalid={!!problem} aria-describedby={problem ? `${id}-problem` : undefined} onChange={event => { setAddress(event.target.value); setProblem(""); setFound(undefined); setChosen(undefined); }} />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !address.trim()}>{i18n.t(pending && !found ? "Finding…" : "Find")}</Button>
      </form>
      {problem ? <FieldError id={`${id}-problem`}><GitHubError message={problem} /></FieldError> : null}
      {found ? <fieldset className="plugin-github-choices" disabled={pending}>
        <legend className="sr-only">{i18n.t("Choose a plugin")}</legend>
        {found.map(plugin => <label key={plugin.source} className="plugin-github-choice" title={plugin.source}>
          <input type="radio" name={`${id}-plugin`} checked={chosen?.source === plugin.source} onChange={() => choose(plugin)} />
          <span>{plugin.name ?? plugin.id}</span><span className="settings-description">{[plugin.version ? i18n.t("Version {{version}}", { version: plugin.version }) : undefined, plugin.path || undefined].filter(Boolean).join(" · ")}</span>
        </label>)}
      </fieldset> : null}
      {chosen ? <div className="plugin-github-track">
        <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>{i18n.t("Follow")}</TooltipTrigger><TooltipContent>{i18n.t("Release follows the latest formal GitHub release. Branch follows the newest commit, for testing.")}</TooltipContent></Tooltip>
        <ChoiceGroup<GitHubTrack> aria-label={i18n.t("Follow")} value={track} onValueChange={setTrack} disabled={pending}
          options={[{ value: "release", label: i18n.t("Release"), disabled: !chosen.release }, { value: "branch", label: i18n.t("Branch"), disabled: !chosen.branch }]} />
      </div> : null}
      <div className="settings-actions">
        <Button disabled={pending || !chosen} onClick={async () => { if (!chosen) return; setPending(true); setProblem(""); try { await add(chosen.source, track); onClose(); } catch (error) { failed(error); } finally { setPending(false); } }}>{i18n.t(pending && found ? "Adding…" : "Add")}</Button>
        <Button variant="outline" disabled={pending} onClick={onClose}>{i18n.t("Cancel")}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
function githubErrorText(message: string) {
  if (!message.startsWith(GITHUB_RATE_LIMIT + " ")) return { text: i18n.t(message, message) };
  const suffix = " " + GITHUB_LOGIN_HINT;
  const hasHint = message.endsWith(suffix);
  const retry = message.slice(GITHUB_RATE_LIMIT.length + 1, hasHint ? -suffix.length : undefined);
  const prefix = GITHUB_RETRY_AFTER.split("{{time}}")[0]!;
  const instruction = retry.startsWith(prefix)
    ? i18n.t(GITHUB_RETRY_AFTER, { time: retry.slice(prefix.length, -1) })
    : i18n.t(GITHUB_RETRY_LATER);
  return { text: `${i18n.t(GITHUB_RATE_LIMIT)} ${instruction}`, hint: hasHint ? i18n.t(GITHUB_LOGIN_HINT) : undefined };
}
function PluginDetail({ children }: { children: string }) {
  return <Tooltip><TooltipTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={i18n.t("Plugin status details")} aria-description={children} />}><Info aria-hidden="true" /></TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>;
}
function GitHubError({ message }: { message: string }) {
  const { text, hint } = githubErrorText(message);
  return <>{text}{hint ? <PluginDetail>{hint}</PluginDetail> : null}</>;
}
function PluginState({ tone, label, detail }: { tone: "ok" | "error" | "warning" | "neutral"; label: string; detail?: string }) {
  return <span className="plugin-status" role="status"><Status variant="plain" tone={tone} label={label} />{detail ? <PluginDetail>{detail}</PluginDetail> : null}</span>;
}
/** Dialog-owned drafts; Host remains the owner of saved settings. */
function ConnectionSettings({ plugin, change, busy }: { plugin: Plugin; change: (action: string, args: Record<string, unknown>) => Promise<void>; busy: boolean }) {
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
      // Save feedback stays in the field's own Row, like the plugin list's update state.
      const feedback = state?.error ? <FieldError id={`${id}-error`}>{i18n.t("Save failed")}: {state.error}</FieldError> : state?.status ? <span id={`${id}-status`} role="status">{i18n.t(state.status)}</span> : undefined;
      return <div key={key}>
        {field.type === "boolean" ? <SettingsSwitch label={<SettingLabel title={field.title ?? key} description={field.description} />} description={feedback} disabled={busy} checked={draft[key] === true}
          invalid={!!state?.error} onChange={value => { dirty.current.add(key); edits.current[key] = (edits.current[key] ?? 0) + 1; setDraft(d => ({ ...d, [key]: value })); save(key, value); }} /> :
          ["string", "number", "integer"].includes(field.type ?? "") ? <Row label={<label htmlFor={id}><SettingLabel title={field.title ?? key} description={field.description} /></label>} description={feedback}>
            <Input {...common} disabled={busy} type={field.type === "string" ? "text" : "number"} value={String(draft[key] ?? "")} onChange={event => { const value = event.target.value; dirty.current.add(key); edits.current[key] = (edits.current[key] ?? 0) + 1; setDraft(d => ({ ...d, [key]: value })); setStates(s => ({ ...s, [key]: {} })); }} onBlur={event => {
              const value = field.type === "string" ? event.target.value : Number(event.target.value);
              if (saved.current[key] !== value || errors.current[key]) save(key, value);
              else dirty.current.delete(key);
            }} /></Row> : null}
      </div>;
    })}
    <PluginSecrets plugin={plugin} busy={busy} change={change} />
    <PluginHealthCheck plugin={plugin} busy={busy} ready={ready} />
  </>;
}

function PluginSecrets({ plugin, busy, change }: { plugin?: Plugin; busy: boolean; change: (action: string, args: Record<string, unknown>) => Promise<void> }) {
  const client = useHostClient();
  const prefix = useId();
  const [values, setValues] = useState<Record<string, string>>({}), [problems, setProblems] = useState<Record<string, string>>({}), [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; title: string }>(), [deletePending, setDeletePending] = useState(false), [deleteProblem, setDeleteProblem] = useState("");
  const deleteButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setValues({}); setProblems({}); setDeleting(undefined); }, [client, plugin?.id]);
  if (!plugin?.secrets?.declarations.length) return null;
  const supported = plugin.secrets.supported;
  return <section className="settings-section settings-section--stacked" aria-label={i18n.t("Plugin secrets")}>
    {!supported ? <Notice tone="warning">{i18n.t("Plugin secrets require a Windows Host")}</Notice> : null}
    {plugin.secrets.declarations.map(secret => {
      const id = `${prefix}-${secret.id}`, problem = problems[secret.id];
      return <form key={secret.id} className="plugin-secret-form" onSubmit={async event => {
        event.preventDefault(); setSaving(true); setProblems(p => ({ ...p, [secret.id]: "" })); const value = values[secret.id]; setValues(v => ({ ...v, [secret.id]: "" }));
        try {
          const response = await client.request("/api/plugins/secrets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plugin.id, name: secret.id, value }) });
          if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? i18n.t("Unable to store plugin secret")); }
        } catch (error) { setProblems(p => ({ ...p, [secret.id]: error instanceof Error ? error.message : i18n.t("Unable to store plugin secret") })); } finally { window.dispatchEvent(new Event("plugins-changed")); setSaving(false); }
      }}>
        <Row label={<label htmlFor={id}><SettingLabel title={secret.title} description={secret.description} /></label>} description={<>
          <span id={`${id}-status`} role="status"><Status variant="plain" tone={secret.error ? "error" : secret.configured ? "ok" : "neutral"} label={i18n.t(secret.error ? "Unavailable or damaged" : secret.configured ? "Configured" : "Not configured")} /></span>
          <FieldError id={`${id}-error`}>{problem}</FieldError>
        </>}><Input id={id} type="password" aria-invalid={!!problem} aria-describedby={problem ? `${id}-status ${id}-error` : `${id}-status`} autoComplete="new-password" disabled={!supported || busy || saving} value={values[secret.id] ?? ""} onChange={e => setValues(v => ({ ...v, [secret.id]: e.target.value }))} /></Row>
        {secret.error ? <Notice tone="error">{i18n.t("Unable to read this secret. Delete or replace it.")}</Notice> : null}
        <div className="settings-actions"><Button type="submit" size="sm" variant="outline" disabled={!supported || busy || saving || !values[secret.id]}>{i18n.t("Save secret")}</Button>
        <Button type="button" size="sm" variant="destructive" disabled={!supported || busy || saving || !secret.configured && !secret.error} onClick={event => { deleteButton.current = event.currentTarget; setDeleteProblem(""); setDeleting({ id: secret.id, title: secret.title }); }}>{i18n.t("Delete secret")}</Button></div>
      </form>;
    })}
    {deleting ? <DangerConfirmation
      title={i18n.t("Delete {{name}}?", { name: deleting.title })}
      description={i18n.t("The saved secret will be deleted from this Host. Enter it again to use it.")}
      action={i18n.t("Delete")} pending={deletePending} error={deleteProblem} returnFocus={deleteButton}
      onClose={() => setDeleting(undefined)} onConfirm={async () => {
        setDeletePending(true); setDeleteProblem("");
        try { await change("secret-delete", { id: plugin.id, name: deleting.id }); setDeleting(undefined); }
        catch (e) { setDeleteProblem(e instanceof Error ? e.message : String(e)); }
        finally { setDeletePending(false); }
      }} /> : null}
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
    <div className="settings-actions"><Tooltip><TooltipTrigger render={<span tabIndex={disabled ? 0 : undefined} />}><Button size="sm" variant="outline" disabled={disabled || busy || checking} onClick={async () => {
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
    {result ? <><PluginState tone={result.ok ? "ok" : "error"} label={i18n.t(result.ok ? "Connected" : "Error")} /><p className="settings-description" role="status">{result.message}</p></> : null}
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
