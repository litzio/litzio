import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { createAssistantRequest } from "../assistant-api.ts";
import { ASSISTANT, type AiModels, type AiProvider, type AssistantConversation, type AssistantConversationInfo, type AssistantDiagnostics, type AssistantFileReference, type AssistantSettings, type AssistantSubmission, type AssistantSubmissionResult } from "../../shared/assistant.ts";
import { brand } from "../../../../brand.ts";
import { i18n } from "../i18n.ts";
import { providerIssue } from "./useAssistantProviderOptions.ts";

type Request = ReturnType<typeof createAssistantRequest>;
export type AssistantLocalSubmission = { provider: AssistantSettings["provider"]; conversationId?: string; receipt: AssistantSubmission; text: string; references: AssistantFileReference[] };

const conversationKey = `${brand.storagePrefix}.assistantConversation.v2`;
function lastConversation() { try { return localStorage.getItem(conversationKey) || undefined; } catch { return undefined; } }
function rememberConversation(id?: string) { try { if (id) localStorage.setItem(conversationKey, id); else localStorage.removeItem(conversationKey); } catch { /* In-page state remains usable. */ } }
export const errorText = (error: unknown) => i18n.t((error as Error).message, { defaultValue: (error as Error).message });
const newSubmissionId = () => crypto.getRandomValues(new Uint32Array(4)).join("-");

type Choices = { provider: AiProvider; permissionMode: AssistantSettings["permissionMode"]; model: string; effort: string; mode: string };
const agentMode = (catalog: AiModels | undefined) => catalog?.copilot?.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id ?? "";
/**
 * The one place that decides which provider, model, reasoning effort, mode and permission a conversation uses.
 * A new conversation takes the settings defaults. A resumed conversation keeps its own values and uses settings only
 * for a missing permission mode. Choosing another provider for a new conversation keeps the settings model and effort
 * on the settings provider, takes the first listed model elsewhere, and leaves the permission mode as chosen.
 */
const choicesFrom = {
  settings: (settings: AssistantSettings, catalog: AiModels | undefined): Choices => ({
    provider: settings.provider, permissionMode: settings.permissionMode, model: settings.model, effort: settings.reasoningEffort, mode: agentMode(catalog) }),
  conversation: (conversation: AssistantConversation, settings: AssistantSettings): Choices => ({
    provider: conversation.provider ?? "codex", permissionMode: conversation.permissionMode ?? settings.permissionMode,
    model: conversation.model, effort: conversation.reasoningEffort, mode: conversation.copilot?.currentMode ?? "" }),
  provider: (selected: AiProvider, catalog: AiModels, settings: AssistantSettings | undefined): Omit<Choices, "permissionMode"> => {
    const first = catalog.models.find(model => selected === settings?.provider && model.model === settings.model) ?? catalog.models[0];
    return { provider: selected, model: first?.model ?? "", effort: selected === settings?.provider ? settings.reasoningEffort : first?.defaultReasoningEffort ?? "", mode: agentMode(catalog) };
  },
};

/**
 * The shown conversation and the messages sent to it: setup and resume, sending, snapshot observation and receipt
 * attribution. App owns the local submission list; this hook only reads and updates it.
 * Hiding the panel keeps observation and the submission scope; leaving the conversation or provider ends the scope.
 */
export function useAssistantConversation({ request, open, settingsRevision, submissions, setSubmissions, onProviderRecheck, setProblem, folders, documentPath, catalog, onChooseProvider }: {
  request: Request; open: boolean; settingsRevision: number;
  submissions: AssistantLocalSubmission[]; setSubmissions: Dispatch<SetStateAction<AssistantLocalSubmission[]>>;
  onProviderRecheck(): void; setProblem(message: string): void; folders: string[]; documentPath: string;
  /** The model list shown in the calling render; settings defaults take its agent mode. */
  catalog(): AiModels | undefined;
  onChooseProvider(selected: AiProvider, changed: boolean): void;
}) {
  const [settings, setSettings] = useState<AssistantSettings>();
  const [conversation, setConversation] = useState<AssistantConversation>();
  const [provider, setProvider] = useState<AiProvider>("codex");
  const [permissionMode, setPermissionMode] = useState<AssistantSettings["permissionMode"]>("full-access");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [mode, setMode] = useState("");
  const [setup, setSetup] = useState("");
  const [resumeProblem, setResumeProblem] = useState<{ message: string; providerUnavailable?: boolean }>();
  const [ready, setReady] = useState(false);
  const current = useRef(conversation); current.current = conversation;
  const initializedSettings = useRef(settingsRevision);
  const submissionScope = useRef(0);
  const leaveSubmissionScope = () => { submissionScope.current++; };
  // Navigation hides other owners' rows without discarding their only local copy.
  const visibleSubmissions = submissions.filter(value => value.provider === provider &&
    (conversation ? (value.conversationId ?? value.receipt.conversationId) === conversation.id : value.conversationId === undefined));
  const submitted = useRef(visibleSubmissions); submitted.current = visibleSubmissions;
  const chooseProvider = (selected: AiProvider) => {
    onChooseProvider(selected, selected !== provider);
    setProvider(selected);
  };
  const apply = (next: Partial<Choices>) => {
    if (next.provider !== undefined) chooseProvider(next.provider);
    if (next.permissionMode !== undefined) setPermissionMode(next.permissionMode);
    if (next.model !== undefined) setModel(next.model);
    if (next.effort !== undefined) setEffort(next.effort);
    if (next.mode !== undefined) setMode(next.mode);
  };
  const applySubmission = (result: AssistantSubmissionResult, updateConversation = true) => {
    if (result.submission.status === "rejected") onProviderRecheck();
    setSubmissions(previous => {
      return previous.map(value => value.receipt.id === result.submission.id ? { ...value,
        conversationId: value.conversationId ?? result.submission.conversationId ?? result.conversation?.id,
        receipt: value.receipt.status === "accepted" ? value.receipt : result.submission } : value);
    });
    if (result.conversation && updateConversation) { setConversation(result.conversation); setPermissionMode(result.conversation.permissionMode ?? permissionMode); rememberConversation(result.conversation.id); }
  };
  const enabled = !!settings;
  const active = conversation?.turns.some(turn => turn.status === "inProgress") ?? false;
  const unresolved = visibleSubmissions.filter(value => !conversation?.turns.some(turn => turn.items.some(item => item.submissionId === value.receipt.id)));
  // Keep the same nonoverlapping observer for hidden work, then stop at rest.
  const observe = open || active || !!conversation?.userInput || unresolved.some(value => value.receipt.status === "pending");
  // Closing a setup refresh must not strand an already-admitted turn/send.
  // Failed setup is still blocked by `setup` below.
  const observationReady = ready || !open && (active || unresolved.length > 0);
  useEffect(() => {
    const refreshingSettings = initializedSettings.current !== settingsRevision;
    initializedSettings.current = settingsRevision;
    if (!open) { setReady(false); return; }
    let alive = true;
    setReady(false); setSetup(""); setResumeProblem(undefined);
    void request<AssistantSettings>(ASSISTANT.settingsRoute).then(async value => {
      if (!alive) return;
      const defaults = choicesFrom.settings(value, catalog());
      setSettings(value); if (!current.current && (!settings || refreshingSettings)) apply(defaults);
      const id = current.current?.id ?? lastConversation();
      let resumed: AssistantConversation | undefined;
      if (id) {
        try { resumed = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "resume", id }); }
        catch (error) {
          // A missing or unavailable last thread must not block a fresh conversation.
          if (alive) {
            current.current = undefined; setConversation(undefined); rememberConversation(); apply(defaults);
            setResumeProblem({ message: i18n.t("Could not reopen the previous conversation. {{reason}}", { reason: errorText(error) }) });
          }
        }
      }
      if (!alive) return;
      if (resumed) {
        if (!current.current) apply(choicesFrom.conversation(resumed, value));
        setConversation(resumed); rememberConversation(resumed.id);
      }
      setReady(true);
    }).catch(error => { if (alive) setSetup(error.message); });
    return () => { alive = false; };
  }, [open, settingsRevision]);
  useEffect(() => {
    if (!conversation) return;
    // Admission is enough; provider history remains provider-owned.
    const observed = new Set(conversation.turns.flatMap(turn => turn.items.filter(item => item.kind === "user").map(item => item.submissionId)));
    setSubmissions(previous => {
      const retained = previous.filter(value => !observed.has(value.receipt.id));
      return retained.length === previous.length ? previous : retained;
    });
  }, [conversation, setSubmissions]);
  const snapshotPending = useRef(false), receiptsPending = useRef(false);
  useEffect(() => {
    if (!observe || !observationReady || !enabled || setup) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    let startedAt = 0;
    const schedule = () => {
      const running = current.current?.turns.some(turn => turn.status === "inProgress") || submitted.current.some(value => value.receipt.status === "pending");
      const delay = running ? Math.max(0, 100 - (performance.now() - startedAt)) : 600;
      if (alive && timer === undefined) timer = setTimeout(poll, delay);
    };
    const poll = async () => {
      timer = undefined;
      if (!alive) return;
      if (snapshotPending.current) { startedAt = performance.now(); schedule(); return; }
      startedAt = performance.now();
      const scope = submissionScope.current;
      const valid = () => alive && scope === submissionScope.current;
      // Receipt lookup never blocks text or replaces a newer same-conversation snapshot.
      if (!receiptsPending.current) {
        receiptsPending.current = true;
        void (async () => {
          for (const value of submitted.current) {
            if (value.receipt.status !== "pending" || current.current?.turns.some(turn => turn.items.some(item => item.submissionId === value.receipt.id))) continue;
            try {
              const result = await request<AssistantSubmissionResult>(`${ASSISTANT.conversationsRoute}?submissionId=${encodeURIComponent(value.receipt.id)}`);
              if (valid()) applySubmission(result, !current.current);
            } catch { /* Acceptance stays uncertain; never replay the message. */ }
            if (!valid()) return;
          }
        })().finally(() => { receiptsPending.current = false; });
      }
      const id = current.current?.id;
      if (!id || !valid()) { schedule(); return; }
      snapshotPending.current = true;
      try { const next = await request<AssistantConversation>(`${ASSISTANT.conversationsRoute}?id=${encodeURIComponent(id)}`);
        if (valid()) setConversation(next);
      }
      catch (error) { if (valid()) setProblem(i18n.t((error as Error).message, { defaultValue: (error as Error).message })); }
      snapshotPending.current = false;
      schedule();
    };
    schedule();
    return () => { alive = false; clearTimeout(timer); };
  }, [observe, conversation?.id, observationReady, enabled, setup, settingsRevision]);
  const sendBody = (submissionId: string, id: string | undefined, message: string, sendProvider: AiProvider, files: AssistantFileReference[]) => ({ action: "send", submissionId, id, message,
    provider: sendProvider, permissionMode, model, reasoningEffort: effort, ...(provider === "copilot" && mode ? { mode } : {}), references: files.filter(file => file.kind !== "skill").map(file => file.path),
    skills: files.filter(file => file.kind === "skill").map(({ name, path }) => ({ name, path })), folders, document: documentPath ? { path: documentPath } : undefined });
  const markUnknown = (submissionId: string, error: unknown) => setSubmissions(previous => previous.map(item => item.receipt.id === submissionId && item.receipt.status !== "accepted"
    ? { ...item, receipt: { ...item.receipt, status: "unknown", error: (error as Error).message } } : item));
  /** Admits the message locally before the request; a lost reply is settled by its receipt, never by sending again. */
  const send = async (message: string, files: AssistantFileReference[], isCurrent: () => boolean) => {
    const submissionId = newSubmissionId();
    setSubmissions(previous => [...previous, { provider, conversationId: conversation?.id, receipt: { id: submissionId, status: "pending", conversationId: conversation?.id }, text: message, references: files }]);
    try {
      const result = await request<AssistantSubmissionResult>(ASSISTANT.conversationsRoute, sendBody(submissionId, conversation?.id, message, provider, files), AbortSignal.timeout(10_000));
      if (isCurrent()) applySubmission(result, current.current === conversation);
    } catch (error) {
      if (isCurrent()) markUnknown(submissionId, error);
    }
  };
  const retry = async (value: AssistantLocalSubmission, sendAsNew: boolean, isCurrent: () => boolean) => {
    const before = current.current;
    if (!sendAsNew && value.receipt.status === "unknown") {
      const result = await request<AssistantSubmissionResult>(`${ASSISTANT.conversationsRoute}?submissionId=${encodeURIComponent(value.receipt.id)}`, undefined, AbortSignal.timeout(10_000));
      if (!isCurrent()) return;
      if (result.submission.status !== "rejected") {
        if (result.submission.status === "unknown") result.submission.error = "Unable to confirm acceptance";
        applySubmission(result, current.current === before);
        return;
      }
    }
    const submissionId = sendAsNew ? newSubmissionId() : value.receipt.id;
    setSubmissions(previous => previous.map(item => item.receipt.id === value.receipt.id
      ? { ...value, receipt: { id: submissionId, status: "pending", conversationId: value.conversationId } } : item));
    try {
      const result = await request<AssistantSubmissionResult>(ASSISTANT.conversationsRoute, sendBody(submissionId, value.conversationId, value.text, value.provider, value.references), AbortSignal.timeout(10_000));
      if (isCurrent()) applySubmission(result, current.current === before);
    } catch (error) {
      if (isCurrent()) markUnknown(submissionId, error);
    }
  };
  const discard = (value: AssistantLocalSubmission) => {
    leaveSubmissionScope();
    setSubmissions(previous => previous.filter(item => item.receipt.id !== value.receipt.id));
  };
  /** Opens a history entry. `failed` leaves the shown conversation and reports the reason; a stale action returns nothing. */
  const resume = async (entry: AssistantConversationInfo, isCurrent: () => boolean): Promise<"resumed" | "failed" | undefined> => {
    let next: AssistantConversation;
    try { next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "resume", id: entry.id }); }
    catch (error) {
      if (!isCurrent()) return;
      const selected = entry.provider ?? "codex";
      const issue = await request<AssistantDiagnostics>(`${ASSISTANT.diagnosticsRoute}?provider=${selected}`)
        .then(providerIssue, (failure: Error) => failure.message);
      if (!isCurrent()) return;
      setResumeProblem({ message: issue || errorText(error), providerUnavailable: !!issue });
      return "failed";
    }
    if (!isCurrent()) return;
    setConversation(next); leaveSubmissionScope(); rememberConversation(next.id);
    apply(choicesFrom.conversation(next, settings!));
    return "resumed";
  };
  /** Shows a new empty conversation; the next send starts it. */
  const leaveConversation = () => { setConversation(undefined); leaveSubmissionScope(); rememberConversation(); };
  /** Settings defaults for a new conversation, with the agent mode of `catalog`. */
  const applyDefaults = (catalog: AiModels | undefined) => { if (settings) apply(choicesFrom.settings(settings, catalog)); else apply({ mode: agentMode(catalog) }); };
  const switchProvider = (selected: AiProvider, catalog: AiModels) => apply(choicesFrom.provider(selected, catalog, settings));
  /** A new conversation keeps a chosen mode and otherwise takes the provider's agent mode once its list arrives. */
  const catalogArrived = (value: AiModels) => { if (!current.current) setMode(previous => previous || agentMode(value)); };
  return { settings, ready, setup, resumeProblem, clearResumeProblem: () => setResumeProblem(undefined), conversation, setConversation, current,
    provider, permissionMode, model, effort, mode, setPermissionMode, setModel, setEffort, setMode,
    active, unresolved, visibleSubmissions, leaveSubmissionScope, leaveConversation, applyDefaults, switchProvider, catalogArrived,
    send, retry, discard, resume };
}
