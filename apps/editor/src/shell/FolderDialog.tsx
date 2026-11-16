import { useMessageState } from "../ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, File, FileX, FileText, Folder, FolderPlus, HardDrive, House, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { FolderBrowseResponse, FolderEntry, FolderPlace } from "../../shared/document-protocol.ts";
import { childPath, splitDocumentPath, unquotePath } from "./document-path.ts";
import { FileImagePreview } from "./FilePreviewDialog.tsx";
import { visibleRecentFolders } from "../preferences.ts";

type FolderDialogProps = {
  open: boolean;
  title?: string;
  description?: string;
  /** File pickers list only the chosen kind beside folders; selection admits that file. */
  extensions?: string[];
  choose?: "folder" | "image" | "pdf" | "document" | "file";
  /** Choosing an output folder returns its address instead of opening it in the sidebar. */
  selectOnly?: boolean;
  /** Where browsing starts, usually the open document's folder. */
  initialPath: string;
  recent: string[];
  restricted?: boolean;
  allowedRoots?: string[];
  browse(path: string): Promise<FolderBrowseResponse>;
  places(): Promise<FolderPlace[]>;
  /** Resolves to an error message, or "" once the folder is open or the image chosen. */
  onOpen(path: string): Promise<string>;
  /** Creates a folder inside `parent`; resolves to an error message, or "" once it exists. Absent, there is no New folder. */
  onCreateFolder?(parent: string, name: string): Promise<string>;
  /** The control that opened the dialog, which gets focus back when it closes. */
  returnFocus?: RefObject<HTMLElement | null>;
  /** A chained dialog can suppress return focus while it takes ownership. */
  finalFocus?(): HTMLElement | boolean;
  onClose(): void;
  /** Runs after focus/inertness is released, so a following dialog can own focus. */
  onClosed?(): void;
};

type Listing = { directory: string; result?: FolderBrowseResponse; error?: string };

const PLACE_ICONS = { home: House, documents: FileText, drive: HardDrive, root: Folder };

const endsWithSeparator = (value: string) => /[\\/]$/.test(value);
const separatorOf = (value: string) => (value.includes("\\") ? "\\" : "/");
/** A folder path ready to list its contents: it ends with its separator. */
const inside = (folder: string) => (endsWithSeparator(folder) ? folder : folder + separatorOf(folder));
const folderName = (folder: string) => splitDocumentPath(folder.replace(/(?<=.)[\\/]+$/, "")).name || folder;

/**
 * Shared Host picker: a browsed location, single selection and optional address draft.
 * Browsing and sorting belong to this opening; only explicit confirmation leaves the dialog.
 */
export function FolderDialog({ open, title, description, choose = "folder", extensions, selectOnly = false, initialPath, recent, restricted, allowedRoots, browse, places, onOpen, onCreateFolder, returnFocus, finalFocus, onClose, onClosed }: FolderDialogProps) {
  useTranslation();
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [location, setLocation] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sort, setSort] = useState<{ key: "name" | "modifiedAt" | "size"; descending: boolean }>({ key: "name", descending: false });
  const [refresh, setRefresh] = useState(0);
  const typeAhead = useRef({ text: "", time: 0 });
  const [listing, setListing] = useState<Listing>({ directory: "" });
  const [highlight, setHighlight] = useState(-1);
  const [placeList, setPlaceList] = useState<FolderPlace[]>([]);
  const [error, setError] = useMessageState("");
  const [pending, setPending] = useState(false);
  // Naming is local to the listed folder. Creation selects without entering it.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useMessageState("");
  const [createPending, setCreatePending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const crumbList = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);

  const path = unquotePath(input);
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  // A complete allowed root is a location, not a partial name in its forbidden parent.
  const atRoot = allowedRoots?.some(root => root.replace(/[\\/]+$/, "") === path.replace(/[\\/]+$/, ""));
  const directory = !editing ? location : atRoot ? inside(path) : cut < 0 ? "" : path.slice(0, cut + 1);
  const partial = !editing || atRoot ? "" : path.slice(cut + 1).toLowerCase();
  const result = listing.directory === directory ? listing.result : undefined;
  const pdf = choose === "pdf";
  const document = choose === "document";
  const image = choose !== "folder";
  const matchesFile = (entry: FolderEntry) => choose === "file" ? entry.kind !== "folder" : pdf ? /\.pdf$/i.test(entry.name) && entry.kind !== "folder"
    : document ? /\.md$/i.test(entry.name) && entry.kind === "document" : entry.kind === "image";
  // Choosing an image needs an image the listing shows; a typed folder is a place to look.
  const named = partial ? result?.entries.find(entry => entry.name.toLowerCase() === partial) : undefined;

  const options = (result?.entries.filter(entry => (entry.kind === "folder" || (image && matchesFile(entry))) && entry.name.toLowerCase().startsWith(partial)) ?? []).sort((a, b) => {
    if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
    const order = sort.key === "name" ? a.name.localeCompare(b.name, i18n.language, { numeric: true }) : sort.key === "size" ? (a.size ?? 0) - (b.size ?? 0) : (a.modifiedAt ?? "").localeCompare(b.modifiedAt ?? "");
    return (sort.descending ? -1 : 1) * order;
  });
  const chosen = options.find(entry => entry.path === selected) ?? (highlight >= 0 ? options[highlight] : named);
  const targetPath = chosen?.path ?? (editing ? path : result?.path ?? location);
  const ready = !pending && (image ? !!chosen : Boolean(targetPath));
  const activeIndex = chosen ? options.indexOf(chosen) : highlight;
  const activeImage = choose === "image" && options[activeIndex]?.kind === "image" ? options[activeIndex] : undefined;

  const crumbs = result?.crumbs ?? [];
  const parent = crumbs.at(-2);
  const currentPlace = [...crumbs].reverse().find(crumb => placeList.some(place => place.path === crumb.path))?.path;

  useEffect(() => {
    if (!open) return;
    let active = true;
    setInput(initialPath ? inside(initialPath) : "");
    setSelected(undefined); setEditing(false); setLocation(initialPath ? inside(initialPath) : "");
    setHistory(initialPath ? [inside(initialPath)] : []); setHistoryIndex(initialPath ? 0 : -1);
    setSort({ key: "name", descending: false });
    setError("");
    setHighlight(-1);
    setCreating(false);
    setNewName("");
    setCreateError("");
    void places().then(
      next => { if (active) setPlaceList(next); },
      () => { if (active) setPlaceList([]); },
    );
    return () => { active = false; };
  }, [open, initialPath, places]);

  // The listing follows the folder part of the path; a slower earlier answer never replaces it.
  useEffect(() => {
    if (!open || !directory) {
      setListing({ directory: "" });
      return;
    }
    if (restricted && visibleRecentFolders([directory], allowedRoots).length === 0) {
      setListing({ directory, error: "Path is outside the allowed folders." });
      return;
    }
    let active = true;
    setListing({ directory });
    browse(directory).then(
      next => { if (active) setListing({ directory, result: next }); },
      (cause: unknown) => { if (active) setListing({ directory, error: cause instanceof Error ? cause.message : String(cause) }); },
    );
    return () => { active = false; };
  }, [open, directory, browse, restricted, allowedRoots, refresh]);

  useEffect(() => {
    if (activeIndex >= 0) list.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => { if (crumbList.current) crumbList.current.scrollLeft = crumbList.current.scrollWidth; }, [result?.path, editing]);
  useEffect(() => { if (editing) { field.current?.focus(); field.current?.select(); } }, [editing]);
  const go = (folder: string, remember = true) => {
    if (pending) return;
    const next = inside(folder);
    if (remember && next !== location) { const steps = [...history.slice(0, historyIndex + 1), next]; setHistory(steps); setHistoryIndex(steps.length - 1); }
    setInput(next); setLocation(next); setEditing(false); setSelected(undefined); setHighlight(-1); setError("");
    list.current?.focus();
  };
  const travel = (step: number) => { const index = historyIndex + step; if (index < 0 || index >= history.length) return; setHistoryIndex(index); go(history[index]!, false); };
  const enter = (entry: FolderEntry) => {
    if (entry.kind === "folder") go(entry.path);
    else if (matchesFile(entry)) void submit(entry.path);
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName("");
    setCreateError("");
    newFolderButton.current?.focus();
  };

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!result || createPending || !onCreateFolder) return;
    const name = newName.trim();
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
      setCreateError({ key: "Enter a folder name without a directory path." });
      return;
    }
    setCreatePending(true);
    const message = await onCreateFolder(result.path, name);
    setCreatePending(false);
    setCreateError(message);
    if (message) return;
    setCreating(false);
    setNewName("");
    setSelected(childPath(result.path, name)); setRefresh(value => value + 1); list.current?.focus();
  };

  const submit = async (target = targetPath) => {
    if (!ready || pending) return;
    setPending(true);
    try {
      const message = await onOpen(target);
      setError(message);
      if (!message) onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setPending(false); }
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (pending || event.nativeEvent.isComposing) return;
    const atEnd = event.currentTarget.selectionStart === input.length && event.currentTarget.selectionEnd === input.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(activeIndex < 0 ? (step > 0 ? 0 : options.length - 1) : (activeIndex + step + options.length) % options.length);
    } else if ((event.key === "Tab" && !event.shiftKey) || (event.key === "ArrowRight" && atEnd)) {
      // Complete into the highlighted (or only, or first) match.
      const match = options[Math.max(activeIndex, 0)];
      if (!match || (event.key === "Tab" && !partial && highlight < 0)) return;
      event.preventDefault();
      setInput(match.kind === "folder" ? inside(match.path) : match.path); setSelected(match.path);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (named?.kind === "folder") go(named.path);
      else if (named && matchesFile(named)) { const file = named; go(result!.path); setSelected(file.path); }
      else go(path);
    } else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setEditing(false); setInput(location); setSelected(undefined); list.current?.focus();
    } else if (event.key === "Backspace" && atEnd && endsWithSeparator(path) && parent) {
      event.preventDefault();
      go(parent.path);
    }
  };

  const target = folderName(targetPath);
  const meta = listing.directory === directory && listing.error ? listing.error : directory && !result ? i18n.t("Reading…") : result && options.length === 0 ? i18n.t("This folder is empty.") : "";
  const pathLabel = choose === "image" ? i18n.t("Image path") : image ? i18n.t("File path") : i18n.t("Folder path");
  const fileTypes = choose === "pdf" ? "PDF (*.pdf)" : document ? "Markdown (*.md)" : choose === "image" ? "PNG, JPEG, GIF, WebP, SVG" : extensions?.map(extension => `*${extension}`).join(", ") ?? i18n.t("All files");
  const listKeys = (event: KeyboardEvent<HTMLUListElement>) => {
    if (pending || event.nativeEvent.isComposing) return;
    let index = activeIndex;
    if (event.key === "ArrowDown") index = Math.min(index + 1, options.length - 1);
    else if (event.key === "ArrowUp") index = index < 0 ? options.length - 1 : Math.max(0, index - 1);
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = options.length - 1;
    else if (event.key === "Enter") { event.preventDefault(); if (chosen) enter(chosen); return; }
    else if (event.key === "Backspace") { event.preventDefault(); if (parent) go(parent.path); return; }
    else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const now = Date.now(), previous = typeAhead.current;
      const text = now - previous.time < 1000 ? previous.text + event.key : event.key;
      typeAhead.current = { text, time: now };
      index = options.findIndex(entry => entry.name.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()));
    } else return;
    event.preventDefault(); setSelected(options[index]?.path); setHighlight(index);
  };
  return (
    <Dialog open={open} onOpenChange={(next, details) => {
      if (next || pending || createPending) return;
      if (creating && details.reason === "escape-key") cancelCreate(); else onClose();
    }} onOpenChangeComplete={next => { if (!next) onClosed?.(); }}>
      <DialogContent className="folder-picker sm:max-w-[var(--layout-folder-picker-width)]" showCloseButton={!pending}
        initialFocus={() => list.current} finalFocus={finalFocus ?? (() => returnFocus?.current ?? true)}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") { event.preventDefault(); setInput(result ? inside(result.path) : location); setEditing(true); }
          if (event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)) { event.preventDefault(); if (event.key === "ArrowUp") { if (parent) go(parent.path); } else travel(event.key === "ArrowLeft" ? -1 : 1); }
        }}>
        <DialogHeader title={description}><DialogTitle>{title ?? (image ? i18n.t("Choose image") : i18n.t("Open folder"))}</DialogTitle></DialogHeader>
        <div className="folder-picker-location">
          <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Back")} disabled={pending || historyIndex <= 0} onClick={() => travel(-1)}><ArrowLeft /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Forward")} disabled={pending || historyIndex >= history.length - 1} onClick={() => travel(1)}><ArrowRight /></Button>
          <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Up")} disabled={!parent || pending} onClick={() => parent && go(parent.path)}><ArrowUp /></Button>
          <div className="folder-picker-field">
            {editing ? <input ref={field} id="folder-path" data-testid="folder-path" className="folder-picker-input" role="combobox" aria-label={pathLabel} aria-expanded={options.length > 0} aria-controls="folder-picker-list" aria-activedescendant={activeIndex >= 0 ? `folder-option-${activeIndex}` : undefined} aria-autocomplete="list" value={input} onChange={event => { setInput(event.target.value); setSelected(undefined); setHighlight(-1); setError(""); }} onKeyDown={keyDown} spellCheck={false} autoComplete="off" disabled={pending} /> : <>
              <nav ref={crumbList} aria-label={i18n.t("Folder location")} className="folder-picker-crumbs">{crumbs.map((crumb, index) => <span key={crumb.path}>{index > 0 ? <ChevronRight aria-hidden="true" /> : null}<Button variant="ghost" size="sm" className="folder-picker-crumb" title={crumb.path} aria-current={index === crumbs.length - 1 ? "location" : undefined} onClick={() => go(crumb.path)}>{crumb.name}</Button></span>)}</nav>
              <Button variant="ghost" size="sm" className="folder-picker-address" aria-label={i18n.t("Edit path")} onClick={() => { setInput(result ? inside(result.path) : location); setEditing(true); }} />
            </>}
          </div>
          {onCreateFolder ? <Button ref={newFolderButton} variant="ghost" size="sm" title={result ? i18n.t("New folder in {{path}}", { path: result.path }) : undefined} disabled={!result || pending} onClick={() => { setCreating(true); setCreateError(""); }}><FolderPlus />{i18n.t("New folder")}</Button> : null}
        </div>
        <div className="folder-picker-body">
          <aside className="folder-picker-sidebar">
            <section aria-label={i18n.t("Start from")}><p className="folder-picker-label">{i18n.t("Start from")}</p>{placeList.map(place => { const PlaceIcon = PLACE_ICONS[place.kind]; return <Button key={place.path} variant="ghost" size="sm" className="folder-picker-place" title={place.path} aria-description={place.path} aria-current={place.path === currentPlace ? "location" : undefined} disabled={pending} onClick={() => go(place.path)}><PlaceIcon /><span>{place.kind === "home" ? i18n.t("Home") : place.kind === "documents" ? i18n.t("Documents") : place.name}</span></Button>; })}</section>
            {recent.length ? <section aria-label={i18n.t("Recent folders")}><p className="folder-picker-label">{i18n.t("Recent")}</p>{recent.map(folder => <Button key={folder} variant="ghost" size="sm" className="folder-picker-place" title={folder} disabled={pending} onClick={() => go(folder)}><Folder /><span>{folderName(folder)}</span></Button>)}</section> : null}
          </aside>
          <div className="folder-picker-main">
            <div className="folder-picker-columns" role="table" aria-label={i18n.t("Sort files")}><div role="row">{([["name", i18n.t("Name")], ["modifiedAt", i18n.t("Date modified")], ["size", i18n.t("Size")]] as const).map(([key, label]) => <div key={key} role="columnheader" aria-sort={sort.key === key ? sort.descending ? "descending" : "ascending" : "none"}><Button variant="ghost" size="sm" onClick={() => setSort({ key, descending: sort.key === key && !sort.descending })}>{label}{sort.key === key ? sort.descending ? " ↓" : " ↑" : ""}</Button></div>)}</div></div>
            <div className="folder-picker-scroll">
              {creating ? <form className="folder-picker-new" onSubmit={event => void createFolder(event)}><Folder /><Input data-testid="new-folder-name" aria-label={i18n.t("New folder name")} value={newName} onChange={event => { setNewName(event.target.value); setCreateError(""); }} autoFocus disabled={createPending} aria-invalid={!!createError} aria-describedby={createError ? "new-folder-error" : undefined} /><Button type="submit" variant="outline" size="sm" disabled={createPending || !newName.trim()}>{i18n.t("Create")}</Button><Button type="button" variant="ghost" size="sm" aria-label={i18n.t("Cancel new folder")} onClick={cancelCreate}>{i18n.t("Cancel")}</Button>{createError ? <p id="new-folder-error" role="alert" data-testid="new-error">{createError}</p> : null}</form> : null}
              <ul ref={list} id="folder-picker-list" className="folder-picker-list" role="listbox" aria-label={i18n.t("Folders")} tabIndex={0} aria-activedescendant={activeIndex >= 0 ? `folder-option-${activeIndex}` : undefined} onKeyDown={listKeys}>
                {options.map((entry, index) => <li key={entry.path} id={`folder-option-${index}`} role="option" aria-label={entry.name} aria-selected={index === activeIndex} className="folder-picker-option" title={entry.path} onClick={() => { if (!pending) { setSelected(entry.path); setHighlight(index); list.current?.focus(); } }} onDoubleClick={() => enter(entry)}>
                  <span className="folder-picker-name">{entry.kind === "folder" ? <Folder aria-hidden="true" /> : entry.kind === "image" ? <ImageIcon aria-hidden="true" /> : entry.kind === "document" ? (choose === "file" && entry.native === false ? <FileX aria-hidden="true" /> : <FileText aria-hidden="true" />) : <File aria-hidden="true" />}<span>{entry.name}</span></span>
                  <span className="folder-picker-date">{entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleDateString(i18n.language) : ""}</span><span className="folder-picker-size">{entry.size === undefined ? "" : entry.size < 1024 ? `${entry.size} B` : `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(entry.size / 1024)} KB`}</span>
                </li>)}
              </ul>
              {meta ? <p className="folder-picker-meta" data-testid="folder-picker-meta" role={listing.error ? "alert" : "status"}>{meta}</p> : null}
            </div>
          </div>
          {open && activeImage && result ? <section className="folder-picker-preview" aria-label={i18n.t("Read-only image preview")}><FileImagePreview key={activeImage.path} entry={activeImage} root={result.path} quiet /></section> : null}
        </div>
        {error ? <p id="open-folder-error" role="alert" data-testid="open-error">{error}</p> : null}
        <div className="folder-picker-footer">
          <div className="folder-picker-target" title={targetPath}><span>{chosen?.name ?? target}</span>{image ? <span className="folder-picker-types">{fileTypes}</span> : null}</div>
          <Button variant="outline" size="sm" disabled={pending} onClick={onClose}>{i18n.t("Cancel")}</Button>
          <Button size="sm" data-testid="folder-open" title={targetPath} disabled={!ready || !result && !editing} onClick={() => image && chosen?.kind === "folder" ? go(chosen.path) : void submit()}><span>{image ? chosen?.kind === "folder" ? i18n.t("Open") : i18n.t("Use") : selectOnly ? i18n.t("Use") : i18n.t("Open “{{name}}”", { name: target })}</span></Button>
          {choose === "image" ? <p className="folder-picker-copy-note">{i18n.t("Images outside the document's folder are copied into its assets folder.")}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
