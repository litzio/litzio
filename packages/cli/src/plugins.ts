import { readFileSync } from "node:fs";
import { DAEMON_PROTOCOL } from "../../../apps/editor/shared/daemon-version.ts";

type PluginRequest = Record<string, unknown>;
/** Returns the Host request for `tokens`, or undefined when the arguments match no accepted form. */
type ActionParser = (tokens: string[]) => PluginRequest | undefined;

const PLUGINS_USAGE = "plugins list|file-actions <path>|install <directory-or-id>|install <github-url> [--track release|branch]|source-plugins <github-url>|scaffold [directory] --id <id> [--template greet|screen|chart]|validate <directory>|register <directory-or-github-url>|unregister <id>|trust <id> --registration <registrationId> [--digest <digest>]|enable <id> [--trust --registration <registrationId>]|disable|reload <id>|check-updates [id]|update <id>|storage-show <id>|storage-clear <id>|settings <id> --file <json-file> --host <origin> --json";
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

function parseOperationInvoke(tokens: string[]): PluginRequest {
  const id = tokens[2];
  if (!id || tokens[3] !== "--input" || tokens.length !== 5) throw new Error("operation invoke <id> --input <json-file>");
  return { action: "invoke", operation: id, input: readJson(tokens[4]!) };
}

const idRequest: ActionParser = ([, action, id, ...rest]) => rest.length === 0 && id !== undefined ? { action, id } : undefined;
const directoryRequest: ActionParser = ([, action, directory, ...rest]) => rest.length === 0 && directory !== undefined ? { action, directory } : undefined;

const githubRequest: ActionParser = tokens => {
  const [, action, source] = tokens;
  if (!source?.startsWith("https://")) return undefined;
  if (tokens.length === 3) return { action, source };
  if (tokens.length === 5 && tokens[3] === "--track" && ["release", "branch"].includes(tokens[4]!)) return { action, source, track: tokens[4] };
  return undefined;
};

const installRequest: ActionParser = tokens => {
  const [, action, id] = tokens;
  if (tokens.length !== 3) return undefined;
  return id && !id.includes("/") && !id.includes("\\") && !id.includes(":") ? { action, id } : { action, directory: id };
};

const scaffoldRequest: ActionParser = tokens => {
  const offset = tokens[2] === "--id" ? 2 : 3;
  const hasTemplate = tokens.length === offset + 4 && tokens[offset + 2] === "--template" && ["greet", "screen", "chart"].includes(tokens[offset + 3]!);
  if (tokens[offset] !== "--id" || !tokens[offset + 1] || !(tokens.length === offset + 2 || hasTemplate)) {
    throw new Error("plugins scaffold [directory] --id <id> [--template greet|screen|chart]");
  }
  return { action: "scaffold", ...(offset === 3 ? { directory: tokens[2] } : {}), id: tokens[offset + 1], ...(hasTemplate ? { template: tokens[offset + 3] } : {}) };
};

/** `trust` and `enable --trust` carry the registration the user confirmed; neither implies approval. */
const consentRequest: ActionParser = tokens => {
  const [, action, id] = tokens;
  const body: PluginRequest = { action, id };
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
  return body;
};

const pluginActions: Record<string, ActionParser> = {
  list: tokens => tokens.length === 2 ? { action: "list" } : undefined,
  "file-actions": ([, action, path, ...rest]) => path !== undefined && !rest.length ? { action, path } : undefined,
  install: tokens => githubRequest(tokens) ?? installRequest(tokens),
  register: tokens => githubRequest(tokens) ?? directoryRequest(tokens),
  "source-plugins": tokens => tokens.length === 3 ? githubRequest(tokens) : undefined,
  validate: directoryRequest,
  bundle: directoryRequest,
  dependencies: directoryRequest,
  scaffold: scaffoldRequest,
  trust: consentRequest,
  enable: tokens => tokens.length > 3 ? consentRequest(tokens) : idRequest(tokens),
  disable: idRequest,
  reload: idRequest,
  update: idRequest,
  unregister: idRequest,
  "check-updates": ([, action, id, ...rest]) => rest.length === 0 ? { action, ...(id ? { id } : {}) } : undefined,
  "storage-show": idRequest,
  "storage-clear": idRequest,
  "secret-status": idRequest,
  "secret-delete": ([, action, id, name, ...rest]) => rest.length === 0 && name !== undefined ? { action, id, name } : undefined,
  settings: tokens => {
    const [, action, id] = tokens;
    if (tokens.length === 3) return { action, id };
    if (tokens.length === 5 && tokens[3] === "--file") return { action, id, settings: readJson(tokens[4]!) };
    return undefined;
  },
};

/** Builds the Host request from the arguments left after `--host <origin>` and `--json` are removed. */
function pluginRequest(tokens: string[]): PluginRequest {
  const [command, action] = tokens;
  if (command === "operation" && action === "invoke") return parseOperationInvoke(tokens);
  const parse = command === "plugins" && action !== undefined && Object.hasOwn(pluginActions, action) ? pluginActions[action] : undefined;
  const body = parse?.(tokens);
  if (!body) throw new Error(PLUGINS_USAGE);
  return body;
}

export async function pluginCli(args: string[]): Promise<number> {
  let dispatched = false;
  try {
    const index = args.indexOf("--host"), target = index >= 0 ? args[index + 1] : undefined;
    if (!target) throw new Error("An explicit --host <http(s) origin> is required");
    const origin = new URL(target);
    if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Expected Host origin");
    const tokens = args.filter((_, i) => i !== index && i !== index + 1 && args[i] !== "--json");
    const command = tokens[0];
    const body = pluginRequest(tokens);
    const health = await fetch(new URL("/daemon/health", origin), { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!health.ok || (await health.json()).protocolVersion !== DAEMON_PROTOCOL) throw new Error("Host protocol check failed");
    dispatched = true;
    const waitsForActivation = ["invoke", "enable"].includes(String(body.action));
    const timeout = body.source || ["update", "reload"].includes(String(body.action)) ? 600_000 : 30_000;
    const endpoint = body.action === "file-actions" ? "/api/plugin-screens" : "/api/plugins";
    const response = await fetch(new URL(endpoint, origin), { method: "POST", headers: { "Content-Type": "application/json", Origin: origin.origin }, body: JSON.stringify(body), redirect: "error", signal: waitsForActivation ? undefined : AbortSignal.timeout(timeout) });
    const value = await response.json();
    process.stdout.write((args.includes("--json") || command !== "operation" || !value.error ? JSON.stringify({ target: origin.origin, ...value }) : `${value.code ? value.code + ": " : ""}${value.message ?? value.error}`) + "\n");
    return response.ok && (!value.receipt || value.receipt.outcome === "success") ? 0 : 1;
  } catch (error) { process.stdout.write(JSON.stringify({ outcome: dispatched ? "uncertain" : "failure", reason: String(error) }) + "\n"); return 1; }
}
