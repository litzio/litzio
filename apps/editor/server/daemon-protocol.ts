import { hostIdentity } from "./host-identity.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readRequestBody } from "./request-body.ts";

// v4 requires assistant routes and permissionMode; v3 daemons expose the old API.
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";
export { DAEMON_PROTOCOL };
export type DaemonIdentity = { pid: number; startedAt: string; instanceId: string };
export type DaemonLauncher = "desktop" | "cli-start" | "cli-run";
export type DaemonDetails = { processStartedAt: string; daemonHome: string; executable: string; log?: string; roots: readonly string[]; nonLoopback: boolean };
export type DaemonHealth = DaemonIdentity & DaemonDetails & { launcher: DaemonLauncher; productVersion: string; protocolVersion: string; identity?: { runAs: string } };
export type DaemonControl = { health: DaemonHealth; stop(): void };
export const sameInstance = (a: DaemonIdentity, b: DaemonIdentity) => a.pid === b.pid && a.startedAt === b.startedAt && a.instanceId === b.instanceId;
function reply(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data));
}

/** Called after Host/Origin/body checks, before every static, media or API route. */
export async function daemonRequest(req: IncomingMessage, res: ServerResponse, url: URL, control: DaemonControl): Promise<boolean> {
  const protocol = req.headers["x-litzio-protocol"];
  const operation = url.pathname === "/daemon/health" || url.pathname === "/daemon/stop";
  if ((operation || protocol !== undefined) && protocol !== control.health.protocolVersion) {
    reply(res, 409, { error: "Daemon protocol mismatch. Stop with the CLI version matching the running daemon, or Ctrl+C in its foreground terminal; then start the desired version. Do not kill by PID alone.", protocolVersion: control.health.protocolVersion }); return true;
  }
  if (!url.pathname.startsWith("/daemon/")) return false;
  if (url.pathname === "/daemon/health" && req.method === "GET") { reply(res, 200, { ...control.health, identity: hostIdentity() }); return true; }
  if (url.pathname === "/daemon/stop" && req.method === "POST") {
    let body: unknown;
    try { body = JSON.parse((await readRequestBody(req, 4096)).toString("utf8")); }
    catch { reply(res, 400, { error: "Expected bounded JSON stop request." }); return true; }
    if (!body || typeof body !== "object" || !sameInstance(body as DaemonIdentity, control.health) || !("confirm" in body) || body.confirm !== true) {
      reply(res, 409, { error: "Instance identity and explicit confirmation required; other clients/jobs may be interrupted." }); return true;
    }
    reply(res, 200, { stopping: control.health }); setImmediate(control.stop); return true;
  }
  reply(res, 404, { error: "Unknown daemon operation." }); return true;
}
