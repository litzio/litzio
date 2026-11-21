import type { HostClient } from "../host-client.ts";
import type { FileAction } from "./FileActionDialog.tsx";
import type { FileIdentity, FileOperationResponse, FolderTrashConfirmation, FolderTrashResult, RenameFileRequest } from "../../shared/file-operations.ts";
import { i18n, type MessageKey } from "../i18n.ts";
import { splitDocumentPath } from "./document-path.ts";

/**
 * Host requests for Rename, Delete, folder Trash and creation Undo, and how their replies read.
 * Every value is captured by the caller when the action starts (client, root, path, revision,
 * identity); nothing here reads tabs, sessions or the active tab, so a reply belongs to the
 * target the action started with.
 */

/** Asks the Host for the current revision of a file an earlier creation receipt names, without deleting it. */
export async function checkCreatedFile(client: HostClient, root: string, path: string, identity: FileIdentity): Promise<string> {
  const check = await client.request(`/api/file`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root, path, checkOnly: true, expectedIdentity: identity }) });
  const state = await check.json();
  if (!check.ok || typeof state.revision !== "string") throw new Error(state.error ?? "Could not check file.");
  return state.revision;
}

export type FileActionRequest = {
  action: FileAction; root: string; path: string;
  /** Folder Trash: the confirmed folder state and this window's tabs inside it. */
  folder?: { confirmation?: FolderTrashConfirmation; openDocuments: string[]; cleanupPaths: string[] };
  /** Creation Undo: the revision just checked and the receipt's identity. */
  created?: { revision: string; identity?: FileIdentity };
  /** Rename: the new stem and this window's dirty documents. */
  rename?: { name?: string; openDocuments: NonNullable<RenameFileRequest["openDocuments"]> };
  /** Image rename from a Figure form: that form's own document. */
  figureDocument?: NonNullable<RenameFileRequest["figureDocument"]>;
};

export type FileActionResult = Partial<Omit<FileOperationResponse, "path">> & Partial<Pick<FolderTrashResult, "unsavedDocuments" | "containedPaths">> & {
  path?: unknown; error?: string; references?: string[];
};
export type FileActionReply = { ok: boolean; status: number; result: FileActionResult };

/** Sends one file action. A lost folder Trash or image rename reply leaves files uncertain, so it says so. */
export async function requestFileAction(client: HostClient, request: FileActionRequest): Promise<FileActionReply> {
  const { action, root, path, folder, created, rename, figureDocument } = request;
  const interrupted = (cause: unknown): never => {
    if (folder) throw new Error(i18n.t("The Trash operation did not complete reliably. Some items may have moved. Check the source folder and OS Trash before trying again."));
    if (figureDocument) throw new Error(i18n.t("The image rename response was interrupted. Files may have changed. Keep your edits and check the files before Reloading."));
    throw cause;
  };
  const response = await client.request(folder ? "/api/folder-trash" : `/api/file`, {
    method: folder ? "POST" : action === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ root, path,
      ...(folder ? { expectedIdentity: folder.confirmation?.identity, expectedRevision: folder.confirmation?.revision, openDocuments: folder.openDocuments, cleanupPaths: folder.cleanupPaths } : {}),
      ...(created ? { expectedRevision: created.revision, expectedIdentity: created.identity } : {}),
      ...(action === "rename" && rename ? { name: rename.name, openDocuments: rename.openDocuments } : {}),
      ...(figureDocument ? { figureDocument } : {}) }),
  }).catch(interrupted);
  const result: FileActionResult = await response.json().catch(interrupted);
  return { ok: response.ok, status: response.status, result };
}

/** The Host refused because these documents must be saved first. */
export function saveFirstRefusal(result: FileActionResult, folder: boolean): Error | undefined {
  if (folder && result.unsavedDocuments?.length) return new Error(i18n.t("Save these documents before moving the folder to Trash: {{documents}}", { documents: result.unsavedDocuments.map(path => splitDocumentPath(path).name).join(", ") }));
  if (Array.isArray(result.references)) return new Error(i18n.t("Save these documents before renaming the image: {{documents}}", { documents: result.references.join(", ") }));
  return undefined;
}

/** The operation did not complete: the Host's own message, or the status. */
export function fileActionFailure({ ok, status, result }: FileActionReply): Error | undefined {
  if (ok && typeof result.path === "string") return undefined;
  return new Error(result.error ? i18n.t(result.error as MessageKey) : `File operation failed (${status})`);
}

/** Paths the Host verified inside a trashed folder; only these tabs close. */
export function trashedPaths(result: FileActionResult): string[] {
  return Array.isArray(result.containedPaths) ? result.containedPaths.filter((path: unknown): path is string => typeof path === "string") : [];
}
