import { PluginIcon } from "../PluginIcon.tsx";
import { getHostClient } from "../host-client.ts";
import { ContextMenu } from "@/components/ui/context-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";
import { FolderTree, folderActions } from "./FolderTree.tsx";
import { usePlugins, defaultFolderCandidate } from "../PluginSettings.tsx";
import { HostStatus } from "../components/HostStatus.tsx";
import { Tooltip, TooltipTrigger, TooltipContent } from "../components/ui/tooltip.tsx";
import { HostExplorer, HostHeading } from "./HostExplorer.tsx";
import { hostRegistry, hostLabel, type HostClient } from "../host-client.ts";
import { SettingsSelect } from "@/components/ui/settings.tsx";
import { locatorKey, type HostLocator } from "../host-locator.ts";
import { PanelResize } from "./PanelResize.tsx";
import { usePanelWidthBounds } from "./panel-width.ts";
import { THEME_LABELS, type ThemePreference } from "../preferences.ts";
import type { FileActionHandler } from "./FileActionDialog.tsx";
import { useTranslation } from "react-i18next";
import { i18n, type MessageKey } from "../i18n.ts";
import { useSyncExternalStore, useRef, useState, type ReactNode, type RefObject } from "react";
import { Sun, Moon, FileText, Files as FilesIcon, Folder, FolderOpen, PanelLeftClose, Plus, Settings } from "lucide-react";
import { DesktopMenu } from "./DesktopDaemon.tsx";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import type { FolderTreeState } from "./folder-tree.ts";

type SidebarProps = {
  onCopyPath?(path: string): void;
  onHostCreate?(hostId: string, client: HostClient, path: string, root?: string): Promise<string>;
  createdDocumentFocus?(): HTMLElement | null;
  documentHostId?: string;
  onHostDirty?(hostId: string, path: string): boolean;
  onHostOpen?(hostId: string, path: string): Promise<void>;
  onHostFileAction?(hostId: string, ...args: Parameters<FileActionHandler>): Promise<string>;
  contributions?: { icon?: ReactNode; id: string; label: string; run(returnFocus: HTMLElement): void }[];
  onAddToChat?(locator: HostLocator, returnFocus: HTMLElement): void;
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
  onCopyPath, documentHostId = "local", onHostCreate, createdDocumentFocus, onHostDirty, onHostOpen, onHostFileAction, onFileAction, fileActionsDisabled, isFileDirty, onWidth, open, overlay, onClose, documentPath, onToggle, toggleRef, onOpenFolder, onNewDocument, recent = [], onOpenRecent, onNew, onNewFolder,
  folders = [], focusFolder, onFolderFocused, onToggleFolder, onToggleSection, onOpenDocument, onOpenRight, openRightDisabled, onCloseFolder, onRefreshFolder, onRevealFolder, onSettings, settingsDisabled, updateVersion,
  theme = "light", onThemeChange, contributions = [], onAddToChat,
}: SidebarProps) {
  useTranslation();
  const [hostFilter, setHostFilter] = useState("");
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  const hosts = hostRegistry.list();
  const bounds = usePanelWidthBounds("sidebar");
  const content = useRef<HTMLDivElement>(null);
  const blankTrigger = useRef<HTMLDivElement>(null);
  const { plugins } = usePlugins();
  const candidate = defaultFolderCandidate(plugins, { folders: folders.length, recent: recent.length, documentPath });
  const candidatePlugin = candidate && plugins.find(p => p.running && p.status?.folders.includes(candidate));
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
      {open && !overlay && bounds ? <PanelResize label={i18n.t("Explorer width")} side="left" {...bounds} onWidth={onWidth} /> : null}
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
      <div ref={content} id="sidebar-files" className={`sidebar-content${hosts.length > 1 ? " sidebar-content--multi-host" : ""}`} hidden={!open}
        onContextMenu={event => {
          if (!event.currentTarget.contains(event.target as Node) || (event.target as Element).closest(".sidebar-folder-header, .sidebar-tree-item")) return;
          event.preventDefault(); event.stopPropagation();
          // Keep this menu's provider beside the tree: file dialogs must not inherit a closed menu's focus scope.
          blankTrigger.current?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }));
        }}>
        {hosts.length > 1 ? <div className="host-filter"><SettingsSelect label={i18n.t("Host")} value={hostFilter} options={[{ value: "", label: i18n.t("All Hosts") }, ...hosts.map(host => ({ value: host.hostId, label: host.label }))]} onChange={setHostFilter} /></div> : null}
        <section className="sidebar-host" data-host-id="local" hidden={!!hostFilter && hostFilter !== "local"} aria-label={hosts.find(host => host.hostId === "local")?.label ?? "Local"}>
        {hosts.length > 1 ? <HostHeading hostId="local" /> : null}
        {folders.length > 0 ? folders.map(tree => {
          const decoration = plugins.find(p => p.enabled && p.running && p.iconDigest && p.status?.decorations.some(d => d.path === tree.root));
          return <FolderTree onCopyPath={onCopyPath}
            key={locatorKey({ hostId: tree.hostId, path: tree.root })}
            onAddToChat={onAddToChat ? (path, focus) => onAddToChat({ hostId: tree.hostId, path }, focus) : undefined}
            onFileAction={onFileAction} fileActionsDisabled={fileActionsDisabled} isFileDirty={isFileDirty}
            tree={tree} decoration={decoration ? <PluginIcon client={getHostClient(tree.hostId)} plugin={decoration.id} digest={decoration.iconDigest} /> : null}
            focusFolder={focusFolder}
            onFolderFocused={onFolderFocused}
            documentPath={documentHostId === "local" ? documentPath : ""}
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
            {candidate && onOpenRecent ? <Button type="button" size="sm" variant="ghost" className="w-full justify-start" title={candidate.path} onClick={() => onOpenRecent(candidate.path)}>{candidatePlugin ? <PluginIcon client={getHostClient("local")} plugin={candidatePlugin.id} digest={candidatePlugin.iconDigest} fallback={<FolderOpen aria-hidden="true" />} /> : null}{i18n.t("Open {{name}}", { name: candidate.label })}</Button> : null}
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
        {hosts.filter(host => host.hostId !== "local").map(host => <div className="sidebar-host" key={host.hostId} hidden={!!hostFilter && hostFilter !== host.hostId}><HostExplorer onCopyPath={onCopyPath} onAddToChat={onAddToChat ? (path, focus) => onAddToChat({ hostId: host.hostId, path }, focus) : undefined} onCreate={(client, path, root) => onHostCreate?.(host.hostId, client, path, root) ?? Promise.resolve("Host creation unavailable")} createdDocumentFocus={createdDocumentFocus} documentPath={documentHostId === host.hostId ? documentPath : ""} isFileDirty={path => onHostDirty?.(host.hostId, path) ?? false} hostId={host.hostId} onOpen={path => onHostOpen?.(host.hostId, path) ?? Promise.reject(new Error("Host navigation unavailable"))} onFileAction={(...args) => onHostFileAction?.(host.hostId, ...args) ?? Promise.reject(new Error("Host file actions unavailable"))} disabled={fileActionsDisabled} /></div>)}
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
          <HostAccount hostId={documentHostId} collapsed={!open} />
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

function HostAccount({ hostId, collapsed }: { hostId: string; collapsed: boolean }) {
  const runtime = hostRegistry.get(hostId);
  const account = runtime.state === "connected" ? runtime.identity?.runAs : undefined;
  const label = hostLabel(hostId);
  const text = `${label}${account ? ` · ${account}` : ""}`;
  return <Tooltip><TooltipTrigger render={<div tabIndex={0} className="sidebar-host-account" aria-label={`${label} · ${i18n.t("Run as")}${account ? `: ${account}` : ""}`} />}>
    <HostStatus runtime={runtime} compact showDetails={false} iconOnly={!!account || collapsed} />
    {!collapsed && account ? <span className="sidebar-tree-name">{text}</span> : null}
  </TooltipTrigger><TooltipContent><div><div>{label}{account ? ` · ${i18n.t("Run as")}: ${account}` : ""}</div>{account ? <div>{i18n.t("This Host performs file operations and assistant execution with this account's permissions.")}</div> : null}</div></TooltipContent></Tooltip>;
}
