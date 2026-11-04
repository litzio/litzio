import path from "node:path";
import { ensureS1, s1Request, stopS1 } from "../../editor/server/s1-discovery.ts";
import { browseFolder, folderPlaces } from "../../editor/server/document-api.ts";
import { SECURITY_HEADERS } from "../../editor/server/editor-static.ts";
import { ORIGIN, type FirstDocument } from "./host-protocol.ts";

/** S1 leaves the renderer origin/bridge intact and replaces only the Host transport. */
export async function createS1Proxy(cli: string, first: FirstDocument, version: string, listed: (root: string) => void, log: (message: string) => void) {
  const instance = await ensureS1(cli, version, log);
  if (first.document) await s1Request(instance, "/s1/roots", { path: path.dirname(first.document) });
  for (const sample of Object.values(first.samples ?? {})) await s1Request(instance, "/s1/roots", { path: path.dirname(sample) });
  const local = (data: unknown) => Response.json(data, { headers: SECURITY_HEADERS });
  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.origin !== ORIGIN && `${url.protocol}//${url.host}` !== ORIGIN) return new Response(null, { status: 403 });
    try {
      // The existing folder chooser lists local names. Only the selected root is granted to daemon.
      if (url.pathname === "/api/folder-places" && request.method === "GET") return local(folderPlaces());
      if (url.pathname === "/api/folder-browse" && request.method === "GET") return local(browseFolder(url.searchParams.get("path") ?? undefined, null, url.searchParams.get("files") === "image" ? "image" : url.searchParams.get("files") === "pdf" ? "pdf" : "document"));
      if (url.pathname === "/api/folder" && request.method === "GET" && url.searchParams.get("root")) {
        await s1Request(instance, "/s1/roots", { path: url.searchParams.get("root") });
      }
      if (url.pathname === "/api/document" && request.method === "GET" && !url.searchParams.has("path")) {
        if (!first.document) return local({ start: true, samples: first.samples, sampleProblem: first.sampleProblem });
        url.searchParams.set("path", first.document);
      }
      const headers = new Headers(request.headers);
      headers.delete("host"); headers.delete("cookie"); headers.delete("sec-fetch-site");
      headers.set("Authorization", `Bearer ${instance.token}`); headers.set("Origin", instance.url);
      const response = await fetch(instance.url + url.pathname + url.search, {
        method: request.method, headers,
        ...(["GET", "HEAD"].includes(request.method) ? {} : { body: new Uint8Array(await request.arrayBuffer()) }),
        signal: AbortSignal.timeout(120_000),
      });
      if (url.pathname === "/api/folder" && request.method === "GET" && response.ok) {
        const folder = await response.clone().json(); if (folder.root === folder.path) listed(folder.root);
      }
      return response;
    } catch (error) { log(`S1 proxy failed: ${String(error)}`); return Response.json({ error: String(error) }, { status: 502, headers: SECURITY_HEADERS }); }
  };
  return Object.assign(handle, { close: async () => {
    if (process.env.LITZIO_S1_EXIT === "stop") {
      log("S1 stop-on-exit requested; all other clients and jobs can be interrupted (experiment, not product policy).");
      await stopS1(instance, true);
    } else log("S1 keep-on-exit; daemon remains running.");
  } });
}
