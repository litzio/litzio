import { HostStatus } from "../components/HostStatus.tsx";
import { i18n } from "../i18n.ts";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip.tsx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hostRegistry, hostLabel, getHostClient } from "../host-client.ts";
import { useFolderTrees } from "./folder-tree.ts";
import { FolderTree } from "./Sidebar.tsx";
import { FolderDialog } from "./FolderDialog.tsx";
import type { FileActionHandler } from "./FileActionDialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { HostContext } from "../host-context.tsx";
import type { FolderResponse, FolderBrowseResponse, FolderPlacesResponse } from "../../shared/document-protocol.ts";
import { FolderOpen } from "lucide-react";

export function HostHeading({ hostId }: { hostId: string }) {
  useTranslation();
  useSyncExternalStore(hostRegistry.subscribe, hostRegistry.snapshot, hostRegistry.snapshot);
  useEffect(() => { void hostRegistry.connect(hostId); }, [hostId]);
  return <div className="host-heading"><span className="sidebar-tree-name">{hostLabel(hostId)}</span><Tooltip><TooltipTrigger render={<span tabIndex={0} />}><HostStatus runtime={hostRegistry.get(hostId)} showDetails={false} compact /></TooltipTrigger><TooltipContent>{hostRegistry.get(hostId).reason ?? hostRegistry.get(hostId).warning ?? hostRegistry.list().find(host => host.hostId === hostId)?.origin}</TooltipContent></Tooltip></div>;
}

export function HostExplorer({ hostId, documentPath, isFileDirty, onOpen, onFileAction, disabled }: { hostId: string; documentPath: string; isFileDirty(path: string): boolean; onOpen(path: string): Promise<void>; onFileAction: FileActionHandler; disabled: boolean }) {
  useTranslation();
  const client = getHostClient(hostId);
  const [problem, setProblem] = useState("");
  const [picker, setPicker] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  async function request<T>(route: string): Promise<T> {
    const response = await client.request(route);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result as T;
  }
  const folders = useFolderTrees((root, path, background) => request<FolderResponse>(`/api/folder?${new URLSearchParams({ root, ...(path ? { path } : {}), ...(background ? { background: "1" } : {}) })}`), setProblem, undefined, hostId);
  return <HostContext.Provider value={hostId}><section aria-label={hostLabel(hostId)} data-host-id={hostId} onContextMenu={event => event.stopPropagation()}>
    <HostHeading hostId={hostId} />
    {!folders.trees.length ? <div className="sidebar-empty"><Button className="w-full justify-start" size="sm" variant="ghost" disabled={disabled} onClick={event => { returnFocus.current = event.currentTarget; setPicker(true); }}><FolderOpen />{i18n.t("Open folder…")}</Button></div> : null}
    {problem ? <p role="alert">{problem}</p> : null}
    {folders.trees.map(tree => <FolderTree key={tree.root} tree={tree} documentPath={documentPath} isFileDirty={isFileDirty} fileActionsDisabled={disabled} onFileAction={async (...args) => { const result = await onFileAction(...args); folders.refreshParents(args[2].path); return result; }} onToggleFolder={path => folders.toggle(tree.root, path)} onToggleSection={() => folders.toggleSection(tree.root)} onOpenDocument={path => void onOpen(path)} onOpenFolder={() => setPicker(true)} onRefresh={() => folders.refreshRoot(tree.root)} onClose={() => folders.close(tree.root)} />)}
    <FolderDialog open={picker} recent={[]} returnFocus={returnFocus} initialPath={folders.roots.at(-1) ?? ""} browse={path => request<FolderBrowseResponse>(`/api/folder-browse?${new URLSearchParams({ path })}`)} places={() => request<FolderPlacesResponse>("/api/folder-places").then(value => value.places)} onOpen={async path => { try { folders.open(await request<FolderResponse>(`/api/folder?${new URLSearchParams({ root: path })}`), ""); return ""; } catch (cause) { return String(cause); } }} onClose={() => setPicker(false)} />
  </section></HostContext.Provider>;
}
