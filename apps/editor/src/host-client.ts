import { LOCAL_HOST_ID } from "./host-locator.ts";

export type HostClient = ReturnType<typeof createHostClient>;
/** Immutable address boundary. Never persists Host URLs in document content. */
export function createHostClient(base: string, ready: Promise<void> = Promise.resolve()) {
  const prefix = base.replace(/\/$/, "");
  const url = (path: string) => `${prefix}/${path.replace(/^\//, "")}`;
  return {
    url,
    get crossOrigin(): "anonymous" | undefined {
      return typeof window !== "undefined" && new URL(url("/"), window.location.href).origin !== window.location.origin ? "anonymous" : undefined;
    },
    async request(path: string, init?: RequestInit): Promise<Response> {
      await ready;
      return fetch(url(path), init);
    },
  };
}
export type HostRuntime = {
  client: HostClient;
  state: "connecting" | "connected" | "disconnected";
  capabilities?: { fileDeletion: "trash" | "permanent" };
};
/** A registry can be injected in fixtures; unknown identities fail closed. */
export function createHostRegistry(hosts: readonly { hostId: string; origin: string }[]) {
  const attempts = new Map<string, object>();
  const runtimes = new Map<string, HostRuntime>();
  for (const host of hosts) {
    if (runtimes.has(host.hostId)) throw new Error(`Duplicate Host: ${host.hostId}`);
    runtimes.set(host.hostId, { client: createHostClient(host.origin), state: "connecting" });
  }
  return {
    get(hostId: string): HostRuntime {
      const runtime = runtimes.get(hostId);
      if (!runtime) throw new Error(`Unavailable Host: ${hostId}`);
      return runtime;
    },
    async connect(hostId: string): Promise<void> {
      const runtime = this.get(hostId);
      // An attempt token prevents a late reply overwriting a newer observation.
      const attempt = {};
      attempts.set(hostId, attempt);
      runtime.state = "connecting";
      runtime.capabilities = undefined;
      const client = runtime.client;
      try {
        const response = await client.request("/api/host-capabilities");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (attempts.get(hostId) !== attempt) return;
        runtime.capabilities = { fileDeletion: body.fileDeletion === "trash" ? "trash" : "permanent" };
        runtime.state = "connected";
      } catch { if (attempts.get(hostId) === attempt) runtime.state = "disconnected"; }
    },
  };
}
export const hostRegistry = createHostRegistry([{ hostId: LOCAL_HOST_ID, origin: "/" }]);
let release: ((client: HostClient) => void) | undefined;
const desktopReady = typeof window !== "undefined" && window.litzioDesktop
  ? new Promise<HostClient>(resolve => { release = resolve; }) : Promise.resolve(createHostClient("/"));
// Local startup waits for Desktop's verified address. Other Hosts have no shared gate.
const local = hostRegistry.get(LOCAL_HOST_ID);
let localAddress = "/";
let connectedLocal: HostClient | undefined;
local.client = {
  url: path => createHostClient(localAddress).url(path),
  get crossOrigin() { return createHostClient(localAddress).crossOrigin; },
  async request(path, init) {
    const client = connectedLocal ?? await desktopReady;
    return client.request(path, init);
  },
};
export function setDesktopHost(origin: string): void {
  localAddress = origin;
  connectedLocal = createHostClient(origin);
  release?.(connectedLocal);
  void hostRegistry.connect(LOCAL_HOST_ID);
}
export const getHostClient = (hostId: string): HostClient => hostRegistry.get(hostId).client;
