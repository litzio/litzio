import type { HostClient } from "../host-client.ts";
import SourceCompare, { type Comparison } from "./SourceCompare.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { createAssistantRequest } from "../assistant-api.ts";
import { useHostClient } from "../host-context.tsx";
import { PanelResize } from "./PanelResize.tsx";
import { AssistantQuestion } from "./AssistantQuestion.tsx";
import { AssistantUsageTooltip } from "./AssistantUsageTooltip.tsx";
import type { FileIdentity } from "../../shared/file-operations.ts";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Plus, History, ExternalLink, FolderOpen, Ellipsis, Paperclip, TextCursorInput, X, ArrowUp, ArrowDown, Square, Check, Brain, Terminal, FilePen, Wrench, ListChecks } from "lucide-react";
import { AI_PROVIDERS, ASSISTANT, providerEngine, type AiProvider, type AssistantUserInput, type AssistantSettings, type AssistantConversation, type AssistantConversationInfo, type AiModels, type AssistantFileReference } from "../../shared/assistant.ts";
import { Button } from "@/components/ui/button.tsx";
import { PanelHeader } from "@/components/ui/panel-header.tsx";
import { EmptyState } from "@/components/ui/screen-parts.tsx";
import { Status } from "@/components/ui/status.tsx";
import { Notice } from "../ui/primitives.tsx";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { i18n, type MessageKey } from "../i18n.ts";
import { brand } from "../../../../brand.ts";
import "./assistant.css";
import { CopyButton } from "../components/CopyButton.tsx";
import { AssistantAnswer } from "./AssistantAnswer.tsx";
import { FolderDialog } from "./FolderDialog.tsx";
import { browseInsideRoots } from "./folder-requests.ts";
import { splitDocumentPath } from "./document-path.ts";
import { isScreenPath } from "../views/screen-path.ts";
import type { FolderPlace } from "../../shared/document-protocol.ts";
import { AssistantHistory, pathName, providerLabel } from "./AssistantHistory.tsx";
import { AssistantComposer, ReferenceChips, hasSkillToken, useComposerDraft } from "./AssistantComposer.tsx";
import { useTranscriptScroll } from "./useTranscriptScroll.ts";
import { errorText, useAssistantConversation, type AssistantLocalSubmission } from "./useAssistantConversation.ts";
import { useAssistantProviderOptions } from "./useAssistantProviderOptions.ts";

const widthKey = `${brand.storagePrefix}.assistantWidth`;
export function assistantWidth() { try { const value = Number(localStorage.getItem(widthKey)); return value >= 340 && value <= 560 ? value : undefined; } catch { return undefined; } }
export function rememberAssistantWidth(value: number) { try { localStorage.setItem(widthKey, String(value)); } catch { /* Width remains usable for this page. */ } }

export type { AssistantLocalSubmission };
export type AssistantButtonStatus = "working" | "completed" | "attention" | undefined;

type Props = { submissions: AssistantLocalSubmission[]; setSubmissions: Dispatch<SetStateAction<AssistantLocalSubmission[]>>; onStatus: Dispatch<SetStateAction<AssistantButtonStatus>>; settingsRevision: number; open: boolean; overlay: boolean; width: number | undefined; onWidth(value: number): void; onClose(): void; onSettings(): void; settingsDisabled?: boolean;
  providerReadRevision: number; onProviderRecheck(): void;
  onUndoChange(path: string, undo: () => Promise<unknown>): Promise<boolean>;
  onOpen(path: string, client: HostClient): Promise<void>; onUndo(result: { path: string; revision: string; identity?: FileIdentity }, client: HostClient): Promise<boolean>;
  referenceRequest?: { path: string };
  onReferenceConsumed(request: { path: string }): void;
  documentPath: string; folders: string[]; documentDirty: boolean };

/** A concrete shell surface; it does not introduce a plugin contribution API. */
export function AssistantPanel({ onUndoChange, submissions, setSubmissions, onStatus, settingsRevision, providerReadRevision, onProviderRecheck, open, overlay, width, onWidth, onClose, onSettings, settingsDisabled, documentPath, folders, documentDirty, onOpen, onUndo, referenceRequest, onReferenceConsumed }: Props) {
  useTranslation();
  const client = useHostClient();
  const request = createAssistantRequest(client);
  const changeFocus = useRef<HTMLElement | null>(null);
  const [changeComparison, setChangeComparison] = useState<{ path: string; load(signal: AbortSignal): Promise<Comparison> }>();
  const [removed, setRemoved] = useState<string[]>([]);
  const [history, setHistory] = useState<AssistantConversationInfo[] | null>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [actionPending, setPending] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const pending = actionPending || uploadingImages;
  const imageUploads = useRef(Promise.resolve());
  const pendingImageUploads = useRef(0);
  const busy = useRef(false);
  // `models`, `clearProviderProblem` and `draft` come from the hooks below; these callbacks run only after this render.
  const { settings, ready, setup, resumeProblem, clearResumeProblem, conversation, setConversation, current, provider, permissionMode, model, effort, mode,
    setPermissionMode, setModel, setEffort, setMode, active, unresolved, visibleSubmissions, leaveSubmissionScope, leaveConversation, applyDefaults, switchProvider,
    catalogArrived, send: sendMessage, retry, discard, resume } = useAssistantConversation({ request, open, settingsRevision, submissions, setSubmissions, onProviderRecheck, setProblem,
    folders, documentPath, catalog: () => models, onChooseProvider: (selected, changed) => { if (changed) clearProviderProblem(); if (providerEngine(selected) !== "codex") draft.dropSkills(); } });
  const { models, setModels, providerProblem, clearProviderProblem } = useAssistantProviderOptions({ request, open, ready, provider, providerReadRevision, setProblem, onModels: catalogArrived });
  const [choicesOpen, setChoicesOpen] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  const historyOpen = history !== null;
  const { transcript, transcriptContent, away, unread, jumpToBottom, readPosition, holdDisclosure, followLayout, releaseOnWheel } =
    useTranscriptScroll({ open, historyOpen, conversationId: conversation?.id, content: [conversation?.turns, conversation?.userInput, visibleSubmissions] });
  const draft = useComposerDraft({ request, open, provider });
  const { input, message, references } = draft;
  const initialFocus = useRef(false);
  const openedSettings = useRef(settingsRevision), providerVersion = useRef(0);
  const enabled = !!settings;
  const acp = providerEngine(provider) === "acp";
  const showStop = active && (acp || (!message.trim() && !references.length));
  const composerAction = i18n.t(showStop ? "Stop response" : active ? "Steer conversation" : "Send message");
  // Read acknowledgement is local presentation state; conversation/submission owners stay unchanged.
  const lastTurn = conversation?.turns.at(-1);
  const completion = lastTurn?.status === "completed" ? `${conversation!.id}:${lastTurn.id}` : undefined;
  const [seenCompletion, setSeenCompletion] = useState<string>();
  useEffect(() => { if (open) setSeenCompletion(completion); }, [open, completion]);
  const needsAttention = !!conversation?.userInput || conversation?.turns.some(turn => turn.items.some(item => item.question?.status === "unknown")) || lastTurn?.status === "failed" || unresolved.some(value => ["rejected", "unknown"].includes(value.receipt.status));
  const working = active || unresolved.some(value => value.receipt.status === "pending");
  const buttonStatus: AssistantButtonStatus = open ? undefined : needsAttention ? "attention" : working ? "working" : completion && completion !== seenCompletion ? "completed" : undefined;
  useEffect(() => { onStatus(buttonStatus); }, [buttonStatus, onStatus]);
  useEffect(() => () => { onStatus(undefined); }, [onStatus]);
  // Each opening or settings refresh starts a fresh setup in `useAssistantConversation`; the panel surface resets with it.
  useEffect(() => {
    const refreshingSettings = openedSettings.current !== settingsRevision;
    openedSettings.current = settingsRevision;
    if (!open) return;
    initialFocus.current = !refreshingSettings;
    // A later focus move belongs to the user or another UI, even if setup is slow.
    const cancelInitialFocus = () => { initialFocus.current = false; };
    document.addEventListener("focusin", cancelInitialFocus);
    setProblem(""); setHistory(null);
    return () => {
      initialFocus.current = false;
      document.removeEventListener("focusin", cancelInitialFocus);
    };
  }, [open, settingsRevision]);
  // Hiding the panel is not a provider/scope change: a late send reply still belongs here.
  useEffect(() => () => {
    providerVersion.current++; busy.current = false; setPending(false);
    imageUploads.current = Promise.resolve(); pendingImageUploads.current = 0; setUploadingImages(false);
    setSubmissions(previous => previous.map(value => value.receipt.status === "pending" ? { ...value, receipt: { ...value.receipt, status: "unknown" } } : value));
  }, [settingsRevision]);
  // The upload queue and its provider-change invalidation stay together with `providerVersion`.
  const pasteImages = (images: File[]) => {
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
        const file = await request<AssistantFileReference>(ASSISTANT.conversationsRoute, { action: "upload-image", mime: image.type, data });
        if (isCurrent()) {
          setImagePreviews(previous => ({ ...previous, [file.path]: `data:${image.type};base64,${data}` }));
          draft.addReference(file);
        }
      }
    }).catch(error => {
      if (isCurrent()) setProblem(i18n.t(error.message, { defaultValue: error.message }));
    }).finally(() => {
      if (isCurrent() && --pendingImageUploads.current === 0) setUploadingImages(false);
    });
  };
  useLayoutEffect(() => {
    if (open && ready && enabled && !setup && initialFocus.current) {
      initialFocus.current = false;
      input.current?.focus();
    }
  }, [open, ready, enabled, setup]);
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
    setPending(true); setProblem(""); clearResumeProblem();
    try { await action(isCurrent); } catch (error) { if (isCurrent()) setProblem(errorText(error)); } finally { if (isCurrent()) { busy.current = false; setPending(false); } }
  };
  const send = () => run(async isCurrent => {
    if (pendingImageUploads.current || !ready || !catalogModel || active && acp) return;
    const value = message.trim(); if (!value && !references.length) return;
    const files = references.filter(file => file.kind !== "skill" || provider === "codex" && hasSkillToken(value, file.name));
    draft.clear(); setHistory(null); input.current?.focus();
    jumpToBottom();
    await sendMessage(value, files, isCurrent);
  });
  // Explorer "Add to chat" and the composer file picker attach the same explicit file chip.
  const addFileReference = (path: string) => { draft.addReference({ path, name: pathName(path), kind: "file" }); setHistory(null); };
  useEffect(() => {
    if (!referenceRequest) return;
    addFileReference(referenceRequest.path);
    onReferenceConsumed(referenceRequest);
  }, [referenceRequest, onReferenceConsumed]);
  const [choosingFile, setChoosingFile] = useState(false);
  const fileButton = useRef<HTMLButtonElement>(null), filePicked = useRef(false);
  const folderKey = folders.join("\n");
  // Same range as the explorer: files inside the opened folders, never another place on the Host.
  const browseFiles = useCallback((path: string) => browseInsideRoots(folders, path, client), [folderKey, client]);
  const fileRoots = useCallback(async (): Promise<FolderPlace[]> => folders.map(path => ({ kind: "root", name: pathName(path), path })), [folderKey]);
  const fileStart = documentPath && isScreenPath(documentPath, folders) ? splitDocumentPath(documentPath).directory : folders[0] ?? "";
  const chooseFile = async (path: string) => {
    const listing = await browseFiles(splitDocumentPath(path).directory);
    const entry = listing.entries.find(value => value.path === path);
    if (!entry || entry.kind === "folder") return i18n.t("Unavailable");
    filePicked.current = true; addFileReference(entry.path);
    return "";
  };
  const copilot = conversation?.copilot ?? models?.copilot;
  const effortHelp = copilot?.reasoningEffortSource === "cli"
    ? "Copilot CLI reasoning effort is fixed for a conversation. Start a new conversation to change it."
    : "Model, reasoning effort and mode changes apply to the next message.";
  const currentEffortHelp = copilot?.reasoningEffortSource === "config" && copilot.reasoningEfforts?.length && conversation?.model === model
    ? i18n.t("Current model reasoning effort: {{value}}.", { value: i18n.t(conversation.reasoningEffort as MessageKey) }) : "";
  const catalogModel = models?.models.find(value => value.model === model);
  const efforts = provider === "ollama" ? catalogModel?.supportedReasoningEfforts : copilot?.reasoningEfforts ?? catalogModel?.supportedReasoningEfforts;
  const effectiveEffort = provider === "ollama" && catalogModel && !efforts?.some(value => value.reasoningEffort === effort) ? catalogModel.defaultReasoningEffort : effort;
  useEffect(() => { if (effort !== effectiveEffort) setEffort(effectiveEffort); }, [effort, effectiveEffort, setEffort]);
  const effortLabel = (value: string) => i18n.t((provider === "ollama" && efforts?.find(option => option.reasoningEffort === value)?.description || value) as MessageKey);
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
  // A provider failure reaches both the diagnostic and the model list; report that reason once.
  const providerNotice = setup || (resumeProblem?.providerUnavailable ? resumeProblem.message : providerProblem);
  const errorNotice = resumeProblem && !resumeProblem.providerUnavailable ? resumeProblem.message : problem;
  const notices = <>
    {providerNotice ? <Notice tone="error" className="assistant-notice"><p>{i18n.t(providerNotice, { defaultValue: providerNotice })}</p><Button variant="outline" disabled={settingsDisabled} onClick={onSettings}>{i18n.t("Open Assistant settings")}</Button></Notice> : null}
    {errorNotice && errorNotice !== providerNotice ? <Notice tone="error" className="assistant-notice">{errorNotice}</Notice> : null}
  </>;
  /** Leaves the shown conversation for a new empty one; the draft and its attachments stay. */
  const startConversation = async (isCurrent: () => boolean) => {
    let catalog = models;
    if (settings && provider !== settings.provider) catalog = await request<AiModels>(`${ASSISTANT.modelsRoute}?provider=${settings.provider}`);
    if (!isCurrent()) return false;
    leaveConversation(); draft.closeMention();
    setModels(catalog); applyDefaults(catalog);
    return true;
  };
  const historyEntry = (info: AssistantConversationInfo) => setHistory(previous => previous?.map(entry => entry.id === info.id ? info : entry) ?? null);
  const renameHistory = async (entry: AssistantConversationInfo, title: string) => {
    const info = await request<AssistantConversationInfo>(ASSISTANT.conversationsRoute, { action: "rename", id: entry.id, title });
    historyEntry(info);
    setConversation(previous => previous?.id === info.id ? { ...previous, title: info.title } : previous);
  };
  const archiveHistory = (entry: AssistantConversationInfo, archived: boolean) => run(async isCurrent => {
    const info = await request<AssistantConversationInfo>(ASSISTANT.conversationsRoute, { action: archived ? "archive" : "unarchive", id: entry.id });
    if (!isCurrent()) return;
    historyEntry(info);
    if (!archived || current.current?.id !== info.id) return;
    // Leave the archived conversation before reading the default catalog, which may fail.
    leaveConversation();
    await startConversation(isCurrent);
  });
  const resumeHistory = (entry: AssistantConversationInfo) => run(async isCurrent => {
    const result = await resume(entry, isCurrent);
    if (result === "failed") transcript.current?.scrollTo(0, 0);
    if (result !== "resumed") return;
    setHistory(null); input.current?.focus();
  });
  const usage = conversation?.tokenUsage, percent = usage?.limit ? Math.min(100, Math.round(usage.used / usage.limit * 100)) : null;
  const submitAnswer = (question: AssistantUserInput, answers: import("../../shared/assistant.ts").AssistantUserInputAnswers) => run(async isCurrent => {
    const next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "answer", id: conversation!.id, turnId: question.turnId, requestId: question.requestId, answers });
    if (isCurrent()) setConversation(next);
  });
  const retrySubmission = (value: AssistantLocalSubmission, sendAsNew = false) => run(isCurrent => retry(value, sendAsNew, isCurrent));
  const submissionActions = (value: AssistantLocalSubmission) => {
    const status = value.receipt.status;
    if (status === "accepted") return null;
    return <div className="assistant-submission-status type-helper">
      <span role={status === "rejected" ? "alert" : "status"}><Status variant="plain" tone={status === "pending" ? "progress" : status === "rejected" ? "error" : "warning"} label={i18n.t(status === "pending" ? "Sending…" : status === "rejected" ? "Failed" : "Needs confirmation")} /></span>
      {value.receipt.error ? <span>{i18n.t(value.receipt.error, { defaultValue: value.receipt.error })}</span> : null}
      {status !== "pending" ? <Button variant="outline" size="sm" disabled={pending} onClick={() => void retrySubmission(value)}>{i18n.t("Retry")}</Button> : null}
      {status === "unknown" && value.receipt.error === "Unable to confirm acceptance" ? <Tooltip><TooltipTrigger
        render={<Button variant="outline" size="sm" disabled={pending} />} onClick={() => void retrySubmission(value, true)}>{i18n.t("Send as new")}</TooltipTrigger>
        <TooltipContent>{i18n.t("Send the original message as a new request. The previous request may already have run.")}</TooltipContent>
      </Tooltip> : null}
      {status !== "pending" ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => discard(value)}>{i18n.t("Discard message")}</Button> : null}
    </div>;
  };
  return <aside ref={panel} hidden={!open} className={`assistant-panel type-body${overlay ? " assistant-panel--overlay" : ""}`} aria-label={i18n.t("Assistant")}
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
        const controls = Array.from(panel.current!.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(element => !element.matches(":disabled") && element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    {!overlay ? <PanelResize label={i18n.t("Assistant width")} onWidth={onWidth} /> : null}
    <PanelHeader title={i18n.t("Assistant")} actions={<>
      <Button variant="ghost" size="icon-sm" title={i18n.t("New conversation")} aria-label={i18n.t("New conversation")} disabled={pending || !ready} onClick={() => { void run(async isCurrent => {
        if (!await startConversation(isCurrent)) return;
        setHistory(null); input.current?.focus();
      }); }}><Plus /></Button>
      <Button variant="ghost" size="icon-sm" title={i18n.t("Conversation history")} aria-label={i18n.t("Conversation history")} disabled={!ready || pending} onClick={() => void run(async isCurrent => {
        const next = history ? null : await request<AssistantConversationInfo[]>(ASSISTANT.conversationsRoute);
        if (isCurrent()) setHistory(next);
      })}><History /></Button>
      {(() => {
        const label = i18n.t("Provider log"), unavailable = !conversation || pending || !window.litzioDesktop?.providerSessionLog;
        const openLog = (action: "open" | "reveal") => void run(async () => {
          try {
            const result = await window.litzioDesktop!.providerSessionLog(conversation!.id, conversation!.provider ?? "codex", action);
            if (result) setProblem(i18n.t(result.reason === "missing" ? "Provider log is absent or has been removed." : result.reason === "denied" ? "Provider log access was denied." : result.reason === "launch" ? "Could not open provider log. Try showing its location." : "Provider log is absent, inaccessible or could not be verified."));
          }
          catch { setProblem(i18n.t(action === "open" ? "Could not open provider log. Try showing its location." : "Provider log is absent, inaccessible or could not be verified.")); }
        });
        // Only a disabled trigger needs its wrapper as the named keyboard stop for the reason.
        return <DropdownMenu><Tooltip><TooltipTrigger render={unavailable ? <span tabIndex={0} aria-label={label} /> : <span />}>
          <DropdownMenuTrigger disabled={unavailable} render={<Button variant="ghost" size="icon-sm" aria-label={label} />}><Ellipsis /></DropdownMenuTrigger>
        </TooltipTrigger><TooltipContent>{i18n.t(!window.litzioDesktop?.providerSessionLog ? "Provider log opening requires Windows Desktop." : !conversation ? "Send a message to create a provider session first." : "Provider log")}</TooltipContent></Tooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openLog("open")}><ExternalLink aria-hidden="true" />{i18n.t("Open provider log in Notepad")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openLog("reveal")}><FolderOpen aria-hidden="true" />{i18n.t("Show provider log location")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>;
      })()}
      <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Close assistant")} onClick={onClose}><X /></Button>
    </>} />
    <div className="assistant-context type-helper" title={[documentPath, ...folders].filter(Boolean).join("\n")}>

      <span className="assistant-context-file"><span>{documentPath.split(/[\\/]/).at(-1) || i18n.t("No file opened")}</span>
        {documentPath && documentDirty ? <Tooltip><TooltipTrigger render={<span tabIndex={0} role="status" aria-label={`${i18n.t("Saved version")}: ${i18n.t("The assistant reads the saved file. Unsaved changes are not included.")}`} />}>
          <Status variant="plain" tone="warning" label={i18n.t("Saved version")} />
        </TooltipTrigger><TooltipContent><span><span className="break-all">{documentPath}</span><br />{i18n.t("The assistant reads the saved file. Unsaved changes are not included.")}</span></TooltipContent></Tooltip> : null}</span><span>{i18n.t("Opened folders: {{count}}", { count: folders.length })}</span>
    </div>
    {changeComparison ? <Dialog open onOpenChange={value => { if (!value) setChangeComparison(undefined); }}>
      <DialogContent className="recovery-prompt-comparing" finalFocus={changeFocus}><DialogHeader><DialogTitle>{i18n.t("View changes")}: {pathName(changeComparison.path)}</DialogTitle></DialogHeader>
        <SourceCompare load={changeComparison.load} assistant visual={{ client, path: changeComparison.path }} />
      </DialogContent>
    </Dialog> : null}
    <div className="assistant-reading">
    <div ref={transcript} className="assistant-transcript" aria-label={i18n.t("Conversation")} onScroll={readPosition}
      onWheel={releaseOnWheel}>
    <div ref={transcriptContent}>
      {history ? <AssistantHistory entries={history} pending={pending} notices={notices} onResume={entry => void resumeHistory(entry)}
        archiveUnavailable={entry => entry.id === conversation?.id && active ? i18n.t("Stop the Assistant response before archiving the conversation.") : undefined}
        onRename={renameHistory} onArchive={archiveHistory} />
        : conversation?.turns.map(turn => <section key={`${conversation.id}:${turn.id}`} className="assistant-turn" data-status={turn.status}>
          {turn.items.filter(item => item.kind === "user" && !item.questionAnswer).map(item => <div key={item.id}>
            <UserMessage text={item.text} references={item.references ?? []} previews={imagePreviews} reuseDisabled={!ready || !enabled || !!setup} onReuse={draft.reuse} />
          </div>)}
          <div role="group" aria-label={i18n.t("Assistant response")}>
            {turn.items.map(item => item.kind === "assistant" ? <AssistantAnswer key={item.id} source={item.text} streaming={turn.status === "inProgress"} onLayout={followLayout} /> : isWorkDetail(item) ? <AssistantWorkStep key={item.id} item={item} running={turn.status === "inProgress"} active={turn.status === "inProgress" && (item.status === "inProgress" || item.status === "pending" || !item.status && item === turn.items.at(-1))} onDisclosure={holdDisclosure} actions={item.fileChanges?.map(path => <div className="flex flex-wrap items-center gap-2" data-testid="assistant-file-change" data-path={path} key={path}>
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
              <strong className="type-item-name">{i18n.t(deleted ? "Created file deleted" : "Document created")}</strong>
              <Tooltip><TooltipTrigger render={<span className="type-body" tabIndex={0} aria-label={result.path} />}>
                {resultLabel(result.path)}
              </TooltipTrigger><TooltipContent className="break-all">{result.path}</TooltipContent></Tooltip>
              <div><Button size="sm" variant="outline" disabled={pending || deleted} onClick={() => void run(() => onOpen(result.path, client))}>{i18n.t("Open")}</Button>
              <Button size="sm" variant="destructive" disabled={pending || deleted} onClick={event => {
                const trigger = event.currentTarget;
                const card = trigger.closest<HTMLElement>(".assistant-result");
                resultFocus.current = trigger;
                void run(async isCurrent => {
                  if (await onUndo(result, client) && isCurrent()) { setRemoved(previous => [...previous, item.id]); resultFocus.current = card; }
                });
              }}>{i18n.t("Undo creation")}</Button></div>
              {!deleted ? <small className="type-helper">{i18n.t("Undo deletes the created file.")}</small> : null}
            </div>;
          })}
          {conversation.userInput?.turnId === turn.id && !turn.items.some(item => item.question?.requestId === conversation.userInput?.requestId && item.question?.turnId === conversation.userInput?.turnId) ? <AssistantQuestion key={`${conversation.id}:${conversation.userInput.turnId}:${typeof conversation.userInput.requestId}:${conversation.userInput.requestId}`} question={conversation.userInput} disabled={pending || !ready || !enabled || !!setup}
            submit={answers => submitAnswer(conversation.userInput!, answers)} /> : null}
          {turn.status === "inProgress" ? <p className="assistant-progress type-helper" role="status">{i18n.t(conversation.userInput?.turnId === turn.id ? "Needs your attention" : turn.items.at(-1)?.kind === "assistant" ? "Writing answer…" : "Thinking…")}</p> : null}
          {turn.status === "interrupted" ? <p>{i18n.t("Stopped")}</p> : null}
          {turn.error ? <p role="alert">{i18n.t(turn.error, { defaultValue: turn.error })}</p> : null}
          {turn.items.some(item => item.kind === "assistant" && item.text.trim()) ? <div className="assistant-turn-actions">
            <CopyButton iconOnly text={turn.items.filter(item => item.kind === "assistant").map(item => item.text).join("\n\n")} label={i18n.t("Copy answer")} />
          </div> : null}
        </section>)}
      {!history && visibleSubmissions.filter(value => !conversation?.turns.some(turn => turn.items.some(item => item.submissionId === value.receipt.id))).map(value =>
        <div key={value.receipt.id} className="assistant-submission">
          <UserMessage text={value.text} references={value.references} previews={imagePreviews} reuseDisabled={!ready || !enabled || !!setup} onReuse={draft.reuse} />
          {submissionActions(value)}
        </div>)}
      {!history && !conversation && !visibleSubmissions.length ? <div className="assistant-welcome"><EmptyState title={i18n.t("Ask about your document")} description={i18n.t("With edit access, documents are edited directly.")} /></div> : null}
      {!history && notices}
      {conversation?.permissionFallback ? <Tooltip><TooltipTrigger render={<span tabIndex={0} role="status" />}>{i18n.t("Opened folders")}</TooltipTrigger><TooltipContent>{i18n.t("Full access is not allowed in this environment. Continuing with Opened folders.")}</TooltipContent></Tooltip> : null}
    </div>
    </div>
    {!history && away ? <Button className="assistant-jump" variant="outline" size="sm" onClick={jumpToBottom}><ArrowDown />{i18n.t(unread ? "New content · Jump to bottom" : "Jump to bottom")}</Button> : null}
    </div>
    <form className="assistant-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {percent !== null && percent >= 80 ? <p className="assistant-warning type-helper">{i18n.t("Context is nearly full. Start a new conversation soon.")}</p> : null}
      {models && !catalogModel ? <p role="status">{i18n.t("Choose a model and reasoning effort from the available list.")}</p> : null}
      <AssistantComposer draft={draft} previews={imagePreviews} uploading={uploadingImages} disabled={!ready || !enabled || !!setup}
        placeholder={i18n.t(active ? "Send a message to steer the current work…" : "Ask a question…")} onSend={() => void send()} onPasteImages={pasteImages} />
      <div className="assistant-controls">
        <AssistantChoice label={i18n.t("Provider")} value={providerLabel(provider)}
          help={i18n.t(conversation ? "Provider is fixed after a conversation starts. Start a new conversation to change it." : "These choices apply only to this conversation. Defaults are in Assistant settings.")}
          disabled={!!conversation || active || pending || !ready} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={provider}
          options={AI_PROVIDERS.map(value => ({ value, label: providerLabel(value) }))}
          onSelect={selection => {
            const selected = selection as AiProvider;
            void run(async isCurrent => {
              const catalog = await request<AiModels>(`${ASSISTANT.modelsRoute}?provider=${selected}&cache=prefer`);
              if (!isCurrent()) return;
              leaveSubmissionScope(); switchProvider(selected, catalog); setModels(catalog);
              draft.closeMention(); setHistory(null);
            });
          }} />

        <AssistantChoice label={i18n.t("Model")} value={catalogModel?.displayName ?? model} help={catalogModel?.description || i18n.t(effortHelp)} disabled={active || pending || !models} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={model} options={models?.models.map(value => ({ value: value.model, label: value.displayName })) ?? []}
          onSelect={selection => { const value = models!.models.find(model => model.model === selection)!; setModel(value.model); if (provider === "ollama" ? !value.supportedReasoningEfforts.some(option => option.reasoningEffort === effort) : !conversation || provider === "codex") setEffort(value.defaultReasoningEffort); }} />

        {(provider === "ollama" ? !!efforts?.length : copilot?.reasoningEfforts?.length !== 0) && <AssistantChoice label={i18n.t("Reasoning effort")} value={effortLabel(effectiveEffort)} help={[i18n.t(effortHelp), currentEffortHelp].filter(Boolean).join(" ")} disabled={active || pending || !catalogModel || !!conversation && copilot?.reasoningEffortSource === "cli"} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={effectiveEffort} options={efforts?.map(value => ({ value: value.reasoningEffort, label: effortLabel(value.reasoningEffort) })) ?? []} onSelect={setEffort} />}

        <AssistantChoice label={i18n.t("Write access")} value={i18n.t(permissionMode === "full-access" ? "Full access" : permissionMode === "read-only" ? "Read-only" : "Opened folders")}
          help={i18n.t("Opened folders allows folder edits and network access; Read-only allows reads. Provider requests beyond these defaults ask for approval. Full access automatically approves provider tools and allows Host tools outside opened folders, within Host roots. Document edits apply directly; supported changes can be viewed and undone.") + (models?.fullAccessAllowed === false ? ` ${i18n.t("Your organization does not allow Full access. Choose Opened folders or Read-only and send again.")}` : "")} disabled={active || pending || !settings} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={permissionMode} options={[
            { value: "opened-folders", label: i18n.t("Opened folders") }, { value: "read-only", label: i18n.t("Read-only") }, { value: "full-access", label: i18n.t("Full access"), disabled: models?.fullAccessAllowed === false },
          ]} onSelect={value => setPermissionMode(value as AssistantSettings["permissionMode"])} />

        {acp && copilot?.modes.length ? <AssistantChoice label={i18n.t("Session mode")} value={copilot.modes.find(value => value.id === mode)?.name ?? mode} help={i18n.t("Model, reasoning effort and mode changes apply to the next message.")} disabled={active || pending} onOpenChange={setChoicesOpen} choiceOpen={choicesOpen} visible={open} selected={mode} options={copilot.modes.map(value => ({ value: value.id, label: value.name }))} onSelect={setMode} /> : null}
      </div>
      <div className="assistant-footer">
        {(() => {
          const unavailable = !folders.length, label = i18n.t("Add file");
          return <Tooltip><TooltipTrigger render={unavailable ? <span tabIndex={0} aria-label={label} /> : <span />}>
            <Button ref={fileButton} type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={unavailable} onClick={() => { filePicked.current = false; setChoosingFile(true); }}><Paperclip /></Button>
          </TooltipTrigger><TooltipContent>{i18n.t(unavailable ? "Open a folder to add its files." : "Add file")}</TooltipContent></Tooltip>;
        })()}
        <AssistantUsageTooltip copilotUsage={conversation?.copilotUsage} provider={provider} active={open} context={usage ? `${usage.used.toLocaleString()} / ${usage.limit?.toLocaleString() ?? "?"} ${i18n.t("tokens")}${percent !== null ? ` · ${percent}%` : ""}` : i18n.t("Context usage is not available yet.")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="9" pathLength="100" strokeDasharray={`${percent ?? 0} 100`} /></svg>
        </AssistantUsageTooltip>
        <Tooltip><TooltipTrigger render={<Button type={showStop ? "button" : "submit"} variant={showStop ? "outline" : "default"} size="icon-sm" aria-label={composerAction}
          disabled={pending || !showStop && (!ready || (!message.trim() && !references.length) || !catalogModel || !enabled || !!setup)} />}
          onClick={showStop ? () => void run(async isCurrent => { const next = await request<AssistantConversation>(ASSISTANT.conversationsRoute, { action: "interrupt", id: conversation!.id }); if (isCurrent()) setConversation(next); }) : undefined}>
          {showStop ? <Square /> : <ArrowUp />}
        </TooltipTrigger><TooltipContent>{showStop ? composerAction : i18n.t("{{action}} (Enter) · New line Shift+Enter", { action: composerAction })}</TooltipContent></Tooltip>
      </div>
    </form>
    <FolderDialog open={choosingFile} choose="file" selectOnly title={i18n.t("Add file")} initialPath={fileStart} recent={[]} allowedRoots={folders}
      browse={browseFiles} places={fileRoots} onOpen={chooseFile} onClose={() => setChoosingFile(false)}
      finalFocus={() => (filePicked.current ? input.current : fileButton.current) ?? true} />
  </aside>;
}
function AssistantWorkStep({ item, active, running, onDisclosure, actions }: { actions?: import("react").ReactNode; running: boolean; item: AssistantConversation["turns"][number]["items"][number]; active: boolean; onDisclosure(): void }) {
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => { if (!running) setExpanded(false); }, [running]);
  const failed = ["failed", "declined"].includes(item.status ?? "");
  const shell = item.work?.kind === "execute";
  const Icon = item.kind === "reasoning" ? Brain : shell ? Terminal : item.work?.kind === "edit" ? FilePen : item.kind === "plan" ? ListChecks : Wrench;
  const status = active ? "inProgress" : !running && ["inProgress", "pending"].includes(item.status ?? "") ? "interrupted" : item.status ?? "completed";
  const label = item.kind === "reasoning" ? i18n.t(active ? "Thinking…" : "Thinking") : shell ? "Shell" : item.kind === "plan" ? i18n.t("Steps") : i18n.t("Tool");
  return <><details className="assistant-steps type-helper" data-kind={item.kind} data-status={status} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary onClick={onDisclosure}><Icon aria-hidden="true" /><span className="type-helper" title={item.text}><span>{label}</span> {item.text.replace(/\s+/g, " ")}</span><Status variant="plain" tone={["inProgress", "pending", "running"].includes(status) ? "progress" : failed ? "error" : "neutral"} hideIndicator={!["inProgress", "pending", "running"].includes(status) && !failed} label={activityStatus(status)} /></summary>
    {item.kind === "tool" ? <pre>{shell ? "$ " : ""}{item.text}{item.work?.detail ? `\n${item.work.detail}` : ""}</pre> : <p>{item.text}</p>}
    {item.work?.truncated ? <p>{i18n.t("Output truncated.")}</p> : null}
  </details>{actions ? <div className="grid gap-2 mb-3">{actions}</div> : null}</>;
}
function activityStatus(value: string) {
  return value === "interrupted" ? i18n.t("Stopped") : ["inProgress", "pending", "running"].includes(value) ? i18n.t("In progress") : ["completed", "success"].includes(value) ? i18n.t("Completed") : value === "failed" ? i18n.t("Failed") : value === "declined" ? i18n.t("Declined") : i18n.t("Unknown status");
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

/** A sent message can be copied or reused as new composer text; it is never edited in place. */
function UserMessage({ text, references, previews, reuseDisabled, onReuse }: { text: string; references: AssistantFileReference[]; previews: Record<string, string>; reuseDisabled: boolean; onReuse(text: string): void }) {
  return <div className="assistant-user-message">
    <p className="assistant-user" role="group" aria-label={i18n.t("Your message")}><span>{text}</span><ReferenceChips previews={previews} references={references} /></p>
    {text.trim() ? <div className="assistant-user-actions">
      <CopyButton iconOnly text={text} label={i18n.t("Copy message")} />
      <Tooltip><TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={i18n.t("Reuse message")} disabled={reuseDisabled} />} onClick={() => onReuse(text)}><TextCursorInput /></TooltipTrigger>
        <TooltipContent>{i18n.t("Reuse message")}</TooltipContent></Tooltip>
    </div> : null}
  </div>;
}

/** Direct choices reuse the existing menu and item interaction. */
function AssistantChoice({ label, value, help, disabled, visible, choiceOpen, onOpenChange, selected, options, onSelect }: {
  label: string; value: string; help: string; disabled: boolean; visible: boolean; choiceOpen: string | null; onOpenChange(open: string | null): void;
  selected: string; options: { value: string; label: string; disabled?: boolean }[]; onSelect(value: string): void;
}) {
  const open = choiceOpen === label, name = i18n.t("{{name}} settings", { name: label });
  const change = (value: boolean) => onOpenChange(value ? label : null);
  useEffect(() => { if (!visible) change(false); }, [visible]);
  return <DropdownMenu open={open && visible && !disabled} onOpenChange={change}>
    {/* A locked choice keeps its reason readable: the wrapper becomes the named keyboard stop. */}
    <Tooltip disabled={open}><TooltipTrigger render={disabled ? <span tabIndex={0} aria-label={name} /> : <span />}>
      <DropdownMenuTrigger disabled={disabled} render={<Button type="button" variant="outline" size="sm" aria-label={name} />}>{value || label}</DropdownMenuTrigger>
    </TooltipTrigger><TooltipContent className="assistant-choice-help pointer-events-none">{label}: {help}</TooltipContent></Tooltip>
    <DropdownMenuContent side="top" align="start" aria-label={label} className="assistant-choices">
      {options.map(option => <DropdownMenuItem disabled={option.disabled} key={option.value} aria-current={selected === option.value ? "true" : undefined} onClick={() => onSelect(option.value)}>
        <Check aria-hidden="true" style={{ visibility: selected === option.value ? "visible" : "hidden" }} />{option.label}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
