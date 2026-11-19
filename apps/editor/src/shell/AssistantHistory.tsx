import { useEffect, useRef, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, Ellipsis, Pencil } from "lucide-react";
import { ASSISTANT, type AiProvider, type AssistantConversationInfo } from "../../shared/assistant.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ContextMenu, type ContextMenuAction } from "@/components/ui/context-menu.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { i18n } from "../i18n.ts";

export const pathName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) || path;
export const providerLabel = (provider: AiProvider | undefined) => provider === "copilot" ? "GitHub Copilot" : "Codex";

/** The history list the Assistant panel shows instead of the transcript; the panel owns the Host requests. */
export function AssistantHistory({ entries, pending, notices, archiveUnavailable, onResume, onRename, onArchive }: {
  entries: AssistantConversationInfo[]; pending: boolean; notices: ReactNode;
  /** Why the row cannot be archived now; the Host makes the same check. */
  archiveUnavailable(entry: AssistantConversationInfo): string | undefined;
  onResume(entry: AssistantConversationInfo): void;
  /** Rejects with the Host reason so the rename form can keep the entered name. */
  onRename(entry: AssistantConversationInfo, title: string): Promise<void>;
  onArchive(entry: AssistantConversationInfo, archived: boolean): Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [renaming, setRenaming] = useState<AssistantConversationInfo>();
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const searchInput = useRef<HTMLInputElement>(null);
  const renameReturn = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<{ moved: string; next?: string }>(undefined);
  const query = search.trim().toLocaleLowerCase();
  const listed = entries.filter(entry => !!entry.archivedAt === archived);
  const matches = listed.filter(entry => !query || entry.title.toLocaleLowerCase().includes(query) ||
    entry.folders.some(folder => pathName(folder).toLocaleLowerCase().includes(query)));
  useEffect(() => {
    const focus = pendingFocus.current;
    if (!focus || pending) return;
    pendingFocus.current = undefined;
    // A failed request keeps the row; otherwise its menu trigger is gone, so keep keyboard users in the list.
    if (matches.some(entry => entry.id === focus.moved)) return;
    (focus.next ? rows.current.get(focus.next) : undefined)?.focus() ?? searchInput.current?.focus();
  });
  const empty = query && listed.length ? "No matching conversations" : archived ? "No archived conversations" : "No conversations yet.";
  return <div className="assistant-history">
    <div className="assistant-history-header">
      <h3 className="type-item-name">{i18n.t("Conversation history")}</h3>
      <Button type="button" variant="ghost" size="sm" className="top-bar-toggle" aria-pressed={archived} disabled={pending} onClick={() => setArchived(value => !value)}>
        <Archive aria-hidden="true" />{i18n.t("Archived")}</Button>
    </div>
    <Input ref={searchInput} aria-label={i18n.t("Search conversation history")} className="assistant-history-search" placeholder={i18n.t("Title or folder name")} value={search} disabled={pending} onChange={event => setSearch(event.target.value)} />
    {notices}
    {!matches.length ? <p>{i18n.t(empty)}</p> : matches.map((entry, index) => {
      const unavailable = archiveUnavailable(entry);
      const move = () => {
        pendingFocus.current = { moved: entry.id, next: (matches[index + 1] ?? matches[index - 1])?.id };
        void onArchive(entry, !archived);
      };
      const actions: ContextMenuAction[] = [
        { id: "rename", label: i18n.t("Rename…"), icon: <Pencil aria-hidden="true" />, run: () => { renameReturn.current = rows.current.get(entry.id) ?? null; setRenaming(entry); } },
        archived ? { id: "unarchive", label: i18n.t("Unarchive"), icon: <ArchiveRestore aria-hidden="true" />, run: move }
          : { id: "archive", label: i18n.t("Archive"), icon: <Archive aria-hidden="true" />, disabled: !!unavailable, disabledReason: unavailable, run: move },
      ];
      return <ContextMenu key={entry.id} actions={actions} disabled={pending} trigger={<div className="assistant-history-row">
        <Button ref={row => { if (row) rows.current.set(entry.id, row); else rows.current.delete(entry.id); }} className="assistant-history-open" variant="ghost" disabled={pending} onClick={() => onResume(entry)}>
          <strong className="type-item-name">{entry.title}</strong>
          <span className="type-helper"><time dateTime={new Date(entry.updatedAt).toISOString()}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(entry.updatedAt)}</time>{" · "}{providerLabel(entry.provider)}</span>
          {entry.folders.length ? <small className="type-helper" title={entry.folders.join("\n")}>{entry.folders.map(pathName).join(" · ")}</small> : null}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger disabled={pending} render={<Button className="assistant-history-menu" variant="ghost" size="icon-xs" aria-label={i18n.t("More actions for {{name}}", { name: entry.title })} />}><Ellipsis /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map(action => {
              const item = <DropdownMenuItem key={action.id} aria-disabled={action.disabled || undefined}
                disabled={action.disabled && !action.disabledReason} closeOnClick={!action.disabled}
                className={action.disabledReason ? "opacity-50" : undefined}
                onClick={() => { if (!action.disabled) action.run(); }}>{action.icon}{action.label}</DropdownMenuItem>;
              return action.disabledReason ? <Tooltip key={action.id}><TooltipTrigger render={item} /><TooltipContent>{action.disabledReason}</TooltipContent></Tooltip> : item;
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>} />;
    })}
    {renaming ? <RenameConversation entry={renaming} returnFocus={renameReturn} onRename={title => onRename(renaming, title)} onClose={() => setRenaming(undefined)} /> : null}
  </div>;
}

/** Follows the Explorer file rename form; the Host trims and checks the same limit. */
function RenameConversation({ entry, returnFocus, onRename, onClose }: {
  entry: AssistantConversationInfo; returnFocus: { current: HTMLElement | null }; onRename(title: string): Promise<void>; onClose(): void;
}) {
  const [name, setName] = useState(entry.title);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (pending || !name.trim()) return;
    setPending(true); setError("");
    try { await onRename(name); onClose(); }
    catch (cause) { setError(i18n.t((cause as Error).message, { defaultValue: (cause as Error).message })); }
    finally { setPending(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={false} initialFocus={input} finalFocus={() => returnFocus.current ?? true} aria-busy={pending || undefined}>
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <DialogHeader><DialogTitle>{i18n.t("Rename conversation")}</DialogTitle></DialogHeader>
        <label className="form-field"><span>{i18n.t("Conversation name")}</span>
          <Input ref={input} aria-invalid={!!error} aria-describedby={error ? "conversation-rename-error" : undefined}
            value={name} maxLength={ASSISTANT.conversationTitleLimit} onFocus={event => event.currentTarget.select()} disabled={pending}
            onChange={event => { setName(event.target.value); setError(""); }} /></label>
        {error ? <p id="conversation-rename-error" role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p> : null}
        <DialogFooter><Button type="button" size="sm" variant="outline" disabled={pending} onClick={onClose}>{i18n.t("Cancel")}</Button>
          <Button type="submit" size="sm" disabled={pending || !name.trim()}>{i18n.t("Rename")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
