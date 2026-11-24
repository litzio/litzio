// Spike wrapper: the Litzio Ollama connection launches this instead of `copilot --acp`.
// It ignores Copilot flags, turns the Copilot BYOK variables the Host already sets
// (COPILOT_PROVIDER_BASE_URL=<ollama>/v1, COPILOT_MODEL) into a pi models.json in a temporary
// agent directory, and runs the @openma/pi-acp ACP server in this process.
// The user's ~/.pi and ~/.agents are never read: agent, session and HOME directories are temporary.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const adapterDir = path.dirname(require.resolve("@openma/pi-acp/package.json"));
// pnpm layout: the adapter's own pi dependency sits next to it.
const piVersion = JSON.parse(readFileSync(path.join(adapterDir, "..", "..", "@earendil-works", "pi-coding-agent", "package.json"), "utf8")).version;

if (process.argv.includes("--version")) {
  console.log(`pi-acp ${require("@openma/pi-acp/package.json").version} (pi ${piVersion})`);
  process.exit(0);
}

const root = process.env.PI_SPIKE_ROOT ?? path.join(os.tmpdir(), "litzio-pi-spike");
const agentDir = path.join(root, "agent"), sessionDir = path.join(root, "sessions"), home = path.join(root, "home");
for (const dir of [agentDir, sessionDir, home]) mkdirSync(dir, { recursive: true });
const baseUrl = process.env.COPILOT_PROVIDER_BASE_URL ?? "http://127.0.0.1:11434/v1";
const model = process.env.COPILOT_MODEL ?? "gemma4:e4b";
const contextWindow = Number(process.env.PI_SPIKE_CONTEXT ?? 65536);
writeFileSync(path.join(agentDir, "models.json"), JSON.stringify({ providers: { ollama: {
  baseUrl, api: "openai-completions", apiKey: "ollama",
  models: [{ id: model, input: ["text", "image"], contextWindow, maxTokens: 8192 }],
} } }, null, 2));
writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({
  defaultProvider: "ollama", defaultModel: model,
  // PI_SPIKE_POWERSHELL: replace the Git Bash tool with pi's optional PowerShell tool (native Windows only).
  ...(process.env.PI_SPIKE_POWERSHELL ? { defaultTools: ["read", "powershell", "edit", "write"] } : {}), quietStartup: true, enableInstallTelemetry: false,
  extensions: [path.join(here, "litzio-audio-extension.mjs"), ...(process.env.LITZIO_PI_APPROVAL ? [path.join(here, "litzio-approval-extension.mjs")] : [])],
}, null, 2));
Object.assign(process.env, {
  PI_CODING_AGENT_DIR: agentDir, PI_ACP_SESSION_DIR: sessionDir, PI_ACP_MODEL: `ollama/${model}`,
  // PI_ACP_TRUST_PROJECTS: the Host-owned assistant folder carries .agents/skills, loaded only for a trusted project.
  PI_ACP_QUIET_STARTUP: "1", PI_ACP_TRUST_PROJECTS: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
  // pi reads ~/.agents/skills through os.homedir(), which is USERPROFILE on Windows.
  HOME: home, USERPROFILE: home, LITZIO_PI_AUDIO_DIR: path.join(root, "audio"),
});
// pi walks .agents/skills up from the cwd until a git root; the Host's assistant folder lives under the user's home.
// An empty .git directory stops that walk at the assistant folder (spike only; AGENTS.md lookup still walks to the drive root).
mkdirSync(path.join(process.cwd(), ".git"), { recursive: true });
// SPIKE_ADAPTER_ENTRY: an esbuild single-file bundle of the adapter (bundling check).
const { main } = await import(pathToFileURL(process.env.SPIKE_ADAPTER_ENTRY ?? path.join(adapterDir, "dist", "bin.js")).href);
await main([]);
