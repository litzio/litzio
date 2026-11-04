import { startHttpHost } from "../../server/http-host.ts";

export const ORIGIN = "http://127.0.0.1";
/** Transport adapter for existing integration cases; exercises the actual HTTP Host. */
export function createTestHttpHost(editorDir: string) {
  const host = startHttpHost({ roots: [], editorDir, port: 0 });
  return Object.assign(async (request: Request) => {
    const { url } = await host;
    const route = new URL(request.url);
    return fetch(url + route.pathname + route.search, { method: request.method,
      headers: { ...Object.fromEntries(request.headers), Origin: url },
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: await request.text() }) });
  }, { close: async () => (await host).close() });
}
