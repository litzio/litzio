import { ContextMenu } from "@/components/ui/context-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";
import { FolderTree, folderActions } from "./FolderTree.tsx";
import { HostStatus } from "../components/HostStatus.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { hostConnection } from "../host-client.ts";
import { PanelResize } from "./PanelResize.tsx";
import { usePanelWidthBounds } from "./panel-width.ts";
import { THEME_LABELS, type ThemePreference } from "../preferences.ts";
import type { FileActionHandler } from "./FileActionDialog.tsx";
import { useTranslation } from "react-i18next";
import { i18n, type MessageKey } from "../i18n.ts";
import { useSyncExternalStore, useRef, type ReactNode, type RefObject } from "react";
import { Sun, Moon, FileText, Files as FilesIcon, Folder, FolderOpen, PanelLeftClose, Plus, Settings } from "lucide-react";
import { DesktopMenu } from "./DesktopDaemon.tsx";
import { Button } from "@/components/ui/button.tsx";

import type { FolderTreeState } from "./folder-tree.ts";

type SidebarProps = {
  onCopyPath?(path: string): void;
  contributions?: { icon?: ReactNode; id: string; label: string; run(returnFocus: HTMLElement): void }[];
  onAddToChat?(path: string, returnFocus: HTMLElement): void;
  onFileAction: FileActionHandler;
  fileActionsDisabled: boolean;
  isFileDirty(path: string): boolean;
  open: boolean;
  overlay?: boolean;
  onClose?(): void;
  documentPath: string;
  onWidth(value: number): void;
  onToggle(): void;
  toggleRef?: RefObject<HTMLButtonElement | null>;
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
  theme?: ThemePreference;
  onThemeChange?(theme: ThemePreference): void;
  updateVersion?: string;
  /** App Settings, separate from document settings. Names the control focus returns to. */
  onSettings?(returnFocus: HTMLElement): void;
  settingsDisabled?: boolean;
};

/** File navigation stays mounted when collapsed. Outline remains independent on the right. */
export function Sidebar({
  onCopyPath, onFileAction, fileActionsDisabled, isFileDirty, onWidth, open, overlay, onClose, documentPath, onToggle, toggleRef, onOpenFolder, onNewDocument, recent = [], onOpenRecent, onNew, onNewFolder,
  folders = [], focusFolder, onFolderFocused, onToggleFolder, onToggleSection, onOpenDocument, onOpenRight, openRightDisabled, onCloseFolder, onRefreshFolder, onRevealFolder, onSettings, settingsDisabled, updateVersion,
  theme = "light", onThemeChange, contributions = [], onAddToChat,
}: SidebarProps) {
  useTranslation();
  useSyncExternalStore(hostConnection.subscribe, hostConnection.snapshot, hostConnection.snapshot);
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
      <div className="sidebar-header">
        {open ? <span className="product">{i18n.t("Explorer")}</span> : null}
        <div className="sidebar-header-actions">
          <Button
            ref={toggleRef}
            className="sidebar-collapse"
            variant="ghost"
            size="icon-sm"
            aria-label={open ? i18n.t("Collapse Explorer") : i18n.t("Expand Explorer")}
            title={open ? i18n.t("Collapse Explorer") : i18n.t("Expand Explorer")}
            aria-expanded={open}
            aria-controls="sidebar-files"
            onClick={onToggle}
          >
            {open ? <PanelLeftClose /> : <FilesIcon />}
          </Button>
        </div>
      </div>
      {/* Keep the tree mounted: collapse retains scroll and keyboard position. */}
      <div ref={content} id="sidebar-files" className="sidebar-content" hidden={!open}
        onContextMenu={event => {
          if (!event.currentTarget.contains(event.target as Node) || (event.target as Element).closest(".sidebar-folder-header, .sidebar-tree-item")) return;
          event.preventDefault(); event.stopPropagation();
          // Keep this menu's provider beside the tree: file dialogs must not inherit a closed menu's focus scope.
          blankTrigger.current?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }));
        }}>
        <section className="sidebar-host" data-host-id="local" aria-label="Local">
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
      {onSettings || onThemeChange || contributions.length ? (
        <div className="sidebar-footer">
          {open ? contributions.map(item => <Button key={item.id} size="sm" variant="ghost" className="min-w-0 justify-start" disabled={fileActionsDisabled}
            onClick={event => item.run(event.currentTarget)}>{item.icon ?? <FileText aria-hidden="true" />}{i18n.t(item.label as MessageKey)}</Button>) : null}
          <div className="sidebar-preferences">
            {onSettings ? <SettingsEntry disabled={settingsDisabled} iconOnly={!open} onOpen={onSettings} updateVersion={updateVersion} /> : null}
            {onThemeChange ? <Button variant="ghost" size="icon-sm"
              aria-label={`${i18n.t("Color mode")}: ${i18n.t(THEME_LABELS[theme])}`}
              title={`${i18n.t("Color mode")}: ${i18n.t(THEME_LABELS[theme])}`}
              onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </Button> : null}
            {typeof window !== "undefined" && window.litzioDesktop ? <DesktopMenu desktop={window.litzioDesktop} /> : null}
          </div>
          <HostAccount collapsed={!open} />
        </div>
      ) : null}
    </nav>
  );
}

/** One Settings entry for both sidebar states, including its focus-return target. */
function SettingsEntry({ iconOnly, onOpen, updateVersion, disabled }: { disabled?: boolean; updateVersion?: string; iconOnly: boolean; onOpen(returnFocus: HTMLElement): void }) {
  return <Button disabled={disabled} data-open-settings="" className={iconOnly ? undefined : "min-w-0 flex-1 justify-start"}
    size={iconOnly ? "icon-sm" : "sm"} variant="ghost"
    aria-label={updateVersion ? i18n.t("Settings, new version available") : i18n.t("Settings")}
    title={updateVersion ? i18n.t("New version {{version}} available", { version: updateVersion }) : i18n.t("Settings")}
    onClick={event => onOpen(event.currentTarget)}>
    <span className="settings-entry-icon"><Settings aria-hidden="true" />
      {updateVersion ? <span className="settings-update-dot" data-testid="settings-update-dot" aria-hidden="true" /> : null}
    </span>{iconOnly ? null : i18n.t("Settings")}
  </Button>;
}

function HostAccount({ collapsed }: { collapsed: boolean }) {
  const runtime = hostConnection.get();
  const account = runtime.state === "connected" ? runtime.identity?.runAs : undefined;
  const label = i18n.t("Background service");
  const text = account ?? label;
  return <Tooltip><TooltipTrigger render={<div tabIndex={0} className="sidebar-host-account" aria-label={`${label} · ${i18n.t("Run as")}${account ? `: ${account}` : ""}`} />}>
    <HostStatus runtime={runtime} compact showDetails={false} iconOnly={!!account || collapsed} />
    {!collapsed && account ? <span className="sidebar-tree-name">{text}</span> : null}
  </TooltipTrigger><TooltipContent><div><div>{label}{account ? ` · ${i18n.t("Run as")}: ${account}` : ""}</div>{account ? <div>{i18n.t("This Host performs file operations and assistant execution with this account's permissions.")}</div> : null}</div></TooltipContent></Tooltip>;
}
