import SourceCompare, { type Comparison } from "./SourceCompare.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
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
import { MessageSquare, Plus, History, ExternalLink, FolderOpen, X, ArrowUp, ArrowDown, Square, Check, Brain, Terminal, FilePen, Wrench, ListChecks, LoaderCircle, TriangleAlert } from "lucide-react";
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

export type AssistantLocalSubmission = { hostId: string; provider: AssistantSettings["provider"]; conversationId?: string; receipt: AssistantSubmission; text: string; references: AssistantFileReference[] };
export type AssistantButtonStatus = "working" | "completed" | "attention" | undefined;

type Props = { submissions: AssistantLocalSubmission[]; setSubmissions: Dispatch<SetStateAction<AssistantLocalSubmission[]>>; onStatus: Dispatch<SetStateAction<AssistantButtonStatus>>; onNewHost?(): void; settingsRevision: number; open: boolean; overlay: boolean; width: number | undefined; onWidth(value: number): void; onClose(): void; onSettings(): void; settingsDisabled?: boolean;
  onScreen(): ScreenInfo;
  onScreenAction(action: ScreenAction): Promise<ScreenActionResult>;
  onDisplay(request: DisplayRequest, pollStartedAt: number): Promise<DisplayReply>;
  onUndoChange(path: string, undo: () => Promise<unknown>): Promise<boolean>;
  onOpen(path: string): Promise<void>; onUndo(result: { path: string; revision: string; identity?: FileIdentity }): Promise<boolean>;
  referenceRequest?: { hostId: string; path: string };
  onReferenceConsumed(request: { hostId: string; path: string }): void;
  reviewWorkspacePath?:string; documentPath: string; folders: string[]; documentDirty: boolean };

/** A concrete shell surface; it does not introduce a plugin contribution API. */
export function AssistantPanel({ onUndoChange, submissions, setSubmissions, onStatus, onNewHost, settingsRevision, open, overlay, width, onWidth, onClose, onSettings, settingsDisabled, reviewWorkspacePath, documentPath, folders, documentDirty, onOpen, onUndo, referenceRequest, onReferenceConsumed, onDisplay, onScreen, onScreenAction }: Props) {
  useTranslation();
  const client = useHostClient();
  const [hostId] = useState(useContext(HostContext));
  const conversationKey = `${brand.storagePrefix}.assistantConversation:${hostId}`;
  const request = createAssistantRequest(client);
  const changeFocus = useRef<HTMLElement | null>(null);
  const [changeComparison, setChangeComparison] = useState<{ path: string; load(signal: AbortSignal): Promise<Comparison> }>();
  // Match existing editor identities: getRandomValues also works on non-localhost HTTP.
  const [displayClient] = useState(() => crypto.getRandomValues(new Uint32Array(4)).join("-"));
  const actionHandler = useRef(onScreenAction); actionHandler.current = onScreenAction;
  const actionReplies = useRef(new Map<string, ScreenActionResult>());
  const screenHandler = useRef(onScreen); screenHandler.current = onScreen;
  const displayHandler = useRef(onDisplay); displayHandler.current = onDisplay;
  const displayReplies = useRef(new Map<string, DisplayReply>());
  const [displayUndoBusy, setDisplayUndoBusy] = useState(false);
  const [displayUndone, setDisplayUndone] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [settings, setSettings] = useState<AssistantSettings>();
  const [models, setModels] = useState<AiModels>();
  const [conversation, setConversation] = useState<AssistantConversation>();
  const [history, setHistory] = useState<AssistantConversationInfo[] | null>(null);
  const [provider, setProvider] = useState<"codex" | "copilot">("codex");
  const [permissionMode, setPermissionMode] = useState<AssistantSettings["permissionMode"]>("full-access");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [mode, setMode] = useState("");
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<AssistantFileReference[]>([]);
  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null);
  const [skillCatalog, setSkillCatalog] = useState<AssistantSkills>();
  const [skillProblem, setSkillProblem] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [setup, setSetup] = useState("");
  const [ready, setReady] = useState(false);
  const [actionPending, setPending] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const pending = actionPending || uploadingImages;
  const imageUploads = useRef(Promise.resolve());
  const pendingImageUploads = useRef(0);
  const busy = useRef(false);
  const submissionScope = useRef(0);
  const leaveSubmissionScope = () => { submissionScope.current++; };
  // Navigation hides other owners' rows without discarding their only local copy.
  const visibleSubmissions = submissions.filter(value => value.hostId === hostId && value.provider === provider &&
    (conversation ? (value.conversationId ?? value.receipt.conversationId) === conversation.id : value.conversationId === undefined));
  const submitted = useRef(visibleSubmissions); submitted.current = visibleSubmissions;
  const applySubmission = (result: AssistantSubmissionResult, updateConversation = true) => {
    setSubmissions(previous => {
      return previous.map(value => value.hostId === hostId && value.receipt.id === result.submission.id ? { ...value,
        conversationId: value.conversationId ?? result.submission.conversationId ?? result.conversation?.id,
        receipt: value.receipt.status === "accepted" ? value.receipt : result.submission } : value);
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
  const initializedSettings = useRef(settingsRevision), providerVersion = useRef(0);
  const enabled = !!settings;
  const active = conversation?.turns.some(turn => turn.status === "inProgress") ?? false;
  const showStop = active && (provider === "copilot" || (!message.trim() && !references.length));
  const composerAction = i18n.t(showStop ? "Stop response" : active ? "Steer conversation" : "Send message");
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
  // Keep the same nonoverlapping observer for hidden work, then stop at rest.
  const observe = open || active || !!conversation?.userInput || unresolved.some(value => value.receipt.status === "pending");
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
    imageUploads.current = Promise.resolve(); pendingImageUploads.current = 0; setUploadingImages(false);
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
    // Admission is enough; provider history remains provider-owned.
    const observed = new Set(conversation.turns.flatMap(turn => turn.items.filter(item => item.kind === "user").map(item => item.submissionId)));
    setSubmissions(previous => {
      const retained = previous.filter(value => value.hostId !== hostId || !observed.has(value.receipt.id));
      return retained.length === previous.length ? previous : retained;
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
      const pollStartedAt = performance.now();
      try { const next = await request<AssistantConversation & DisplaySnapshot & ScreenSnapshot & ScreenActionSnapshot>(`${ASSISTANT.conversationsRoute}?id=${encodeURIComponent(id)}&displayClient=${encodeURIComponent(displayClient)}`);
        if (valid()) {
          setConversation(next);
          if (!windowWorkPending.current) {
            windowWorkPending.current = true;
            void (async () => {
              if (valid() && next.screenActionRequest && displayRequestCurrent(next.screenActionRequest, pollStartedAt)) {
                const command = next.screenActionRequest;
                await request(ASSISTANT.conversationsRoute, { action: "screen-action-ack", id, displayClient, requestId: command.id });
                if (!valid()) return;
                let reply = actionReplies.current.get(command.id);
                if (!reply) {
                  try { reply = await actionHandler.current(command.action); }
                  catch { reply = { outcome: "uncertain", completed: [], remaining: [{ target: "request", reason: "Window action failed; query screen state before retrying." }] }; }
                  actionReplies.current.set(command.id, reply);
                }
                if (!valid()) return;
                await request(ASSISTANT.conversationsRoute, { action: "screen-action-result", id, displayClient, requestId: command.id, reply });
              }
              if (valid() && next.screenRequest && displayRequestCurrent(next.screenRequest, pollStartedAt)) {
                await request(ASSISTANT.conversationsRoute, { action: "screen-ack", id, displayClient, requestId: next.screenRequest.id });
                if (!valid()) return;
                await request(ASSISTANT.conversationsRoute, { action: "screen-result", id, displayClient, requestId: next.screenRequest.id, reply: screenHandler.current() });
              }
              if (valid() && next.displayRequest && displayRequestCurrent(next.displayRequest, pollStartedAt)) {
                const command = next.displayRequest;
                await request(ASSISTANT.conversationsRoute, { action: "display-ack", id, displayClient, requestId: command.id });
                if (!valid()) return;
                // An ACK can be lost; retransmit the reply, never apply the request twice.
                let reply = displayReplies.current.get(command.id);
                if (!reply) { reply = await displayHandler.current(command, performance.now()); displayReplies.current.set(command.id, reply); }
                if (!valid()) return;
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
    schedule();
    return () => { alive = false; clearTimeout(timer); };
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
    if (pendingImageUploads.current || !ready || active && provider === "copilot") return;
    const value = message.trim(); if (!value && !references.length) return;
    const submissionId = crypto.getRandomValues(new Uint32Array(4)).join("-");
    const files = references.filter(file => file.kind !== "skill" || provider === "codex" && hasSkillToken(value, file.name));
    setSubmissions(previous => [...previous, { hostId, provider, conversationId: conversation?.id, receipt: { id: submissionId, status: "pending", conversationId: conversation?.id }, text: value, references: files }]);
    setMessage(""); setReferences([]); setMention(null); setHistory(null); input.current?.focus();
    jumpToBottom();
    try {
      const result = await request<AssistantSubmissionResult>(ASSISTANT.conversationsRoute, { action: "send", submissionId, displayClient, id: conversation?.id, message: value,
        provider, permissionMode, model, reasoningEffort: effort, ...(provider === "copilot" && mode ? { mode } : {}), references: files.filter(file => file.kind !== "skill").map(file => file.path), skills: files.filter(file => file.kind === "skill").map(({ name, path }) => ({ name, path })), folders, reviewWorkspace: reviewWorkspacePath ? {path:reviewWorkspacePath} : undefined, document: documentPath ? { path: documentPath } : undefined }, AbortSignal.timeout(10_000));
      if (isCurrent()) applySubmission(result, current.current === conversation);
    } catch (error) {
      if (isCurrent()) setSubmissions(previous => previous.map(item => item.receipt.id === submissionId && item.receipt.status !== "accepted" ? { ...item, receipt: { ...item.receipt, status: "unknown", error: (error as Error).message } } : item));
    }
  });
  const addReference = (file: AssistantFileReference) => {
    setReferences(previous => {
      if (previous.some(value => samePath(value.path, file.path))) return previous;
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
  const retrySubmission = (value: AssistantLocalSubmission, sendAsNew = false) => run(async isCurrent => {
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
    const submissionId = sendAsNew ? crypto.getRandomValues(new Uint32Array(4)).join("-") : value.receipt.id;
    setSubmissions(previous => previous.map(item => item.hostId === hostId && item.receipt.id === value.receipt.id
      ? { ...value, receipt: { id: submissionId, status: "pending", conversationId: value.conversationId } } : item));
    try {
      const result = await request<AssistantSubmissionResult>(ASSISTANT.conversationsRoute, { action: "send", submissionId,
        displayClient, id: value.conversationId, message: value.text, provider: value.provider, permissionMode, model, reasoningEffort: effort,
        ...(provider === "copilot" && mode ? { mode } : {}), references: value.references.filter(file => file.kind !== "skill").map(file => file.path),
        skills: value.references.filter(file => file.kind === "skill").map(({ name, path }) => ({ name, path })), folders,
        document: documentPath ? { path: documentPath } : undefined }, AbortSignal.timeout(10_000));
      if (isCurrent()) applySubmission(result, current.current === before);
    } catch (error) {
      if (isCurrent()) setSubmissions(previous => previous.map(item => item.hostId === hostId && item.receipt.id === submissionId && item.receipt.status !== "accepted"
        ? { ...item, receipt: { ...item.receipt, status: "unknown", error: (error as Error).message } } : item));
    }
  });
  const submissionActions = (value: AssistantLocalSubmission) => {
    const status = value.receipt.status;
    if (status === "accepted") return null;
    return <div className="assistant-submission-status">
      <span role={status === "rejected" ? "alert" : "status"}>{i18n.t(status === "pending" ? "Sending…" : status === "rejected" ? "Failed" : "Needs confirmation")}</span>
      {value.receipt.error ? <span>{i18n.t(value.receipt.error, { defaultValue: value.receipt.error })}</span> : null}
      {status !== "pending" ? <Button variant="outline" size="sm" disabled={pending} onClick={() => void retrySubmission(value)}>{i18n.t("Retry")}</Button> : null}
      {status === "unknown" && value.receipt.error === "Unable to confirm acceptance" ? <Tooltip><TooltipTrigger
        render={<Button variant="outline" size="sm" disabled={pending} />} onClick={() => void retrySubmission(value, true)}>{i18n.t("Send as new")}</TooltipTrigger>
        <TooltipContent>{i18n.t("Send the original message as a new request. The previous request may already have run.")}</TooltipContent>
      </Tooltip> : null}
      {status !== "pending" ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
        submissionScope.current++;
        setSubmissions(previous => previous.filter(item => item.hostId !== hostId || item.receipt.id !== value.receipt.id));
      }}>{i18n.t("Discard message")}</Button> : null}
    </div>;
  };
  return <aside ref={panel} hidden={!open} className={`assistant-panel${overlay ? " assistant-panel--overlay" : ""}`} aria-label={i18n.t("Assistant")}
    role={overlay ? "dialog" : undefined} aria-modal={overlay ? true : undefined} data-testid="assistant-panel"
    onKeyDown={event => {
      if (event.defaultPrevented) return;
      // Dialog owns these keys, including document-level Escape before its queued initial focus.
      if (changeComparison) return;
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
      <Button variant="ghost" size="icon-sm" title={i18n.t("New conversation")} aria-label={i18n.t("New conversation")} disabled={pending || (!onNewHost && !ready)} onClick={() => { if (onNewHost) { onNewHost(); return; } void run(async isCurrent => {
        let catalog = models;
        if (settings && provider !== settings.provider) catalog = await request<AiModels>(`${ASSISTANT.modelsRoute}?provider=${settings.provider}`);
        if (!isCurrent()) return;
        setConversation(undefined); leaveSubmissionScope(); rememberConversation(conversationKey, ); setHistory(null); setProblem(""); setMessage(""); setReferences([]); setMention(null);
        setModels(catalog); if (settings) defaults(settings);
        setMode(catalog?.copilot?.modes.find(mode => /(?:^|#)agent$/.test(mode.id))?.id ?? ""); input.current?.focus();
      }); }}><Plus /></Button>
      <Button variant="ghost" size="icon-sm" title={i18n.t("Conversation history")} aria-label={i18n.t("Conversation history")} disabled={!ready || pending} onClick={() => void run(async isCurrent => { const next = history ? null : await request<AssistantConversationInfo[]>(`${ASSISTANT.conversationsRoute}?provider=${provider}`); if (isCurrent()) setHistory(next); })}><History /></Button>
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
    {changeComparison ? <Dialog open onOpenChange={value => { if (!value) setChangeComparison(undefined); }}>
      <DialogContent className="recovery-prompt-comparing" finalFocus={changeFocus}><DialogHeader><DialogTitle>{i18n.t("View changes")}: {pathName(changeComparison.path)}</DialogTitle></DialogHeader>
        <SourceCompare load={changeComparison.load} assistant visual={{ client, path: changeComparison.path }} />
      </DialogContent>
    </Dialog> : null}
    <div className="assistant-reading">
    <div ref={transcript} className="assistant-transcript" aria-label={i18n.t("Conversation")} onScroll={readPosition}
      onWheel={event => { if (event.deltaY < 0 && event.currentTarget.scrollTop > 0) following.current = false; }}>
    <div ref={transcriptContent}>
      {history ? <div className="assistant-history"><h3>{i18n.t("Conversation history")}</h3><p>{i18n.t(provider === "copilot" ? "Continue a Copilot conversation." : "Continue the same Codex conversation here or in the CLI.")}</p>
        {!history.length ? <p>{i18n.t("No conversations yet.")}</p> : history.map(entry => <Button key={entry.id} variant="ghost" disabled={pending} onClick={() => void run(async isCurrent => {
          const next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "resume", id: entry.id });
          if (!isCurrent()) return;
          setConversation(next); leaveSubmissionScope(); rememberConversation(conversationKey, next.id); setProvider(next.provider ?? provider); setPermissionMode(next.permissionMode ?? settings!.permissionMode); setModel(next.model); setEffort(next.reasoningEffort); setMode(next.copilot?.currentMode ?? ""); setHistory(null); input.current?.focus();
        })}><strong>{entry.title}</strong><time dateTime={new Date(entry.updatedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(entry.updatedAt)}</time>
          {entry.folders.length ? <small title={entry.folders.join("\n")}>{entry.folders.map(pathName).join(" · ")}</small> : null}</Button>)}</div>
        : conversation?.turns.map(turn => <section key={`${conversation.id}:${turn.id}`} className="assistant-turn" data-status={turn.status}>
          {turn.items.filter(item => item.kind === "user" && !item.questionAnswer).map(item => <div key={item.id}>
            <p className="assistant-user" role="group" aria-label={i18n.t("Your message")}><span>{item.text}</span><ReferenceChips previews={imagePreviews} previewScope={hostId} references={item.references ?? []} /></p>
          </div>)}
          <div role="group" aria-label={i18n.t("Assistant response")}>
            {turn.items.map(item => item.kind === "assistant" ? <AssistantAnswer key={item.id} source={item.text} streaming={turn.status === "inProgress"} onLayout={() => { if (following.current) jumpToBottom(); }} /> : isWorkDetail(item) ? <AssistantWorkStep key={item.id} item={item} running={turn.status === "inProgress"} active={turn.status === "inProgress" && (item.status === "inProgress" || item.status === "pending" || !item.status && item === turn.items.at(-1))} onDisclosure={holdDisclosure} actions={item.fileChanges?.map(path => <div className="flex flex-wrap items-center gap-2" data-testid="assistant-file-change" data-path={path} key={path}>
              <span className="min-w-0 break-all flex-1" title={path}>{pathName(path)}</span>
              <Tooltip><TooltipTrigger render={<Button size="sm" variant="outline" disabled={pending || turn.status === "inProgress"} />} onClick={event => {
                changeFocus.current = event.currentTarget;
                const body = { action: "file-change-compare", id: conversation.id, turnId: turn.id, path, folders };
                setChangeComparison({ path, load: signal => request<Comparison>(ASSISTANT.conversationsRoute, body, signal) });
              }}>{i18n.t("View changes")}</TooltipTrigger><TooltipContent>{i18n.t("Compare the content before this turn with the current disk file.")}</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger render={<Button size="sm" variant="outline" disabled={pending || turn.status === "inProgress"} />} onClick={() => void run(async () => {
                await onUndoChange(path, () => request(ASSISTANT.conversationsRoute, { action: "file-change-undo", id: conversation.id, turnId: turn.id, path, folders }));
              })}>{i18n.t("Undo change")}</TooltipTrigger><TooltipContent>{i18n.t("Restore the content before this turn only if the file has not changed since the assistant edit.")}</TooltipContent></Tooltip>
            </div>)} /> : null)}
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
          {turn.status === "inProgress" ? <p className="assistant-progress" role="status">{i18n.t(conversation.userInput?.turnId === turn.id ? "Needs your attention" : turn.items.at(-1)?.kind === "assistant" ? "Writing answer…" : "Thinking…")}</p> : null}
          {turn.status === "interrupted" ? <p>{i18n.t("Stopped")}</p> : null}
          {turn.error ? <p role="alert">{i18n.t(turn.error, { defaultValue: turn.error })}</p> : null}
          {turn.items.some(item => item.kind === "assistant" && item.text.trim()) ? <div className="assistant-turn-actions">
            <CopyButton iconOnly text={turn.items.filter(item => item.kind === "assistant").map(item => item.text).join("\n\n")} label={i18n.t("Copy answer")} />
          </div> : null}
        </section>)}
      {!history && visibleSubmissions.filter(value => !conversation?.turns.some(turn => turn.items.some(item => item.submissionId === value.receipt.id))).map(value =>
        <div key={value.receipt.id} className="assistant-submission">
          <p className="assistant-user" role="group" aria-label={i18n.t("Your message")}><span>{value.text}</span><ReferenceChips previews={imagePreviews} previewScope={hostId} references={value.references} /></p>
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
      {percent !== null && percent >= 80 ? <p className="assistant-warning">{i18n.t("Context is nearly full. Start a new conversation soon.")}</p> : null}
      {models && !catalogModel ? <p role="status">{i18n.t("Choose a model and reasoning effort from the available list.")}</p> : null}
      <ReferenceChips composer uploading={uploadingImages} previews={imagePreviews} previewScope={hostId} references={references} remove={removeReference} />
      {mention ? <div className="assistant-reference-options" role="listbox" id="assistant-reference-options" aria-label={i18n.t("Codex skills")}>
        {matches.map((file, index) => <Button variant="ghost" size="sm" type="button" role="option" id={`assistant-reference-${index}`} aria-selected={candidateIndex === index} key={file.path} title={file.path} onMouseDown={event => event.preventDefault()} onClick={() => chooseReference(file)}>{file.displayName ?? file.name}<small>{file.kind === "skill" ? skillCatalog?.skills.find(skill => skill.path === file.path)?.description : file.path}</small></Button>)}
        {!skillCatalog && !skillProblem ? <p role="status">{i18n.t("Loading skills…")}</p> : null}
        {(skillProblem || skillCatalog?.errors.length) ? <p role="alert">{i18n.t("Could not load some skills.")} {skillProblem || skillCatalog?.errors.map(error => `${error.path}: ${error.message}`).join("; ")}</p> : null}
        {!matches.length && skillCatalog ? <p>{i18n.t("No matching skills.")}</p> : null}
      </div> : null}
      <textarea onPaste={event => {
        const images = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => !!file);
        if (!images.length) return;
        event.preventDefault();
        const version = providerVersion.current, isCurrent = () => version === providerVersion.current;
        pendingImageUploads.current++;
        setUploadingImages(true); setProblem("");
        // Chain paste batches separately from other actions; never discard an accepted paste.
        imageUploads.current = imageUploads.current.then(async () => {
          for (const image of images) {
            if (!isCurrent()) return;
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(",")[1]);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(image);
            });
            const file = await request<AssistantFileReference>(ASSISTANT.conversationsRoute, { action: "upload-image", id: conversation?.id, mime: image.type, data });
            if (isCurrent()) {
              setImagePreviews(previous => ({ ...previous, [`${hostId}:${file.path}`]: `data:${image.type};base64,${data}` }));
              addReference(file);
            }
          }
        }).catch(error => {
          if (isCurrent()) setProblem(i18n.t(error.message, { defaultValue: error.message }));
        }).finally(() => {
          if (isCurrent() && --pendingImageUploads.current === 0) setUploadingImages(false);
        });
      }} ref={input} aria-controls={mention ? "assistant-reference-options" : undefined} aria-expanded={mention ? true : undefined} aria-activedescendant={mention && matches[candidateIndex] ? `assistant-reference-${candidateIndex}` : undefined} aria-label={i18n.t("Message assistant")} placeholder={i18n.t(active ? "Send a message to steer the current work…" : "Ask a question…")} value={message} onChange={event => {
        const value = event.target.value, end = event.target.selectionStart;
        setReferences(previous => {
          const remaining = previous.filter(file => file.kind !== "skill" || hasSkillToken(value, file.name));
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
          help={i18n.t("Opened folders allows folder edits and network access; Read-only allows reads. Provider requests beyond these defaults ask for approval. Full access automatically approves provider tools and allows Host tools outside opened folders, within Host roots. Document edits wait for review.") + (models?.fullAccessAllowed === false ? ` ${i18n.t("Your organization does not allow Full access. Choose Opened folders or Read-only and send again.")}` : "")} disabled={active || pending || !settings} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={permissionMode} options={[
            { value: "opened-folders", label: i18n.t("Opened folders") }, { value: "read-only", label: i18n.t("Read-only") }, { value: "full-access", label: i18n.t("Full access"), disabled: models?.fullAccessAllowed === false },
          ]} onSelect={value => setPermissionMode(value as AssistantSettings["permissionMode"])} />

        {provider === "copilot" && copilot?.modes.length ? <AssistantChoice label={i18n.t("Session mode")} value={copilot.modes.find(value => value.id === mode)?.name ?? mode} help={i18n.t("Model, reasoning effort and mode changes apply to the next message.")} disabled={active || pending} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={mode} options={copilot.modes.map(value => ({ value: value.id, label: value.name }))} onSelect={setMode} /> : null}
      </div>
      <div className="assistant-footer">

        <AssistantUsageTooltip copilotUsage={conversation?.copilotUsage} provider={provider} active={open} context={usage ? `${usage.used.toLocaleString()} / ${usage.limit?.toLocaleString() ?? "?"} ${i18n.t("tokens")}${percent !== null ? ` · ${percent}%` : ""}` : i18n.t("Context usage is not available yet.")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="9" pathLength="100" strokeDasharray={`${percent ?? 0} 100`} /></svg>
        </AssistantUsageTooltip><small>{i18n.t("Shift+Enter for a new line")}</small>
        <Tooltip><TooltipTrigger render={<Button type={showStop ? "button" : "submit"} variant={showStop ? "outline" : "default"} size="icon-sm" aria-label={composerAction}
          disabled={pending || !showStop && (!ready || (!message.trim() && !references.length) || !catalogModel || !enabled || !!setup)} />}
          onClick={showStop ? () => void run(async isCurrent => { const next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "interrupt", id: conversation!.id }); if (isCurrent()) setConversation(next); }) : undefined}>
          {showStop ? <Square /> : <ArrowUp />}
        </TooltipTrigger><TooltipContent>{composerAction}</TooltipContent></Tooltip>
      </div>
    </form>
  </aside>;
}
function AssistantWorkStep({ item, active, running, onDisclosure, actions }: { actions?: import("react").ReactNode; running: boolean; item: AssistantConversation["turns"][number]["items"][number]; active: boolean; onDisclosure(): void }) {
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => { if (!running) setExpanded(false); }, [running]);
  const failed = ["failed", "declined"].includes(item.status ?? "");
  const shell = item.work?.kind === "execute";
  const Icon = active ? LoaderCircle : failed ? TriangleAlert : item.kind === "reasoning" ? Brain : shell ? Terminal : item.work?.kind === "edit" ? FilePen : item.kind === "plan" ? ListChecks : Wrench;
  const status = active ? "inProgress" : !running && ["inProgress", "pending"].includes(item.status ?? "") ? "interrupted" : item.status ?? "completed";
  const label = item.kind === "reasoning" ? i18n.t(active ? "Thinking…" : "Thinking") : shell ? "Shell" : item.kind === "plan" ? i18n.t("Steps") : i18n.t("Tool");
  return <><details className="assistant-steps" data-kind={item.kind} data-status={status} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary onClick={onDisclosure}><Icon aria-hidden="true" className={active ? "animate-spin" : undefined} /><span title={item.text}><strong>{label}</strong> {item.text.replace(/\s+/g, " ")}</span><small>{activityStatus(status)}</small></summary>
    {item.kind === "tool" ? <pre>{shell ? "$ " : ""}{item.text}{item.work?.detail ? `\n${item.work.detail}` : ""}</pre> : <p>{item.text}</p>}
    {item.work?.truncated ? <p>{i18n.t("Output truncated.")}</p> : null}
  </details>{actions ? <div className="grid gap-2 mb-3">{actions}</div> : null}</>;
}
function activityStatus(value: string) {
  return value === "interrupted" ? i18n.t("Stopped") : value === "inProgress" ? i18n.t("In progress") : value === "completed" ? i18n.t("Completed") : value === "failed" ? i18n.t("Failed") : value === "declined" ? i18n.t("Declined") : value;
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

function ReferenceChips({ references, remove, previews, previewScope, composer = false, uploading = false }: { references: AssistantFileReference[]; remove?(path: string): void; previews: Record<string, string>; previewScope: string; composer?: boolean; uploading?: boolean }) {
  let imageNumber = 0;
  const files = references.map(file => {
    const number = file.pastedImage ? ++imageNumber : 0;
    return { file, number, name: number ? i18n.t("Image {{number}}", { number }) : file.kind === "skill" ? `$${file.name}` : file.name,
      preview: file.pastedImage ? previews[`${previewScope}:${file.path}`] : undefined };
  });
  const thumbnails = composer ? files.filter(({ preview }) => preview) : [];
  const chips = composer ? files.filter(({ preview }) => !preview) : files;
  return <>
    {chips.length ? <span className="assistant-references">{chips.map(({ file, name, preview }) => <span className="assistant-reference" key={file.path}>
      <Tooltip><TooltipTrigger render={<span tabIndex={0} />} >{preview ? <img className="assistant-reference-preview" src={preview} alt="" /> : null}{name}{file.unavailable ? ` · ${i18n.t("Unavailable")}` : ""}</TooltipTrigger><TooltipContent className="break-all">{file.path}</TooltipContent></Tooltip>
      {remove ? <Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("Remove reference: {{name}}", { name: file.pastedImage ? name : file.name })} onClick={() => remove(file.path)}><X /></Button> : null}
    </span>)}</span> : null}
    {thumbnails.length || uploading ? <div className="assistant-image-previews">
      {thumbnails.map(({ file, name, number, preview }) => <Tooltip key={file.path}>
        <TooltipTrigger render={<span className="assistant-image-preview" tabIndex={0} />}>
          <img src={preview} alt={name} />
          <Button type="button" variant="outline" size="icon-sm" aria-label={i18n.t("Remove image {{number}}", { number })} onClick={() => remove?.(file.path)}><X /></Button>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>)}
      {uploading ? <span className="assistant-image-upload" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><span aria-hidden="true">{i18n.t("In progress")}</span><span className="sr-only">{i18n.t("Uploading images…")}</span></span> : null}
    </div> : null}
  </>;
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
