import type { AuthoredDocumentRequest } from "@litzio/plugin-sdk";
import type { DocumentCreationReceipt } from "../../server/document-create.ts";
import type { HostClient } from "../host-client.ts";

export type ScreenDocumentInput = {
  name: string;
  authoring: AuthoredDocumentRequest["authoring"];
  images?: AuthoredDocumentRequest["images"];
  folder?: string;
  open?: boolean;
};

/** UI scope only; construction and exclusive publication belong to the common Host operation. */
export async function saveScreenDocument(client: HostClient, roots: string[], input: ScreenDocumentInput, signal?: AbortSignal): Promise<DocumentCreationReceipt> {
  signal?.throwIfAborted();
  client.assertCurrent();
  if (!input.authoring || typeof input.authoring !== "object") throw new Error("Document authoring input is required.");
  const folder = input.folder ?? roots[0];
  if (!folder || !roots.includes(folder)) throw new Error("Open a folder on this screen's Host before saving a document.");
  if (typeof input.name !== "string" || !input.name.trim() || /[\\/:\x00-\x1f]/.test(input.name) || !input.name.endsWith(".md")) throw new Error("Use a .md filename without directory separators.");
  const response = await client.request("/api/document", {
    method: "PUT", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ path: `${folder.replace(/[\\/]$/, "")}/${input.name}`, authoring: input.authoring, images: input.images }),
  });
  const reply = await response.json();
  if (!response.ok || reply.error) throw new Error(reply.error ?? `HTTP ${response.status}`);
  return reply;
}
