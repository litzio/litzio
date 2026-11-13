import { remoteHostOrigin } from "../../editor/server/remote-host-registry.ts";
import { trustedDesktopUrl } from "../../editor/shared/desktop-origin.ts";
import { CONTENT_SECURITY_POLICY, serveEditorFile } from "../../editor/server/editor-static.ts";

/** Only packaged static files. Host APIs and document media never pass through this scheme. */
export function bundledUiResponse(directory: string, request: Request, hostUrl: string, remoteOrigins: readonly string[] = []): Response {
  if (!trustedDesktopUrl(request.url)) return new Response(null, { status: 403 });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
  const sources = [hostUrl, ...remoteOrigins].map(remoteHostOrigin).join(" ");
  const url = new URL(request.url);
  const response = serveEditorFile(directory, url.pathname);
  // App scripts and blob plugin modules run locally; fetches/images target registered Hosts.
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY
    .replace("connect-src 'self'", `connect-src 'self' ${sources}`)
    .replace("img-src 'self' data: blob:", `img-src 'self' data: blob: ${sources}`));
  return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
}
