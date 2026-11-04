import { LOCAL_HOST_ID } from "./host-locator.ts";

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
export type HostRuntime = {
  client: HostClient;
  state: "connecting" | "connected" | "disconnected";
  error?: string;
  capabilities?: { fileDeletion: "trash" | "permanent" };
};
/** A registry can be injected in fixtures; unknown identities fail closed. */
export function createHostRegistry(hosts: readonly { hostId: string; origin: string; label?: string }[]) {
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const attempts = new Map<string, object>();
  const runtimes = new Map<string, HostRuntime>();
  for (const host of hosts) {
    if (runtimes.has(host.hostId)) throw new Error(`Duplicate Host: ${host.hostId}`);
    runtimes.set(host.hostId, { client: createHostClient(host.origin), state: "connecting" });
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    list: () => hosts.map(host => ({ ...host, label: host.label ?? host.hostId })),
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
      runtime.error = undefined;
      notify();
      const client = runtime.client;
      try {
        const response = await client.request("/api/host-capabilities");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (attempts.get(hostId) !== attempt) return;
        runtime.capabilities = { fileDeletion: body.fileDeletion === "trash" ? "trash" : "permanent" };
        runtime.state = "connected";
      } catch (cause) { if (attempts.get(hostId) === attempt) { runtime.state = "disconnected"; runtime.error = String(cause); } }
      notify();
    },
  };
}
export let hostRegistry = createHostRegistry([{ hostId: LOCAL_HOST_ID, origin: "/", label: "Local" }]);
/** Inject the same registry contract used by Desktop and browser fixtures before mounting App. */
export function setHostRegistry(registry: ReturnType<typeof createHostRegistry>): void { hostRegistry = registry; }
export function hostLabel(hostId: string): string {
  const hosts = hostRegistry.list();
  const label = hosts.find(host => host.hostId === hostId)?.label ?? hostId;
  return hosts.filter(host => host.label === label).length > 1 ? `${label} (${hostId})` : label;
}
let release: ((client: HostClient) => void) | undefined;
const desktopReady = typeof window !== "undefined" && window.litzioDesktop
  ? new Promise<HostClient>(resolve => { release = resolve; }) : Promise.resolve(createHostClient("/"));
// Local startup waits for Desktop's verified address. Other Hosts have no shared gate.
const local = hostRegistry.get(LOCAL_HOST_ID);
let connectedLocal: HostClient | undefined;
/** A session/receipt keeps its connection. A changed origin invalidates follow-ups. */
function bindLocalConnection(): HostClient {
  const binding = connectedLocal ? Promise.resolve(connectedLocal) : desktopReady;
  let address = connectedLocal;
  void binding.then(client => { address = client; });
  const assertCurrent = () => {
    if (address && connectedLocal && address.url("/") !== connectedLocal.url("/")) throw new HostConnectionChangedError();
  };
  return {
    assertCurrent,
    url: path => (address ?? createHostClient("/")).url(path),
    get crossOrigin() { return address?.crossOrigin; },
    async request(path, init) {
      const client = await binding;
      assertCurrent();
      return client.request(path, init);
    },
  };
}
local.client = bindLocalConnection();
export function setDesktopHost(origin: string): void {
  connectedLocal = createHostClient(origin);
  release?.(connectedLocal);
  hostRegistry.get(LOCAL_HOST_ID).client = bindLocalConnection();
  void hostRegistry.connect(LOCAL_HOST_ID);
}
export const getHostClient = (hostId: string): HostClient => hostRegistry.get(hostId).client;
