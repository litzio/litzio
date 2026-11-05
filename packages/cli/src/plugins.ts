import { readFileSync } from "node:fs";
import { DAEMON_PROTOCOL } from "../../../apps/editor/shared/daemon-version.ts";
export async function pluginCli(args: string[]): Promise<number> {
  let dispatched = false;
  try {
    const index = args.indexOf("--host"), target = index >= 0 ? args[index + 1] : undefined;
    if (!target) throw new Error("An explicit --host <http(s) origin> is required");
    const origin = new URL(target);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected Host origin");
    const tokens = args.filter((_, i) => i !== index && i !== index + 1 && args[i] !== "--json");
    const [command, action, id] = tokens;
    let body: Record<string, unknown>;
    if (command === "operation" && action === "invoke") {
      if (!id || tokens[3] !== "--input" || tokens.length !== 5) throw new Error("operation invoke <id> --input <json-file>");
      body = { action: "invoke", operation: id, input: JSON.parse(readFileSync(tokens[4]!, "utf8")) };
    } else if (command === "plugins" && action === "list" && tokens.length === 2) body = { action };
    else if (command === "plugins" && action === "register" && tokens.length === 3) body = { action, directory: id };
    else if (command === "plugins" && ["enable", "disable", "unregister"].includes(action!) && tokens.length === 3) body = { action, id };
    else if (command === "plugins" && action === "secret-status" && tokens.length === 3) body = { action, id };
    else if (command === "plugins" && action === "secret-delete" && tokens.length === 4) body = { action, id, name: tokens[3] };
    else if (command === "plugins" && action === "trust" && tokens.length === 5 && tokens[3] === "--digest") body = { action, id, digest: tokens[4] };
    else if (command === "plugins" && action === "settings" && tokens.length === 3) body = { action, id };
    else if (command === "plugins" && action === "settings" && tokens.length === 5 && tokens[3] === "--file") body = { action, id, settings: JSON.parse(readFileSync(tokens[4]!, "utf8")) };
    else throw new Error("plugins list|register <directory>|unregister <id>|trust <id> --digest <digest>|enable|disable <id>|settings <id> --file <json-file> --host <origin> --json");
    const health = await fetch(new URL("/daemon/health", origin), { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!health.ok || (await health.json()).protocolVersion !== DAEMON_PROTOCOL) throw new Error("Host protocol check failed");
    dispatched = true;
    const response = await fetch(new URL("/api/plugins", origin), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin.origin }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(30000) });
    const value = await response.json(); process.stdout.write(JSON.stringify({ target: origin.origin, ...value }) + "\n"); return response.ok && (!value.receipt || value.receipt.outcome === "success") ? 0 : 1;
  } catch (error) { process.stdout.write(JSON.stringify({ outcome: dispatched ? "uncertain" : "failure", reason: String(error) }) + "\n"); return 1; }
}
