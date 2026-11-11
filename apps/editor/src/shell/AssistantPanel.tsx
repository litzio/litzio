import type { ScreenAction, ScreenActionResult, ScreenActionSnapshot, ScreenInfo, ScreenSnapshot } from "../../shared/assistant-screen.ts";
import { LOCAL_HOST_ID } from "../host-locator.ts";
import { hostLabel } from "../host-client.ts";
import { createAssistantRequest } from "../assistant-api.ts";
import { useHostClient, HostContext } from "../host-context.tsx";
import { displayRequestCurrent, displayValues, type DisplayRequest, type DisplayReply, type DisplayReceipt, type DisplaySnapshot, type DisplaySettings } from "../../shared/assistant-display.ts";
import { PanelResize } from "./PanelResize.tsx";
import { AssistantQuestion } from "./AssistantQuestion.tsx";
import { AssistantUsageTooltip } from "./AssistantUsageTooltip.tsx";
import type { FileIdentity } from "../../shared/file-operations.ts";
import { useContext, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Plus, History, ExternalLink, FolderOpen, X, ArrowUp, ArrowDown, Square, Check } from "lucide-react";
import { ASSISTANT, type AssistantUserInput, type AssistantSubmissionResult, type AssistantSubmission, type AssistantSettings, type AssistantConversation, type AssistantConversationInfo, type AiModels, type AssistantFileReference, type AssistantSkills, type AssistantDiagnostics } from "../../shared/assistant.ts";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { i18n, type MessageKey } from "../i18n.ts";
import { brand } from "../../../../brand.ts";
import "./assistant.css";
import { CopyButton } from "../components/CopyButton.tsx";
import { AssistantAnswer } from "./AssistantAnswer.tsx";

function lastConversation(conversationKey: string) { try { return localStorage.getItem(conversationKey) || undefined; } catch { return undefined; } }
function rememberConversation(conversationKey: string, id?: string) { try { if (id) localStorage.setItem(conversationKey, id); else localStorage.removeItem(conversationKey); } catch { /* In-page state remains usable. */ } }
const pathName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || path;
const widthKey = `${brand.storagePrefix}.assistantWidth`;
export function assistantWidth() { try { const value = Number(localStorage.getItem(widthKey)); return value >= 340 && value <= 560 ? value : undefined; } catch { return undefined; } }
export function rememberAssistantWidth(value: number) { try { localStorage.setItem(widthKey, String(value)); } catch { /* Width remains usable for this page. */ } }

export type AssistantLocalSubmission = { hostId: string; provider: AssistantSettings["provider"]; conversationId?: string; receipt: AssistantSubmission; restores?: string[]; text: string; references: AssistantFileReference[] };
export type AssistantButtonStatus = "working" | "completed" | "attention" | undefined;

type Props = { submissions: AssistantLocalSubmission[]; setSubmissions: Dispatch<SetStateAction<AssistantLocalSubmission[]>>; onStatus: Dispatch<SetStateAction<AssistantButtonStatus>>; onNewHost?(): void; settingsRevision: number; open: boolean; overlay: boolean; width: number | undefined; onWidth(value: number): void; onClose(): void; onSettings(): void; settingsDisabled?: boolean;
  onScreen(): ScreenInfo;
  onScreenAction(action: ScreenAction): Promise<ScreenActionResult>;
  onDisplay(request: DisplayRequest, pollStartedAt: number): Promise<DisplayReply>;
  onReviewChange(hostId: string, conversation: string, change: string, path: string): void;
  onOpen(path: string): Promise<void>; onUndo(result: { path: string; revision: string; identity?: FileIdentity }): Promise<boolean>;
  referenceRequest?: { hostId: string; path: string };
  onReferenceConsumed(request: { hostId: string; path: string }): void;
  reviewWorkspacePath?:string; documentPath: string; folders: string[]; documentDirty: boolean };

/** A concrete shell surface; it does not introduce a plugin contribution API. */
export function AssistantPanel({ onReviewChange, submissions, setSubmissions, onStatus, onNewHost, settingsRevision, open, overlay, width, onWidth, onClose, onSettings, settingsDisabled, reviewWorkspacePath, documentPath, folders, documentDirty, onOpen, onUndo, referenceRequest, onReferenceConsumed, onDisplay, onScreen, onScreenAction }: Props) {
  useTranslation();
  const client = useHostClient();
  const [hostId] = useState(useContext(HostContext));
  const conversationKey = `${brand.storagePrefix}.assistantConversation:${hostId}`;
  const request = createAssistantRequest(client);
  // Match existing editor identities: getRandomValues also works on non-localhost HTTP.
  const [displayClient] = useState(() => crypto.getRandomValues(new Uint32Array(4)).join("-"));
  const actionHandler = useRef(onScreenAction); actionHandler.current = onScreenAction;
  const actionReplies = useRef(new Map<string, ScreenActionResult>());
  const screenHandler = useRef(onScreen); screenHandler.current = onScreen;
  const displayHandler = useRef(onDisplay); displayHandler.current = onDisplay;
  const displayReplies = useRef(new Map<string, DisplayReply>());
  const questionAcks = useRef(new Set<string>());
  const [displayUndoBusy, setDisplayUndoBusy] = useState(false);
  const [displayUndone, setDisplayUndone] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [settings, setSettings] = useState<AssistantSettings>();
  const [models, setModels] = useState<AiModels>();
  const [changes, setChanges] = useState<{id:string;path:string}[]>([]);
  const [conversation, setConversation] = useState<AssistantConversation>();
  const [history, setHistory] = useState<AssistantConversationInfo[] | null>(null);
  const [provider, setProvider] = useState<"codex" | "copilot">("codex");
  const [permissionMode, setPermissionMode] = useState<AssistantSettings["permissionMode"]>("full-access");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [mode, setMode] = useState("");
  const [references, setReferences] = useState<AssistantFileReference[]>([]);
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null);
  const [skillCatalog, setSkillCatalog] = useState<AssistantSkills>();
  const [skillProblem, setSkillProblem] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [setup, setSetup] = useState("");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const submissionScope = useRef(0), restoring = useRef<string[]>([]);
  const leaveSubmissionScope = () => { submissionScope.current++; restoring.current = []; };
  // Navigation hides other owners' rows without discarding their only local copy.
  const visibleSubmissions = submissions.filter(value => value.hostId === hostId && value.provider === provider &&
    (conversation ? (value.conversationId ?? value.receipt.conversationId) === conversation.id : value.conversationId === undefined));
  const submitted = useRef(visibleSubmissions); submitted.current = visibleSubmissions;
  const applySubmission = (result: AssistantSubmissionResult, updateConversation = true) => {
    setSubmissions(previous => {
      const accepted = result.submission.status === "accepted" && !result.submission.turnFailed;
      const restored = accepted ? previous.find(value => value.hostId === hostId && value.receipt.id === result.submission.id)?.restores ?? [] : [];
      return previous.filter(value => value.hostId !== hostId || !restored.includes(value.receipt.id)).map(value => value.hostId === hostId && value.receipt.id === result.submission.id ? { ...value, restores: accepted ? [] : value.restores,
        receipt: value.receipt.status === "accepted" && ["pending", "rejected"].includes(result.submission.status) || value.receipt.status === "unknown" && result.submission.status === "pending"
          ? value.receipt : { ...result.submission, ...(value.receipt.turnFailed ? { turnFailed: true } : {}), ...((result.submission.status === "unknown" || value.receipt.turnFailed) && !result.submission.error && value.receipt.error ? { error: value.receipt.error } : {}) } } : value);
    });
    if (result.conversation && updateConversation) { setConversation(result.conversation); setPermissionMode(result.conversation.permissionMode ?? permissionMode); rememberConversation(conversationKey, result.conversation.id); }
  };
  const [choicesOpen, setChoicesOpen] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null), input = useRef<HTMLTextAreaElement>(null), transcript = useRef<HTMLDivElement>(null);
  const transcriptContent = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false), [unread, setUnread] = useState(false);
  const jumpToBottom = () => {
    following.current = true; setAway(false); setUnread(false);
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  };
  const readPosition = () => {
    const element = transcript.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 2;
    following.current = atBottom; setAway(!atBottom);
    if (atBottom) setUnread(false);
  };
  const holdDisclosure = () => {
    // A reader opening details owns the viewport, including when previously following.
    following.current = false;
    requestAnimationFrame(readPosition);
  };
  useEffect(() => {
    if (!conversation?.id) { setChanges([]); return; }
    let live = true;
    const id = conversation.id;
    const read = () => { void request<{id:string;path:string}[]>(ASSISTANT.conversationsRoute, { action: "changes-list", id }).then(value => { if (live) setChanges(Array.isArray(value) ? value : []); }).catch(() => {}); };
    read(); const timer = setInterval(read, 2000);
    return () => { live = false; clearInterval(timer); };
  }, [conversation?.id, hostId]);
  const readingScope = `${conversation?.id ?? ""}:${!!history}`;
  useLayoutEffect(jumpToBottom, [readingScope]);
  // Compare visible content, not snapshot identity: unchanged polls are not new output.
  const transcriptRevision = JSON.stringify([conversation?.turns, conversation?.userInput, visibleSubmissions]);
  useLayoutEffect(() => {
    if (following.current) jumpToBottom();
    else setUnread(true);
  }, [transcriptRevision]);
  useLayoutEffect(() => {
    if (!open) return;
    // Markdown/math and viewport resizing can change height after the snapshot commit.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (following.current) jumpToBottom(); });
    });
    if (transcript.current) observer.observe(transcript.current);
    if (transcriptContent.current) observer.observe(transcriptContent.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [open]);
  const referenceCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (referenceCaret.current === null) return;
    // Apply selection with the controlled value, before another input can arrive.
    const position = referenceCaret.current; referenceCaret.current = null;
    input.current?.setSelectionRange(position, position);
  }, [message]);
  const initialFocus = useRef(false);
  const current = useRef(conversation); current.current = conversation;
  const panelOpen = useRef(open); panelOpen.current = open;
  const initializedSettings = useRef(settingsRevision), providerVersion = useRef(0);
  const enabled = !!settings;
  const active = conversation?.turns.some(turn => turn.status === "inProgress") ?? false;
  // Read acknowledgement is local presentation state; conversation/submission owners stay unchanged.
  const lastTurn = conversation?.turns.at(-1);
  const completion = lastTurn?.status === "completed" ? `${conversation!.id}:${lastTurn.id}` : undefined;
  const [seenCompletion, setSeenCompletion] = useState<string>();
  useEffect(() => { if (open) setSeenCompletion(completion); }, [open, completion]);
  const unresolved = visibleSubmissions.filter(value => !conversation?.turns.some(turn => turn.items.some(item => item.submissionId === value.receipt.id)));
  const needsAttention = !!conversation?.userInput || conversation?.turns.some(turn => turn.items.some(item => item.question?.status === "unknown")) || lastTurn?.status === "failed" || unresolved.some(value => ["rejected", "unknown"].includes(value.receipt.status));
  const working = active || unresolved.some(value => value.receipt.status === "pending");
  const buttonStatus: AssistantButtonStatus = open ? undefined : needsAttention ? "attention" : working ? "working" : completion && completion !== seenCompletion ? "completed" : undefined;
  useEffect(() => { onStatus(buttonStatus); }, [buttonStatus, onStatus]);
  useEffect(() => () => { onStatus(undefined); }, [onStatus]);
  useEffect(() => {
    if (!open || history || !conversation) return;
    for (const item of conversation.turns.flatMap(turn => turn.items)) {
      const q = item.question;
      if (!q?.requiresDisplayAck || q.displayed || q.status !== "pending") continue;
      const signature = JSON.stringify([q.turnId, typeof q.requestId, q.requestId]);
      const key = `${conversation.id}:${signature}`;
      const card = [...panel.current!.querySelectorAll<HTMLElement>("[data-question-request]")].find(el => el.getAttribute("data-question-request") === signature);
      if (!card?.getClientRects().length || questionAcks.current.has(key)) continue;
      questionAcks.current.add(key);
      void request(ASSISTANT.conversationsRoute, { action: "question-visible", id: conversation.id, turnId: q.turnId, requestId: q.requestId, displayClient })
        .catch(() => questionAcks.current.delete(key));
    }
  }, [conversation, open, history, displayClient]);
  // Keep the same nonoverlapping observer for hidden work, then stop at rest.
  const observe = open || active || !!conversation?.userInput || unresolved.some(value => ["pending", "unknown", "accepted"].includes(value.receipt.status) && !value.receipt.turnFailed);
  // Closing a setup refresh must not strand an already-admitted turn/send.
  // Failed setup is still blocked by `setup` below.
  const observationReady = ready || !open && (active || unresolved.length > 0);
  const defaults = (value: AssistantSettings) => { setProvider(value.provider); setPermissionMode(value.permissionMode); setModel(value.model); setEffort(value.reasoningEffort); setMode(models?.copilot?.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id ?? ""); };
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
    void request<AssistantSettings>(ASSISTANT.settingsRoute).then(async value => {
      if (!alive) return;
      setSettings(value); if (value.provider === "copilot") setReferences(previous => previous.filter(file => file.kind !== "skill")); if (!current.current && (!settings || refreshingSettings)) defaults(value);
      const id = current.current?.id ?? lastConversation(conversationKey);
      let resumed: AssistantConversation | undefined;
      if (id) {
        try { resumed = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "resume", id }); }
        catch {
          // A missing or unavailable last thread must not block a fresh conversation.
          if (alive) { current.current = undefined; setConversation(undefined); rememberConversation(conversationKey, ); setProblem(""); defaults(value); }
        }
      }
      if (!alive) return;
      const selectedProvider = resumed?.provider ?? current.current?.provider ?? (!settings || refreshingSettings ? value.provider : provider);
      const [catalog, diagnostics] = await Promise.all([request<AiModels>(`${ASSISTANT.modelsRoute}?provider=${selectedProvider}`), request<AssistantDiagnostics>(`${ASSISTANT.diagnosticsRoute}?provider=${selectedProvider}`)]);
      if (!alive) return;
      setModels(catalog);
      if (resumed) {
        if (!current.current) { setModel(resumed.model); setEffort(resumed.reasoningEffort); setMode(resumed.copilot?.currentMode ?? ""); setProvider(selectedProvider); setPermissionMode(resumed.permissionMode ?? value.permissionMode); }
        setConversation(resumed); rememberConversation(conversationKey, resumed.id);
      } else setMode(catalog.copilot?.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id ?? "");
      if (!diagnostics.connected) { setSetup(diagnostics.error ?? "Codex CLI is unavailable on the Host."); return; }
      if (selectedProvider === "codex" && !diagnostics.account) { setSetup("Sign in to Codex to start a conversation."); return; }
      if (alive) setReady(true);
    }).catch(error => { if (alive) setSetup(error.message); });
    return () => {
      alive = false; initialFocus.current = false;
      document.removeEventListener("focusin", cancelInitialFocus);
    };
  }, [open, settingsRevision]);
  // Hiding the panel is not a provider/scope change: a late send reply still belongs here.
  useEffect(() => () => {
    providerVersion.current++; busy.current = false; setPending(false);
    setSubmissions(previous => previous.map(value => value.hostId === hostId && value.receipt.status === "pending" ? { ...value, receipt: { ...value.receipt, status: "unknown" } } : value));
  }, [settingsRevision]);
  useLayoutEffect(() => {
    if (open && ready && enabled && !setup && initialFocus.current) {
      initialFocus.current = false;
      input.current?.focus();
    }
  }, [open, ready, enabled, setup]);
  useEffect(() => {
    if (!conversation) return;
    // A live provider event or Host-created row is not evidence of resumable history.
    const recorded = new Set(conversation.turns.filter(turn => !["failed", "inProgress"].includes(turn.status))
      .flatMap(turn => turn.items.filter(item => item.kind === "user" && item.userMessageSource === "provider-history").map(item => item.submissionId)));
    const failed = new Map(conversation.turns.filter(turn => turn.status === "failed")
      .flatMap(turn => turn.items.filter(item => item.kind === "user").map(item => [item.submissionId, turn.error] as const)));
    setSubmissions(previous => {
      const retired = new Set(previous.filter(value => value.hostId === hostId && !value.receipt.turnFailed && recorded.has(value.receipt.id)).map(value => value.receipt.id));
      const restored = new Set(previous.filter(value => value.hostId === hostId && retired.has(value.receipt.id)).flatMap(value => value.restores ?? []));
      let changed = false;
      const retained = previous.filter(value => value.hostId !== hostId || !retired.has(value.receipt.id) && !restored.has(value.receipt.id)).map(value => {
        if (value.hostId !== hostId || !failed.has(value.receipt.id)) return value;
        const error = failed.get(value.receipt.id);
        if (value.receipt.status === "unknown" && value.receipt.turnFailed && value.receipt.error === error) return value;
        changed = true;
        return { ...value, receipt: { ...value.receipt, status: "unknown" as const, turnFailed: true, error } };
      });
      return changed || retained.length !== previous.length ? retained : previous;
    });
  }, [conversation, hostId, setSubmissions]);
  const snapshotPending = useRef(false), receiptsPending = useRef(false), windowWorkPending = useRef(false);
  useEffect(() => {
    if (!observe || !observationReady || !enabled || setup) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    let startedAt = 0;
    const schedule = () => {
      const running = current.current?.turns.some(turn => turn.status === "inProgress") || submitted.current.some(value => value.receipt.status === "pending");
      const delay = running ? Math.max(0, 100 - (performance.now() - startedAt)) : 600;
      if (alive && document.visibilityState === "visible" && timer === undefined) timer = setTimeout(poll, delay);
    };
    const poll = async () => {
      timer = undefined;
      if (!alive || document.visibilityState !== "visible") return;
      if (snapshotPending.current) { startedAt = performance.now(); schedule(); return; }
      startedAt = performance.now();
      const scope = submissionScope.current;
      const valid = () => alive && scope === submissionScope.current && document.visibilityState === "visible";
      // Receipt lookup never blocks text or replaces a newer same-conversation snapshot.
      if (!receiptsPending.current) {
        receiptsPending.current = true;
        void (async () => {
          for (const value of submitted.current) {
            if (value.receipt.status === "rejected" || current.current?.turns.some(turn => turn.items.some(item => item.submissionId === value.receipt.id))) continue;
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
      const pollStartedAt = performance.now();
      try { const next = await request<AssistantConversation & DisplaySnapshot & ScreenSnapshot & ScreenActionSnapshot>(`${ASSISTANT.conversationsRoute}?id=${encodeURIComponent(id)}${panelOpen.current ? `&displayClient=${encodeURIComponent(displayClient)}` : ""}`);
        if (valid()) {
          setConversation(next);
          if (!windowWorkPending.current) {
            windowWorkPending.current = true;
            void (async () => {
              if (valid() && panelOpen.current && next.screenActionRequest && displayRequestCurrent(next.screenActionRequest, pollStartedAt)) {
                const command = next.screenActionRequest;
                let reply = actionReplies.current.get(command.id);
                if (!reply) {
                  try { reply = await actionHandler.current(command.action); }
                  catch { reply = { outcome: "uncertain", completed: [], remaining: [{ target: "request", reason: "Window action failed; query screen state before retrying." }] }; }
                  actionReplies.current.set(command.id, reply);
                }
                await request(ASSISTANT.conversationsRoute, { action: "screen-action-result", id, displayClient, requestId: command.id, reply });
              }
              if (valid() && panelOpen.current && next.screenRequest && displayRequestCurrent(next.screenRequest, pollStartedAt)) {
                await request(ASSISTANT.conversationsRoute, { action: "screen-result", id, displayClient, requestId: next.screenRequest.id, reply: screenHandler.current() });
              }
              if (valid() && panelOpen.current && next.displayRequest && displayRequestCurrent(next.displayRequest, pollStartedAt)) {
                const command = next.displayRequest;
                // An ACK can be lost; retransmit the reply, never apply the request twice.
                let reply = displayReplies.current.get(command.id);
                if (!reply) { reply = await displayHandler.current(command, pollStartedAt); displayReplies.current.set(command.id, reply); }
                await request(ASSISTANT.conversationsRoute, { action: "display-result", id, displayClient, requestId: command.id, reply });
              }
            })().catch(error => { if (valid()) setProblem(i18n.t(error.message, { defaultValue: error.message })); }).finally(() => { windowWorkPending.current = false; });
          }
        }
      }
      catch (error) { if (valid()) setProblem(i18n.t((error as Error).message, { defaultValue: (error as Error).message })); }
      snapshotPending.current = false;
      schedule();
    };
    const visibilityChanged = () => {
      if (document.visibilityState !== "visible") { clearTimeout(timer); timer = undefined; }
      else schedule();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    schedule();
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [observe, conversation?.id, observationReady, enabled, setup, settingsRevision, displayClient]);
  const resultFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!pending && resultFocus.current) {
      const target = resultFocus.current; resultFocus.current = null;
      if (target.isConnected && open) target.focus();
    }
  }, [pending, open]);
  const run = async (action: (isCurrent: () => boolean) => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    const version = providerVersion.current, isCurrent = () => version === providerVersion.current;
    setPending(true); setProblem("");
    try { await action(isCurrent); } catch (error) { if (isCurrent()) setProblem(i18n.t((error as Error).message, { defaultValue: (error as Error).message })); } finally { if (isCurrent()) { busy.current = false; setPending(false); } }
  };
  const send = () => run(async isCurrent => {
    if (!ready || active && provider === "copilot") return;
    const value = message.trim(); if (!value && !references.length) return;
    const submissionId = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const files = references.filter(file => file.kind !== "skill" || provider === "codex" && hasSkillToken(value, file.name));
    const restores = restoring.current; restoring.current = [];
    setSubmissions(previous => [...previous, { hostId, provider, restores, conversationId: conversation?.id, receipt: { id: submissionId, status: "pending", conversationId: conversation?.id }, text: value, references: files }]);
    setMessage(""); setReferences([]); setMention(null); setHistory(null); input.current?.focus();
    jumpToBottom();
    try {
      const result = await request<AssistantSubmissionResult>(ASSISTANT.conversationsRoute, { action: "send", submissionId, displayClient, id: conversation?.id, message: value,
        provider, permissionMode, model, reasoningEffort: effort, ...(provider === "copilot" && mode ? { mode } : {}), references: files.filter(file => file.kind !== "skill").map(file => file.path), skills: files.filter(file => file.kind === "skill").map(({ name, path }) => ({ name, path })), folders, reviewWorkspace: reviewWorkspacePath ? {path:reviewWorkspacePath} : undefined, document: documentPath ? { path: documentPath } : undefined }, AbortSignal.timeout(120_000));
      if (isCurrent()) applySubmission(result, current.current === conversation);
    } catch (error) {
      if (isCurrent()) setSubmissions(previous => previous.map(item => item.receipt.id === submissionId && item.receipt.status !== "accepted" ? { ...item, receipt: { ...item.receipt, status: "unknown", error: (error as Error).message } } : item));
    }
  });
  const addReference = (file: AssistantFileReference) => {
    setReferences(previous => {
      if (previous.some(value => samePath(value.path, file.path))) return previous;
      if (file.kind !== "skill" && previous.filter(value => value.kind !== "skill").length >= 10) { setProblem(i18n.t("At most 10 file references are allowed.")); return previous; }
      return [...previous, file];
    });
  };
  useEffect(() => {
    if (!referenceRequest) return;
    if (referenceRequest.hostId === hostId) {
      addReference({ path: referenceRequest.path, name: pathName(referenceRequest.path), kind: "file" });
      setHistory(null);
    }
    onReferenceConsumed(referenceRequest);
  }, [referenceRequest, hostId, onReferenceConsumed]);
  const mentionOpen = mention !== null;
  useEffect(() => {
    if (!mentionOpen || !open) return;
    let alive = true;
    setSkillCatalog(undefined); setSkillProblem("");
    void request<AssistantSkills>(`${ASSISTANT.skillsRoute}?provider=${provider}`).then(value => { if (alive) setSkillCatalog(value); }).catch(error => { if (alive) setSkillProblem(error.message); });
    return () => { alive = false; };
  }, [mentionOpen, open, provider]);
  const matches = mention ? (skillCatalog?.skills ?? []).map(skill => ({ ...skill, kind: "skill" })).filter(file => `${file.displayName ?? ""} ${file.name} ${file.description}`.toLocaleLowerCase().includes(mention.query.toLocaleLowerCase())) : [];
  useEffect(() => { if (mention) document.getElementById(`assistant-reference-${candidateIndex}`)?.scrollIntoView({ block: "nearest" }); }, [candidateIndex, mention?.query]);
  const chooseReference = (file: AssistantFileReference) => {
    addReference(file);
    if (mention) {
      const replacement = file.kind === "skill" ? `$${file.name} ` : "";
      referenceCaret.current = mention.start + replacement.length;
      setMessage(message.slice(0, mention.start) + replacement + message.slice(mention.end));
    }
    setMention(null); input.current?.focus();
  };
  const removeReference = (path: string) => {
    const skill = references.find(file => file.path === path && file.kind === "skill");
    if (skill) setMessage(value => value.split(/(\s+)/).filter(part => part !== `$${skill.name}`).join(""));
    setReferences(previous => {
      const remaining = previous.filter(file => file.path !== path && !(skill && file.kind === "skill" && file.name === skill.name));
      const text = skill ? message.split(/(\s+)/).filter(part => part !== `$${skill.name}`).join("") : message;
      if (!remaining.length && !text.trim()) restoring.current = [];
      return remaining;
    });
  };
  const copilot = conversation?.copilot ?? models?.copilot;
  const effortHelp = copilot?.reasoningEffortSource === "cli"
    ? "Copilot CLI reasoning effort is fixed for a conversation. Start a new conversation to change it."
    : "Model, reasoning effort and mode changes apply to the next message.";
  const currentEffortHelp = copilot?.reasoningEffortSource === "config" && copilot.reasoningEfforts?.length && conversation?.model === model
    ? i18n.t("Current model reasoning effort: {{value}}.", { value: i18n.t(conversation.reasoningEffort as MessageKey) }) : "";
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
  const submitAnswer = (question: AssistantUserInput, answers: import("../../shared/assistant.ts").AssistantUserInputAnswers) => run(async isCurrent => {
    const next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "answer", id: conversation!.id, turnId: question.turnId, requestId: question.requestId, answers, displayClient });
    if (isCurrent()) setConversation(next);
  });
  const submissionActions = (value: AssistantLocalSubmission, failure?: string) => {
    if (value.receipt.status === "accepted" && !value.receipt.turnFailed && !failure) return null;
    const status = failure || value.receipt.status === "accepted" ? "unknown" : value.receipt.status;
    const error = failure ?? value.receipt.error;
    return <div className="assistant-submission-status">
      <span role={status === "rejected" ? "alert" : "status"}>{i18n.t(status === "rejected" ? "Failed" : status === "pending" ? "Sending…" : "Needs confirmation")}</span>
      {error ? <span>{i18n.t(error, { defaultValue: error })}</span> : null}
      {status !== "pending" ? <Tooltip><TooltipTrigger render={<span tabIndex={0} />}>
        <Button variant="outline" size="sm" disabled={!!message || !!references.length || pending} onClick={() => {
          restoring.current = [value.receipt.id, ...(value.restores ?? [])];
          setMessage(value.text); setReferences(value.references); input.current?.focus();
        }}>{i18n.t("Restore to input")}</Button>
      </TooltipTrigger><TooltipContent>{i18n.t("Restore after clearing your current draft.")}</TooltipContent></Tooltip> : null}
      {status === "unknown" ? <Tooltip><TooltipTrigger render={<Button variant="outline" size="sm" disabled={pending} />} onClick={() => void run(async isCurrent => {
        const before = current.current;
        const result = await request<AssistantSubmissionResult>(`${ASSISTANT.conversationsRoute}?submissionId=${encodeURIComponent(value.receipt.id)}`);
        if (isCurrent()) applySubmission(result, current.current === before);
      })}>{i18n.t("Check conversation")}</TooltipTrigger><TooltipContent>{i18n.t("Check acceptance without sending this message again.")}</TooltipContent></Tooltip> : null}
      {status !== "pending" ? <Tooltip><TooltipTrigger render={<Button variant="ghost" size="sm" disabled={pending} />} onClick={() => {
        submissionScope.current++;
        setSubmissions(previous => previous.filter(item => item.hostId !== hostId || item.receipt.id !== value.receipt.id));
      }}>{i18n.t("Discard message")}</TooltipTrigger><TooltipContent>{i18n.t("Discard this local copy without cancelling or resending the message.")}</TooltipContent></Tooltip> : null}
    </div>;
  };
  return <aside ref={panel} hidden={!open} className={`assistant-panel${overlay ? " assistant-panel--overlay" : ""}`} aria-label={i18n.t("Assistant")}
    role={overlay ? "dialog" : undefined} aria-modal={overlay ? true : undefined} data-testid="assistant-panel"
    onKeyDown={event => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        // Focus can still be on a chip before the portalled popup autofocus runs.
        if (choicesOpen) { event.stopPropagation(); setChoicesOpen(null); }
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
      <Button variant="ghost" size="icon-sm" title={i18n.t("New conversation")} aria-label={i18n.t("New conversation")} disabled={pending || active || (!onNewHost && !ready)} onClick={() => { if (onNewHost) { onNewHost(); return; } void run(async isCurrent => {
        let catalog = models;
        if (settings && provider !== settings.provider) catalog = await request<AiModels>(`${ASSISTANT.modelsRoute}?provider=${settings.provider}`);
        if (!isCurrent()) return;
        setConversation(undefined); leaveSubmissionScope(); rememberConversation(conversationKey, ); setHistory(null); setProblem(""); setMessage(""); setReferences([]); setMention(null);
        setModels(catalog); if (settings) defaults(settings);
        setMode(catalog?.copilot?.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id ?? ""); input.current?.focus();
      }); }}><Plus /></Button>
      <Button variant="ghost" size="icon-sm" title={i18n.t("Conversation history")} aria-label={i18n.t("Conversation history")} disabled={!ready || pending || active} onClick={() => void run(async isCurrent => { const next = history ? null : await request<AssistantConversationInfo[]>(`${ASSISTANT.conversationsRoute}?provider=${provider}`); if (isCurrent()) setHistory(next); })}><History /></Button>
      {(["open", "reveal"] as const).map(action => <Tooltip key={action}><TooltipTrigger render={<span tabIndex={0} />}>
        <Button variant="ghost" size="icon-sm" aria-label={i18n.t(action === "open" ? "Open provider log in Notepad" : "Show provider log location")} disabled={!conversation || pending || hostId !== LOCAL_HOST_ID || !window.litzioDesktop?.providerSessionLog} onClick={() => void run(async () => {
          try {
            const result = await window.litzioDesktop!.providerSessionLog(hostId, conversation!.id, conversation!.provider ?? "codex", action);
            if (result) setProblem(i18n.t(result.reason === "missing" ? "Provider log is absent or has been removed." : result.reason === "denied" ? "Provider log access was denied." : result.reason === "launch" ? "Could not open provider log. Try showing its location." : "Provider log is absent, inaccessible or could not be verified."));
          }
          catch { setProblem(i18n.t(action === "open" ? "Could not open provider log. Try showing its location." : "Provider log is absent, inaccessible or could not be verified.")); }
        })}>{action === "open" ? <ExternalLink /> : <FolderOpen />}</Button>
      </TooltipTrigger><TooltipContent>{i18n.t(hostId !== LOCAL_HOST_ID ? "Remote provider logs cannot be opened on this PC." : !window.litzioDesktop?.providerSessionLog ? "Provider log opening requires Windows Desktop." : !conversation ? "Send a message to create a provider session first." : action === "open" ? "Open provider log in Notepad" : "Show provider log location")}</TooltipContent></Tooltip>)}
      <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Close assistant")} onClick={onClose}><X /></Button>
    </div>
    <div className="assistant-context" title={[documentPath, ...folders].filter(Boolean).join("\n")}>
      <span title={i18n.t("Files and AI run under this Host’s OS account. Start a new conversation to choose another Host.")}>{hostLabel(hostId)}</span>
      {documentPath && documentDirty ? <Tooltip><TooltipTrigger render={<span tabIndex={0} role="status" />}>
        {i18n.t("Using saved version")}
      </TooltipTrigger><TooltipContent><span><span className="break-all">{documentPath}</span><br />{i18n.t("The assistant reads the saved file. Unsaved changes are not included.")}</span></TooltipContent></Tooltip>
        : <span>{documentPath.split(/[\\/]/).at(-1) || i18n.t("No file opened")}</span>}<span>{i18n.t("Opened folders: {{count}}", { count: folders.length })}</span>
    </div>
    <div className="assistant-reading">
    <div ref={transcript} className="assistant-transcript" aria-label={i18n.t("Conversation")} onScroll={readPosition}
      onWheel={event => { if (event.deltaY < 0 && event.currentTarget.scrollTop > 0) following.current = false; }}>
    <div ref={transcriptContent}>
      {!history && conversation ? changes.map(change => <div key={change.id} className="assistant-result">
        <strong>{i18n.t("Pending changes")}</strong><span title={change.path}>{pathName(change.path)}</span>
        <Button size="sm" variant="secondary" onClick={() => onReviewChange(hostId, conversation.id, change.id, change.path)}>{i18n.t("Review")}</Button>
      </div>) : null}
      {history ? <div className="assistant-history"><h3>{i18n.t("Conversation history")}</h3><p>{i18n.t(provider === "copilot" ? "Continue a Copilot conversation." : "Continue the same Codex conversation here or in the CLI.")}</p>
        {!history.length ? <p>{i18n.t("No conversations yet.")}</p> : history.map(entry => <Button key={entry.id} variant="ghost" disabled={pending} onClick={() => void run(async isCurrent => {
          const next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "resume", id: entry.id });
          if (!isCurrent()) return;
          setConversation(next); leaveSubmissionScope(); rememberConversation(conversationKey, next.id); setProvider(next.provider ?? provider); setPermissionMode(next.permissionMode ?? settings!.permissionMode); setModel(next.model); setEffort(next.reasoningEffort); setMode(next.copilot?.currentMode ?? ""); setHistory(null); input.current?.focus();
        })}><strong>{entry.title}</strong><time dateTime={new Date(entry.updatedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(entry.updatedAt)}</time>
          {entry.folders.length ? <small title={entry.folders.join("\n")}>{entry.folders.map(pathName).join(" · ")}</small> : null}</Button>)}</div>
        : conversation?.turns.map(turn => <section key={`${conversation.id}:${turn.id}`} className="assistant-turn" data-status={turn.status}>
          {turn.items.filter(item => item.kind === "user" && !item.questionAnswer).map(item => <div key={item.id}>
            <p className="assistant-user" role="group" aria-label={i18n.t("Your message")}><span>{item.text}</span><ReferenceChips references={item.references ?? []} /></p>
            {turn.status === "failed" && visibleSubmissions.find(value => value.receipt.id === item.submissionId) ? submissionActions(visibleSubmissions.find(value => value.receipt.id === item.submissionId)!, turn.error) : null}
          </div>)}
          <div role="group" aria-label={i18n.t("Assistant response")}>
            {turn.items.filter(item => item.kind === "assistant").map(item => <AssistantAnswer key={item.id} source={item.text} streaming={turn.status === "inProgress"} onLayout={() => { if (following.current) jumpToBottom(); }} />)}
          </div>
          {turn.items.filter(item => item.question).map(item => <AssistantQuestion key={item.id} question={item.question!} disabled={pending || !ready || !enabled || !!setup} submit={answers => submitAnswer(item.question!, answers)} />)}
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
          {turn.items.map(item => {
            const receipt = displayReceipt(item); if (!receipt) return null;
            const undone = displayUndone.includes(receipt.requestId);
            return <div key={item.id} className="assistant-result" data-testid="assistant-display-result">
              <strong>{i18n.t(undone ? "Display settings restored" : "Display settings changed")}</strong>
              {receipt.changed.map(key => <span key={key}>{i18n.t(displayLabels[key])}: {displayValueLabel(receipt.before[key])} → {displayValueLabel(receipt.after[key])}</span>)}
              {receipt.error ? <small role="alert">{receipt.error}</small> : null}
              <div><Tooltip><TooltipTrigger render={<Button size="sm" variant="outline" disabled={pending || displayUndoBusy || undone || !ready || !settings || !!setup} />}
                onClick={() => {
                  setDisplayUndoBusy(true); setProblem("");
                  void request(ASSISTANT.conversationsRoute, { action: "display-undo", id: conversation!.id, displayClient, requestId: receipt.requestId })
                    .then(() => setDisplayUndone(previous => [...previous, receipt.requestId]))
                    .catch(error => setProblem(error.message)).finally(() => setDisplayUndoBusy(false));
                }}>{i18n.t("Undo display change")}</TooltipTrigger><TooltipContent>{i18n.t("Undo is available in the originating window and Host session while these values are unchanged.")}</TooltipContent></Tooltip></div>
            </div>;
          })}
          {conversation.userInput?.turnId === turn.id && !turn.items.some(item => item.question?.requestId === conversation.userInput?.requestId && item.question?.turnId === conversation.userInput?.turnId) ? <AssistantQuestion key={`${conversation.id}:${conversation.userInput.turnId}:${typeof conversation.userInput.requestId}:${conversation.userInput.requestId}`} question={conversation.userInput} disabled={pending || !ready || !enabled || !!setup}
            submit={answers => submitAnswer(conversation.userInput!, answers)} /> : null}
          <AssistantWorkDetails turn={turn} needsInput={conversation.userInput?.turnId === turn.id} onDisclosure={holdDisclosure} />
          {turn.status === "interrupted" ? <p>{i18n.t("Stopped")}</p> : null}
          {turn.error ? <p role="alert">{i18n.t(turn.error, { defaultValue: turn.error })}</p> : null}
          {turn.items.some(item => item.kind === "assistant" && item.text.trim()) ? <div className="assistant-turn-actions">
            <CopyButton iconOnly text={turn.items.filter(item => item.kind === "assistant").map(item => item.text).join("\n\n")} label={i18n.t("Copy answer")} />
          </div> : null}
        </section>)}
      {!history && visibleSubmissions.filter(value => !conversation?.turns.some(turn => turn.items.some(item => item.submissionId === value.receipt.id))).map(value =>
        <div key={value.receipt.id} className="assistant-submission">
          <p className="assistant-user" role="group" aria-label={i18n.t("Your message")}><span>{value.text}</span><ReferenceChips references={value.references} /></p>
          {submissionActions(value)}
        </div>)}
      {!history && !conversation && !visibleSubmissions.length ? <div className="assistant-welcome"><MessageSquare /><h3>{i18n.t("Ask about your document")}</h3><p>{i18n.t("Ask about the current document and opened folders. Requested edits wait for your review.")}</p></div> : null}
      {setup ? <div className="assistant-notice" role="status"><p>{i18n.t(setup as any)}</p><Button variant="outline" disabled={settingsDisabled} onClick={onSettings}>{i18n.t("Open Assistant settings")}</Button></div> : null}
      {conversation?.permissionFallback ? <Tooltip><TooltipTrigger render={<span tabIndex={0} role="status" />}>{i18n.t("Opened folders")}</TooltipTrigger><TooltipContent>{i18n.t("Full access is not allowed in this environment. Continuing with Opened folders.")}</TooltipContent></Tooltip> : null}
      {problem ? <p role="alert" className="assistant-notice">{problem}</p> : null}
    </div>
    </div>
    {!history && away ? <Button className="assistant-jump" variant="outline" size="sm" onClick={jumpToBottom}><ArrowDown />{i18n.t(unread ? "New content · Jump to bottom" : "Jump to bottom")}</Button> : null}
    </div>
    <form className="assistant-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {provider === "copilot" ? <p className="assistant-provider-note">{i18n.t("This Copilot connection does not support question cards. Reply in a message after the response ends.")}</p> : null}
      {percent !== null && percent >= 80 ? <p className="assistant-warning">{i18n.t("Context is nearly full. Start a new conversation soon.")}</p> : null}
      {models && !catalogModel ? <p role="status">{i18n.t("Choose a model and reasoning effort from the available list.")}</p> : null}
      <ReferenceChips references={references} remove={removeReference} />
      {mention ? <div className="assistant-reference-options" role="listbox" id="assistant-reference-options" aria-label={i18n.t("Codex skills")}>
        {matches.map((file, index) => <Button variant="ghost" size="sm" type="button" role="option" id={`assistant-reference-${index}`} aria-selected={candidateIndex === index} key={file.path} title={file.path} onMouseDown={event => event.preventDefault()} onClick={() => chooseReference(file)}>{file.displayName ?? file.name}<small>{file.kind === "skill" ? skillCatalog?.skills.find(skill => skill.path === file.path)?.description : file.path}</small></Button>)}
        {!skillCatalog && !skillProblem ? <p role="status">{i18n.t("Loading skills…")}</p> : null}
        {(skillProblem || skillCatalog?.errors.length) ? <p role="alert">{i18n.t("Could not load some skills.")} {skillProblem || skillCatalog?.errors.map(error => `${error.path}: ${error.message}`).join("; ")}</p> : null}
        {!matches.length && skillCatalog ? <p>{i18n.t("No matching skills.")}</p> : null}
      </div> : null}
      <textarea ref={input} aria-controls={mention ? "assistant-reference-options" : undefined} aria-expanded={mention ? true : undefined} aria-activedescendant={mention && matches[candidateIndex] ? `assistant-reference-${candidateIndex}` : undefined} aria-label={i18n.t("Message assistant")} placeholder={i18n.t(active ? "Send a message to steer the current work…" : "Ask a question…")} value={message} onChange={event => {
        const value = event.target.value, end = event.target.selectionStart;
        setReferences(previous => {
          const remaining = previous.filter(file => file.kind !== "skill" || hasSkillToken(value, file.name));
          if (!value && !remaining.length) restoring.current = [];
          return remaining;
        });
        setMessage(value); const match = /(?:^|\s)\/([^\s]*)$/.exec(value.slice(0, end));
        if (match && !mentionOpen) { setSkillCatalog(undefined); setSkillProblem(""); }
        setMention(match && provider === "codex" ? { start: end - match[1].length - 1, end, query: match[1] } : null); setCandidateIndex(0);
      }}
        disabled={!ready || !enabled || !!setup} onKeyDown={event => {
          if (mention && !event.nativeEvent.isComposing) {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMention(null); return; }
            if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setCandidateIndex(index => matches.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length : 0); return; }
            if (event.key === "Enter") { event.preventDefault(); if (matches[candidateIndex]) chooseReference(matches[candidateIndex]); return; }
          }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <div className="assistant-controls">
        <AssistantChoice label={i18n.t("Provider")} value={provider === "copilot" ? "GitHub Copilot" : "Codex"}
          help={i18n.t(conversation ? "Provider is fixed after a conversation starts. Start a new conversation to change it." : "These choices apply only to this conversation. Defaults are in Assistant settings.")}
          disabled={!!conversation || active || pending || !settings || !settings || !models && !setup} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={provider}
          options={["codex", "copilot"].map(value => ({ value, label: value === "codex" ? "Codex" : "GitHub Copilot" }))}
          onSelect={selection => {
            const selected = selection as "codex" | "copilot";
            void run(async isCurrent => {
              leaveSubmissionScope(); setReady(false);
              try {
                const [catalog, diagnostics] = await Promise.all([request<AiModels>(`${ASSISTANT.modelsRoute}?provider=${selected}`), request<AssistantDiagnostics>(`${ASSISTANT.diagnosticsRoute}?provider=${selected}`)]);
                if (!isCurrent()) return;
                setProvider(selected); setModels(catalog); setSetup(!diagnostics.connected ? diagnostics.error ?? "Codex CLI is unavailable on the Host." : selected === "codex" && !diagnostics.account ? "Sign in to Codex to start a conversation." : "");
                const first = catalog.models.find(model => selected === settings?.provider && model.model === settings.model) ?? catalog.models[0]; setModel(first?.model ?? ""); setEffort(selected === settings?.provider ? settings.reasoningEffort : first?.defaultReasoningEffort ?? "");
                setMode(catalog.copilot?.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id ?? "");
                setReferences(previous => previous.filter(file => file.kind !== "skill")); setMention(null); setHistory(null);
              } finally { if (isCurrent()) setReady(true); }
            });
          }} />

        <AssistantChoice label={i18n.t("Model")} value={catalogModel?.displayName ?? model} help={catalogModel?.description || i18n.t(effortHelp)} disabled={active || pending || !models} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={model} options={models?.models.map(value => ({ value: value.model, label: value.displayName })) ?? []}
          onSelect={selection => { const value = models!.models.find(model => model.model === selection)!; setModel(value.model); if (!conversation || provider === "codex") setEffort(value.defaultReasoningEffort); }} />

        {copilot?.reasoningEfforts?.length !== 0 && <AssistantChoice label={i18n.t("Reasoning effort")} value={i18n.t(effort as MessageKey)} help={[i18n.t(effortHelp), currentEffortHelp].filter(Boolean).join(" ")} disabled={active || pending || !catalogModel || !!conversation && copilot?.reasoningEffortSource === "cli"} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={effort} options={(copilot?.reasoningEfforts ?? catalogModel?.supportedReasoningEfforts)?.map(value => ({ value: value.reasoningEffort, label: i18n.t(value.reasoningEffort as MessageKey) })) ?? []} onSelect={setEffort} />}

        <AssistantChoice label={i18n.t("Write access")} value={i18n.t(permissionMode === "full-access" ? "Full access" : permissionMode === "read-only" ? "Read-only" : "Opened folders")}
          help={i18n.t("Full access removes the sandbox and automatically approves tools, paths and network access. Requested document edits wait for review.") + (models?.fullAccessAllowed === false ? ` ${i18n.t("Your organization does not allow Full access. Choose Opened folders or Read-only and send again.")}` : "")} disabled={active || pending || !settings} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={permissionMode} options={[
            { value: "opened-folders", label: i18n.t("Opened folders") }, { value: "read-only", label: i18n.t("Read-only") }, { value: "full-access", label: i18n.t("Full access"), disabled: models?.fullAccessAllowed === false },
          ]} onSelect={value => setPermissionMode(value as AssistantSettings["permissionMode"])} />

        {provider === "copilot" && copilot?.modes.length ? <AssistantChoice label={i18n.t("Session mode")} value={copilot.modes.find(value => value.id === mode)?.name ?? mode} help={i18n.t("Model, reasoning effort and mode changes apply to the next message.")} disabled={active || pending} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={mode} options={copilot.modes.map(value => ({ value: value.id, label: value.name }))} onSelect={setMode} /> : null}
      </div>
      <div className="assistant-footer">

        <AssistantUsageTooltip provider={provider} active={open} context={usage ? `${usage.used.toLocaleString()} / ${usage.limit?.toLocaleString() ?? "?"} ${i18n.t("tokens")}${percent !== null ? ` · ${percent}%` : ""}` : i18n.t("Context usage is not available yet.")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="9" pathLength="100" strokeDasharray={`${percent ?? 0} 100`} /></svg>
        </AssistantUsageTooltip><small>{i18n.t("Shift+Enter for a new line")}</small>
        {active ? <Button type="button" variant="outline" size="icon-sm" aria-label={i18n.t("Stop response")} disabled={pending} onClick={() => void run(async isCurrent => { const next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "interrupt", id: conversation!.id }); if (isCurrent()) setConversation(next); })}><Square /></Button> : null}
        <Button type="submit" size="icon-sm" aria-label={i18n.t(active ? "Steer conversation" : "Send message")} disabled={pending || active && provider === "copilot" || !ready || (!message.trim() && !references.length) || !catalogModel || !enabled || !!setup}><ArrowUp /></Button>
      </div>
    </form>
  </aside>;
}
function AssistantWorkDetails({ turn, needsInput, onDisclosure }: { turn: AssistantConversation["turns"][number]; needsInput: boolean; onDisclosure(): void }) {
  const active = turn.status === "inProgress";
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => { if (!active) setExpanded(false); }, [active]);
  const details = turn.items.filter(isWorkDetail);
  if (!active && !details.length) return null;
  const tool = turn.items.findLast(item => item.kind === "tool" && item.status === "inProgress");
  const latest = turn.items.findLast(item => ["assistant", "reasoning", "tool"].includes(item.kind));
  const stage = needsInput ? i18n.t("Needs your attention") : tool ? i18n.t("Running tool: {{target}}", { target: tool.text.replace(/\s+/g, " ") }) : latest?.kind === "assistant" ? i18n.t("Writing answer…") : i18n.t("Thinking…");
  return <details className="assistant-steps" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <Tooltip><TooltipTrigger render={<summary onClick={onDisclosure} />}><span role={active ? "status" : undefined}>{active ? stage : i18n.t("Work details")}</span></TooltipTrigger><TooltipContent>{i18n.t("Work details")}{active ? ` · ${stage}` : ""}</TooltipContent></Tooltip>
    {details.map(item => <div key={item.id} data-kind={item.kind}><small>{i18n.t(item.kind === "tool" ? "Tool" : item.kind === "reasoning" ? "Reasoning summary" : "Steps")}{item.status ? ` · ${activityStatus(item.status)}` : ""}</small><p>{item.text}</p></div>)}
  </details>;
}
function activityStatus(value: string) {
  return value === "inProgress" ? i18n.t("In progress") : value === "completed" ? i18n.t("Completed") : value === "failed" ? i18n.t("Failed") : value === "declined" ? i18n.t("Declined") : value;
}

function createdDocument(item: import("../../shared/assistant.ts").AssistantConversationItem): { path: string; revision: string; identity?: FileIdentity } | null {
  if (item.kind !== "tool" || item.text !== "create_document" || item.toolResult?.success !== true) return null;
  for (const part of item.toolResult.contentItems) {
    if (part.type !== "inputText" || !part.text) continue;
    try { const result = JSON.parse(part.text); if (typeof result.path === "string" && typeof result.revision === "string" && /^[a-f0-9]{64}$/.test(result.revision)) return result; } catch { /* Not a creation receipt. */ }
  }
  return null;
}

function isWorkDetail(item: AssistantConversation["turns"][number]["items"][number]) {
  return !["user", "assistant", "question"].includes(item.kind) && (item.kind !== "reasoning" || item.text.trim().length > 0);
}

function samePath(a: string, b: string) {
  const normalize = (value: string) => /^[a-z]:|^\\\\/i.test(value) ? value.replaceAll("\\", "/").toLowerCase() : value;
  return normalize(a) === normalize(b);
}

function ReferenceChips({ references, remove }: { references: AssistantFileReference[]; remove?(path: string): void }) {
  if (!references.length) return null;
  return <span className="assistant-references">{references.map(file => <span className="assistant-reference" key={file.path}>
    <Tooltip><TooltipTrigger render={<span tabIndex={0} />} >{file.kind === "skill" ? `$${file.name}` : file.name}</TooltipTrigger><TooltipContent className="break-all">{file.path}</TooltipContent></Tooltip>
    {remove ? <Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("Remove reference: {{name}}", { name: file.name })} onClick={() => remove(file.path)}><X /></Button> : null}
  </span>)}</span>;
}

function hasSkillToken(text: string, name: string) { return text.split(/\s+/).includes(`$${name}`); }

/** Direct choices reuse the existing menu and item interaction. */
function AssistantChoice({ label, value, help, disabled, visible, choiceOpen, onOpenChange, selected, options, onSelect }: {
  label: string; value: string; help: string; disabled: boolean; visible: boolean; choiceOpen: string | null; onOpenChange(open: string | null): void;
  selected: string; options: { value: string; label: string; disabled?: boolean }[]; onSelect(value: string): void;
}) {
  const open = choiceOpen === label;
  const change = (value: boolean) => onOpenChange(value ? label : null);
  useEffect(() => { if (!visible) change(false); }, [visible]);
  return <DropdownMenu open={open && visible && !disabled} onOpenChange={change}>
    <Tooltip disabled={open}><TooltipTrigger render={<DropdownMenuTrigger disabled={disabled} render={<Button type="button" variant="outline" size="sm" aria-label={i18n.t("{{name}} settings", { name: label })} />} />}>{value || label}</TooltipTrigger><TooltipContent className="assistant-choice-help pointer-events-none">{label}: {help}</TooltipContent></Tooltip>
    <DropdownMenuContent side="top" align="start" aria-label={label} className="assistant-choices">
      {options.map(option => <DropdownMenuItem disabled={option.disabled} key={option.value} aria-current={selected === option.value ? "true" : undefined} onClick={() => onSelect(option.value)}>
        <Check aria-hidden="true" style={{ visibility: selected === option.value ? "visible" : "hidden" }} />{option.label}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

const displayLabels = {
  theme: "Theme", uiLanguage: "Display language", documentWidth: "Document width", pageBackground: "Page style",
  light: "Light", dark: "Dark", standard: "Standard document width", wide: "Wide document", paper: "Paper", flat: "Flat",
} as const;
function displayReceipt(item: AssistantConversation["turns"][number]["items"][number]): DisplayReceipt | null {
  if (item.kind !== "tool" || item.text !== "change_display_settings") return null;
  for (const part of item.toolResult?.contentItems ?? []) {
    if (part.type !== "inputText" || !part.text) continue;
    try {
      const value = JSON.parse(part.text);
      displayValues(value.before, true); displayValues(value.after, true);
      if (typeof value.requestId === "string" && Array.isArray(value.changed) && value.changed.length && value.changed.every((key: keyof DisplaySettings) => Object.hasOwn(displayLabels, key) && Object.hasOwn(value.before, key))) return value;
    } catch { /* Not a display receipt. */ }
  }
  return null;
}

function displayValueLabel(value: DisplaySettings[keyof DisplaySettings]) {
  if (value === "ko") return "한국어";
  if (value === "en") return "English";
  return i18n.t(displayLabels[value]);
}
