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
    if (command === "review" && tokens[2] === "--input") {
      if (!["open", "read", "patch", "regenerate", "status"].includes(action!) || tokens.length !== 4) throw new Error("review open|read|patch|regenerate|status --input <json-file> --host <origin> --json");
      body = { ...JSON.parse(readFileSync(tokens[3]!, "utf8")), action: `generated-${action}` };
    } else if (command === "review") {
      if (!["read", "propose", "approve", "reject", "undo", "status"].includes(action!) || tokens.length !== 8 || tokens[4] !== "--input" || tokens[6] !== "--root") throw new Error("review <action> <pluginId> <reviewId> --input <file> --root <root> --host <origin> --json");
      body = { ...JSON.parse(readFileSync(tokens[5]!, "utf8")), action, plugin: id, review: tokens[3], root: tokens[7] };
    } else if (command === "operation" && action === "invoke") {
      if (!id || tokens[3] !== "--input" || tokens.length !== 5) throw new Error("operation invoke <id> --input <json-file>");
      body = { action: "invoke", operation: id, input: JSON.parse(readFileSync(tokens[4]!, "utf8")) };
    } else if (command === "jobs" && action === "list" && tokens.length <= 3) {
      body = { action: "job-list", ...(id ? { plugin: id } : {}) };
    } else if (command === "plugins" && ["start", "status", "stop", "result"].includes(action!) && id) {
      if (action === "start") {
        if (tokens[3] === "--job") {
          const files: string[] = []; let root: string | undefined;
          for (let i = 5; i < tokens.length; i += 2) {
            if (!tokens[i + 1]) throw new Error("Missing option value");
            if (tokens[i] === "--root" && !root) root = tokens[i + 1];
            else if (tokens[i] === "--file") files.push(tokens[i + 1]!);
            else throw new Error("Unexpected batch option");
          }
          if (!tokens[4] || !root || !files.length) throw new Error("plugins start <pluginId> --job <job> --root <root> --file <file> [--file <file>]");
          body = { action: "job-start-many", plugin: id, job: tokens[4], root, files };
        } else {
          if (tokens.length !== 5 || tokens[3] !== "--input") throw new Error("plugins start <pluginId> --input <json-file>");
          body = { ...JSON.parse(readFileSync(tokens[4]!, "utf8")), action: "job-start", plugin: id };
        }
      } else {
        if (tokens.length !== 3) throw new Error("plugins status|stop|result <requestId>");
        body = { action: `job-${action}`, requestId: id };
      }
    } else if (command === "plugins" && action === "list" && tokens.length === 2) body = { action };
    else if (command === "plugins" && ["register", "validate"].includes(action!) && tokens.length === 3) body = { action, directory: id };
    else if (command === "plugins" && action === "scaffold" && tokens.length === 5 && tokens[3] === "--id") body = { action, directory: id, id: tokens[4] };
    else if (command === "plugins" && (action === "trust" || action === "enable" && tokens.length > 3)) {
      body = { action, id };
      for (let i = 3; i < tokens.length; i++) {
        const option = tokens[i];
        if (action === "enable" && option === "--trust" && body.trust === undefined) body.trust = true;
        else if ((option === "--registration" || action === "trust" && option === "--digest") && tokens[i + 1] && !tokens[i + 1]!.startsWith("--")) {
          const key = option === "--registration" ? "registrationId" : "digest";
          if (body[key] !== undefined) throw new Error("Duplicate plugin trust option");
          body[key] = tokens[++i];
        } else throw new Error("Invalid plugin trust option");
      }
      if ((action === "trust" || body.trust) && !body.registrationId) throw new Error("Read plugins list and supply --registration <registrationId> to confirm that registration");
    }
    else if (command === "plugins" && ["enable", "disable", "reload", "unregister"].includes(action!) && tokens.length === 3) body = { action, id };
    else if (command === "plugins" && action === "secret-status" && tokens.length === 3) body = { action, id };
    else if (command === "plugins" && action === "secret-delete" && tokens.length === 4) body = { action, id, name: tokens[3] };
    else if (command === "plugins" && action === "settings" && tokens.length === 3) body = { action, id };
    else if (command === "plugins" && action === "settings" && tokens.length === 5 && tokens[3] === "--file") body = { action, id, settings: JSON.parse(readFileSync(tokens[4]!, "utf8")) };
    else throw new Error("plugins list|scaffold <directory> --id <id>|validate <directory>|register <directory>|unregister <id>|trust <id> --registration <registrationId> [--digest <digest>]|enable <id> [--trust --registration <registrationId>]|disable|reload <id>|settings <id> --file <json-file> --host <origin> --json");
    const health = await fetch(new URL("/daemon/health", origin), { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!health.ok || (await health.json()).protocolVersion !== DAEMON_PROTOCOL) throw new Error("Host protocol check failed");
    dispatched = true;
    const response = await fetch(new URL(command === "review" ? "/api/reviews" : "/api/plugins", origin), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin.origin }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(30000) });
    const value = await response.json(); process.stdout.write(JSON.stringify({ target: origin.origin, ...value }) + "\n"); return response.ok && (!value.receipt || value.receipt.outcome === "success") ? 0 : 1;
  } catch (error) { process.stdout.write(JSON.stringify({ outcome: dispatched ? "uncertain" : "failure", reason: String(error) }) + "\n"); return 1; }
}
