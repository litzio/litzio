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

let client = createHostClient("/");
// The screen mounts immediately. Initial Host work waits until main verifies a daemon.
let release: (() => void) | undefined;
const ready = typeof window !== "undefined" && window.litzioDesktop
  ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve();
export function setDesktopHost(url: string): void {
  client = createHostClient(url);
  release?.();
}
export const hostClient = {
  url: (path: string) => client.url(path),
  async request(path: string, init?: RequestInit): Promise<Response> {
    await ready;
    return fetch(this.url(path), init);
  },
};
