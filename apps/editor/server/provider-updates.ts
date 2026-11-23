import { spawn, execFile } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { AiProvider, ProviderUpdate, ProviderVersion } from "../shared/assistant.ts";
import { stopAgentProcess } from "./codex-app-server.ts";

/** Adjustable: a stalled CLI update is ended and reported as failed. */
export const PROVIDER_UPDATE_TIMEOUT_MS = 10 * 60_000;
/** Adjustable: latest-release reads are reused this long; the settings screen does not poll. */
export const LATEST_RELEASE_CACHE_MS = 10 * 60_000;
const OUTPUT_LIMIT = 64 * 1024;

/**
 * Provider differences. Both CLIs update themselves with `update` and resolve "latest" from these
 * public GitHub releases; the request carries no user or project data.
 */
const PROVIDERS: Record<AiProvider, { repository: string }> = {
  codex: { repository: "openai/codex" },
  copilot: { repository: "github/copilot-cli" },
};

export async function latestRelease(provider: AiProvider): Promise<string> {
  // Test and isolated Hosts point the same GitHub API override as plugin sources at a fake.
  const api = process.env.LITZIO_GITHUB_API_URL || "https://api.github.com";
  const response = await fetch(`${api}/repos/${PROVIDERS[provider].repository}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "cli-version-check" }, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const version = semver(((await response.json()) as { tag_name?: unknown }).tag_name);
  if (!version) throw new Error("No release version.");
  return version.join(".");
}

function semver(value: unknown): number[] | undefined {
  const match = typeof value === "string" ? value.match(/(\d+)\.(\d+)\.(\d+)/) : null;
  return match ? match.slice(1, 4).map(Number) : undefined;
}
function launcher(bin: string) {
  const shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
  return { command: shell ? `"${bin}"` : bin, shell };
}
/** Older CLIs without the subcommand still print help; only a listed `update` command counts. */
function listsUpdate(bin: string): Promise<boolean> {
  const { command, shell } = launcher(bin);
  return new Promise(resolve => execFile(command, ["--help"], { shell, windowsHide: true, timeout: 5000 }, (error, out) => resolve(!error && /^\s+update\s/m.test(out))));
}

/** Target Host owner of provider CLI updates; nothing here is persisted. */
export class ProviderUpdates {
  private runs = new Map<AiProvider, ProviderUpdate>();
  private releases = new Map<AiProvider, { version: string; checkedAt: number }>();
  constructor(private executable: (provider: AiProvider) => string | null, private options: { latest?: (provider: AiProvider) => Promise<string>; timeoutMs?: number } = {}) {}

  async version(provider: AiProvider, installed: string | null): Promise<ProviderVersion> {
    const bin = this.executable(provider);
    if (!bin) return { versionStatus: "unknown", updateUnavailable: "missing" };
    // The comparison serves the update command; without one, no release request is made.
    if (!await listsUpdate(bin)) return { versionStatus: "unknown", updateUnavailable: "unsupported" };
    const release = await this.release(provider);
    const current = semver(installed), latest = semver(release?.version);
    const newer = current && latest ? latest.findIndex((part, index) => part !== current[index]) : -1;
    return {
      versionStatus: !current || !latest ? "unknown" : newer >= 0 && latest[newer]! > current[newer]! ? "available" : "current",
      ...(release ? { latestVersion: release.version, latestCheckedAt: release.checkedAt } : {}),
    };
  }
  private async release(provider: AiProvider) {
    const cached = this.releases.get(provider);
    if (cached && Date.now() - cached.checkedAt < LATEST_RELEASE_CACHE_MS) return cached;
    try {
      const value = { version: await (this.options.latest ?? latestRelease)(provider), checkedAt: Date.now() };
      this.releases.set(provider, value);
      return value;
    } catch { return undefined; }
  }

  state(provider: AiProvider): ProviderUpdate { return this.runs.get(provider) ?? { provider, status: "idle", output: "" }; }

  /**
   * Runs the executable's own `update`. The run stays "running" until `finished` has re-read the Host state,
   * so a screen that sees the result also sees the new version. `finished` reports whether a turn deferred the relaunch.
   */
  start(provider: AiProvider, finished: (succeeded: boolean) => Promise<boolean>): ProviderUpdate {
    if (this.runs.get(provider)?.status === "running") throw new Error(`An update of the ${provider} CLI is already running.`);
    const state: ProviderUpdate = { provider, status: "running", startedAt: Date.now(), output: "" };
    // The last run stays in daemon memory: reopening the screen shows its progress or result.
    this.runs.set(provider, state);
    void (async () => {
      let succeeded = false;
      try { succeeded = await this.run(state); if (await finished(succeeded)) state.deferred = true; }
      catch (error) { state.error ??= (error as Error).message; }
      finally { state.finishedAt = Date.now(); state.status = succeeded ? "succeeded" : "failed"; }
    })();
    return state;
  }
  private async run(state: ProviderUpdate): Promise<boolean> {
    const bin = this.executable(state.provider);
    if (!bin) { state.error = "The CLI was not found on the Host."; return false; }
    if (!await listsUpdate(bin)) { state.error = "This CLI version has no update command."; return false; }
    const { command, shell } = launcher(bin);
    const child = spawn(command, ["update"], { shell, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"], env: process.env });
    child.stdin.end();
    const append = (decoder: StringDecoder) => (chunk: Buffer) => {
      // Progress control sequences are not readable output.
      const output = state.output + decoder.write(chunk).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
      if (output.length > OUTPUT_LIMIT) { state.output = output.slice(-OUTPUT_LIMIT); state.outputTruncated = true; } else state.output = output;
    };
    child.stdout.on("data", append(new StringDecoder("utf8")));
    child.stderr.on("data", append(new StringDecoder("utf8")));
    const timeoutMs = this.options.timeoutMs ?? PROVIDER_UPDATE_TIMEOUT_MS;
    const timer = setTimeout(() => { state.timedOut = true; void stopAgentProcess(child).catch(() => {}); }, timeoutMs);
    try {
      const [code, error] = await new Promise<[number | null, Error?]>(resolve => { child.once("error", error => resolve([null, error])); child.once("close", code => resolve([code])); });
      state.exitCode = code;
      if (state.timedOut) state.error = `The update did not finish within ${Math.round(timeoutMs / 1000)} seconds.`;
      else if (error) state.error = error.message;
      return code === 0 && !state.timedOut;
    } finally { clearTimeout(timer); }
  }
}
