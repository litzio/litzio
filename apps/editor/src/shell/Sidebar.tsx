import { ContextMenu } from "@/components/ui/context-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";
import { FolderTree, folderActions } from "./FolderTree.tsx";
import { PanelResize } from "./PanelResize.tsx";
import { usePanelWidthBounds } from "./panel-width.ts";
import type { FileActionHandler } from "./FileActionDialog.tsx";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useRef } from "react";
import { Folder, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { PanelHeader } from "@/components/ui/panel-header.tsx";

import type { FolderTreeState } from "./folder-tree.ts";

type SidebarProps = {
  onCopyPath?(path: string): void;
  onAddToChat?(path: string, returnFocus: HTMLElement): void;
  onFileAction: FileActionHandler;
  fileActionsDisabled: boolean;
  isFileDirty(path: string): boolean;
  open: boolean;
  overlay?: boolean;
  onClose?(): void;
  documentPath: string;
  onWidth(value: number): void;
  /** Names the control the folder dialog returns focus to. */
  onOpenFolder(returnFocus: HTMLElement | null): void;
  onNewDocument?(returnFocus: HTMLElement): void;
  /** Recently opened folders, offered without an opened folder so one click lists one again. */
  recent?: string[];
  onOpenRecent?(folder: string): void;
  /** Opens New in an opened folder; it shows and lets the user choose the destination folder. Names the button. */
  onNew?(root: string, button: HTMLElement, exact?: boolean): void;
  /** Opens New folder, which likewise shows and chooses where the folder is created. */
  onNewFolder?(root: string, button: HTMLElement, exact?: boolean): void;
  /** The opened folders, in order, each a tree of the folders listed so far. */
  folders?: FolderTreeState[];
  focusFolder?: string | null;
  onFolderFocused?(): void;
  onToggleFolder?(root: string, path: string): void;
  onToggleSection?(root: string): void;
  onOpenDocument?(path: string): void;
  onOpenRight?(path: string): void;
  openRightDisabled?: boolean;
  onCloseFolder?(root: string): void;
  onRefreshFolder?(root: string): void;
  onRevealFolder?(path: string): void;
};

/** Explorer panel beside the Activity bar, which owns its open/collapse toggle. File navigation
 * stays mounted when collapsed. Outline remains independent on the right. */
export function Sidebar({
  onCopyPath, onFileAction, fileActionsDisabled, isFileDirty, onWidth, open, overlay, onClose, documentPath, onOpenFolder, onNewDocument, recent = [], onOpenRecent, onNew, onNewFolder,
  folders = [], focusFolder, onFolderFocused, onToggleFolder, onToggleSection, onOpenDocument, onOpenRight, openRightDisabled, onCloseFolder, onRefreshFolder, onRevealFolder, onAddToChat,
}: SidebarProps) {
  useTranslation();
  const bounds = usePanelWidthBounds("sidebar");
  const content = useRef<HTMLDivElement>(null);
  const blankTrigger = useRef<HTMLDivElement>(null);
  const only = folders.length === 1 ? folders[0] : undefined;
  const blankActions = only ? folderActions({
    onCopyPath,
    onNew: button => onNew?.(only.root, button),
    onNewFolder: button => onNewFolder?.(only.root, button),
    onOpenFolder, onRevealFolder,
    onRefresh: () => onRefreshFolder?.(only.root), onClose: () => onCloseFolder?.(only.root),
  }, only.root, () => content.current?.querySelector<HTMLButtonElement>('[data-folder-menu]') ?? null)
    : [{ id: "open", label: i18n.t("Open folder…"), icon: <FolderOpen aria-hidden="true" />, run: () => onOpenFolder(content.current) }];
  return (
    <nav className={`sidebar${open ? "" : " sidebar--collapsed"}${overlay && open ? " sidebar--overlay" : ""}`} aria-label={i18n.t("Application")} data-testid="sidebar"
      onKeyDown={event => {
        if (overlay && open && event.key === "Escape" && !event.defaultPrevented && !event.nativeEvent.isComposing && event.currentTarget.contains(event.target as Node)) {
          event.preventDefault(); event.stopPropagation(); onClose?.();
        }
      }}>
      {open && bounds ? <PanelResize label={i18n.t("Explorer width")} side="left" {...bounds} onWidth={onWidth} /> : null}
      <PanelHeader title={i18n.t("Explorer")} />
      {/* Keep the tree mounted: collapse retains scroll and keyboard position. */}
      <div ref={content} id="sidebar-files" className="sidebar-content" hidden={!open}
        onContextMenu={event => {
          if (!event.currentTarget.contains(event.target as Node) || (event.target as Element).closest(".sidebar-folder-header, .sidebar-tree-item")) return;
          event.preventDefault(); event.stopPropagation();
          // Keep this menu's provider beside the tree: file dialogs must not inherit a closed menu's focus scope.
          blankTrigger.current?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }));
        }}>
        <section className="sidebar-host" data-host-id="local" aria-label={i18n.t("Local")}>
        {folders.length > 0 ? folders.map(tree => {
          return <FolderTree onCopyPath={onCopyPath}
            key={tree.root}
            onAddToChat={onAddToChat ? (path, focus) => onAddToChat(path, focus) : undefined}
            onFileAction={onFileAction} fileActionsDisabled={fileActionsDisabled} isFileDirty={isFileDirty}
            tree={tree}
            focusFolder={focusFolder}
            onFolderFocused={onFolderFocused}
            documentPath={documentPath}
            onToggleFolder={path => onToggleFolder?.(tree.root, path)}
            onToggleSection={() => onToggleSection?.(tree.root)}
            onOpenDocument={path => onOpenDocument?.(path)}
            onOpenRight={onOpenRight} openRightDisabled={openRightDisabled}
            onNew={(button, path) => onNew?.(path ?? tree.root, button, !!path)}
            onNewFolder={(button, path) => onNewFolder?.(path ?? tree.root, button, !!path)}
            onOpenFolder={onOpenFolder}
            onRevealFolder={onRevealFolder}
            onRefresh={() => onRefreshFolder?.(tree.root)}
            onClose={() => onCloseFolder?.(tree.root)}
          />;
        }) : (
          <section className="sidebar-empty" aria-label={i18n.t("Explorer")} data-testid="sidebar-empty">
            <p className="sidebar-empty-text">{i18n.t("Open a folder to browse its files and create documents.")}</p>
            <Button type="button" size="sm" variant="ghost" className="w-full justify-start"
              aria-label={i18n.t("Open folder…")} title={i18n.t("Open folder…")}
              onClick={event => onOpenFolder(event.currentTarget)}>
              <FolderOpen aria-hidden="true" />{i18n.t("Open folder…")}</Button>
            {onNewDocument ? <Button type="button" size="sm" variant="ghost" className="w-full justify-start"
              onClick={event => onNewDocument(event.currentTarget)}>
              <Plus aria-hidden="true" />{i18n.t("New document…")}</Button> : null}
            {recent.length > 0 && onOpenRecent ? (
              <section className="sidebar-recent" aria-labelledby="sidebar-recent-label">
                <p className="sidebar-recent-label" id="sidebar-recent-label">{i18n.t("Recent")}</p>
                <ul>
                  {recent.map(folder => (
                    <li key={folder}>
                      <button type="button" className="sidebar-tree-item sidebar-recent-folder" title={folder} onClick={() => onOpenRecent(folder)}>
                        <Folder className="sidebar-tree-icon" aria-hidden="true" />
                        <span className="sidebar-tree-name">{splitDocumentPath(folder.replace(/[\\/]+$/, "")).name || folder}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        )}
        </section>
      </div>
      <ContextMenu actions={blankActions} trigger={<div ref={blankTrigger} className="contents" />} />
    </nav>
  );
}
