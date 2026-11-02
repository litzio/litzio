import { useEffect, useRef, useState, type ReactNode } from "react";
import { AI_TASK, AI_AGENT, type AiAgentSettings, type AiModels, type AiDiagnostics, type AiEnvironment } from "@litzio/plugin-api/ai";
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
    const { Input, Button, Dialog, text: t } = host;
    const get = <T,>(route: string) => host.readJson<T>(route.slice(1), {});
    const refresh = async () => {
      setLoading(true); setProblem("");
      const results = await Promise.allSettled([get<AiModels>(AI_AGENT.modelsRoute), get<AiDiagnostics>(AI_AGENT.diagnosticsRoute)]);
      if (!alive.current) return;
      if (results[0].status === "fulfilled") setModels(results[0].value); else { setModels(undefined); setProblem(String(results[0].reason.message)); }
      if (results[1].status === "fulfilled") setDiagnostics(results[1].value); else { setDiagnostics(undefined); setProblem(String(results[1].reason.message)); }
      setLoading(false);
    };
    useEffect(() => {
      alive.current = true;
      void Promise.all([get<AiAgentSettings>(AI_TASK.settingsRoute), get<AiEnvironment>(AI_AGENT.environmentRoute)]).then(([next, env]) => {
        if (!alive.current) return;
        setSettings({ ...next, responseLanguage: next.responseLanguage ?? (document.documentElement.lang === "ko" ? "ko" : "en") }); setStoredSettings(next); setEnvironment(env); if (next.enabled) void refresh();
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
        setSettings(current => enablementOnly && current ? { ...stored, model: current.model, reasoningEffort: current.reasoningEffort, responseLanguage: current.responseLanguage } : stored);
        setSaved(!enablementOnly);
        if (!next.enabled) { setModels(undefined); setDiagnostics(undefined); }
        else if (!settings?.enabled) void refresh();
      } catch (error) { if (alive.current) setProblem(`${t("Could not save AI settings.")} ${(error as Error).message}`); }
      finally { if (alive.current) setBusy(false); }
    };
    const model = models?.models.find(item => item.model === settings?.model);
    const valid = model?.supportedReasoningEfforts.some(item => item.reasoningEffort === settings?.reasoningEffort);
    const selectModel = (name: string) => {
      const selected = models?.models.find(item => item.model === name); if (!settings || !selected) return;
      setSettings({ ...settings, model: name, reasoningEffort: selected.supportedReasoningEfforts.some(item => item.reasoningEffort === settings.reasoningEffort) ? settings.reasoningEffort : selected.defaultReasoningEffort }); setSaved(false);
    };
    const status = !settings || loading ? t("Checking…") : !settings.enabled ? t("Off") : diagnostics?.error?.includes("0.166.0") ? t("Update required") : diagnostics?.error ? t("Unavailable")
      : diagnostics?.account === null ? t("Login required") : diagnostics?.connected && diagnostics.account ? t("Available") : t("Unavailable");
    const date = (value?: number) => value ? new Date(value).toLocaleString() : t("Not checked");
    const filteredModels = models?.models.filter(item => `${item.displayName} ${item.model}`.toLowerCase().includes(search.toLowerCase()));
    const row = (label: string, content: ReactNode) => <div className="agent-diagnostic-row"><span>{label}</span><div>{content}</div></div>;
    return <section className="agent-settings" aria-label={t("AI agent")}>
      {view === "diagnostics" ? <>
        <div><Button variant="ghost" onClick={() => setView("settings")}>← {t("AI agent")}</Button></div>
        <div className="agent-heading"><h3 className="settings-heading">{t("Codex diagnostics")}</h3><Button variant="secondary" disabled={loading || !settings?.enabled} onClick={() => void refresh()}>{t("Run diagnostics")}</Button></div>
        <p className="agent-muted">{t("Last checked")}: {date(diagnostics?.checkedAt)}</p>
        <div className="agent-diagnostics">
          {row("Codex CLI", <>{diagnostics?.version ?? t("Unavailable")}<code>{diagnostics?.path ?? "—"}</code></>)}
          {row("app-server", <>{t(diagnostics?.connected ? "Connected" : "Unavailable")}<p>{diagnostics?.error}</p></>)}
          {row(t("Account"), <>{diagnostics?.accountError ?? (diagnostics?.account ? `${diagnostics.account.email ?? diagnostics.account.type} · ${diagnostics.account.planType ?? ""}` : t("Codex login is required on the Host."))}<code>account/read</code></>)}
          {row(t("Usage and limits"), <>{diagnostics?.rateLimitsError ?? (diagnostics?.rateLimits?.length ? diagnostics.rateLimits.map(bucket => <div key={bucket.name}><strong>{bucket.name}</strong>{bucket.windows.map((window, index) => <p key={index}>{window.windowDurationMins ?? "—"} {t("minutes")} · {window.usedPercent}% {t("used")}{window.resetsAt ? ` · ${t("Resets")}: ${date(window.resetsAt * 1000)}` : ""}</p>)}</div>) : t("Unavailable"))}<code>account/rateLimits/read</code></>)}
          {row(t("MCP servers"), <>{diagnostics?.mcpError ?? (diagnostics?.mcp?.length ? diagnostics.mcp.map(server => <p key={server.name}>{server.name} · {server.status} · {server.authStatus}</p>) : t("No MCP servers reported."))}<code>mcpServerStatus/list</code></>)}
        </div>
        <p className="agent-muted">{t("To sign in, run codex login in a terminal, then run diagnostics again.")}</p>
      </> : <>
        <h4>{t("Providers")}</h4>
        <div className="agent-provider">
          <button className="agent-provider-open" onClick={event => { focus.current = event.currentTarget; setSearch(""); setDialog(true); }} aria-label={t("Codex models")}>
            <span aria-hidden="true">›</span><strong>Codex</strong><span className="agent-provider-summary"><i className={diagnostics?.connected && diagnostics.account && settings?.enabled ? "agent-dot available" : "agent-dot"} />{status}{models ? ` · ${t("Models")}: ${models.models.length}` : ""}</span>
          </button>
          <Button variant="ghost" onClick={() => setView("diagnostics")}>{t("Diagnostics")}</Button>
          <button className="agent-switch" role="switch" aria-label={t("Use Codex")} aria-checked={settings?.enabled ?? false} disabled={!storedSettings || busy || loading} onClick={() => void save({ ...storedSettings!, enabled: !storedSettings!.enabled }, true)}><span /></button>
        </div>
        <h4>{t("Defaults")}</h4>
        <p className="agent-muted">{t("Shared by all AI tasks. Changes apply to the next task.")}</p>
        <div className="agent-defaults">
          <label htmlFor="ai-provider">{t("Default provider")}</label><select id="ai-provider" className="form-select" value="codex" disabled><option value="codex">Codex</option></select>
          <label htmlFor="ai-model">{t("Model")}</label><select id="ai-model" className="form-select" value={settings?.model ?? ""} disabled={!models || busy || !settings?.enabled} onChange={event => selectModel(event.target.value)}>
            {!model ? <option value={settings?.model ?? ""}>{settings?.model ?? t("Checking…")}</option> : null}
            {models?.models.map(item => <option key={item.id} value={item.model}>{item.displayName}</option>)}
          </select>
          <label htmlFor="ai-effort">{t("Reasoning effort")}</label><select id="ai-effort" className="form-select" value={settings?.reasoningEffort ?? ""} disabled={!model || busy || !settings?.enabled} onChange={event => { setSettings({ ...settings!, reasoningEffort: event.target.value }); setSaved(false); }}>
            {!valid ? <option value={settings?.reasoningEffort ?? ""}>{settings?.reasoningEffort ?? "—"}</option> : null}
            {model?.supportedReasoningEfforts.map(item => <option key={item.reasoningEffort} value={item.reasoningEffort}>{item.reasoningEffort}</option>)}
          </select>
        </div>
        <div className="agent-defaults">
          <label htmlFor="ai-language">{t("Response language")}</label>
          <select id="ai-language" className="form-select" value={settings?.responseLanguage ?? "en"} disabled={!settings || busy} onChange={event => { setSettings({ ...settings!, responseLanguage: event.target.value as AiAgentSettings["responseLanguage"] }); setSaved(false); }}>
            <option value="ko">한국어</option><option value="en">English</option><option value="ja">日本語</option><option value="document">{t("Follow document language")}</option>
          </select>
        </div>
        {models && !valid ? <p role="status">{t("Choose a model and reasoning effort from the available list.")}</p> : null}
        <div><Button variant="default" disabled={!valid || busy || !settings?.enabled} onClick={() => void save()}>{t(busy ? "Saving…" : "Save AI settings")}</Button></div>
        <h4>{t("Common working environment")}</h4>
        <div className="agent-diagnostics">
          {row(t("Working folder"), <code>{environment?.cwd ?? "—"}</code>)}
          {row(t("Litzio instructions"), <code title={environment?.instructions}>{environment ? "AGENTS.md" : "—"}</code>)}
          {row(t("Litzio skills"), environment?.skills.length ? environment.skills.join(", ") : t("No Litzio skills installed."))}
        </div>
      </>}
      {problem ? <p role="alert">{problem}</p> : null}
      {saved ? <p role="status">{t("AI settings saved.")}</p> : null}
      <Dialog open={dialog} onClose={() => setDialog(false)} title={t("Codex models")} description={t("Models and supported reasoning efforts reported by Codex.")} returnFocus={focus} testId="ai-models-dialog"
        footer={<><span className="agent-updated">{t("Updated")}: {date(models?.updatedAt)}</span><Button variant="secondary" onClick={() => { setDialog(false); setView("diagnostics"); }}>{t("Diagnostics")}</Button><Button variant="default" disabled={loading || !settings?.enabled} onClick={() => void refresh()}>{t("Refresh")}</Button></>}>
        <div className="agent-models"><Input aria-label={t("Search models")} placeholder={t("Search models")} value={search} onChange={event => setSearch(event.target.value)} />
          <p className="agent-muted">{t("Models")}: {filteredModels?.length ?? "—"}</p>
          <div className="agent-model-list">{!models ? <p>{loading ? t("Checking…") : t("Unavailable")}</p> : filteredModels?.map(item => <article key={item.id}>
            <div className="agent-model-name"><strong>{item.displayName}</strong><code>{item.model}</code>{item.model === storedSettings?.model ? <small>{t("Default")}</small> : null}</div><p>{item.description}</p><small>{t("Reasoning effort")}: {item.supportedReasoningEfforts.map(effort => effort.reasoningEffort).join(" · ")}</small>
          </article>)}
          {filteredModels?.length === 0 ? <p>{t("No matching models.")}</p> : null}</div>
        </div>
      </Dialog>
    </section>;
  }
  // The shell translates contribution metadata at render time, including language changes.
  return { commands: [], sidebar: [], tabs: [], settings: [{ id: AI_TASK.plugin, label: "AI agent", description: "Manage provider connections and models. Codex is supported.", View: Settings }], dispose() {} };
}
