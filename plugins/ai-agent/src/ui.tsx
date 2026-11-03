import { useEffect, useRef, useState, type ReactNode } from "react";
import { AI_TASK, AI_AGENT, type AiAgentSettings, type AiModels, type AiDiagnostics, type AiEnvironment, type AiProvider } from "@litzio/plugin-api/ai";
import type { UiHost } from "@litzio/plugin-api/ui";
import "./settings.css";

export function activate(host: UiHost) {
  function Settings() {
    const [settings, setSettings] = useState<AiAgentSettings>();
    const [storedSettings, setStoredSettings] = useState<AiAgentSettings>();
    const [models, setModels] = useState<AiModels>();
    const [diagnostics, setDiagnostics] = useState<AiDiagnostics>();
    const [environment, setEnvironment] = useState<AiEnvironment>();
    const [view, setView] = useState<"settings" | "diagnostics">("settings");
    const [dialog, setDialog] = useState(false), [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [saved, setSaved] = useState(false);
    const [problem, setProblem] = useState("");
    const focus = useRef<HTMLElement | null>(null), alive = useRef(true);
    const { Input, Button, Dialog, SettingsSwitch, SettingsSelect, SettingsAction, text: t } = host;
    const get = <T,>(route: string, provider?: AiProvider) => host.readJson<T>(route.slice(1), provider ? { provider } : {});
    const refresh = async (provider: AiProvider = settings?.provider ?? "codex", choose = false) => {
      setLoading(true); setProblem("");
      const results = await Promise.allSettled([get<AiModels>(AI_AGENT.modelsRoute, provider), get<AiDiagnostics>(AI_AGENT.diagnosticsRoute, provider)]);
      if (!alive.current) return;
      if (results[0].status === "fulfilled") {
        const catalog = results[0].value; setModels(catalog);
        if (choose && catalog.models.length) setSettings(current => current ? { ...current, model: catalog.models[0].model, reasoningEffort: catalog.models[0].defaultReasoningEffort } : current);
      } else { setModels(undefined); setProblem(String(results[0].reason.message)); }
      if (results[1].status === "fulfilled") setDiagnostics(results[1].value); else { setDiagnostics(undefined); setProblem(String(results[1].reason.message)); }
      setLoading(false);
    };
    useEffect(() => {
      alive.current = true;
      void Promise.all([get<AiAgentSettings>(AI_TASK.settingsRoute), get<AiEnvironment>(AI_AGENT.environmentRoute)]).then(([next, env]) => {
        if (!alive.current) return;
        setSettings({ ...next, responseLanguage: next.responseLanguage ?? (navigator.language.startsWith("ko") ? "ko" : navigator.language.startsWith("ja") ? "ja" : "en") }); setStoredSettings(next); setEnvironment(env); if (next.enabled) void refresh(next.provider);
      }).catch(error => { if (alive.current) setProblem(error.message); });
      return () => { alive.current = false; };
    }, []);
    const save = async (next = settings, enablementOnly = false) => {
      if (!next || busy) return;
      setBusy(true); setProblem(""); setSaved(false);
      try {
        const stored = await host.requestJson<AiAgentSettings>(AI_TASK.settingsRoute.slice(1), "PUT", next);
        if (!alive.current) return;
        setStoredSettings(stored);
        setSettings(current => enablementOnly && current ? { ...stored, model: current.model, reasoningEffort: current.reasoningEffort, writeAccess: current.writeAccess, responseLanguage: current.responseLanguage } : stored);
        setSaved(!enablementOnly);
        if (!next.enabled) { setModels(undefined); setDiagnostics(undefined); }
        else if (!settings?.enabled) void refresh(next.provider);
      } catch (error) { if (alive.current) setProblem(`${t("Could not save AI settings.")} ${(error as Error).message}`); }
      finally { if (alive.current) setBusy(false); }
    };
    const copilot = settings?.provider === "copilot", providerName = copilot ? "GitHub Copilot" : "Codex";
    const model = models?.models.find(item => item.model === settings?.model);
    const valid = !!model && model.supportedReasoningEfforts.some(item => item.reasoningEffort === settings?.reasoningEffort);
    const selectModel = (name: string) => {
      const selected = models?.models.find(item => item.model === name); if (!settings || !selected) return;
      setSettings({ ...settings, model: name, reasoningEffort: selected.supportedReasoningEfforts.some(item => item.reasoningEffort === settings.reasoningEffort) ? settings.reasoningEffort : selected.defaultReasoningEffort }); setSaved(false);
    };
    const status = !settings || loading ? t("Checking…") : !settings.enabled ? t("Off") : /Codex .+ or later is required\./.test(diagnostics?.error ?? "") ? t("Update required") : diagnostics?.error ? t("Unavailable")
      : diagnostics?.account === null ? t("Login required") : diagnostics?.connected && (copilot || diagnostics.account) ? t(copilot ? "Connected" : "Available") : t("Unavailable");
    const date = (value?: number) => value ? new Date(value).toLocaleString() : t("Not checked");
    const filteredModels = models?.models.filter(item => `${item.displayName} ${item.model}`.toLowerCase().includes(search.toLowerCase()));
    const row = (label: string, content: ReactNode) => <div className="agent-diagnostic-row"><span>{label}</span><div>{content}</div></div>;
    return <section className="agent-settings" aria-label={t("AI agent")}>
      {view === "diagnostics" ? <>
        <div><Button variant="ghost" onClick={() => setView("settings")}>← {t("AI agent")}</Button></div>
        <div className="agent-heading"><h3 className="settings-heading">{copilot ? t("Copilot diagnostics") : t("Codex diagnostics")}</h3><Button variant="secondary" disabled={loading || !settings?.enabled} onClick={() => void refresh()}>{t("Run diagnostics")}</Button></div>
        <p className="agent-muted">{t("Last checked")}: {date(diagnostics?.checkedAt)}</p>
        <div className="agent-diagnostics">
          {row(`${providerName} CLI`, <>{diagnostics?.version ?? t("Unavailable")}<code>{diagnostics?.path ?? "—"}</code></>)}
          {row(copilot ? "ACP" : "app-server", <>{t(diagnostics?.connected ? "Connected" : "Unavailable")}<p>{diagnostics?.error}</p></>)}
          {!copilot ? <>{row(t("Account"), <>{diagnostics?.accountError ?? (diagnostics?.account ? `${diagnostics.account.email ?? diagnostics.account.type} · ${diagnostics.account.planType ?? ""}` : t("Codex login is required on the Host."))}<code>account/read</code></>)}
          {row(t("Usage and limits"), <>{diagnostics?.rateLimitsError ?? (diagnostics?.rateLimits?.length ? diagnostics.rateLimits.map(bucket => <div key={bucket.name}><strong>{bucket.name}</strong>{bucket.windows.map((window, index) => <p key={index}>{window.windowDurationMins ?? "—"} {t("minutes")} · {window.usedPercent}% {t("used")}{window.resetsAt ? ` · ${t("Resets")}: ${date(window.resetsAt * 1000)}` : ""}</p>)}</div>) : t("Unavailable"))}<code>account/rateLimits/read</code></>)}
          {row(t("MCP servers"), <>{diagnostics?.mcpError ?? (diagnostics?.mcp?.length ? diagnostics.mcp.map(server => <p key={server.name}>{server.name} · {t(server.status)} · {t(server.authStatus)}</p>) : t("No MCP servers reported."))}<code>mcpServerStatus/list</code></>)}</> : null}
        </div>
        <p className="agent-muted">{t(copilot ? "Sign in with Copilot CLI on the Host. Connection does not verify model access or quota." : "To sign in, run codex login in a terminal, then run diagnostics again.")}</p>
      </> : <>
        <h4>{t("Providers")}</h4>
        <div className="agent-provider">
          <button className="agent-provider-open" onClick={event => { focus.current = event.currentTarget; setSearch(""); setDialog(true); }} aria-label={t(copilot ? "Copilot models" : "Codex models")}>
            <span aria-hidden="true">›</span><strong>{providerName}</strong><span className="agent-provider-summary"><i className={diagnostics?.connected && (copilot || diagnostics.account) && settings?.enabled ? "agent-dot available" : "agent-dot"} />{status}{models ? ` · ${t("Models")}: ${models.models.length}` : ""}</span>
          </button>
          <Button variant="ghost" onClick={() => setView("diagnostics")}>{t("Diagnostics")}</Button>
        </div>
        <SettingsSwitch label={t(copilot ? "Use Copilot" : "Use Codex")} checked={settings?.enabled ?? false} disabled={!storedSettings || busy || loading || settings?.provider !== storedSettings.provider} onChange={enabled => void save({ ...storedSettings!, enabled }, true)} />
        <h4>{t("Defaults")}</h4>
        <p className="agent-muted">{t(copilot ? "Copilot is used for assistant conversations. Feature tasks retain their Codex defaults." : "Shared by all AI tasks. Changes apply to the next task.")}</p>
        <SettingsSelect label={t("Default provider")} value={settings?.provider ?? "codex"} disabled={!settings?.enabled || busy || loading}
          options={[{ value: "codex", label: "Codex" }, { value: "copilot", label: "GitHub Copilot" }]} onChange={value => {
            const provider = value as AiProvider;
            setSettings({ ...settings!, provider, model: "", reasoningEffort: provider === "copilot" ? "" : settings!.codexTaskSettings?.reasoningEffort ?? "" });
            setModels(undefined); setDiagnostics(undefined); setSaved(false); void refresh(provider, true);
          }} />
        <SettingsSelect label={t("Model")} value={settings?.model ?? ""} disabled={!models || busy || !settings?.enabled} onChange={selectModel}
          options={[...(!model ? [{ value: settings?.model ?? "", label: settings?.model ?? t("Checking…") }] : []), ...(models?.models.map(item => ({ value: item.model, label: item.displayName })) ?? [])]} />
        <div title={copilot && models?.copilot?.reasoningEffortSource === "cli" ? t("Copilot CLI reasoning effort is fixed for a conversation. Start a new conversation to change it.") : undefined}><SettingsSelect label={t("Reasoning effort")} value={settings?.reasoningEffort ?? ""} disabled={!model || busy || !settings?.enabled}
          onChange={value => { setSettings({ ...settings!, reasoningEffort: value }); setSaved(false); }}
          options={[...(!valid ? [{ value: settings?.reasoningEffort ?? "", label: settings?.reasoningEffort ?? "—" }] : []), ...(model?.supportedReasoningEfforts.map(item => ({ value: item.reasoningEffort, label: t(item.reasoningEffort) })) ?? [])]} /></div>
        <div title={t("Full access removes the sandbox and automatically approves tools, paths and network access. Existing documents must still be proposed in text.")}>
          <SettingsSelect label={t("Write access")} value={settings?.writeAccess ?? "opened-folders"} disabled={!settings || busy}
            onChange={value => { setSettings({ ...settings!, writeAccess: value as AiAgentSettings["writeAccess"] }); setSaved(false); }}
            options={[{ value: "read-only", label: t("Read-only") }, { value: "opened-folders", label: t("Opened folders") }, { value: "full-access", label: t("Full access") }]} />
        </div>
        <SettingsSelect label={t("AI default language")} value={settings?.responseLanguage ?? "en"} disabled={!settings || busy}
          onChange={value => { setSettings({ ...settings!, responseLanguage: value as AiAgentSettings["responseLanguage"] }); setSaved(false); }}
          options={[{ value: "ko", label: "한국어" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" }]} />
        <p className="agent-muted">{t("Used only for tasks started without a conversation.")}</p>
        {models && !valid ? <p role="status">{t("Choose a model and reasoning effort from the available list.")}</p> : null}
        <SettingsAction variant="default" label={t("Defaults")} actionLabel={t(busy ? "Saving…" : "Save AI settings")} disabled={!valid || busy || !settings?.enabled} run={() => void save()} />
        <h4>{t("Common working environment")}</h4>
        <div className="agent-diagnostics">
          {row(t("Working folder"), <code>{environment?.cwd ?? "—"}</code>)}
          {row(t("Litzio instructions"), <code title={environment?.instructions}>{environment ? "AGENTS.md" : "—"}</code>)}
          {!copilot ? row(t("Litzio skills"), environment?.skills.length ? environment.skills.join(", ") : t("No Litzio skills installed.")) : null}
        </div>
      </>}
      {problem ? <p role="alert">{problem}</p> : null}
      {saved ? <p role="status">{t("AI settings saved.")}</p> : null}
      <Dialog open={dialog} onClose={() => setDialog(false)} title={t(copilot ? "Copilot models" : "Codex models")} description={t(copilot ? "Models reported by Copilot CLI. Account access and quota may vary." : "Models and supported reasoning efforts reported by Codex.")} returnFocus={focus} testId="ai-models-dialog"
        footer={<><span className="agent-updated">{t("Updated")}: {date(models?.updatedAt)}</span><Button variant="secondary" onClick={() => { setDialog(false); setView("diagnostics"); }}>{t("Diagnostics")}</Button><Button variant="default" disabled={loading || !settings?.enabled} onClick={() => void refresh()}>{t("Refresh")}</Button></>}>
        <div className="agent-models"><Input aria-label={t("Search models")} placeholder={t("Search models")} value={search} onChange={event => setSearch(event.target.value)} />
          <p className="agent-muted">{t("Models")}: {filteredModels?.length ?? "—"}</p>
          <div className="agent-model-list">{!models ? <p>{loading ? t("Checking…") : t("Unavailable")}</p> : filteredModels?.map(item => <article key={item.id}>
            <div className="agent-model-name"><strong>{item.displayName}</strong><code>{item.model}</code>{item.model === storedSettings?.model ? <small>{t("Default")}</small> : null}</div><p>{item.description}</p><small>{t("Reasoning effort")}: {item.supportedReasoningEfforts.map(effort => t(effort.reasoningEffort)).join(" · ")}</small>
          </article>)}
          {filteredModels?.length === 0 ? <p>{t("No matching models.")}</p> : null}</div>
        </div>
      </Dialog>
    </section>;
  }
  // The shell translates contribution metadata at render time, including language changes.
  return { commands: [], sidebar: [], tabs: [], settings: [{ id: AI_TASK.plugin, label: "AI agent", description: "Manage provider connections and models. Codex and Copilot are supported.", View: Settings }], dispose() {} };
}
