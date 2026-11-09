import { readFileSync, statSync } from "node:fs";
import { DAEMON_PROTOCOL } from "../../../apps/editor/shared/daemon-version.ts";

import { VIEW_LIMITS, catalogViewByteLimit, type CatalogView } from "@litzio/core/views-v2";
import { VIEW_TRANSPORT_LIMITS } from "../../../apps/editor/shared/view-limits.ts";
function readJson(file: string) {
  if (statSync(file).size > VIEW_LIMITS.bytes) throw new Error("View input exceeds byte limit");
  const bytes = readFileSync(file);
  if (bytes.length > VIEW_LIMITS.bytes) throw new Error("View input exceeds byte limit");
  const value = JSON.parse(bytes.toString("utf8"));
  if (value?.kind === "litzio-view" && bytes.length > catalogViewByteLimit(value as CatalogView)) throw new Error("View input exceeds byte limit");
  return value;
}
/** Thin transport: all validation, calculation, storage and receipts belong to Host/Core. */
export async function viewCli(args: string[]): Promise<number> {
  let dispatched = false;
  try {
    const tokens = [...args];
    const take = (flag: string) => { const i = tokens.indexOf(flag); if (i < 0) return undefined; const value = tokens[i + 1]; if (!value || value.startsWith("--")) throw new Error(`Missing ${flag} value`); tokens.splice(i, 2); return value; };
    const target = take("--host"), plugin = take("--plugin"), inputFile = take("--input");
    const replacement = inputFile === undefined ? undefined : readJson(inputFile);
    const json = tokens.indexOf("--json"); if (json >= 0) tokens.splice(json, 1);
    if (!target) throw new Error("Explicit --host <origin> required");
    const origin = new URL(target);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected Host origin");
    const [action, file] = tokens;
    if (tokens.length !== 2 || !["validate", "run"].includes(action!)) throw new Error("view validate|run <file> --host <origin> --json");
    if (inputFile && action !== "run") throw new Error("--input requires run");
    if (plugin && action !== "validate") throw new Error("--plugin requires validate");
    const input = { action, view: readJson(file!), ...(plugin ? { plugin } : {}), ...(inputFile ? { input: replacement } : {}) };
    const body = JSON.stringify(input);
    if (Buffer.byteLength(body) > VIEW_TRANSPORT_LIMITS.requestBytes) throw new Error("View request exceeds byte limit");
    const health = await fetch(new URL("/daemon/health", origin), { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!health.ok || (await health.json()).protocolVersion !== DAEMON_PROTOCOL) throw new Error("Host protocol check failed");
    dispatched = true;
    const response = await fetch(new URL("/api/views", origin), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin.origin }, body, redirect: "error", signal: AbortSignal.timeout(30000) });
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > VIEW_TRANSPORT_LIMITS.responseBytes) throw new Error("View response exceeds byte limit");
        chunks.push(next.value);
      }
    } finally { await reader.cancel(); }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    process.stdout.write(JSON.stringify({ host: origin.origin, ...result }) + "\n");
    return response.ok && result.receipt?.outcome === "success" ? 0 : 1;
  } catch (error) { process.stdout.write(JSON.stringify({ outcome: dispatched ? "uncertain" : "failure", error: String(error) }) + "\n"); return 1; }
}
