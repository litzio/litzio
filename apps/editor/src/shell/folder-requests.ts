import { type HostClient, getHostClient } from "../host-client.ts";
import type { DocumentErrorResponse, FolderBrowseResponse, FolderCreateRequest, FolderCreateResponse, FolderPlace, FolderPlacesResponse, FolderResponse } from "../../shared/document-protocol.ts";
import { isScreenPath } from "../views/screen-path.ts";
import { splitDocumentPath } from "./document-path.ts";

/** Asks the Host for one level of a folder inside the folder the user chose. */
export async function requestFolder(root: string, path?: string, background = false, client: HostClient = getHostClient(), signal?: AbortSignal): Promise<FolderResponse> {
  const query = new URLSearchParams({ root, ...(path ? { path } : {}), ...(background ? { background: "1" } : {}) });
  const response = await client.request(`/api/folder?${query}`, { signal });
  const payload = (await response.json()) as Partial<FolderResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.entries)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload as FolderResponse;
}

/** Browses one level inside opened folders only, with crumbs that stop at the containing root. */
export async function browseInsideRoots(roots: readonly string[], path: string, client: HostClient = getHostClient(), signal?: AbortSignal): Promise<FolderBrowseResponse> {
  const root = roots.find(root => isScreenPath(path, [root], true));
  if (!root) throw new Error("Path is outside the allowed folders.");
  const reply = await requestFolder(root, path, false, client, signal);
  const crumbs: FolderBrowseResponse["crumbs"] = [];
  let current = reply.path;
  while (isScreenPath(current, [root], true)) {
    const trimmed = current.replace(/(?<=.)[\\/]+$/, "");
    crumbs.unshift({ name: splitDocumentPath(trimmed).name || current, path: current });
    if (!isScreenPath(current, [root])) break;
    const parent = splitDocumentPath(trimmed).directory;
    if (parent === current) break;
    current = parent;
  }
  return { path: reply.path, crumbs, entries: reply.entries.filter(entry => isScreenPath(entry.path, [root])) };
}

/** Asks the Host for one level of any folder while choosing which folder to open, or an image. */
export async function browseHostFolder(path: string, files?: "image" | "pdf", client = getHostClient()): Promise<FolderBrowseResponse> {
  const response = await client.request(`/api/folder-browse?${new URLSearchParams({ path, ...(files ? { files } : {}) })}`);
  const payload = (await response.json()) as Partial<FolderBrowseResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.entries) || !Array.isArray(payload.crumbs)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload as FolderBrowseResponse;
}

/** Asks the Host to create one folder inside an existing one. */
export async function requestCreateFolder(parent: string, name: string, client = getHostClient()): Promise<FolderCreateResponse> {
  const response = await client.request(`/api/folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parent, name } satisfies FolderCreateRequest),
  });
  const payload = (await response.json()) as Partial<FolderCreateResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || typeof payload.path !== "string") throw new Error(payload.error ?? `request failed (${response.status})`);
  return { path: payload.path };
}

/** Asks the Host where choosing a folder can start. */
export async function folderPlaces(client = getHostClient()): Promise<FolderPlace[]> {
  const response = await client.request(`/api/folder-places`);
  const payload = (await response.json()) as Partial<FolderPlacesResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.places)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload.places;
}
