export class HostConnectionChangedError extends Error {
  readonly code = "host-connection-changed";
  constructor() { super("The Host connection changed. This operation belongs to the previous connection; reopen it explicitly."); }
}

export type HostClient = ReturnType<typeof createHostClient>;
/** Immutable address boundary. Never persists Host URLs in document content. */
export function createHostClient(base: string, ready: Promise<void> = Promise.resolve()) {
  const prefix = base.replace(/\/$/, "");
  const url = (path: string) => `${prefix}/${path.replace(/^\//, "")}`;
  return {
    url,
    assertCurrent() { /* Immutable registered origin. */ },
    get crossOrigin(): "anonymous" | undefined {
      return typeof window !== "undefined" && new URL(url("/"), window.location.href).origin !== window.location.origin ? "anonymous" : undefined;
    },
    async request(path: string, init?: RequestInit): Promise<Response> {
      await ready;
      return fetch(url(path), init);
    },
  };
}
