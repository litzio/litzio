import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readRequestBody } from "./request-body.ts";

export const DAEMON_PROTOCOL = "1";
export type DaemonIdentity = { pid: number; startedAt: string; instanceId: string };
export type DaemonHealth = DaemonIdentity & { productVersion: string; protocolVersion: string };
export type DaemonAuth = { token: string; health: DaemonHealth; stop(): void };
const bootstrap = `const token=location.hash.slice(1);history.replaceState(null,'','/daemon/login');
fetch('/daemon/session',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Litzio-Protocol':'${DAEMON_PROTOCOL}','Content-Type':'application/json'},body:'{}'})
.then(r=>{if(!r.ok)throw Error('Daemon authentication or protocol failed');location.replace('/')}).catch(e=>document.body.textContent=e.message);`;

export const sameInstance = (a: DaemonIdentity, b: DaemonIdentity) => a.pid === b.pid && a.startedAt === b.startedAt && a.instanceId === b.instanceId;
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function reply(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data));
}

/** Called after Host/Origin/body checks, before every static, media or API route. */
export async function daemonRequest(req: IncomingMessage, res: ServerResponse, url: URL, auth: DaemonAuth, endpoint: string): Promise<boolean> {
  // Cookies are scoped by hostname, never TCP port. Keep concurrent channel/manual listeners independent.
  const cookieName = `litzio-daemon-v${auth.health.protocolVersion}-${createHash("sha256").update(endpoint).digest("hex").slice(0, 16)}`;
  if (req.method === "GET" && url.pathname === "/daemon/login") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end('<!doctype html><title>Litzio daemon</title><body>Connecting…<script src="/daemon/login.js"></script>'); return true;
  }
  if (req.method === "GET" && url.pathname === "/daemon/login.js") {
    res.setHeader("Content-Type", "text/javascript"); res.end(bootstrap); return true;
  }
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const cookie = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? "";
  const authorizedBearer = equal(bearer, auth.token);
  if (!authorizedBearer && !equal(cookie, auth.token)) { reply(res, 401, { error: "Daemon authentication required." }); return true; }
  if ((authorizedBearer || req.headers["x-litzio-protocol"] !== undefined) && req.headers["x-litzio-protocol"] !== auth.health.protocolVersion) {
    reply(res, 409, { error: "Daemon protocol mismatch. Stop with the CLI version matching the running daemon, or Ctrl+C in its foreground terminal; then start the desired version. Do not kill by PID alone.", protocolVersion: auth.health.protocolVersion }); return true;
  }
  if (!url.pathname.startsWith("/daemon/")) return false;
  if (url.pathname === "/daemon/health" && req.method === "GET") { reply(res, 200, auth.health); return true; }
  if (url.pathname === "/daemon/session" && req.method === "POST" && authorizedBearer) {
    res.setHeader("Set-Cookie", `${cookieName}=${auth.token}; HttpOnly; SameSite=Strict; Path=/${new URL(endpoint).protocol === "https:" ? "; Secure" : ""}`);
    reply(res, 200, { authenticated: true }); return true;
  }
  if (url.pathname === "/daemon/stop" && req.method === "POST" && authorizedBearer) {
    let body: unknown;
    try { body = JSON.parse((await readRequestBody(req, 4096)).toString("utf8")); }
    catch { reply(res, 400, { error: "Expected bounded JSON stop request." }); return true; }
    if (!body || typeof body !== "object" || !sameInstance(body as DaemonIdentity, auth.health) || !("confirm" in body) || body.confirm !== true) {
      reply(res, 409, { error: "Instance identity and explicit confirmation required; other clients/jobs may be interrupted." }); return true;
    }
    reply(res, 200, { stopping: auth.health }); setImmediate(auth.stop); return true;
  }
  reply(res, 404, { error: "Unknown daemon operation." }); return true;
}
