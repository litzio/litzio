// Disposable S1 daemon; not an adopted Host architecture.
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { startHttpHost } from "./http-host.ts";
import { RootAccess } from "./file-access.ts";
import { AiAgentConnection } from "./ai-agent-connection.ts";
import { hostPaths } from "./host-paths.ts";
import { readRequestBody } from "./request-body.ts";
import { s1Directory, readS1, s1Health, s1Request, stopS1, ensureS1, S1_PROTOCOL, type S1Instance } from "./s1-discovery.ts";

const bootstrap = `const token=location.hash.slice(1); history.replaceState(null,'','/s1/login');
fetch('/s1/session',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:'{}'})
.then(r=>{if(!r.ok)throw Error('Authentication failed'); location.replace('/index.html')}).catch(e=>document.body.textContent=e.message);`;
const heartbeat = `const id=crypto.randomUUID(); const ping=()=>fetch('/s1/client',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}).catch(()=>{});
ping();setInterval(ping,5000);addEventListener('pagehide',()=>navigator.sendBeacon('/s1/release',new Blob([JSON.stringify({id})],{type:'application/json'})));`;
declare const __LITZIO_CLI_BUILD__: { version: string };
const productVersion = () => process.env.LITZIO_S1_PRODUCT ?? (typeof __LITZIO_CLI_BUILD__ === "undefined" ? "development" : __LITZIO_CLI_BUILD__.version);

export async function runS1(editorDir: string) {
  const directory = s1Directory(), lock = path.join(directory, "daemon.lock"), discovery = path.join(directory, "instance.json");
  const identity = { pid: process.pid, startedAt: new Date().toISOString(), instance: randomUUID() };
  let fd: number;
  try { fd = fs.openSync(lock, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") { console.log("S1 lock held; concurrent contender exits."); return; }
    throw error;
  }
  fs.writeFileSync(fd, JSON.stringify(identity)); fs.closeSync(fd);
  const cleanup = () => {
    // Ownership includes generation and start time, not just a reusable PID.
    const current = JSON.parse(fs.readFileSync(lock, "utf8"));
    if (current.instance === identity.instance && current.startedAt === identity.startedAt && current.pid === identity.pid) {
      fs.rmSync(discovery, { force: true }); fs.unlinkSync(lock);
    }
  };
  const token = randomBytes(32).toString("base64url");
  const equal = (candidate: string) => { const a = Buffer.from(candidate), b = Buffer.from(token); return a.length === b.length && timingSafeEqual(a, b); };
  const access = new RootAccess([], true), clients = new Map<string, number>();
  let instance: S1Instance, closing = false;
  const count = () => { for (const [id, at] of clients) if (Date.now() - at > 15_000) clients.delete(id); return clients.size; };
  const reply = (res: import("node:http").ServerResponse, status: number, data: unknown) => {
    res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data));
  };
  try {
    const agent = process.env.LITZIO_S1_FAKE_AGENT ? new AiAgentConnection(hostPaths().agent, {
      bin: process.env.LITZIO_S1_NODE ?? process.execPath, args: [process.env.LITZIO_S1_FAKE_AGENT, path.join(directory, "fake-agent.jsonl")],
    }) : undefined;
    const host = await startHttpHost({ roots: [], editorDir, port: Number(process.env.LITZIO_S1_PORT ?? 0), spike: { access, agent,
      async intercept(req, res, url) {
        // Keep the HTTP Host's Host allowlist, and reject foreign origins before custom controls.
        const origin = req.headers.origin;
        if ((origin && origin !== instance.url) || req.headers["sec-fetch-site"] === "cross-site") { reply(res, 403, { error: "Foreign origin." }); return true; }
        if (url.pathname === "/s1/login" && req.method === "GET") {
          res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><title>S1 login</title><body>Connecting…<script src="/s1/login.js"></script>'); return true;
        }
        if (url.pathname === "/s1/login.js" && req.method === "GET") { res.setHeader("Content-Type", "text/javascript"); res.end(bootstrap); return true; }
        const bearer = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        const cookie = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith("litzio-s1="))?.slice(10) ?? "";
        if (!equal(bearer) && !equal(cookie)) { reply(res, 401, { error: "Local authentication required." }); return true; }
        if (url.pathname === "/s1/client.js" && req.method === "GET") { res.setHeader("Content-Type", "text/javascript"); res.end(heartbeat); return true; }
        if (url.pathname.startsWith("/s1/")) {
          if (url.pathname === "/s1/health" && req.method === "GET") {
            reply(res, 200, { ...identity, productVersion: productVersion(), protocolVersion: process.env.LITZIO_S1_PROTOCOL ?? S1_PROTOCOL, clients: count(), roots: access.roots, jobs: "not tracked; restart always requires confirmation" }); return true;
          }
          if (req.method !== "POST" || origin !== instance.url || !/^application\/json(?:;|$)/.test(req.headers["content-type"] ?? "")) { reply(res, 403, { error: "Expected same-origin JSON POST." }); return true; }
          const body = JSON.parse((await readRequestBody(req, 16 * 1024)).toString("utf8"));
          if (url.pathname === "/s1/session") {
            if (!equal(bearer)) { reply(res, 401, { error: "Token required." }); return true; }
            res.setHeader("Set-Cookie", `litzio-s1=${token}; HttpOnly; SameSite=Strict; Path=/`);
            reply(res, 200, { authenticated: true });
          } else if (url.pathname === "/s1/client" || url.pathname === "/s1/release") {
            if (typeof body.id !== "string" || body.id.length > 100) { reply(res, 400, { error: "Invalid client." }); return true; }
            if (url.pathname.endsWith("release")) clients.delete(body.id); else clients.set(body.id, Date.now());
            reply(res, 200, { clients: count() });
          } else if (url.pathname === "/s1/roots") {
            if (typeof body.path !== "string") { reply(res, 400, { error: "Root path required." }); return true; }
            access.addRoot(body.path); reply(res, 200, { roots: access.roots });
          } else if (url.pathname === "/s1/stop") {
            if (body.instance !== identity.instance || body.confirm !== true) { reply(res, 409, { error: "Explicit confirmation required; clients/jobs may be interrupted.", clients: count() }); return true; }
            reply(res, 200, { stopping: identity });
            setImmediate(() => void stop());
          } else reply(res, 404, { error: "Unknown S1 control." });
          return true;
        }
        if (["/", "/index.html"].includes(url.pathname) && req.method === "GET") {
          res.setHeader("Content-Type", "text/html");
          res.end(fs.readFileSync(path.join(editorDir, "index.html"), "utf8").replace("</head>", '<script src="/s1/client.js" defer></script></head>')); return true;
        }
        return false;
      },
    } });
    instance = { ...identity, token, url: host.url };
    const temp = path.join(directory, `${identity.instance}.tmp`);
    fs.writeFileSync(temp, JSON.stringify(instance), { mode: 0o600 }); fs.renameSync(temp, discovery);
    console.log(JSON.stringify({ ...identity, url: host.url })); // Never log credentials.
    async function stop() {
      if (closing) return; closing = true;
      process.off("SIGINT", stop); process.off("SIGTERM", stop);
      try { await host.close(); } finally { cleanup(); }
    }
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
  } catch (error) { cleanup(); throw error; }
}

export async function s1Cli(action: string, args: string[], editorDir: string, cli: string) {
  if (action === "s1-run") return runS1(editorDir);
  const directory = s1Directory();
  if (action === "start") { await ensureS1(cli, productVersion(), console.error); return; }
  const instance = readS1(directory);
  if (!instance) { console.log("S1 daemon not running."); return; }
  if (action === "status") console.log(JSON.stringify(await s1Health(instance)));
  else if (action === "stop") await stopS1(instance, args.includes("--confirm"));
  else if (action === "root") console.log(JSON.stringify(await s1Request(instance, "/s1/roots", { path: args[0] })));
  else if (action === "browser-url") console.log(`${instance.url}/s1/login#${instance.token}`);
  else throw new Error("S1 daemon actions: s1-run, start, stop --confirm, status, root <folder>, browser-url (secret).");
}
