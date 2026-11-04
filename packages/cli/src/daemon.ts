import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { isIP } from "node:net";
import { brand } from "../../../brand.ts";
import { startHttpHost } from "../../../apps/editor/server/http-host.ts";
import { DAEMON_PROTOCOL, sameInstance } from "../../../apps/editor/server/daemon-protocol.ts";
import { acquireDaemonLock, daemonDirectory, daemonPort, inspectDaemon, prepareDaemonDirectory, readDaemonRecord, stopDaemon, type DaemonChannel } from "../../../apps/editor/server/daemon-state.ts";
import { productVersion } from "./version.ts";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function options(action: string, args: string[]) {
  const { values, tokens } = parseArgs({ args, strict: true, allowPositionals: false, tokens: true, options: {
    channel: { type: "string" }, root: { type: "string", multiple: true }, port: { type: "string" }, host: { type: "string" }, "public-origin": { type: "string" },
    confirm: { type: "boolean" },
  } });
  const seen = new Set<string>();
  const allowed = new Set(["channel", ...(action === "run" ? ["root", "port", "host", "public-origin"] : action === "stop" ? ["confirm"] : [])]);
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (!allowed.has(token.name)) throw new Error(`--${token.name} is not supported by daemon ${action}.`);
    if (token.name === "root") continue;
    if (seen.has(token.name)) throw new Error(`Specify --${token.name} only once.`);
    seen.add(token.name);
  }
  const channel = (values.channel ?? (productVersion === "development" ? "development" : productVersion.includes("-") ? "beta" : "stable")) as DaemonChannel;
  if (!["stable", "beta", "development"].includes(channel)) throw new Error("--channel must be stable, beta or development.");
  if (values.host !== undefined && !isIP(values.host)) throw new Error("--host must be an IP address (default: 127.0.0.1).");
  const port = values.port === undefined ? daemonPort(channel) : Number(values.port);
  if ((values.port !== undefined && !/^\d+$/.test(values.port)) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be an integer from 1 to 65535.");
  return { ...values, channel, port, local: !values.root && !values.host && !values.port && !values["public-origin"] };
}

export async function daemonCli(action: string, args: string[], editorDir: string, entry: string): Promise<void> {
  const config = options(action, args), directory = daemonDirectory(config.channel);
  if (action === "run") {
    prepareDaemonDirectory(directory);
    const identity = { pid: process.pid, startedAt: new Date().toISOString(), instanceId: randomUUID() };
    const lock = path.join(directory, config.local ? "daemon.lock" : `manual-${config.host ?? "127.0.0.1"}-${config.port}.lock`.replaceAll(":", "_"));
    const release = acquireDaemonLock(lock, identity);
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
      }
    })();
    const signalStop = () => { void stop().catch(error => { console.error(error.message); process.exitCode = 1; }); };
    try {
      host = await startHttpHost({ roots: config.root ?? [], host: config.host, port: config.port, editorDir, publicOrigin: config["public-origin"],
        daemon: { health: { ...identity, productVersion, protocolVersion: DAEMON_PROTOCOL }, stop: signalStop } });
      if (config.local) {
        const temp = path.join(directory, `${identity.instanceId}.tmp`);
        fs.writeFileSync(temp, JSON.stringify({ ...identity, url: host.url }), { flag: "wx", mode: 0o600 });
        fs.renameSync(temp, path.join(directory, "instance.json"));
      }
      process.once("SIGINT", signalStop); process.once("SIGTERM", signalStop);
      console.log(`${brand.name.en} HTTP: ${host.url}\nAllowed folders: ${host.roots.length ? host.roots.join(", ") : "unrestricted access"}`);
      process.send?.({ ready: true }); process.disconnect?.();
    } catch (error) { await stop(); throw error; }
    return;
  }
  if (!["start", "stop", "status"].includes(action)) throw new Error("Unknown daemon command.");
  let record = readDaemonRecord(directory);
  if (action === "start" && !record) {
    prepareDaemonDirectory(directory);
    const log = path.join(directory, "daemon.log"), fd = fs.openSync(log, "a", 0o600);
    try {
      const child = spawn(process.execPath, [...(entry.endsWith(".ts") ? ["--import", "tsx"] : []), entry, "daemon", "run", "--channel", config.channel], {
        cwd: process.cwd(), detached: true, windowsHide: true, stdio: ["ignore", fd, fd, "ipc"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { child.disconnect(); reject(new Error(`Daemon startup was not confirmed. Inspect ${log}`)); }, 15_000);
        const done = () => { clearTimeout(timer); resolve(); };
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("message", done);
        child.once("exit", done); // A concurrent candidate may own the lock; inspect its record below.
        child.unref();
      });
    } finally { fs.closeSync(fd); }
    for (let i = 0; i < 100; i++) {
      record = readDaemonRecord(directory);
      if (record) break;
      // A failed candidate leaves its reason in the log; do not retry spawning or change ports.
      if (!fs.existsSync(path.join(directory, "daemon.lock"))) throw new Error(`Daemon startup failed. Inspect ${log}`);
      await delay(100);
    }
    if (!record) throw new Error(`Daemon startup was not confirmed. Inspect ${log}; lock is not automatically replaced.`);
  }
  if (!record) { console.log(JSON.stringify({ running: false, locked: fs.existsSync(path.join(directory, "daemon.lock")) })); return; }
  if (action === "stop") {
    if (!config.confirm) throw new Error("daemon stop requires --confirm; other clients/jobs may be interrupted.");
    await stopDaemon(record, productVersion);
    for (let i = 0; i < 100; i++) {
      if (!fs.existsSync(path.join(directory, "daemon.lock"))) { console.log(JSON.stringify({ stopped: record })); return; }
      await delay(100);
    }
    throw new Error("Daemon shutdown was not confirmed; inspect status before restarting.");
  }
  const health = await inspectDaemon(record, productVersion);
  console.log(JSON.stringify({ running: true, ...record, ...health }));
}
