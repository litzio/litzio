import { Row, Section } from "./components/ui/row.tsx";
import { Status } from "./components/ui/status.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.tsx";
import { AssistantAccount, AssistantRateLimits } from "./AssistantAccountUsage.tsx";
import { useHostClient } from "./host-context.tsx";
import { observeAssistantProvider } from "./assistant-api.ts";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { ASSISTANT, DEFAULT_OLLAMA_URL, checkedOllamaUrl, type AssistantSettings, type AiModels, type AssistantDiagnostics, type AssistantEnvironment, type AiProvider } from "../shared/assistant.ts";
import "./assistant-settings.css";
import { SettingsSelect } from "./components/ui/settings.tsx";
import { FieldError, Notice } from "./ui/primitives.tsx";
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
function createRequest(client: ReturnType<typeof useHostClient>) { return async function request<T>(route: string, method = "GET", body?: unknown): Promise<T> {
 const response = await client.request(route, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
 const value = await response.json(); if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`); return value;
}; }

export function AssistantSettings({ onSaved, providerReadRevision }: { onSaved(): void; providerReadRevision: number }) {
    const request = createRequest(useHostClient());
    const [settings, setSettings] = useState<AssistantSettings>();
    const [storedSettings, setStoredSettings] = useState<AssistantSettings>();
    const [inspecting, setInspecting] = useState<AiProvider>("codex");
    const [catalogs, setCatalogs] = useState<Partial<Record<AiProvider, AiModels>>>({});
    const models = catalogs[inspecting];
    const setModels = (value: AiModels) => setCatalogs(current => (current[value.provider]?.updatedAt ?? 0) > value.updatedAt
      ? current : { ...current, [value.provider]: value });
    const [environment, setEnvironment] = useState<AssistantEnvironment>();
    const [view, setView] = useState<"settings" | "diagnostics">("settings");
    const [dialog, setDialog] = useState(false), [search, setSearch] = useState("");
    const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
    const [selectingProvider, setSelectingProvider] = useState(false);
    const latest = useRef<AssistantSettings | undefined>(undefined), queue = useRef(Promise.resolve()), revision = useRef(0);
    const [connections, setConnections] = useState<Partial<Record<AiProvider, AssistantDiagnostics>>>({});
    const diagnostics = connections[inspecting];
    const [problem, setProblem] = useState("");
    const focus = useRef<HTMLElement | null>(null), alive = useRef(true);
    const t = (key: string) => i18n.t(key as MessageKey);
    const get = <T,>(route: string, provider?: AiProvider) => request<T>(route + (provider ? `?provider=${provider}` : ""));
    const save = (next: AssistantSettings) => {
      latest.current = next; setSettings(next); setBusy(true); setProblem("");
      const version = ++revision.current;
      return queue.current = queue.current.then(async () => {
        try {
          const stored = await request<AssistantSettings>(ASSISTANT.settingsRoute, "PUT", next);
          onSaved();
          if (alive.current && version === revision.current) setStoredSettings(stored);
        } catch { if (alive.current && version === revision.current) setProblem(t("Could not save Assistant settings.")); }
        finally { if (alive.current && version === revision.current) setBusy(false); }
      });
    };
    const loadModels = (provider: AiProvider, preferCached = true) => {
      const update = (value: AiModels) => { if (alive.current) setModels(value); };
      return preferCached ? observeAssistantProvider(request<AiModels>, ASSISTANT.modelsRoute, provider, update)
        : get<AiModels>(ASSISTANT.modelsRoute, provider).then(update);
    };
    const loadDiagnostics = (provider: AiProvider, preferCached = true) => {
      const update = (value: AssistantDiagnostics) => {
        if (alive.current) setConnections(current => (current[provider]?.checkedAt ?? 0) > value.checkedAt
          ? current : { ...current, [provider]: value });
      };
      return preferCached ? observeAssistantProvider(request<AssistantDiagnostics>, ASSISTANT.diagnosticsRoute, provider, update)
        : get<AssistantDiagnostics>(ASSISTANT.diagnosticsRoute, provider).then(update);
    };
    const report = (error: Error) => { if (alive.current) setProblem(error.message); };
    const refresh = async () => {
      setLoading(true); setProblem("");
      await Promise.allSettled([loadModels(inspecting, false).catch(report), loadDiagnostics(inspecting, false).catch(report)]);
      if (alive.current) setLoading(false);
    };
    const selectProvider = async (provider: AiProvider) => {
      const current = latest.current!;
      if (provider === current.provider) { save({ ...current }); return; }
      setSelectingProvider(true); setProblem("");
      try {
        const catalog = await get<AiModels>(ASSISTANT.modelsRoute, provider), first = catalog.models[0];
        if (!first) throw new Error();
        if (!alive.current) return;
        save({ ...latest.current!, provider, model: first.model, reasoningEffort: first.defaultReasoningEffort });
        setModels(catalog); setInspecting(provider);
      } catch { if (alive.current) setProblem(t("Could not save Assistant settings.")); }
      finally { if (alive.current) setSelectingProvider(false); }
    };
    const [ollamaDraft, setOllamaDraft] = useState<string>();
    const [ollamaError, setOllamaError] = useState(false);
    const ollamaId = useId();
    /** The Host applies a new Copilot model source from the next Copilot launch; re-read its catalog now. */
    const saveCopilotSource = async (next: AssistantSettings) => {
      setSelectingProvider(true);
      try {
        await save(next);
        if (!alive.current) return;
        void loadDiagnostics("copilot", false).catch(report);
        const catalog = await get<AiModels>(ASSISTANT.modelsRoute, "copilot");
        if (!alive.current) return;
        setModels(catalog);
        const current = latest.current!, first = catalog.models[0];
        // Like a provider change: keep a still-listed model, otherwise take the first one.
        if (current.provider === "copilot" && first && !catalog.models.some(item => item.model === current.model)) save({ ...current, model: first.model, reasoningEffort: first.defaultReasoningEffort });
      } catch (error) { report(error as Error); }
      finally { if (alive.current) setSelectingProvider(false); }
    };
    const commitOllamaUrl = () => {
      const current = latest.current; if (!current || ollamaDraft === undefined) return;
      let value: string;
      try { value = checkedOllamaUrl(ollamaDraft); } catch { setOllamaError(true); return; }
      setOllamaError(false); setOllamaDraft(value);
      if (value !== (current.ollamaUrl ?? DEFAULT_OLLAMA_URL)) void saveCopilotSource({ ...current, ollamaUrl: value });
    };
    useEffect(() => {
      alive.current = true;
      void get<AssistantEnvironment>(ASSISTANT.environmentRoute).then(env => { if (alive.current) setEnvironment(env); }).catch(report);
      void get<AssistantSettings>(ASSISTANT.settingsRoute).then(next => {
        if (!alive.current) return;
        next = { ...next, responseLanguage: next.responseLanguage ?? (navigator.language.startsWith("ko") ? "ko" : navigator.language.startsWith("ja") ? "ja" : "en") };
        latest.current = next; setSettings(next); setStoredSettings(next); setInspecting(next.provider); setOllamaDraft(next.ollamaUrl ?? DEFAULT_OLLAMA_URL);
      }).catch(report);
      return () => { alive.current = false; };
    }, []);
    const savedProvider = storedSettings?.provider;
    useEffect(() => {
      if (!savedProvider) return;
      void loadModels(savedProvider).catch(report);
      for (const provider of ["codex", "copilot"] as const) void loadDiagnostics(provider).catch(report);
    }, [savedProvider, providerReadRevision]);
    const copilot = inspecting === "copilot", providerName = copilot ? "GitHub Copilot" : "Codex";
    const localCopilot = settings?.copilotModelSource === "ollama";
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
        : value.account === null ? t("Login required") : value.connected && (provider === "copilot" || value.account) ? t("Available") : t("Unavailable");
    };
    const date = (value?: number) => value ? new Date(value).toLocaleString() : t("Not checked");
    const filteredModels = models?.models.filter(item => `${item.displayName} ${item.model}`.toLowerCase().includes(search.toLowerCase()));
    const row = (label: string, content: ReactNode) => <Row kind="fact" label={label}>{content}</Row>;
    return <section className="agent-settings" aria-label={t("Assistant")}>
      {view === "diagnostics" ? <>
        <div><Button variant="ghost" onClick={() => setView("settings")}>← {t("Assistant")}</Button></div>
        <div className="agent-heading"><h3 className="settings-heading">{copilot ? t("Copilot diagnostics") : t("Codex diagnostics")}</h3><Button variant="outline" title={t(copilot ? "Sign in with Copilot CLI on the Host. Connection does not verify model access or quota." : "To sign in, run codex login in a terminal, then run diagnostics again.")} disabled={loading} onClick={() => void refresh()}>{t("Run diagnostics")}</Button></div>
        <p className="type-helper">{t("Last checked")}: {date(diagnostics?.checkedAt)}</p>
        <div className="agent-diagnostics">
          {row(`${providerName} CLI`, <>{diagnostics?.version ?? t("Unavailable")}<code>{diagnostics?.path ?? "—"}</code></>)}
          {diagnostics?.storePowerShellOnly ? row("PowerShell 7", <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>{t("Possible shell issue · Install standard PowerShell 7")}</TooltipTrigger><TooltipContent>{t("Only Microsoft Store PowerShell 7 was found. Codex may fail in restricted modes (CreateProcessAsUserW failed: 5). Replace it with the standard PowerShell 7 installer and run diagnostics again.")}</TooltipContent></Tooltip>) : null}
          {row(copilot ? "ACP" : "app-server", <>{t(diagnostics?.connected ? "Connected" : "Unavailable")}{diagnostics?.error ? <Notice tone="error">{diagnostics.error}</Notice> : null}</>)}
          {!copilot ? <>{row(t("Account"), <>{diagnostics?.accountError ?? <AssistantAccount value={diagnostics} />}<code>account/read</code></>)}
          {row(t("Usage and limits"), <>{diagnostics?.rateLimitsError ?? <AssistantRateLimits value={diagnostics} />}<code>account/rateLimits/read</code></>)}
          {row(t("MCP servers"), <>{diagnostics?.mcpError ?? (diagnostics?.mcp?.length ? diagnostics.mcp.map(server => <div key={server.name}><p>{server.name} · {t(server.status === "connected" ? "Connected" : server.status === "starting" ? "Checking…" : "Unavailable")} · {t(server.authStatus === "oAuth" ? "oAuth" : server.authStatus === "bearerToken" ? "Token authentication" : server.authStatus === "notLoggedIn" ? "Login required" : server.authStatus === "unsupported" ? "No authentication" : "Not checked")}</p><details><summary>{t("Details")}</summary><code>{server.status} · {server.authStatus}</code></details></div>) : t("No MCP servers reported."))}<code>mcpServerStatus/list</code></>)}</> : null}
        </div>

      </> : <>
        <Section title={t("Providers")}>
        {(["codex", "copilot"] as const).map(provider => <Row key={provider} label={<Button variant="ghost" className="agent-provider-open justify-start" onClick={event => { focus.current = event.currentTarget; setInspecting(provider); void loadModels(provider).catch(report); setSearch(""); setDialog(true); }} aria-label={t(provider === "copilot" ? "Copilot models" : "Codex models")}>
            <span aria-hidden="true">›</span><span className="type-item-name">{provider === "copilot" ? "GitHub Copilot" : "Codex"}</span>
          </Button>}>
          <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>
            <Status variant="plain" tone={status(provider) === t("Checking…") ? "progress" : status(provider) === t("Available") ? "ok" : status(provider) === t("Unavailable") ? "error" : "warning"} label={status(provider)} />
          </TooltipTrigger><TooltipContent>{t("Last checked")}: {date(connections[provider]?.checkedAt)}</TooltipContent></Tooltip>
          <Button variant="ghost" onClick={() => { setInspecting(provider); void loadDiagnostics(provider).catch(report); setView("diagnostics"); }}>{t("Diagnostics")}</Button>
        </Row>)}
        <Tooltip><TooltipTrigger render={<div tabIndex={0} />}>
          <SettingsSelect label={t("Copilot model source")} testId="copilot-model-source" value={localCopilot ? "ollama" : "account"} disabled={!settings || selectingProvider}
            onChange={value => void saveCopilotSource({ ...latest.current!, copilotModelSource: value as NonNullable<AssistantSettings["copilotModelSource"]> })}
            options={[{ value: "account", label: t("GitHub account") }, { value: "ollama", label: t("Local (Ollama)") }]} />
        </TooltipTrigger><TooltipContent>{t("Models GitHub Copilot uses: your GitHub account's models, or models installed in Ollama on the Host. Applies when the next Copilot connection starts; a running response is not interrupted.")}</TooltipContent></Tooltip>
        {localCopilot ? <Tooltip><TooltipTrigger render={<div tabIndex={0} />}>
          <Row label={<label htmlFor={ollamaId}>{t("Ollama address")}</label>}>
            <div className="agent-ollama-url">
              <Input id={ollamaId} data-testid="ollama-url" value={ollamaDraft ?? ""} disabled={selectingProvider} aria-invalid={ollamaError || undefined} aria-describedby={ollamaError ? `${ollamaId}-error` : undefined}
                onChange={event => { setOllamaDraft(event.target.value); setOllamaError(false); }} onBlur={commitOllamaUrl}
                onKeyDown={event => { if (event.key === "Enter") commitOllamaUrl(); }} />
              <FieldError id={`${ollamaId}-error`}>{ollamaError ? t("Enter an http:// or https:// address.") : null}</FieldError>
            </div>
          </Row>
        </TooltipTrigger><TooltipContent>{t("Set Ollama's context length to 64k or more.")}</TooltipContent></Tooltip> : null}
        </Section>
        <Section title={t("Defaults")} description={t("Changes apply to the next task.")}>
        <SettingsSelect label={t("Default provider")} value={settings?.provider ?? "codex"} disabled={!settings || selectingProvider}
          options={(["codex", "copilot"] as const).map(value => ({ value, label: value === "codex" ? "Codex" : "GitHub Copilot" }))} onChange={value => void selectProvider(value as AiProvider)} />
        <SettingsSelect label={t("Model")} value={settings?.model ?? ""} disabled={!defaultModels || !settings || selectingProvider} onChange={selectModel}
          options={[...(!model ? [{ value: settings?.model ?? "", label: settings?.model ?? t("Checking…") }] : []), ...(defaultModels?.models.map(item => ({ value: item.model, label: item.displayName })) ?? [])]} />
        <div title={settings?.provider === "copilot" && defaultModels?.copilot?.reasoningEffortSource === "cli" ? t("Copilot CLI reasoning effort is fixed for a conversation. Start a new conversation to change it.") : undefined}><SettingsSelect label={t("Reasoning effort")} value={settings?.reasoningEffort ?? ""} disabled={!model || !settings || selectingProvider}
          onChange={value => { save({ ...latest.current!, reasoningEffort: value }); }}
          options={[...(!valid ? [{ value: settings?.reasoningEffort ?? "", label: settings?.reasoningEffort ?? "—" }] : []), ...(model?.supportedReasoningEfforts.map(item => ({ value: item.reasoningEffort, label: t(item.reasoningEffort) })) ?? [])]} /></div>
        <Tooltip><TooltipTrigger render={<div tabIndex={0} />}>
          <SettingsSelect label={t("Write access")} value={settings?.permissionMode ?? "full-access"} disabled={!settings}
            onChange={value => { save({ ...latest.current!, permissionMode: value as AssistantSettings["permissionMode"] }); }}
            options={[{ value: "read-only", label: t("Read-only") }, { value: "opened-folders", label: t("Opened folders") }, { value: "full-access", label: t("Full access"), disabled: defaultModels?.fullAccessAllowed === false }]} />
        </TooltipTrigger><TooltipContent>{t("Opened folders allows folder edits and network access; Read-only allows reads. Provider requests beyond these defaults ask for approval. Full access automatically approves provider tools and allows Host tools outside opened folders, within Host roots. Document edits apply directly; supported changes can be viewed and undone.")}{defaultModels?.fullAccessAllowed === false ? ` ${t("Your organization does not allow Full access. Choose Opened folders or Read-only and send again.")}` : ""}</TooltipContent></Tooltip>
        <SettingsSelect label={t("AI default language")} description={t("Used only for tasks started without a conversation.")} value={settings?.responseLanguage ?? "en"} disabled={!settings}
          onChange={value => { save({ ...latest.current!, responseLanguage: value as AssistantSettings["responseLanguage"] }); }}
          options={[{ value: "ko", label: "한국어" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" }]} />

        {defaultModels && !valid ? <p role="status">{t("Choose a model and reasoning effort from the available list.")}</p> : null}

        </Section>
        <Section title={t("Common working environment")}>
          {row(t("Working folder"), <code>{environment?.cwd ?? "—"}</code>)}
          {row(t("Litzio instructions"), <code title={environment?.instructions}>{environment ? "AGENTS.md" : "—"}</code>)}
          {settings?.provider !== "copilot" ? row(t("Litzio skills"), environment?.skills.length ? environment.skills.join(", ") : t("No Litzio skills installed.")) : null}
        </Section>
      </>}
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      {busy ? <p role="status">{t("Saving…")}</p> : null}
      <Dialog open={dialog} onClose={() => setDialog(false)} title={t(copilot ? "Copilot models" : "Codex models")} description={t(copilot ? localCopilot ? "Models installed in Ollama on the Host." : "Models reported by Copilot CLI. Account access and quota may vary." : "Models and supported reasoning efforts reported by Codex.")} returnFocus={focus} testId="assistant-models-dialog"
        footer={<><span className="agent-updated type-helper">{t("Updated")}: {date(models?.updatedAt)}</span><Button variant="outline" onClick={() => { setDialog(false); setView("diagnostics"); }}>{t("Diagnostics")}</Button><Button variant="outline" disabled={loading} onClick={() => void refresh()}>{t("Refresh")}</Button></>}>
        <div className="agent-models"><Input aria-label={t("Search models")} placeholder={t("Search models")} value={search} onChange={event => setSearch(event.target.value)} />
          <p className="type-helper">{t("Models")}: {filteredModels?.length ?? "—"}</p>
          <div className="agent-model-list">{!models ? <p>{loading ? t("Checking…") : t("Unavailable")}</p> : filteredModels?.map(item => <article key={item.id}>
            <div className="agent-model-name"><strong>{item.displayName}</strong><code>{item.model}</code>{item.model === storedSettings?.model ? <small>{t("Default")}</small> : null}</div><p>{item.description}</p><small>{t("Reasoning effort")}: {item.supportedReasoningEfforts.map(effort => t(effort.reasoningEffort)).join(" · ")}</small>
          </article>)}
          {filteredModels?.length === 0 ? <p>{t("No matching models.")}</p> : null}</div>
        </div>
      </Dialog>
    </section>;

}
