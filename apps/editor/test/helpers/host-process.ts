// Child-process HTTP Host with daemon health, for measuring Host responsiveness
// from a separate client: an in-process client would share the blocked event loop.
// argv: <editor fixture dir> <root folder>. Prints {"url"} once listening; exits on stdin close.
import { randomUUID } from "node:crypto";
import { startHttpHost } from "../../server/http-host.ts";
import { DAEMON_PROTOCOL, type DaemonHealth } from "../../server/daemon-protocol.ts";

const [editorDir, root] = process.argv.slice(2) as [string, string];
const health: DaemonHealth = { pid: process.pid, startedAt: new Date().toISOString(), instanceId: randomUUID(), processStartedAt: "test",
  daemonHome: root, executable: process.execPath, roots: [root], nonLoopback: false, launcher: "cli-run", productVersion: "test", protocolVersion: DAEMON_PROTOCOL };
const host = await startHttpHost({ roots: [root], editorDir, port: 0, daemon: { health, stop: () => void host.close() } });
process.stdout.write(`${JSON.stringify({ url: host.url, protocol: DAEMON_PROTOCOL })}\n`);
process.stdin.resume();
process.stdin.once("end", () => void host.close());
