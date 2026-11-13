import { getHostClient } from "../host-client.ts";
import type { DocumentErrorResponse, FolderBrowseResponse, FolderCreateRequest, FolderCreateResponse, FolderPlace, FolderPlacesResponse, FolderResponse } from "../../shared/document-protocol.ts";

/** Asks the Host for one level of a folder inside the folder the user chose. */
export async function requestFolder(root: string, path?: string, background = false): Promise<FolderResponse> {
  const query = new URLSearchParams({ root, ...(path ? { path } : {}), ...(background ? { background: "1" } : {}) });
  const response = await getHostClient().request(`/api/folder?${query}`);
  const payload = (await response.json()) as Partial<FolderResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.entries)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload as FolderResponse;
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
