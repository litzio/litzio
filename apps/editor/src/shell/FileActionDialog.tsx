import { useEffect, useRef, useState, type RefObject } from "react";
import type { FileIdentity, FolderTrashResult } from "../../shared/file-operations.ts";
import { getHostClient } from "../host-client.ts";
import { useTranslation } from "react-i18next";
import type { FolderEntry } from "../../shared/document-protocol.ts";
import { validFileStem } from "../../shared/file-operations.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { DangerConfirmation } from "@/components/ui/danger-confirmation.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

export type FileAction = "rename" | "delete";
export type FileActionHandler = (action: FileAction, root: string, entry: FolderEntry, name?: string, folderIdentity?: FileIdentity) => Promise<string>;

export function FileActionDialog({ action, entry, trash, dirty, root, hostId, returnFocus, onExecute, onClose }: {
  action: FileAction; entry: FolderEntry; trash: boolean; dirty: boolean;
  root: string; hostId: string;
  returnFocus: RefObject<HTMLElement | null>; onExecute(name?: string, identity?: FileIdentity): Promise<void>; onClose(): void;
}) {
  const { t } = useTranslation();
  const dot = entry.name.lastIndexOf(".");
  const extension = dot > 0 ? entry.name.slice(dot) : "";
  const [name, setName] = useState(extension ? entry.name.slice(0, -extension.length) : entry.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const folder = entry.kind === "folder";
  const [inspection, setInspection] = useState<FolderTrashResult>();
  useEffect(() => {
    if (!folder) return;
    let active = true;
    void getHostClient(hostId).request("/api/folder-trash", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root, path: entry.path, checkOnly: true }) }).then(async response => {
      const result: FolderTrashResult = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (active) setInspection(result);
    }).catch(cause => { if (active) setError(cause instanceof Error ? t(cause.message, { defaultValue: cause.message }) : String(cause)); });
    return () => { active = false; };
  }, [folder, root, entry.path, hostId, t]);
  const execute = async () => {
    if (pendingRef.current) return;
    const stem = extension.toLowerCase() === ".md" && name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
    if (action === "rename" && !validFileStem(stem)) { setError(t("Enter a valid file name without an extension or directory path.")); return; }
    pendingRef.current = true; setPending(true); setError("");
    try { await onExecute(action === "rename" ? stem : undefined, inspection?.identity); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pendingRef.current = false; setPending(false); }
  };
  if (folder) return <DangerConfirmation title={t("Move folder to Trash?")}
    description={<>{t("Move “{{name}}” and its contents to the OS Trash?", { name: entry.name })}<br />
      {inspection ? t(inspection.countComplete ? "Files: {{count}}" : "Files: at least {{count}} (count incomplete)", { count: inspection.fileCount ?? 0 }) : t("Checking folder contents…")}
      {inspection?.references?.length ? <><br />{t("Documents outside this folder reference images inside it: {{documents}}", { documents: inspection.references.join(", ") })}</> : null}
      {inspection && !inspection.referencesComplete ? <><br />{t("Image reference check is incomplete. Other documents may reference this folder.")}</> : null}</>}
    action={t("Move to Trash")} pending={pending} error={error} returnFocus={returnFocus}
    onConfirm={() => { if (inspection) void execute(); }} onClose={onClose} confirmDisabled={!inspection} />;
  if (action === "delete") return <DangerConfirmation title={t(trash ? "Move file to Trash?" : "Delete file permanently?")}
    description={<>{t(trash ? "Move “{{name}}” to the OS Trash?" : "Permanently delete “{{name}}”? This cannot be undone.", {name:entry.name})}
      {dirty ? <> {t("Unsaved changes will be discarded.")}</> : null}</>}
    action={t(dirty ? "Delete and discard changes" : trash ? "Move to Trash" : "Delete file")}
    pending={pending} error={error} returnFocus={returnFocus} onConfirm={() => void execute()} onClose={onClose} />;
  return <Dialog open onOpenChange={open => { if (!open && !pendingRef.current) onClose(); }}>
    <DialogContent showCloseButton={false} initialFocus={input} finalFocus={() => returnFocus.current ?? true} aria-busy={pending || undefined}>
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void execute(); }}>
        <DialogHeader><DialogTitle>{t("Rename file")}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">{t("Rename “{{name}}” in this folder. The extension stays unchanged.", {name:entry.name})}</DialogDescription></DialogHeader>
        <label className="form-field"><span>{t("File name")}</span>
          <div className="flex min-w-0 items-center gap-2"><Input ref={input} aria-label={t("File name")}
            aria-invalid={!!error} aria-describedby={error ? "rename-error" : undefined}
            value={name} onFocus={event => event.currentTarget.select()} disabled={pending}
            onChange={event => { setName(event.target.value); setError(""); }} />
            {extension ? <span className="shrink-0 text-muted-foreground">{extension}</span> : null}</div></label>
        {error ? <p id="rename-error" role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p> : null}
        <DialogFooter><Button type="button" size="sm" variant="secondary" disabled={pending} onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" size="sm" disabled={pending || !name}>{t("Rename")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
