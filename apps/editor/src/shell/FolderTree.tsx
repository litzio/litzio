import { ContextMenu, type ContextMenuAction } from "@/components/ui/context-menu.tsx";
import { FileActionDialog, type FileAction, type FileActionHandler } from "./FileActionDialog.tsx";
import { FilePreviewDialog } from "./FilePreviewDialog.tsx";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent } from "react";
import { Copy, Link, Pencil, Trash2, ChevronRight, Ellipsis, File, Image as ImageIcon, FileText, FileX, FolderOpen, FolderPlus, PanelRightOpen, Plus, RotateCw, X } from "lucide-react";
import { fileDeletion } from "../host-capabilities.ts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";
import { treeKey, visibleTreeItems, type FolderTreeState, type TreeItem } from "./folder-tree.ts";

type FolderTreeProps = {
  onCopyPath?(path: string): void;
  onAddToChat?(path: string, returnFocus: HTMLElement): void;
  onFileAction: FileActionHandler;
  fileActionsDisabled: boolean;
  isFileDirty(path: string): boolean;
  decoration?: ReactNode;
  tree: FolderTreeState;
  focusFolder?: string | null;
  onFolderFocused?(): void;
  documentPath: string;
  onToggleFolder(path: string): void;
  onToggleSection(): void;
  onOpenDocument(path: string): void;
  onOpenRight?(path: string): void;
  openRightDisabled?: boolean;
  onNew?(button: HTMLElement, path?: string): void;
  onNewFolder?(button: HTMLElement, path?: string): void;
  onOpenFolder(returnFocus: HTMLElement | null): void;
  onRevealFolder?(path: string): void;
  onRefresh(): void;
  onClose(): void;
};

/** Shared folder actions; child rows select only operations supported for their path. */
export function folderActions(props: Pick<FolderTreeProps, "onCopyPath" | "onNew" | "onNewFolder" | "onOpenFolder" | "onRevealFolder" | "onRefresh" | "onClose">,
  root: string, button: () => HTMLElement | null): ContextMenuAction[] {
  return [
    { id: "new", visible: !!props.onNew, label: i18n.t("New document…"), icon: <Plus aria-hidden="true" />, run: () => { const target = button(); if (target) props.onNew?.(target); } },
    { id: "new-folder", visible: !!props.onNewFolder, label: i18n.t("New folder…"), icon: <FolderPlus aria-hidden="true" />, run: () => { const target = button(); if (target) props.onNewFolder?.(target); } },
    { id: "open", label: i18n.t("Open folder…"), icon: <FolderOpen aria-hidden="true" />, run: () => props.onOpenFolder(button()) },
    { id: "reveal", label: i18n.t("Open in File Explorer"), icon: <FolderOpen aria-hidden="true" />, visible: !!props.onRevealFolder, run: () => props.onRevealFolder?.(root) },
    ...pathActions(root, root, props.onCopyPath),
    { id: "refresh", label: i18n.t("Refresh"), icon: <RotateCw aria-hidden="true" />, run: props.onRefresh },
    { id: "close", label: i18n.t("Close folder"), icon: <X aria-hidden="true" />, run: props.onClose },
  ];
}

/** Paths belong to the target Host, not the browser machine. */
function pathActions(path: string, root: string, copy?: (path: string) => void): ContextMenuAction[] {
  if (!copy) return [];
  const relative = path.slice(root.replace(/[\\/]+$/, "").length).replace(/^[\\/]+/, "").replaceAll("\\", "/") || ".";
  return [
    { id: "copy-path", label: i18n.t("Copy path"), icon: <Copy aria-hidden="true" />, run: () => copy(path) },
    { id: "copy-relative-path", label: i18n.t("Copy relative path"), icon: <Link aria-hidden="true" />, run: () => copy(relative) },
  ];
}

/** One opened folder as a tree: folders expand in place, documents open. */
export function FolderTree({ onCopyPath, decoration,  onAddToChat, onFileAction, fileActionsDisabled, isFileDirty, tree, focusFolder, onFolderFocused, documentPath, onToggleFolder, onToggleSection, onOpenDocument, onOpenRight, openRightDisabled, onNew, onNewFolder, onOpenFolder, onRevealFolder, onRefresh, onClose }: FolderTreeProps) {
  useTranslation();
  const treeId = useId();
  const section = useRef<HTMLElement>(null);
  const moreActions = useRef<HTMLButtonElement>(null);
  const actions = folderActions({ onCopyPath, onNew, onNewFolder, onOpenFolder, onRevealFolder, onRefresh, onClose }, tree.root, () => moreActions.current);
  const [fileAction, setFileAction] = useState<{ action: FileAction; item: TreeItem }>();
  const actionReturn = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  // Host paths are resolved, so only a filesystem root ends in a separator; it shows as itself.
  const name = (path: string) => splitDocumentPath(path).name || path;
  const folderName = name(tree.root);
  const toggleName = i18n.t(tree.sectionExpanded ? "Collapse folder {{name}}" : "Expand folder {{name}}", { name: folderName });
  const items = visibleTreeItems(tree);
  const rows = useRef(new Map<string, HTMLLIElement>());
  useLayoutEffect(() => {
    const target = focusFolder && tree.sectionExpanded ? rows.current.get(focusFolder) : undefined;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
      onFolderFocused?.();
    }
  }, [focusFolder, tree, onFolderFocused]);
  useLayoutEffect(() => {
    if (pendingFocus.current && !fileAction) {
      const target = rows.current.get(pendingFocus.current);
      if (target) { actionReturn.current = target; target.focus(); pendingFocus.current = null; }
    }
  }, [tree, fileAction]);
  const [focused, setFocused] = useState<string>();
  const [preview, setPreview] = useState<TreeItem>();
  const previewReturn = useRef<HTMLElement | null>(null);
  // One tab stop: the item last focused, else the open document, else the first item.
  const tabStop = [focused, documentPath].find(path => items.some(item => item.entry.path === path)) ?? items[0]?.entry.path;

  const activate = (item: TreeItem) => {
    if (item.entry.kind === "folder") onToggleFolder(item.entry.path);
    else if (item.entry.kind === "document" || /\.pdf$/i.test(item.entry.path)) onOpenDocument(item.entry.path);
    else {
      previewReturn.current = rows.current.get(item.entry.path) ?? null;
      setPreview(item);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    const index = items.findIndex(item => item.entry.path === focused);
    const result = treeKey(items, index, event.key, tree.expanded);
    if (!result) return;
    event.preventDefault();
    if ("focus" in result) rows.current.get(result.focus)?.focus();
    else if ("expand" in result || "collapse" in result) activate(items[index]!);
    else activate(result.activate);
  };

  return (
    <section ref={section} className="sidebar-folder" aria-label={folderName} data-testid="folder" data-root={tree.root}>
      <ContextMenu actions={actions} trigger={<div className="sidebar-folder-header">
        <p className={`sidebar-folder-name${decoration ? " sidebar-folder-name--decorated" : ""}`} title={tree.root}>
          <span className="sidebar-tree-chevron">
            <Button type="button" variant="ghost" size="icon-xs" className="sidebar-folder-toggle"
              aria-label={toggleName} title={toggleName} aria-expanded={tree.sectionExpanded} aria-controls={treeId}
              onClick={onToggleSection}><ChevronRight aria-hidden="true" /></Button>
          </span>
          {decoration}
          <span className="sidebar-tree-name" onClick={event => {
            // A double-click must not immediately undo its first toggle.
            if (event.detail <= 1) onToggleSection();
          }}>{folderName}</span>
        </p>
        <div className="sidebar-folder-actions">
          <Button hidden={!onNew} variant="ghost" size="icon-xs" aria-label={i18n.t("New document…")} title={i18n.t("New document…")} onClick={event => onNew?.(event.currentTarget)}>
            <Plus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger data-folder-menu="" ref={moreActions} render={<Button variant="ghost" size="icon-xs" aria-label={i18n.t("More actions")} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.filter(action => action.id !== "new" && action.visible !== false).map(action =>
                <DropdownMenuItem key={action.id} onClick={action.run}>{action.icon}{action.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>} />
      <ul id={treeId} className="sidebar-tree" role="tree" aria-label={folderName} hidden={!tree.sectionExpanded} onKeyDown={keyDown}>
        {items.map(item => {
          const { entry } = item;
          const folder = entry.kind === "folder";
          const choose = (action: FileAction) => {
            actionReturn.current = rows.current.get(entry.path) ?? null;
            setFileAction({ action, item });
          };
          const trashUnavailable = fileDeletion(tree.hostId) !== "trash";
          const deleteFolder: ContextMenuAction = { id: "delete-folder", label: i18n.t("Delete folder…"), icon: <Trash2 aria-hidden="true" />, danger: true,
            disabled: fileActionsDisabled || trashUnavailable, disabledReason: trashUnavailable ? i18n.t("Folder deletion requires OS Trash. This Host does not provide it.") : undefined, run: () => choose("delete") };
          const folderMenu = folderActions({
            onNew: onNew ? target => onNew(target, entry.path) : undefined,
            onNewFolder: onNewFolder ? target => onNewFolder(target, entry.path) : undefined,
            onOpenFolder, onRevealFolder, onRefresh, onClose,
          }, entry.path, () => rows.current.get(entry.path) ?? null)
            .filter(action => action.id === "new" || action.id === "new-folder" || action.id === "reveal")
            .concat(pathActions(entry.path, tree.root, onCopyPath), deleteFolder);
          const expanded = folder && tree.expanded.has(entry.path);
          // Text files and Markdown without a native marker open in text mode.
          const foreign = entry.kind === "document" && entry.native === false;
          const description = foreign ? i18n.t("Not a {{product}} document") : entry.kind === "image" ? i18n.t("Read-only image preview") : entry.kind === "file" ? i18n.t("This file cannot be edited in {{product}}.") : undefined;
          const Icon = foreign ? FileX : entry.kind === "image" ? ImageIcon : entry.kind === "file" ? File : FileText;
          const row = (
            <li
              key={entry.path}
              ref={row => { if (row) rows.current.set(entry.path, row); else rows.current.delete(entry.path); }}
              role="treeitem"
              className={`sidebar-tree-item${folder ? " sidebar-tree-item--actions" : ""}`}
              data-foreign={foreign || undefined}
              data-path={entry.path}
              style={{ "--tree-depth": item.depth + 1 } as CSSProperties}
              tabIndex={entry.path === tabStop ? 0 : -1}
              title={description ? `${entry.path}\n${description}` : entry.path}
              aria-description={description}
              aria-label={folder ? entry.name : undefined}
              aria-level={item.depth + 1}
              aria-posinset={item.position}
              aria-setsize={item.size}
              aria-expanded={folder ? expanded : undefined}
              aria-selected={folder ? entry.path === focused : undefined}
              aria-current={!folder && entry.path === documentPath ? "page" : undefined}
              onFocus={() => setFocused(entry.path)}
              onClick={() => activate(item)}
            >
              {folder ? <span className="sidebar-tree-chevron" aria-hidden="true"><ChevronRight /></span>
                : <Icon className="sidebar-tree-icon" aria-hidden="true" />}
              <span className="sidebar-tree-name">{entry.name}</span>
              {folder ? <DropdownMenu>
                <DropdownMenuTrigger tabIndex={-1} render={<Button variant="ghost" size="icon-xs" aria-label={i18n.t("More actions for {{name}}", { name: entry.name })} />}
                  onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><Ellipsis /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                  {folderMenu.filter(action => action.visible !== false).map(action => {
                    const menuItem = <DropdownMenuItem key={action.id} aria-disabled={action.disabled || undefined}
                      disabled={action.disabled && !action.disabledReason} closeOnClick={!action.disabled}
                      className={`${action.danger ? "text-destructive" : ""} ${action.disabledReason ? "opacity-50" : ""}`}
                      onClick={() => { if (!action.disabled) action.run(); }}>{action.icon}{action.label}</DropdownMenuItem>;
                    return action.disabledReason ? <Tooltip key={action.id}><TooltipTrigger render={menuItem} /><TooltipContent>{action.disabledReason}</TooltipContent></Tooltip> : menuItem;
                  })}
                </DropdownMenuContent>
              </DropdownMenu> : null}
            </li>
          );
          if (folder) return <ContextMenu key={entry.path} trigger={row} actions={folderMenu} disabled={fileActionsDisabled} />;
          const actions: ContextMenuAction[] = [
            ...(onAddToChat ? [{ id: "add-to-chat", label: i18n.t("Add to chat"), icon: <FileText aria-hidden="true" />, run: () => onAddToChat(entry.path, rows.current.get(entry.path)!) }] : []),
            ...(entry.kind === "document" && onOpenRight ? [{ id: "open-right", label: i18n.t("Open to the right"), icon: <PanelRightOpen aria-hidden="true" />, disabled: openRightDisabled, run: () => onOpenRight(entry.path) }] : []),
            ...pathActions(entry.path, tree.root, onCopyPath),
            { id: "rename", label: i18n.t("Rename…"), icon: <Pencil aria-hidden="true" />, run: () => choose("rename") },
            { id: "delete", label: i18n.t("Delete file…"), icon: <Trash2 aria-hidden="true" />, danger: true, run: () => choose("delete") },
          ];
          return <ContextMenu key={entry.path} trigger={row} actions={actions} disabled={fileActionsDisabled} />;
        })}
      </ul>
      {fileAction ? <FileActionDialog action={fileAction.action} entry={fileAction.item.entry}
        root={tree.root} hostId={tree.hostId}
        trash={tree.hostId !== "local" || fileDeletion(tree.hostId) === "trash"} dirty={isFileDirty(fileAction.item.entry.path)}
        returnFocus={actionReturn} onClose={() => setFileAction(undefined)} onExecute={async (name, identity) => {
          const index = items.findIndex(item => item.entry.path === fileAction.item.entry.path);
          const next = await onFileAction(fileAction.action, tree.root, fileAction.item.entry, name, identity);
          const surviving = items.filter(item => item.entry.path !== fileAction.item.entry.path && !item.entry.path.startsWith(fileAction.item.entry.path + (fileAction.item.entry.path.includes("\\") ? "\\" : "/")));
          const focus = fileAction.action === "rename" ? next : (surviving.find(item => items.indexOf(item) > index) ?? surviving.at(-1))?.entry.path;
          actionReturn.current = focus ? rows.current.get(focus) ?? null : section.current?.querySelector<HTMLButtonElement>(".sidebar-folder-toggle") ?? null;
          pendingFocus.current = focus ?? null;
        }} /> : null}
      {preview ? <FilePreviewDialog key={preview.entry.path} entry={preview.entry} root={tree.root}
        returnFocus={previewReturn} onClose={() => setPreview(undefined)} /> : null}
      {tree.nodes.get(tree.root)?.entries.length === 0 ? <p className="sidebar-folder-empty" hidden={!tree.sectionExpanded}>{i18n.t("No files or folders")}</p> : null}
    </section>
  );
}
