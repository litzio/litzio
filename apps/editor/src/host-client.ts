import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";
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
class HostProtocolMismatch extends Error {}

export type HostRuntime = {
  client: HostClient;
  state: "connecting" | "connected" | "disconnected";
  warning?: string;
  reason?: string;
  failure?: "protocol-mismatch" | "unreachable";
  identity?: { runAs: string };
  capabilities?: { fileDeletion: "trash" | "permanent" };
};
/** A registry can be injected in fixtures; unknown identities fail closed. */
export function createHostRegistry(hosts: readonly { hostId: string; origin: string; label?: string }[]) {
  const listeners = new Set<() => void>();
  let revision = 0;
  const notify = () => { revision++; for (const listener of listeners) listener(); };
  const entries = new Map(hosts.map(host => [host.hostId, { ...host, label: host.label ?? host.hostId }]));
  const productVersions = new Map<string, string>();
  const attempts = new Map<string, object>();
  const runtimes = new Map<string, HostRuntime>();
  for (const host of hosts) {
    if (runtimes.has(host.hostId)) throw new Error(`Duplicate Host: ${host.hostId}`);
    runtimes.set(host.hostId, { client: createHostClient(host.origin), state: "connecting" });
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
    list: () => [...entries.values()].map(host => ({ ...host })),
    add(hostId: string, origin: string, label = hostId) {
      const previous = entries.get(hostId);
      if (previous && previous.origin !== origin) throw new Error("A registered Host origin cannot change.");
      entries.set(hostId, { hostId, origin, label });
      if (!runtimes.has(hostId)) {
        const client = createHostClient(origin);
        runtimes.set(hostId, { client: { ...client, assertCurrent() {
          if (runtimes.get(hostId)?.state !== "connected") throw new Error("Host is not connected.");
        }, async request(path, init) { this.assertCurrent(); return client.request(path, init); } }, state: "connecting" });
      }
      if (!previous || previous.label !== label) notify();
    },
    remove(hostId: string) { attempts.delete(hostId); runtimes.delete(hostId); entries.delete(hostId); productVersions.delete(hostId); notify(); },
    get(hostId: string): HostRuntime {
      const runtime = runtimes.get(hostId);
      if (!runtime) throw new Error(`Unavailable Host: ${hostId}`);
      return runtime;
    },
    async connect(hostId: string, productVersion?: string, background = false): Promise<void> {
      const runtime = this.get(hostId);
      if (productVersion !== undefined) productVersions.set(hostId, productVersion);
      productVersion ??= productVersions.get(hostId);
      // An attempt token prevents a late reply overwriting a newer observation.
      const attempt = {};
      attempts.set(hostId, attempt);
      if (!background || runtime.state !== "connected") runtime.state = "connecting";
      const client = runtime.client;
      runtime.warning = undefined;
      runtime.reason = undefined;
      runtime.failure = undefined;
      notify();
      try {
        const request = (path: string, headers?: HeadersInit) => {
          const init = { headers, redirect: "error" as const, signal: AbortSignal.timeout(5000) };
          return hostId === LOCAL_HOST_ID ? client.request(path, init) : fetch(client.url(path), init);
        };
        if (productVersion !== undefined) {
          const health = await request("/daemon/health", { "X-Litzio-Protocol": DAEMON_PROTOCOL });
          if (health.status === 409) throw new HostProtocolMismatch("Host protocol mismatch.");
          if (!health.ok) throw new Error(`HTTP ${health.status}`);
          const body = await health.json();
          if (body.protocolVersion !== DAEMON_PROTOCOL) throw new HostProtocolMismatch("Host protocol mismatch.");
          if (typeof body.productVersion !== "string") throw new Error("Invalid health response.");
          if (attempts.get(hostId) !== attempt) return;
          if (body.productVersion !== productVersion) runtime.warning = `Host product ${body.productVersion}, client ${productVersion}`;
        }
        const response = await request("/api/host-capabilities");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (attempts.get(hostId) !== attempt) return;
        runtime.capabilities = { fileDeletion: body.fileDeletion === "trash" ? "trash" : "permanent" };
        runtime.identity = typeof body.identity?.runAs === "string" && body.identity.runAs.trim() ? { runAs: body.identity.runAs } : undefined;
        runtime.state = "connected";
      } catch (error) { if (attempts.get(hostId) === attempt) {
        runtime.state = "disconnected";
        runtime.capabilities = undefined;
        runtime.identity = undefined;
        runtime.failure = error instanceof HostProtocolMismatch ? "protocol-mismatch" : "unreachable";
        runtime.reason = error instanceof Error ? error.message : String(error);
      } }
      if (attempts.get(hostId) === attempt) notify();
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

/** Observe the local Host and registered remotes; never replay writes or control daemons. */
export function monitorDesktopHosts(hosts: readonly { hostId: string; origin: string; label?: string }[], productVersion: string, interval = 5000) {
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const local = hostRegistry.list().find(host => host.hostId === LOCAL_HOST_ID)!;
  for (const host of [local, ...hosts.filter(host => host.hostId !== LOCAL_HOST_ID)]) {
    hostRegistry.add(host.hostId, host.origin, host.label);
    const check = async () => {
      try { hostRegistry.get(host.hostId); } catch { return; }
      await hostRegistry.connect(host.hostId, productVersion, true);
      if (!stopped) {
        const timer = setTimeout(() => { timers.delete(timer); void check(); }, interval);
        timers.add(timer);
      }
    };
    void check();
  }
  return () => { stopped = true; for (const timer of timers) clearTimeout(timer); };
}
