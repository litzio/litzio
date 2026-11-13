import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";
import { createHostClient, HostConnectionChangedError, type HostClient } from "./host-transport.ts";
export { createHostClient, HostConnectionChangedError, type HostClient } from "./host-transport.ts";

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
/** One observed connection; requests and sessions keep their captured immutable client. */
export function createHostConnection(client = createHostClient("/")) {
  const listeners = new Set<() => void>();
  let revision = 0;
  const notify = () => { revision++; for (const listener of listeners) listener(); };
  const runtime: HostRuntime = { client, state: "connecting" };
  let productVersion: string | undefined;
  let attempt: object;
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot: () => revision,
    get: () => runtime,
    async connect(version?: string, background = false): Promise<void> {
      productVersion = version ?? productVersion;
      const expectedProduct = productVersion;
      const current = attempt = {};
      if (!background || runtime.state !== "connected") runtime.state = "connecting";
      const client = runtime.client;
      runtime.warning = undefined;
      runtime.reason = undefined;
      runtime.failure = undefined;
      notify();
      try {
        const request = (path: string, headers?: HeadersInit) => client.request(path, {
          headers, redirect: "error", signal: AbortSignal.timeout(5000),
        });
        if (expectedProduct !== undefined) {
          const health = await request("/daemon/health", { "X-Litzio-Protocol": DAEMON_PROTOCOL });
          if (health.status === 409) throw new HostProtocolMismatch("Host protocol mismatch.");
          if (!health.ok) throw new Error(`HTTP ${health.status}`);
          const body = await health.json();
          if (body.protocolVersion !== DAEMON_PROTOCOL) throw new HostProtocolMismatch("Host protocol mismatch.");
          if (typeof body.productVersion !== "string") throw new Error("Invalid health response.");
          if (attempt !== current) return;
          if (body.productVersion !== expectedProduct) runtime.warning = `Host product ${body.productVersion}, client ${expectedProduct}`;
        }
        const response = await request("/api/host-capabilities");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (attempt !== current) return;
        runtime.capabilities = { fileDeletion: body.fileDeletion === "trash" ? "trash" : "permanent" };
        runtime.identity = typeof body.identity?.runAs === "string" && body.identity.runAs.trim() ? { runAs: body.identity.runAs } : undefined;
        runtime.state = "connected";
      } catch (error) { if (attempt === current) {
        runtime.state = "disconnected";
        runtime.capabilities = undefined;
        runtime.identity = undefined;
        runtime.failure = error instanceof HostProtocolMismatch ? "protocol-mismatch" : "unreachable";
        runtime.reason = error instanceof Error ? error.message : String(error);
      } }
      if (attempt === current) notify();
    },
  };
}
export let hostConnection = createHostConnection();
/** Inject the same single-connection contract before mounting browser fixtures. */
export function setHostConnection(connection: ReturnType<typeof createHostConnection>): void { hostConnection = connection; }

let release: ((client: HostClient) => void) | undefined;
const desktopReady = typeof window !== "undefined" && window.litzioDesktop
  ? new Promise<HostClient>(resolve => { release = resolve; }) : Promise.resolve(createHostClient("/"));
// Local startup waits for Desktop's verified address.

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
hostConnection.get().client = bindLocalConnection();
export function setDesktopHost(origin: string): void {
  connectedLocal = createHostClient(origin);
  release?.(connectedLocal);
  hostConnection.get().client = bindLocalConnection();
  void hostConnection.connect();
}
export const getHostClient = (): HostClient => hostConnection.get().client;


/** Observe the local connection using reads only; never replay writes or control daemons. */
export function monitorDesktopHost(productVersion: string, interval = 5000) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connection = hostConnection;
  const check = async () => {
    await connection.connect(productVersion, true);
    if (!stopped) timer = setTimeout(check, interval);
  };
  void check();
  return () => { stopped = true; clearTimeout(timer); };
}
