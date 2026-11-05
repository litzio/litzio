import { readFileSync } from "node:fs";
import { DAEMON_PROTOCOL } from "../../../apps/editor/shared/daemon-version.ts";

/** Thin transport: all validation, calculation, storage and receipts belong to Host/Core. */
export async function viewCli(args: string[]): Promise<number> {
  let dispatched = false;
  try {
    const tokens = [...args];
    const take = (flag: string) => { const i = tokens.indexOf(flag); if (i < 0) return undefined; const value = tokens[i + 1]; if (!value || value.startsWith("--")) throw new Error(`Missing ${flag} value`); tokens.splice(i, 2); return value; };
    const target = take("--host"), root = take("--root"), name = take("--name"), plugin = take("--plugin"), inputFile = take("--input");
    const replacement = inputFile === undefined ? undefined : JSON.parse(readFileSync(inputFile, "utf8"));
    const json = tokens.indexOf("--json"); if (json >= 0) tokens.splice(json, 1);
    if (!target) throw new Error("Explicit --host <origin> required");
    const origin = new URL(target);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected Host origin");
    const [action, file] = tokens;
    let input: Record<string, unknown>;
    if (action === "catalog" && tokens.length === 1 && !root && !name && !plugin && !inputFile) input = { action };
    else if (action === "list" && tokens.length === 1 && !root && !name) input = { action, plugin: plugin ?? "litzio.statistics" };
    else if (action === "open" && tokens.length === 2 && !root && !name) input = { action, plugin: plugin ?? "litzio.statistics", name: file };
    else if (action === "run" && tokens.length === 1 && name && root) input = { action, name, root, plugin: plugin ?? "litzio.statistics" };
    else if (["validate", "propose", "save", "run"].includes(action!) && tokens.length === 2) {
      const view = JSON.parse(readFileSync(file!, "utf8"));
      if (["validate", "propose"].includes(action!) && !root && !name) input = { action, view };
      else if (action === "save" && name && !root) input = { action, view, ...(plugin ? { plugin } : {}), name };
      else if (action === "run" && root && !name) input = { action, view, root };
      else throw new Error("save requires --name; run requires --root");
    } else throw new Error("view validate|propose|save|run <file> | catalog | list | open <name> --host <origin> --json");
    if (inputFile && action !== "run" && action !== "save") throw new Error("--input requires run or save");
    if (plugin && !["list", "open", "save", "run"].includes(action!)) throw new Error("--plugin requires list, open, save or named run");
    if (plugin && action === "run" && file) throw new Error("--plugin requires named run");
    if (inputFile !== undefined) input.input = replacement;
    const health = await fetch(new URL("/daemon/health", origin), { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!health.ok || (await health.json()).protocolVersion !== DAEMON_PROTOCOL) throw new Error("Host protocol check failed");
    dispatched = true;
    const response = await fetch(new URL("/api/views", origin), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin.origin }, body: JSON.stringify(input), redirect: "error", signal: AbortSignal.timeout(30000) });
    const result = await response.json();
    process.stdout.write(JSON.stringify({ host: origin.origin, ...result }) + "\n");
    return response.ok && result.receipt?.outcome === "success" ? 0 : 1;
  } catch (error) { process.stdout.write(JSON.stringify({ outcome: dispatched ? "uncertain" : "failure", error: String(error) }) + "\n"); return 1; }
}
