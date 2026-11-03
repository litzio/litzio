import { PanelResize } from "./PanelResize.tsx";
import { AssistantQuestion } from "./AssistantQuestion.tsx";
import type { FileIdentity } from "../../shared/file-operations.ts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Plus, History, X, ArrowUp, Square } from "lucide-react";
import { AI_AGENT, AI_TASK, type AiAgentSettings, type AiConversation, type AiConversationInfo, type AiConversationInput, type AiModels, type AiFileReference, type AiSkills, type AiDiagnostics } from "@litzio/plugin-api/ai";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { i18n, type MessageKey } from "../i18n.ts";
import { brand } from "../../../../brand.ts";
import "./assistant.css";
import { CopyButton } from "../components/CopyButton.tsx";
import { AssistantAnswer } from "./AssistantAnswer.tsx";

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(import.meta.env.BASE_URL + url.replace(/^\//, ""), body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json(); if (!response.ok) throw new Error(data.error ?? response.statusText); return data;
}
const conversationKey = `${brand.storagePrefix}.assistantConversation`;
function lastConversation() { try { return localStorage.getItem(conversationKey) || undefined; } catch { return undefined; } }
function rememberConversation(id?: string) { try { if (id) localStorage.setItem(conversationKey, id); else localStorage.removeItem(conversationKey); } catch { /* In-page state remains usable. */ } }
const pathName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || path;
const widthKey = `${brand.storagePrefix}.assistantWidth`;
export function assistantWidth() { try { const value = Number(localStorage.getItem(widthKey)); return value >= 340 && value <= 560 ? value : undefined; } catch { return undefined; } }
export function rememberAssistantWidth(value: number) { try { localStorage.setItem(widthKey, String(value)); } catch { /* Width remains usable for this page. */ } }
type Props = { settingsRevision: number; open: boolean; overlay: boolean; width: number | undefined; onWidth(value: number): void; onClose(): void; onSettings(): void; settingsDisabled?: boolean;
  onOpen(path: string): Promise<void>; onUndo(result: { path: string; revision: string; identity?: FileIdentity }): Promise<boolean>;
  referenceRequest?: { path: string };
  documentPath: string; folders: string[]; context(): Promise<AiConversationInput["document"]> };

/** A concrete shell surface; it does not introduce a plugin contribution API. */
export function AssistantPanel({ settingsRevision, open, overlay, width, onWidth, onClose, onSettings, settingsDisabled, documentPath, folders, context, onOpen, onUndo, referenceRequest }: Props) {
  useTranslation();
  const [removed, setRemoved] = useState<string[]>([]);
  const [settings, setSettings] = useState<AiAgentSettings>();
  const [models, setModels] = useState<AiModels>();
  const [conversation, setConversation] = useState<AiConversation>();
  const [history, setHistory] = useState<AiConversationInfo[] | null>(null);
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [references, setReferences] = useState<AiFileReference[]>([]);
  const [candidates, setCandidates] = useState<AiFileReference[]>([]);
  const [mention, setMention] = useState<{ start: number; end: number; query: string; skill: boolean } | null>(null);
  const [skillCatalog, setSkillCatalog] = useState<AiSkills>();
  const [skillProblem, setSkillProblem] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [setup, setSetup] = useState("");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const choicesAnchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null), input = useRef<HTMLTextAreaElement>(null), transcript = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(false);
  const current = useRef(conversation); current.current = conversation;
  const initializedSettings = useRef(settingsRevision), providerVersion = useRef(0);
  const active = conversation?.turns.some(turn => turn.status === "inProgress") ?? false;
  const defaults = (value: AiAgentSettings) => { setModel(value.model); setEffort(value.reasoningEffort); };
  useEffect(() => {
    const refreshingSettings = initializedSettings.current !== settingsRevision;
    initializedSettings.current = settingsRevision;
    if (!open) return;
    initialFocus.current = !refreshingSettings;
    // A later focus move belongs to the user or another UI, even if setup is slow.
    const cancelInitialFocus = () => { initialFocus.current = false; };
    document.addEventListener("focusin", cancelInitialFocus);
    let alive = true;
    setReady(false); setSetup(""); setProblem(""); setHistory(null); setModels(undefined);
    void request<AiAgentSettings>(AI_TASK.settingsRoute).then(async value => {
      if (!alive) return;
      if (settings && value.provider !== settings.provider) {
        // Host disposed the old connection and conversations. Retire its UI requests too.
        providerVersion.current++;
        current.current = undefined; setConversation(undefined); rememberConversation();
        setPending(false); setProblem(""); setHistory(null); setMessage(""); setReferences([]); setMention(null); setChoicesOpen(false);
        setRemoved([]); setSkillCatalog(undefined); setSkillProblem("");
      }
      setSettings(value); if (value.provider === "copilot") setReferences(previous => previous.filter(file => file.kind !== "skill")); if (!current.current) defaults(value);
      if (!value.enabled) {
        setSetup(value.provider === "copilot" ? "AI agent is disabled." : "Codex is disabled.");
        setConversation(current => current ? { ...current, userInput: undefined, turns: current.turns.map(turn => turn.status === "inProgress" ? { ...turn, status: "interrupted" } : turn) } : current);
        return;
      }
      const [catalog, diagnostics] = await Promise.all([request<AiModels>(AI_AGENT.modelsRoute), request<AiDiagnostics>(AI_AGENT.diagnosticsRoute)]);
      if (!alive) return;
      setModels(catalog);
      if (!diagnostics.connected) { setSetup(diagnostics.error ?? "Codex CLI is unavailable on the Host."); return; }
      if (value.provider === "codex" && !diagnostics.account) { setSetup("Sign in to Codex to start a conversation."); return; }
      const id = current.current?.id ?? lastConversation();
      if (id) {
        try {
          const resumed = await request<AiConversation>(AI_AGENT.conversationsRoute, { action: "resume", id });
          if (alive) {
            if (!current.current) { setModel(resumed.model); setEffort(resumed.reasoningEffort); }
            setConversation(resumed); rememberConversation(resumed.id);
          }
        } catch {
          // A missing or unavailable last thread must not block a fresh conversation.
          if (alive) { setConversation(undefined); rememberConversation(); setMessage(""); setProblem(""); defaults(value); }
        }
      }
      if (alive) setReady(true);
    }).catch(error => { if (alive) setSetup(error.message); });
    return () => {
      alive = false; initialFocus.current = false; setReady(false);
      document.removeEventListener("focusin", cancelInitialFocus);
    };
  }, [open, settingsRevision]);
  useLayoutEffect(() => {
    if (open && ready && settings?.enabled && !setup && initialFocus.current) {
      initialFocus.current = false;
      input.current?.focus();
    }
  }, [open, ready, settings?.enabled, setup]);
  useEffect(() => {
    if (!open || !conversation?.id || pending || !ready || !settings?.enabled || setup) return;
    let alive = true, polling = false, timer: ReturnType<typeof setTimeout> | undefined;
    const id = conversation.id;
    const schedule = () => {
      if (alive && document.visibilityState === "visible" && !polling && timer === undefined) timer = setTimeout(poll, 600);
    };
    const poll = async () => {
      timer = undefined;
      if (!alive || document.visibilityState !== "visible") return;
      polling = true;
      try { const next = await request<AiConversation>(`${AI_AGENT.conversationsRoute}?id=${encodeURIComponent(id)}`); if (alive && document.visibilityState === "visible") setConversation(next); }
      catch (error) { if (alive && document.visibilityState === "visible") setProblem((error as Error).message); }
      polling = false;
      schedule();
    };
    const visibilityChanged = () => {
      if (document.visibilityState !== "visible") { clearTimeout(timer); timer = undefined; }
      else schedule();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    schedule();
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [open, conversation?.id, pending, ready, settings?.enabled, setup, settingsRevision]);
  useEffect(() => { const element = transcript.current; if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 180) element.scrollTop = element.scrollHeight; }, [conversation]);
  const resultFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!pending && resultFocus.current) {
      const target = resultFocus.current; resultFocus.current = null;
      if (target.isConnected && open) target.focus();
    }
  }, [pending, open]);
  const run = async (action: (isCurrent: () => boolean) => Promise<void>) => {
    if (pending) return;
    const version = providerVersion.current, isCurrent = () => version === providerVersion.current;
    setPending(true); setProblem("");
    try { await action(isCurrent); } catch (error) { if (isCurrent()) setProblem((error as Error).message); } finally { if (isCurrent()) setPending(false); }
  };
  const send = () => run(async isCurrent => {
    if (active && settings?.provider === "copilot") return;
    const value = message.trim(); if (!value && !references.length) return;
    const document = await context(); if (!isCurrent()) return;
    const next = await request<AiConversation>(AI_AGENT.conversationsRoute, { action: "send", id: conversation?.id, message: value,
      model, reasoningEffort: effort, references: references.filter(file => file.kind !== "skill").map(file => file.path), skills: settings?.provider !== "codex" ? [] : references.filter(file => file.kind === "skill" && hasSkillToken(value, file.name)).map(({ name, path }) => ({ name, path })), folders, document });
    if (!isCurrent()) return;
    setConversation(next); rememberConversation(next.id); setMessage(""); setReferences([]); setMention(null); setHistory(null); input.current?.focus();
    requestAnimationFrame(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; });
  });
  const addReference = (file: AiFileReference) => {
    setReferences(previous => {
      if (previous.some(value => samePath(value.path, file.path))) return previous;
      if (file.kind !== "skill" && previous.filter(value => value.kind !== "skill").length >= 10) { setProblem(i18n.t("At most 10 file references are allowed.")); return previous; }
      return [...previous, file];
    });
  };
  useEffect(() => {
    if (referenceRequest) { addReference({ path: referenceRequest.path, name: pathName(referenceRequest.path), kind: "file" }); setHistory(null); }
  }, [referenceRequest]);
  const mentionOpen = mention !== null;
  const skillOpen = mention?.skill ?? false;
  useEffect(() => {
    if (!mentionOpen || !open) return;
    let alive = true;
    setCandidates([]);
    if (skillOpen) {
      setSkillCatalog(undefined); setSkillProblem("");
      void request<AiSkills>(AI_AGENT.skillsRoute).then(value => { if (alive) setSkillCatalog(value); }).catch(error => { if (alive) setSkillProblem(error.message); });
      return () => { alive = false; };
    }
    const walk = async (root: string, folder: string): Promise<void> => {
      if (!alive) return;
      const listing = await request<{ entries: AiFileReference[] }>(`/api/folder?${new URLSearchParams({ root, path: folder })}`);
      if (!alive) return;
      setCandidates(previous => [...previous, ...listing.entries.filter(file => file.kind !== "folder")].filter((file, index, all) => all.findIndex(other => samePath(other.path, file.path)) === index));
      for (const entry of listing.entries) if (entry.kind === "folder") await walk(root, entry.path);
    };
    void (async () => { for (const root of folders) await walk(root, root); })().catch(error => { if (alive) setProblem(error.message); });
    return () => { alive = false; };
  }, [mentionOpen, skillOpen, open, folders]);
  const matches = mention ? (mention.skill ? (skillCatalog?.skills ?? []).map(skill => ({ ...skill, kind: "skill" })) : candidates).filter(file => `${file.name} ${file.kind === "skill" ? skillCatalog?.skills.find(skill => skill.path === file.path)?.description : file.path}`.toLocaleLowerCase().includes(mention.query.toLocaleLowerCase())) : [];
  useEffect(() => { if (mention) document.getElementById(`assistant-reference-${candidateIndex}`)?.scrollIntoView({ block: "nearest" }); }, [candidateIndex, mention?.query]);
  const chooseReference = (file: AiFileReference) => {
    addReference(file);
    if (mention) { const next = message.slice(0, mention.start) + (file.kind === "skill" ? `$${file.name} ` : "") + message.slice(mention.end); setMessage(next); requestAnimationFrame(() => input.current?.setSelectionRange(mention.start + (file.kind === "skill" ? file.name.length + 2 : 0), mention.start + (file.kind === "skill" ? file.name.length + 2 : 0))); }
    setMention(null); input.current?.focus();
  };
  const removeReference = (path: string) => {
    const skill = references.find(file => file.path === path && file.kind === "skill");
    if (skill) setMessage(value => value.split(/(\s+)/).filter(part => part !== `$${skill.name}`).join(""));
    setReferences(previous => previous.filter(file => file.path !== path && !(skill && file.kind === "skill" && file.name === skill.name)));
  };
  const catalogModel = models?.models.find(value => value.model === model);
  const resultPaths = [...new Set(conversation?.turns.flatMap(turn => turn.items.flatMap(item => {
    const result = createdDocument(item); return result ? [result.path] : [];
  })) ?? [])];
  const normalizedPath = (path: string) => path.replaceAll("\\", "/");
  const relativePath = (path: string) => {
    const normalized = normalizedPath(path);
    const root = folders.map(folder => normalizedPath(folder).replace(/\/+$/, ""))
      .sort((a, b) => b.length - a.length).find(folder => normalized.startsWith(folder + "/"));
    return root ? normalized.slice(root.length + 1) : normalized;
  };
  const resultLabel = (path: string) => {
    const relative = relativePath(path);
    // Include the root name only when separate opened folders have the same relative path.
    const sameRelative = resultPaths.some(other => other !== path && relativePath(other) === relative);
    const candidate = sameRelative ? normalizedPath(path) : relative;
    const parts = candidate.split("/");
    for (let count = 1; count < parts.length; count++) {
      const label = parts.slice(-count).join("/");
      if (!resultPaths.some(other => other !== path && (sameRelative ? normalizedPath(other) : relativePath(other)).split("/").slice(-count).join("/") === label)) return label;
    }
    return candidate;
  };
  const usage = conversation?.tokenUsage, percent = usage?.limit ? Math.min(100, Math.round(usage.used / usage.limit * 100)) : null;
  return <aside ref={panel} hidden={!open} className={`assistant-panel${overlay ? " assistant-panel--overlay" : ""}`} aria-label={i18n.t("Assistant")}
    role={overlay ? "dialog" : undefined} aria-modal={overlay ? true : undefined} data-testid="assistant-panel"
    onKeyDown={event => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        // Focus can still be on a chip before the portalled popup autofocus runs.
        if (choicesOpen) { event.stopPropagation(); setChoicesOpen(false); }
        else onClose();
      }
      if (event.key === "Tab" && overlay) {
        const controls = Array.from(panel.current!.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    {!overlay ? <PanelResize label={i18n.t("Assistant width")} onWidth={onWidth} /> : null}
    <div className="assistant-header">
      <h2><MessageSquare aria-hidden="true" />{i18n.t("Assistant")}</h2>
      <Button variant="ghost" size="icon-sm" title={i18n.t("New conversation")} aria-label={i18n.t("New conversation")} disabled={!ready || pending || active} onClick={() => { setConversation(undefined); rememberConversation(); setHistory(null); setProblem(""); setMessage(""); setReferences([]); setMention(null); if (settings) defaults(settings); input.current?.focus(); }}><Plus /></Button>
      <Button variant="ghost" size="icon-sm" title={i18n.t("Conversation history")} aria-label={i18n.t("Conversation history")} disabled={!ready || pending || active} onClick={() => void run(async isCurrent => { const next = history ? null : await request<AiConversationInfo[]>(AI_AGENT.conversationsRoute); if (isCurrent()) setHistory(next); })}><History /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Close assistant")} onClick={onClose}><X /></Button>
    </div>
    <div className="assistant-context" title={[documentPath, ...folders].filter(Boolean).join("\n")}>
      <span>{documentPath.split(/[\\/]/).at(-1) || i18n.t("No file opened")}</span><span>{i18n.t("Opened folders: {{count}}", { count: folders.length })}</span>
    </div>
    <div ref={transcript} className="assistant-transcript" aria-label={i18n.t("Conversation")}>
      {history ? <div className="assistant-history"><h3>{i18n.t("Conversation history")}</h3><p>{i18n.t(settings?.provider === "copilot" ? "Continue a Copilot conversation." : "Continue the same Codex conversation here or in the CLI.")}</p>
        {!history.length ? <p>{i18n.t("No conversations yet.")}</p> : history.map(entry => <Button key={entry.id} variant="ghost" disabled={pending} onClick={() => void run(async isCurrent => {
          const next = await request<AiConversation>(AI_AGENT.conversationsRoute, { action: "resume", id: entry.id });
          if (!isCurrent()) return;
          setConversation(next); rememberConversation(next.id); setModel(next.model); setEffort(next.reasoningEffort); setHistory(null); input.current?.focus();
        })}><strong>{entry.title}</strong><time dateTime={new Date(entry.updatedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(entry.updatedAt)}</time>
          {entry.folders.length ? <small title={entry.folders.join("\n")}>{entry.folders.map(pathName).join(" · ")}</small> : null}</Button>)}</div>
        : conversation?.turns.map(turn => <section key={turn.id} className="assistant-turn" data-status={turn.status}>
          {turn.items.filter(item => item.kind === "user").map(item => <p key={item.id} className="assistant-user" role="group" aria-label={i18n.t("Your message")}><span>{item.text}</span><ReferenceChips references={item.references ?? []} /></p>)}
          {turn.items.some(isWorkDetail) ? <details key={`${turn.id}-${turn.status}`} open={turn.status === "inProgress"} className="assistant-steps"><summary>{i18n.t(turn.status === "inProgress" ? "Working…" : "Work details")}</summary>
            {turn.items.filter(isWorkDetail).map(item => <div key={item.id} data-kind={item.kind}><small>{i18n.t(item.kind === "tool" ? "Tool" : item.kind === "reasoning" ? "Reasoning summary" : "Steps")}{item.status ? ` · ${activityStatus(item.status)}` : ""}</small><p>{item.text}</p></div>)}</details> : null}
          <div role="group" aria-label={i18n.t("Assistant response")}>
            {turn.items.filter(item => item.kind === "assistant").map(item => <AssistantAnswer key={item.id} source={item.text} />)}
          </div>
          {turn.items.map(item => {
            const result = createdDocument(item);
            if (!result) return null;
            const deleted = removed.includes(item.id);
            return <div key={item.id} className="assistant-result" tabIndex={-1} data-testid="assistant-result">
              <strong>{i18n.t(deleted ? "Created file deleted" : "Document created")}</strong>
              <Tooltip><TooltipTrigger render={<span tabIndex={0} aria-label={result.path} />}>
                {resultLabel(result.path)}
              </TooltipTrigger><TooltipContent className="break-all">{result.path}</TooltipContent></Tooltip>
              <div><Button size="sm" disabled={pending || deleted} onClick={() => void run(() => onOpen(result.path))}>{i18n.t("Open")}</Button>
              <Button size="sm" variant="destructive" disabled={pending || deleted} onClick={event => {
                const trigger = event.currentTarget;
                const card = trigger.closest<HTMLElement>(".assistant-result");
                resultFocus.current = trigger;
                void run(async isCurrent => {
                  if (await onUndo(result) && isCurrent()) { setRemoved(previous => [...previous, item.id]); resultFocus.current = card; }
                });
              }}>{i18n.t("Undo creation")}</Button></div>
              {!deleted ? <small>{i18n.t("Undo deletes the created file.")}</small> : null}
            </div>;
          })}
          {turn.status === "inProgress" ? <p role="status">{i18n.t("Working…")}</p> : turn.status === "interrupted" ? <p>{i18n.t("Stopped")}</p> : null}
          {turn.error ? <p role="alert">{turn.error}</p> : null}
          {turn.items.some(item => item.kind === "assistant" && item.text.trim()) ? <div className="assistant-turn-actions">
            <CopyButton iconOnly text={turn.items.filter(item => item.kind === "assistant").map(item => item.text).join("\n\n")} label={i18n.t("Copy answer")} />
          </div> : null}
        </section>)}
      {!history && conversation?.userInput ? <AssistantQuestion key={`${conversation.id}:${conversation.userInput.turnId}:${typeof conversation.userInput.requestId}:${conversation.userInput.requestId}`} question={conversation.userInput} disabled={pending || !ready || !settings?.enabled || !!setup}
        submit={answers => run(async isCurrent => {
          const question = conversation.userInput!;
          const next = await request<AiConversation>(AI_AGENT.conversationsRoute, { action: "answer", id: conversation.id, turnId: question.turnId, requestId: question.requestId, answers });
          if (isCurrent()) setConversation(next);
        })} /> : null}
      {!history && !conversation ? <div className="assistant-welcome"><MessageSquare /><h3>{i18n.t("Ask about your document")}</h3><p>{i18n.t("Ask about the current document and opened folders. Changes to existing documents are suggested in text.")}</p></div> : null}
      {setup ? <div className="assistant-notice" role="status"><p>{i18n.t(setup as any)}</p><Button variant="outline" disabled={settingsDisabled} onClick={onSettings}>{i18n.t("Open AI settings")}</Button></div> : null}
      {problem ? <p role="alert" className="assistant-notice">{problem}</p> : null}
    </div>
    <form className="assistant-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {percent !== null && percent >= 80 ? <p className="assistant-warning">{i18n.t("Context is nearly full. Start a new conversation soon.")}</p> : null}
      {models && !catalogModel ? <p role="status">{i18n.t("Choose a model and reasoning effort from the available list.")}</p> : null}
      <ReferenceChips references={references} remove={removeReference} />
      {mention ? <div className="assistant-reference-options" role="listbox" id="assistant-reference-options" aria-label={i18n.t(mention.skill ? "Codex skills" : "File references")}>
        {matches.map((file, index) => <Button variant="ghost" size="sm" type="button" role="option" id={`assistant-reference-${index}`} aria-selected={candidateIndex === index} key={file.path} title={file.path} onMouseDown={event => event.preventDefault()} onClick={() => chooseReference(file)}>{file.name}<small>{file.kind === "skill" ? skillCatalog?.skills.find(skill => skill.path === file.path)?.description : file.path}</small></Button>)}
        {mention.skill && !skillCatalog && !skillProblem ? <p role="status">{i18n.t("Loading skills…")}</p> : null}
        {mention.skill && (skillProblem || skillCatalog?.errors.length) ? <p role="alert">{i18n.t("Could not load some skills.")} {skillProblem || skillCatalog?.errors.map(error => `${error.path}: ${error.message}`).join("; ")}</p> : null}
        {!matches.length && (!mention.skill || skillCatalog) ? <p>{i18n.t(mention.skill ? "No matching skills." : "No matching files.")}</p> : null}
      </div> : null}
      <textarea ref={input} aria-controls={mention ? "assistant-reference-options" : undefined} aria-expanded={mention ? true : undefined} aria-activedescendant={mention && matches[candidateIndex] ? `assistant-reference-${candidateIndex}` : undefined} aria-label={i18n.t("Message assistant")} placeholder={i18n.t(active ? "Send a message to steer the current work…" : "Ask a question…")} value={message} onChange={event => {
        const value = event.target.value, end = event.target.selectionStart;
        setReferences(previous => previous.filter(file => file.kind !== "skill" || hasSkillToken(value, file.name)));
        setMessage(value); const match = /(?:^|\s)([@/])([^\s@]*)$/.exec(value.slice(0, end));
        if (match?.[1] === "/" && !skillOpen) { setSkillCatalog(undefined); setSkillProblem(""); }
        setMention(match && (match[1] !== "/" || settings?.provider === "codex") ? { start: end - match[2].length - 1, end, query: match[2], skill: match[1] === "/" } : null); setCandidateIndex(0);
      }}
        disabled={!ready || !settings?.enabled || !!setup} onKeyDown={event => {
          if (mention && !event.nativeEvent.isComposing) {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMention(null); return; }
            if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setCandidateIndex(index => matches.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0); return; }
            if (event.key === "Enter") { event.preventDefault(); if (matches[candidateIndex]) chooseReference(matches[candidateIndex]); return; }
          }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <div className="assistant-controls">
        <Button ref={choicesAnchor} type="button" variant="outline" size="sm" disabled={active || pending} aria-label={i18n.t("Conversation model and effort")} aria-expanded={choicesOpen} onClick={() => setChoicesOpen(!choicesOpen)}>{model || (settings?.provider === "copilot" ? "Copilot" : "Codex")}{settings?.provider !== "copilot" ? ` · ${i18n.t(effort as MessageKey)}` : ""}</Button>
        <Popover open={choicesOpen && open} onOpenChange={setChoicesOpen}><PopoverContent anchor={choicesAnchor} side="top" align="start" className="assistant-choices" finalFocus={choicesAnchor}>
        <label htmlFor="assistant-model">{i18n.t("Model")}</label>
        <select id="assistant-model" className="form-select" aria-label={i18n.t("Model")} value={model} disabled={active || pending || !models} onChange={event => { const value = models!.models.find(model => model.model === event.target.value)!; setModel(value.model); setEffort(value.defaultReasoningEffort); }}>
          {!catalogModel ? <option value={model}>{model}</option> : null}{models?.models.map(value => <option key={value.id} value={value.model}>{value.displayName}</option>)}
        </select>
        {settings?.provider !== "copilot" ? <><label htmlFor="assistant-effort">{i18n.t("Reasoning effort")}</label>
        <select id="assistant-effort" className="form-select" aria-label={i18n.t("Reasoning effort")} value={effort} disabled={active || pending || !catalogModel} onChange={event => setEffort(event.target.value)}>{catalogModel?.supportedReasoningEfforts.map(value => <option key={value.reasoningEffort} value={value.reasoningEffort}>{i18n.t(value.reasoningEffort as MessageKey)}</option>)}</select></> : null}
        <small>{i18n.t("These choices apply only to this conversation. Defaults are in AI settings.")}</small>
        </PopoverContent></Popover>
      </div>
      <div className="assistant-footer">
        <Tooltip><TooltipTrigger render={<span className="assistant-usage" tabIndex={0} role="img" aria-label={i18n.t("Context usage")} />}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="9" pathLength="100" strokeDasharray={`${percent ?? 0} 100`} /></svg>
        </TooltipTrigger><TooltipContent>{usage ? `${usage.used.toLocaleString()} / ${usage.limit?.toLocaleString() ?? "?"} ${i18n.t("tokens")}${percent !== null ? ` · ${percent}%` : ""}` : i18n.t("Context usage is not available yet.")}</TooltipContent></Tooltip><small>{i18n.t("Shift+Enter for a new line")}</small>
        {active ? <Button type="button" variant="outline" size="icon-sm" aria-label={i18n.t("Stop response")} disabled={pending} onClick={() => void run(async isCurrent => { const next = await request<AiConversation>(AI_AGENT.conversationsRoute, { action: "interrupt", id: conversation!.id }); if (isCurrent()) setConversation(next); })}><Square /></Button> : null}
        <Button type="submit" size="icon-sm" aria-label={i18n.t(active ? "Steer conversation" : "Send message")} disabled={pending || active && settings?.provider === "copilot" || !ready || (!message.trim() && !references.length) || !catalogModel || !settings?.enabled || !!setup}><ArrowUp /></Button>
      </div>
    </form>
  </aside>;
}
function activityStatus(value: string) {
  return value === "inProgress" ? i18n.t("In progress") : value === "completed" ? i18n.t("Completed") : value === "failed" ? i18n.t("Failed") : value === "declined" ? i18n.t("Declined") : value;
}

function createdDocument(item: import("@litzio/plugin-api/ai").AiConversationItem): { path: string; revision: string; identity?: FileIdentity } | null {
  if (item.kind !== "tool" || item.text !== "create_document" || item.toolResult?.success !== true) return null;
  for (const part of item.toolResult.contentItems) {
    if (part.type !== "inputText" || !part.text) continue;
    try { const result = JSON.parse(part.text); if (typeof result.path === "string" && typeof result.revision === "string" && /^[a-f0-9]{64}$/.test(result.revision)) return result; } catch { /* Not a creation receipt. */ }
  }
  return null;
}

function isWorkDetail(item: AiConversation["turns"][number]["items"][number]) {
  return !["user", "assistant"].includes(item.kind) && (item.kind !== "reasoning" || item.text.trim().length > 0);
}

function samePath(a: string, b: string) {
  const normalize = (value: string) => /^[a-z]:|^\\\\/i.test(value) ? value.replaceAll("\\", "/").toLowerCase() : value;
  return normalize(a) === normalize(b);
}
function ReferenceChips({ references, remove }: { references: AiFileReference[]; remove?(path: string): void }) {
  if (!references.length) return null;
  return <span className="assistant-references">{references.map(file => <span className="assistant-reference" key={file.path}>
    <Tooltip><TooltipTrigger render={<span tabIndex={0} />} >{file.kind === "skill" ? `$${file.name}` : file.name}</TooltipTrigger><TooltipContent className="break-all">{file.path}</TooltipContent></Tooltip>
    {remove ? <Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("Remove reference: {{name}}", { name: file.name })} onClick={() => remove(file.path)}><X /></Button> : null}
  </span>)}</span>;
}

function hasSkillToken(text: string, name: string) { return text.split(/\s+/).includes(`$${name}`); }
