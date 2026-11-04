/** HTTP Host address boundary. Paths here belong to the Host, never the UI bundle.
 * Document URIs are resolved by renderers only; do not store these URLs in documents.
 */
export function createHostClient(base: string) {
  const prefix = base.replace(/\/$/, "");
  return {
    url(path: string): string {
      return `${prefix}/${path.replace(/^\//, "")}`;
    },
    request(path: string, init?: RequestInit): Promise<Response> {
      return fetch(this.url(path), init);
    },
  };
}

// Step ④ keeps the serving origin. Desktop supplies its daemon address in step ⑤.
export const hostClient = createHostClient("/");
