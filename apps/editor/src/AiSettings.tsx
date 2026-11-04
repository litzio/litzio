import { hostClient } from "./host-client.ts";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AI_AGENT, type AiAgentSettings, type AiModels, type AiDiagnostics, type AiEnvironment, type AiProvider } from "../shared/ai.ts";
import "./ai-settings.css";
import { SettingsSelect } from "./components/ui/settings.tsx";
import { Input } from "./components/ui/input.tsx";
import { Button } from "./components/ui/button.tsx";
import { Dialog as BaseDialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog.tsx";
import { i18n, type MessageKey } from "./i18n.ts";
function Dialog({ open, onClose, title, description, returnFocus, children, footer, testId }: {
  open: boolean; onClose(): void; title: string; description: string; returnFocus: RefObject<HTMLElement | null>;
  children?: ReactNode; footer?: ReactNode; testId?: string;
}) {
  return <BaseDialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent finalFocus={returnFocus} data-testid={testId}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      {children}<DialogFooter>{footer}</DialogFooter>
    </DialogContent>
  </BaseDialog>;
}
async function request<T>(route: string, method = "GET", body?: unknown): Promise<T> {
 const response = await hostClient.request(route, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
 const value = await response.json(); if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`); return value;
}

export function AiSettings({ onSaved }: { onSaved(): void }) {
    const [settings, setSettings] = useState<AiAgentSettings>();
    const [storedSettings, setStoredSettings] = useState<AiAgentSettings>();
    const [inspecting, setInspecting] = useState<AiProvider>("codex");
    const [catalogs, setCatalogs] = useState<Partial<Record<AiProvider, AiModels>>>({});
    const models = catalogs[inspecting];
    const setModels = (value: AiModels | undefined) => { if (value) setCatalogs(current => ({ ...current, [value.provider]: value })); };
    const [diagnostics, setDiagnostics] = useState<AiDiagnostics>();
    const [environment, setEnvironment] = useState<AiEnvironment>();
    const [view, setView] = useState<"settings" | "diagnostics">("settings");
    const [dialog, setDialog] = useState(false), [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
    const latest = useRef<AiAgentSettings | undefined>(undefined), queue = useRef(Promise.resolve()), revision = useRef(0);
    const [connections, setConnections] = useState<Partial<Record<AiProvider, AiDiagnostics>>>({});
    const [problem, setProblem] = useState("");
    const focus = useRef<HTMLElement | null>(null), alive = useRef(true);
    const t = (key: string) => i18n.t(key as MessageKey);
    const get = <T,>(route: string, provider?: AiProvider) => request<T>(route + (provider ? `?provider=${provider}` : ""));
    const save = (next: AiAgentSettings) => {
      latest.current = next; setSettings(next); setBusy(true); setProblem("");
      const version = ++revision.current;
      queue.current = queue.current.then(async () => {
        try {
          const stored = await request<AiAgentSettings>(AI_AGENT.settingsRoute, "PUT", next);
          onSaved();
          if (alive.current && version === revision.current) setStoredSettings(stored);
        } catch { if (alive.current && version === revision.current) setProblem(t("Could not save AI settings.")); }
        finally { if (alive.current && version === revision.current) setBusy(false); }
      });
    };
    const refresh = async (provider: AiProvider = inspecting) => {
      setLoading(true); setProblem("");
      const results = await Promise.allSettled([get<AiModels>(AI_AGENT.modelsRoute, provider), get<AiDiagnostics>(AI_AGENT.diagnosticsRoute, provider)]);
      if (!alive.current) return;
      if (results[0].status === "fulfilled") setModels(results[0].value);
      else { setModels(undefined); setProblem(String(results[0].reason.message)); }
      if (results[1].status === "fulfilled") {
        const value = results[1].value; setDiagnostics(value); setConnections(current => ({ ...current, [provider]: value }));
      } else { setDiagnostics(undefined); setProblem(String(results[1].reason.message)); }
      setLoading(false);
    };
    const selectProvider = async (provider: AiProvider) => {
      const current = latest.current!;
      if (provider === current.provider) { save({ ...current }); return; }
      setLoading(true); setProblem("");
      try {
        const catalog = await get<AiModels>(AI_AGENT.modelsRoute, provider), first = catalog.models[0];
        if (!first) throw new Error();
        if (!alive.current) return;
        save({ ...latest.current!, provider, model: first.model, reasoningEffort: first.defaultReasoningEffort });
        setModels(catalog); setInspecting(provider); void refresh(provider);
      } catch { if (alive.current) setProblem(t("Could not save AI settings.")); }
      finally { if (alive.current) setLoading(false); }
    };
    useEffect(() => {
      alive.current = true;
      void Promise.all([get<AiAgentSettings>(AI_AGENT.settingsRoute), get<AiEnvironment>(AI_AGENT.environmentRoute)]).then(([next, env]) => {
        if (!alive.current) return;
        next = { ...next, responseLanguage: next.responseLanguage ?? (navigator.language.startsWith("ko") ? "ko" : navigator.language.startsWith("ja") ? "ja" : "en") };
        latest.current = next; setSettings(next); setStoredSettings(next); setEnvironment(env); setInspecting(next.provider); void refresh(next.provider);
        const other = next.provider === "codex" ? "copilot" : "codex";
        void get<AiDiagnostics>(AI_AGENT.diagnosticsRoute, other).then(value => { if (alive.current) setConnections(current => ({ ...current, [other]: value })); }).catch(() => {});
      }).catch(error => { if (alive.current) setProblem(error.message); });
      return () => { alive.current = false; };
    }, []);
    const copilot = inspecting === "copilot", providerName = copilot ? "GitHub Copilot" : "Codex";
    const defaultModels = settings ? catalogs[settings.provider] : undefined;
    const model = defaultModels?.models.find(item => item.model === settings?.model);
    const valid = !!model && model.supportedReasoningEfforts.some(item => item.reasoningEffort === settings?.reasoningEffort);
    const selectModel = (name: string) => {
      const selected = defaultModels?.models.find(item => item.model === name); if (!settings || !selected) return;
      save({ ...settings, model: name, reasoningEffort: selected.supportedReasoningEfforts.some(item => item.reasoningEffort === settings.reasoningEffort) ? settings.reasoningEffort : selected.defaultReasoningEffort });
    };
    const status = (provider: AiProvider) => {
      const value = connections[provider];
      return !settings ? t("Checking…") : !value ? t("Checking…")
        : /Codex .+ or later is required\./.test(value.error ?? "") ? t("Update required") : value.error ? t("Unavailable")
        : value.account === null ? t("Login required") : value.connected && (provider === "copilot" || value.account) ? t(provider === "copilot" ? "Connected" : "Available") : t("Unavailable");
    };
    const date = (value?: number) => value ? new Date(value).toLocaleString() : t("Not checked");
    const filteredModels = models?.models.filter(item => `${item.displayName} ${item.model}`.toLowerCase().includes(search.toLowerCase()));
    const row = (label: string, content: ReactNode) => <div className="agent-diagnostic-row"><span>{label}</span><div>{content}</div></div>;
    return <section className="agent-settings" aria-label={t("Assistant")}>
      {view === "diagnostics" ? <>
        <div><Button variant="ghost" onClick={() => setView("settings")}>← {t("Assistant")}</Button></div>
        <div className="agent-heading"><h3 className="settings-heading">{copilot ? t("Copilot diagnostics") : t("Codex diagnostics")}</h3><Button variant="secondary" disabled={loading} onClick={() => void refresh()}>{t("Run diagnostics")}</Button></div>
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
        <h4 title={t("Connected products: Codex, GitHub Copilot")}>{t("Providers")}</h4>
        {(["codex", "copilot"] as const).map(provider => <div className="agent-provider" key={provider}>
          <Button variant="ghost" className="agent-provider-open justify-start" disabled={loading} onClick={event => { focus.current = event.currentTarget; setInspecting(provider); void refresh(provider); setSearch(""); setDialog(true); }} aria-label={t(provider === "copilot" ? "Copilot models" : "Codex models")}>
            <span aria-hidden="true">›</span><strong>{provider === "copilot" ? "GitHub Copilot" : "Codex"}</strong><span className="agent-provider-summary">{status(provider)}</span>
          </Button>
          <Button variant="ghost" onClick={() => { setInspecting(provider); void refresh(provider); setView("diagnostics"); }}>{t("Diagnostics")}</Button>
        </div>)}
        <h4>{t("Defaults")}</h4>
        <p className="agent-muted">{t("Shared by all AI tasks. Changes apply to the next task.")}</p>
        <SettingsSelect label={t("Default provider")} value={settings?.provider ?? "codex"} disabled={!settings || loading}
          options={(["codex", "copilot"] as const).map(value => ({ value, label: value === "codex" ? "Codex" : "GitHub Copilot" }))} onChange={value => void selectProvider(value as AiProvider)} />
        <SettingsSelect label={t("Model")} value={settings?.model ?? ""} disabled={loading || !defaultModels || !settings} onChange={selectModel}
          options={[...(!model ? [{ value: settings?.model ?? "", label: settings?.model ?? t("Checking…") }] : []), ...(defaultModels?.models.map(item => ({ value: item.model, label: item.displayName })) ?? [])]} />
        <div title={settings?.provider === "copilot" && defaultModels?.copilot?.reasoningEffortSource === "cli" ? t("Copilot CLI reasoning effort is fixed for a conversation. Start a new conversation to change it.") : undefined}><SettingsSelect label={t("Reasoning effort")} value={settings?.reasoningEffort ?? ""} disabled={loading || !model || !settings}
          onChange={value => { save({ ...latest.current!, reasoningEffort: value }); }}
          options={[...(!valid ? [{ value: settings?.reasoningEffort ?? "", label: settings?.reasoningEffort ?? "—" }] : []), ...(model?.supportedReasoningEfforts.map(item => ({ value: item.reasoningEffort, label: t(item.reasoningEffort) })) ?? [])]} /></div>
        <div title={t("Full access removes the sandbox and automatically approves tools, paths and network access. Existing documents must still be proposed in text.")}>
          <SettingsSelect label={t("Write access")} value={settings?.writeAccess ?? "opened-folders"} disabled={!settings}
            onChange={value => { save({ ...latest.current!, writeAccess: value as AiAgentSettings["writeAccess"] }); }}
            options={[{ value: "read-only", label: t("Read-only") }, { value: "opened-folders", label: t("Opened folders") }, { value: "full-access", label: t("Full access") }]} />
        </div>
        <SettingsSelect label={t("AI default language")} value={settings?.responseLanguage ?? "en"} disabled={!settings}
          onChange={value => { save({ ...latest.current!, responseLanguage: value as AiAgentSettings["responseLanguage"] }); }}
          options={[{ value: "ko", label: "한국어" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" }]} />
        <p className="agent-muted">{t("Used only for tasks started without a conversation.")}</p>
        {models && !valid ? <p role="status">{t("Choose a model and reasoning effort from the available list.")}</p> : null}

        <h4>{t("Common working environment")}</h4>
        <div className="agent-diagnostics">
          {row(t("Working folder"), <code>{environment?.cwd ?? "—"}</code>)}
          {row(t("Litzio instructions"), <code title={environment?.instructions}>{environment ? "AGENTS.md" : "—"}</code>)}
          {settings?.provider !== "copilot" ? row(t("Litzio skills"), environment?.skills.length ? environment.skills.join(", ") : t("No Litzio skills installed.")) : null}
        </div>
      </>}
      {problem ? <p role="alert">{problem}</p> : null}
      {busy ? <p role="status">{t("Saving…")}</p> : null}
      <Dialog open={dialog} onClose={() => setDialog(false)} title={t(copilot ? "Copilot models" : "Codex models")} description={t(copilot ? "Models reported by Copilot CLI. Account access and quota may vary." : "Models and supported reasoning efforts reported by Codex.")} returnFocus={focus} testId="ai-models-dialog"
        footer={<><span className="agent-updated">{t("Updated")}: {date(models?.updatedAt)}</span><Button variant="secondary" onClick={() => { setDialog(false); setView("diagnostics"); }}>{t("Diagnostics")}</Button><Button variant="default" disabled={loading} onClick={() => void refresh()}>{t("Refresh")}</Button></>}>
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
