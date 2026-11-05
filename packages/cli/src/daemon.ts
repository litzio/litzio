import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { isIP } from "node:net";
import { brand } from "../../../brand.ts";
import { startHttpHost } from "../../../apps/editor/server/http-host.ts";
import { DAEMON_PROTOCOL, sameInstance } from "../../../apps/editor/server/daemon-protocol.ts";
import { daemonChannel, startDaemonChild, acquireDaemonLock, processStart, reclaimStaleDaemon, daemonDirectory, daemonPort, inspectDaemon, prepareDaemonDirectory, readDaemonRecord, stopDaemon, type DaemonChannel, type DaemonRecord } from "../../../apps/editor/server/daemon-state.ts";
import { productVersion } from "./version.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function options(action: string, args: string[]) {
  const { values, tokens } = parseArgs({ args, strict: true, allowPositionals: false, tokens: true, options: {
    channel: { type: "string" }, root: { type: "string", multiple: true }, port: { type: "string" }, host: { type: "string" }, "public-origin": { type: "string" },
    confirm: { type: "boolean" }, json: { type: "boolean" },
  } });
  const seen = new Set<string>();
  const allowed = new Set(["channel", ...(action === "run" ? ["root", "port", "host", "public-origin"] : action === "stop" ? ["confirm"] : action === "status" ? ["json"] : [])]);
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (!allowed.has(token.name)) throw new Error(`--${token.name} is not supported by daemon ${action}.`);
    if (token.name === "root") continue;
    if (seen.has(token.name)) throw new Error(`Specify --${token.name} only once.`);
    seen.add(token.name);
  }
  const channel = (values.channel ?? daemonChannel(productVersion)) as DaemonChannel;
  if (!["stable", "beta", "development"].includes(channel)) throw new Error("--channel must be stable, beta or development.");
  if (values.host !== undefined && !isIP(values.host)) throw new Error("--host must be an IP address (default: 127.0.0.1).");
  const port = values.port === undefined ? daemonPort(channel) : Number(values.port);
  if ((values.port !== undefined && !/^\d+$/.test(values.port)) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be an integer from 1 to 65535.");
  return { ...values, channel, port, local: !values.root && !values.host && !values.port && !values["public-origin"] };
}

export async function daemonCli(action: string, args: string[], editorDir: string, entry: string): Promise<void> {
  const config = options(action, args), directory = daemonDirectory(config.channel);
  if (action === "run") {
    // Only Desktop's private IPC launch opts into parent ownership. Ordinary CLI daemons detach.
    const desktopOwned = process.env.LITZIO_DESKTOP_DAEMON === "1", fromStart = process.env.LITZIO_DAEMON_START === "1";
    delete process.env.LITZIO_DESKTOP_DAEMON; delete process.env.LITZIO_DAEMON_START;
    if (desktopOwned && (!process.connected || !config.local)) throw new Error("Desktop daemon requires its parent IPC pipe and local mode.");
    prepareDaemonDirectory(directory);
    const launcher = desktopOwned ? "desktop" as const : fromStart ? "cli-start" as const : "cli-run" as const;
    const details = { daemonHome: directory, executable: process.execPath, roots: (config.root ?? []).map(root => fs.realpathSync(root)), nonLoopback: !!config.host && config.host !== "::1" && !/^127\./.test(config.host),
      ...((desktopOwned || fromStart) && fs.existsSync(path.join(directory, "daemon.log")) ? { log: path.join(directory, "daemon.log") } : {}) };
    const processStartedAt = processStart(process.pid);
    if (!processStartedAt) throw new Error("Could not determine daemon process creation identity.");
    const identity = { processStartedAt, launcher, pid: process.pid, startedAt: new Date().toISOString(), instanceId: randomUUID() };
    const lock = path.join(directory, config.local ? "daemon.lock" : `manual-${config.host ?? "127.0.0.1"}-${config.port}.lock`.replaceAll(":", "_"));
    const manualRecord = { ...identity, ...details, productVersion, protocolVersion: DAEMON_PROTOCOL, url: config["public-origin"] ?? `http://${config.host?.includes(":") ? `[${config.host}]` : config.host ?? "127.0.0.1"}:${config.port}` };
    const release = acquireDaemonLock(lock, config.local ? identity : manualRecord);
    let host: Awaited<ReturnType<typeof startHttpHost>> | undefined, closing: Promise<void> | undefined;
    const stop = () => closing ??= (async () => {
      process.off("SIGINT", signalStop); process.off("SIGTERM", signalStop);
      try { await host?.close(); }
      finally {
        if (config.local) {
          const record = readDaemonRecord(directory);
          if (record && sameInstance(record, identity)) fs.unlinkSync(path.join(directory, "instance.json"));
        }
        release();
        if (desktopOwned && process.connected) process.disconnect();
      }
    })();
    const signalStop = () => { void stop().catch(error => { console.error(error.message); process.exitCode = 1; }); };
    let parentGone = false, ready = false;
    const parentDisconnected = () => { parentGone = true; if (ready) signalStop(); };
    if (desktopOwned) process.once("disconnect", parentDisconnected);
    try {
      host = await startHttpHost({ roots: config.root ?? [], host: config.host, port: config.port, editorDir, publicOrigin: config["public-origin"],
        daemon: { health: { ...identity, ...details, productVersion, protocolVersion: DAEMON_PROTOCOL }, stop: signalStop } });
      if (desktopOwned && (parentGone || !process.connected)) { await stop(); return; }
      if (config.local) {
        const temp = path.join(directory, `${identity.instanceId}.tmp`);
        fs.writeFileSync(temp, JSON.stringify({ ...identity, ...details, productVersion, protocolVersion: DAEMON_PROTOCOL, url: host.url }), { flag: "wx", mode: 0o600 });
        fs.renameSync(temp, path.join(directory, "instance.json"));
      }
      process.once("SIGINT", signalStop); process.once("SIGTERM", signalStop);
      console.log(`${brand.name.en} HTTP: ${host.url}\nAllowed folders: ${host.roots.length ? host.roots.join(", ") : "unrestricted access"}`);
      ready = true;
      process.send?.({ ready: true, identity });
      if (!desktopOwned) process.disconnect?.();
    } catch (error) { await stop(); throw error; }
    return;
  }
  if (!["start", "stop", "status"].includes(action)) throw new Error("Unknown daemon command.");
  if (action === "start") reclaimStaleDaemon(directory);
  let record = readDaemonRecord(directory);
  const alreadyRunning = action === "start" && !!record;
  if (action === "start" && !record) {
    ({ record } = await startDaemonChild({ directory, bin: process.execPath,
      args: [...(entry.endsWith(".ts") ? ["--import", "tsx"] : []), entry, "daemon", "run", "--channel", config.channel],
      launcher: "cli-start" }));
    if (!record) throw new Error(`Daemon startup was not confirmed. Inspect ${path.join(directory, "daemon.log")}; lock is not automatically replaced.`);
  }

  if (action === "status") {
    const manual: DaemonRecord[] = [];
    for (const name of fs.existsSync(directory) ? fs.readdirSync(directory).sort() : []) {
      if (!name.startsWith("manual-") || !name.endsWith(".lock")) continue;
      try {
        const candidate = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")) as DaemonRecord;
        if (!Number.isSafeInteger(candidate.pid) || candidate.pid < 1 || !candidate.processStartedAt || !candidate.instanceId || !candidate.startedAt || !candidate.url || !Array.isArray(candidate.roots)) throw new Error(`Invalid manual daemon lock: ${name}. Inspect it; records preserved.`);
        manual.push(candidate);
      }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const inspect = async (candidate: NonNullable<typeof record>) => {
      try { return { ...candidate, ...await inspectDaemon(candidate, productVersion), state: "running", running: true }; }
      catch (error) {
        const started = processStart(candidate.pid);
        const owner = !started ? "exited" : started === candidate.processStartedAt ? "alive but unresponsive/incompatible" : "PID reused";
        process.exitCode = 1;
        return { ...candidate, identity: undefined, state: "unreachable", running: false, owner, error: `${(error as Error).message} Owner: ${owner}. ${owner === "alive but unresponsive/incompatible" ? "Inspect logs or use the matching CLI to stop it; records preserved." : "Recorded generation exited or PID reused; records preserved."}` };
      }
    };
    const local = record ? await inspect(record) : { state: "not-running", running: false, daemonHome: directory, locked: fs.existsSync(path.join(directory, "daemon.lock")) };
    const manualInstances = await Promise.all(manual.map(candidate => inspect(candidate)));
    console.log(config.json ? JSON.stringify({ ...local, manualInstances }) : [record ? statusTable(local as Parameters<typeof statusTable>[0]) : `Status: not running (local)\nDaemon home: ${directory}\nLock: ${fs.existsSync(path.join(directory, "daemon.lock")) ? "present" : "absent"}`, ...manualInstances.map(status => `Manual daemon\n${statusTable(status)}`)].join("\n\n"));
    return;
  }
  if (!record) {
    const status = { state: "not-running", running: false, daemonHome: directory, locked: fs.existsSync(path.join(directory, "daemon.lock")) };
    console.log(config.json ? JSON.stringify(status) : `Status: not running\nDaemon home: ${directory}\nLock: ${status.locked ? "present" : "absent"}`); return;
  }
  if (action === "stop") {
    if (!config.confirm) throw new Error("daemon stop requires --confirm; other clients/jobs may be interrupted.");
    await stopDaemon(record, productVersion);
    for (let i = 0; i < 100; i++) {
      if (!fs.existsSync(path.join(directory, "daemon.lock"))) { console.log(JSON.stringify({ stopped: record })); return; }
      await delay(100);
    }
    throw new Error("Daemon shutdown was not confirmed; inspect status before restarting.");
  }
  try {
    const health = await inspectDaemon(record, productVersion);
    const status = { state: "running", running: true, ...record, ...health };
    if (alreadyRunning) console.error(`Already running (pid ${record.pid}, ${record.url}, ${health.launcher}).`);
    console.log(action === "start" || config.json ? JSON.stringify(status) : statusTable(status));
  } catch (error) {
    if (action !== "status") throw error;
    const started = processStart(record.pid);
    const owner = !started ? "exited" : started === record.processStartedAt ? "alive but unresponsive/incompatible" : "PID reused";
    const status = { ...record, state: "unreachable", running: false, owner, error: `${(error as Error).message} Owner: ${owner}. ${owner === "alive but unresponsive/incompatible" ? "Inspect logs or use the matching CLI to stop it; records preserved." : "Run daemon start to reclaim the stale generation."}` };
    console.log(config.json ? JSON.stringify(status) : statusTable(status)); process.exitCode = 1;
  }
}

function statusTable(status: { state: string; url: string; launcher: string; roots: readonly string[]; nonLoopback: boolean; productVersion: string; protocolVersion: string; pid: number; startedAt: string; daemonHome: string; executable: string; log?: string; error?: string; identity?: { runAs: string } }): string {
  return [["Status", status.state], ...(status.state === "running" && status.identity ? [["Run as (실행 계정)", status.identity.runAs]] : []), ["URL", status.url], ["Launcher", status.launcher], ["Access", status.roots.length ? `Root restricted: ${status.roots.join(", ")}` : "unrestricted"],
    ["Non-loopback", String(status.nonLoopback)], ["Product version", status.productVersion], ["Protocol version", status.protocolVersion], ["PID", String(status.pid)],
    ["Started", status.startedAt], ["Daemon home", status.daemonHome], ["Executable", status.executable], ...(status.log ? [["Log", status.log]] : []), ...(status.error ? [["Error", status.error]] : [])]
    .map(([name, value]) => `${name!.padEnd(18)} ${value}`).join("\n");
}
