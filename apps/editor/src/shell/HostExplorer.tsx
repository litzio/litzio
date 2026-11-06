import { HostStatus } from "../components/HostStatus.tsx";
import { i18n } from "../i18n.ts";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hostRegistry, hostLabel, getHostClient, type HostClient } from "../host-client.ts";
import { folderChain, useFolderTrees } from "./folder-tree.ts";
import { FolderTree } from "./FolderTree.tsx";
import { FolderDialog } from "./FolderDialog.tsx";
import type { FileActionHandler } from "./FileActionDialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { HostContext } from "../host-context.tsx";
import type { FolderResponse, FolderBrowseResponse, FolderPlacesResponse } from "../../shared/document-protocol.ts";
import { NewDialog } from "./NewDialog.tsx";
import { newDestinations } from "./new-destinations.ts";
import { childPath } from "./document-path.ts";
import { messageOf } from "../document-session.ts";
import { FolderOpen } from "lucide-react";

export function HostHeading({ hostId }: { hostId: string }) {
  useTranslation();
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  useEffect(() => { void hostRegistry.connect(hostId); }, [hostId]);
  return <div className="host-heading"><span className="sidebar-tree-name">{hostLabel(hostId)}</span><Tooltip><TooltipTrigger render={<span tabIndex={0} />}><HostStatus runtime={hostRegistry.get(hostId)} showDetails={false} compact /></TooltipTrigger><TooltipContent>{hostRegistry.get(hostId).reason ?? hostRegistry.get(hostId).warning ?? hostRegistry.list().find(host => host.hostId === hostId)?.origin}</TooltipContent></Tooltip></div>;
}

export function HostExplorer({ onAddToChat, hostId, documentPath, isFileDirty, onOpen, onFileAction, onCreate, createdDocumentFocus, disabled }: { onAddToChat?(path: string, returnFocus: HTMLElement): void; onCreate(client: HostClient, path: string, root?: string): Promise<string>; createdDocumentFocus?(): HTMLElement | null; hostId: string; documentPath: string; isFileDirty(path: string): boolean; onOpen(path: string): Promise<void>; onFileAction: FileActionHandler; disabled: boolean }) {
  useTranslation();
  const client = getHostClient(hostId);
  const [problem, setProblem] = useState("");
  const [picker, setPicker] = useState(false);
  const [creation, setCreation] = useState<{ open: boolean; kind: "file" | "folder"; directory: string; client: HostClient }>();
  const createReturn = useRef<HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const request = useCallback(async <T,>(route: string): Promise<T> => {
    const response = await client.request(route);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result as T;
  }, [client]);
  // FolderDialog resets on places changes; tree refreshes must not reset its navigation.
  const browse = useCallback((path: string) => request<FolderBrowseResponse>(`/api/folder-browse?${new URLSearchParams({ path })}`), [request]);
  const places = useCallback(() => request<FolderPlacesResponse>("/api/folder-places").then(value => value.places), [request]);
  const folders = useFolderTrees((root, path, background) => request<FolderResponse>(`/api/folder?${new URLSearchParams({ root, ...(path ? { path } : {}), ...(background ? { background: "1" } : {}) })}`), setProblem, undefined, hostId);
  function beginCreate(kind: "file" | "folder", root: string, button: HTMLElement, path?: string) {
    if (disabled) return;
    createReturn.current = button;
    setCreation({ open: true, kind, directory: path ?? folderChain(root, documentPath).at(-1) ?? root, client });
  }
  async function createFolder(parent: string, name: string, requestClient = client): Promise<string> {
    try {
      const response = await requestClient.request("/api/folder", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent, name }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.path !== "string") throw new Error(result.error ?? `HTTP ${response.status}`);
      folders.refresh(parent);
      folders.reveal(result.path);
      return "";
    } catch (cause) { return messageOf(cause); }
  }
  return <HostContext.Provider value={hostId}><section aria-label={hostLabel(hostId)} data-host-id={hostId} onContextMenu={event => event.stopPropagation()}>
    <HostHeading hostId={hostId} />
    {!folders.trees.length ? <div className="sidebar-empty"><Button className="w-full justify-start" size="sm" variant="ghost" disabled={disabled} onClick={event => { returnFocus.current = event.currentTarget; setPicker(true); }}><FolderOpen />{i18n.t("Open folder…")}</Button></div> : null}
    {problem ? <p role="alert">{problem}</p> : null}
    {folders.trees.map(tree => <FolderTree key={tree.root} tree={tree} onAddToChat={onAddToChat} documentPath={documentPath}
      isFileDirty={isFileDirty} fileActionsDisabled={disabled}
      onFileAction={async (...args) => { const result = await onFileAction(...args); folders.refreshParents(args[2].path); return result; }}
      onNew={(button, path) => beginCreate("file", tree.root, button, path)}
      onNewFolder={(button, path) => beginCreate("folder", tree.root, button, path)}
      onToggleFolder={path => folders.toggle(tree.root, path)} onToggleSection={() => folders.toggleSection(tree.root)}
      onOpenDocument={path => void onOpen(path)}
      onOpenFolder={button => { returnFocus.current = button; setPicker(true); }}
      onRefresh={() => folders.refreshRoot(tree.root)} onClose={() => folders.close(tree.root)} />)}
    {creation ? <NewDialog open={creation.open} kind={creation.kind} busy={disabled} directory={creation.directory}
      destinations={newDestinations(folders.trees)} returnFocus={createReturn} createdFocusTarget={creation.kind === "file" ? createdDocumentFocus : undefined}
      onCreate={async (directory, name) => {
        if (creation.kind === "folder") return createFolder(directory, name, creation.client);
        const path = childPath(directory, name);
        const message = await onCreate(creation.client, path, folders.rootOf(path));
        if (!message) { folders.refreshParents(path); folders.reveal(path); }
        return message;
      }} onClose={() => setCreation({ ...creation, open: false })} /> : null}
    <FolderDialog onCreateFolder={createFolder} open={picker} recent={[]} returnFocus={returnFocus} initialPath={folders.roots.at(-1) ?? ""} browse={browse} places={places} onOpen={async path => { try { folders.open(await request<FolderResponse>(`/api/folder?${new URLSearchParams({ root: path })}`), ""); return ""; } catch (cause) { return String(cause); } }} onClose={() => setPicker(false)} />
  </section></HostContext.Provider>;
}
