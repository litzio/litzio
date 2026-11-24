import type { ChildProcess } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { AiProvider } from "../shared/assistant.ts";
import { providerEngine } from "./provider-engine.ts";

/**
 * Daemon log lines for provider processes and assistant turns. Fields are Host-classified kinds, numbers and names;
 * provider error text, user messages, answers, paths and the Ollama host name never reach them.
 */
export type ProviderDaemonLog = { report(group: string, key: string, message?: string): void };
export type LaunchStage = "executable" | "spawn" | "initialize";
/** What a provider connection knows while it starts one process. */
export type Launch = { stage: LaunchStage; started: number; bin?: string | null; version?: string | null; child?: ChildProcess; fields?: string };

export function launch(): Launch { return { stage: "executable", started: performance.now() }; }

const elapsed = (started: number) => `elapsedMs=${Math.round(performance.now() - started)}`;
/** The version number only, not the rest of the CLI's output. */
const versionNumber = (text?: string | null) => text?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.]{1,40})?/)?.[0];
/** Effort, mode and kind names as one token; `empty` stands for an empty value. */
export const token = (value: unknown, empty = "(none)") => String(value ?? "").replace(/[^\w.:@/+-]/g, "_").slice(0, 80) || empty;
/** A model's name and tag only: a registry host or account namespace before the last `/` is dropped. */
export const modelToken = (value: unknown) => token(String(value ?? "").replace(/^.*\//, ""));

/** The Host's conversation key (the provider's session UUID), never its title, folders or documents. */
export const conversationField = (id: string) => `conversation=${/^[A-Za-z0-9-]{1,64}$/.test(id) ? id : "(other)"}`;

/** Whether the Ollama address is this computer and its port; the host name can name a company machine. */
export function ollamaAddress(url: string): string {
  try {
    const address = new URL(url), host = address.hostname.replace(/^\[|\]$/g, "");
    const loopback = host === "localhost" || host === "::1" || /^127\./.test(host);
    return `${loopback ? "loopback" : "remote"}:${address.port || (address.protocol === "https:" ? "443" : "80")}`;
  } catch { return "invalid"; }
}

const exitFields = (child?: ChildProcess) =>
  child?.exitCode != null ? ` exitCode=${child.exitCode}` : child?.signalCode ? ` signal=${child.signalCode}` : "";
const exited = (child?: ChildProcess) => child?.exitCode != null || !!child?.signalCode;

/**
 * Host-classified kind of a failed provider request: a Node system error code, the JSON-RPC code of a provider's
 * error response, a Host timeout, a lost process, or another Host rejection.
 */
export function errorFields(error: unknown): string {
  const value = error && typeof error === "object" ? error as { code?: unknown; providerCode?: unknown; message?: unknown } : undefined;
  if (typeof value?.code === "string" && /^E[A-Z0-9_]{1,40}$/.test(value.code)) return `error=${value.code}`;
  const rpc = value && "providerCode" in value ? value.providerCode : error instanceof Error ? undefined : value?.code;
  if (typeof rpc === "number") return `error=provider code=${rpc}`;
  if (value && "providerCode" in value) return "error=provider";
  const message = typeof value?.message === "string" ? value.message : "";
  if (/timed out/i.test(message)) return "error=timeout";
  if (/exited|not running|disconnected|stream closed/i.test(message)) return "error=disconnected";
  return "error=host";
}

/** Codex's own failure category (`codexErrorInfo`) and HTTP status, never its message. */
export function codexErrorFields(error: { codexErrorInfo?: unknown } | null | undefined): string {
  const info = error?.codexErrorInfo;
  if (typeof info === "string") return `error=${token(info)}`;
  if (info && typeof info === "object" && Object.keys(info).length === 1) {
    const [name, detail] = Object.entries(info)[0]!;
    const status = (detail as { httpStatusCode?: unknown } | null)?.httpStatusCode;
    return `error=${token(name)}${typeof status === "number" ? ` status=${status}` : ""}`;
  }
  return "error=provider";
}

/** `role`: `main` serves conversations and catalogs; `probe` is a diagnostic process that exits after its check. */
export function processLog(log: ProviderDaemonLog | undefined, provider: AiProvider, role: "main" | "probe") {
  const name = `provider=${provider} engine=${providerEngine(provider)} role=${role}`;
  return {
    started(state: Launch) {
      const key = `provider process started ${name}${versionField(state.version)}${state.fields ?? ""}`;
      log?.report(`start ${provider} ${role}`, key, `${key} ${elapsed(state.started)}`);
    },
    failed(state: Launch, error: unknown) {
      const spawnError = typeof (error as { syscall?: unknown })?.syscall === "string" && (error as { syscall: string }).syscall.startsWith("spawn");
      const stage = spawnError ? "spawn" : state.stage, time = elapsed(state.started), child = state.child;
      let written = false;
      const write = () => {
        if (written) return;
        written = true;
        const kind = stage === "executable" ? `error=${!state.bin ? "missing" : state.version === null ? "not-runnable" : state.version === undefined ? "host" : "unsupported-version"}`
          : exited(child) ? `error=exited${exitFields(child)}` : errorFields(error);
        const key = `provider process failed ${name}${versionField(state.version)}${state.fields ?? ""} stage=${stage} ${kind}`;
        log?.report(`start ${provider} ${role}`, key, `${key} ${time}`);
      };
      // A closed stream can reject before the exit code arrives; wait briefly so the line can name the code.
      if (stage === "initialize" && child && !exited(child) && errorFields(error) === "error=disconnected") {
        const timer = setTimeout(write, 1000);
        timer.unref();
        child.once("exit", () => { clearTimeout(timer); write(); });
      } else write();
    },
    /** An exit the Host did not ask for, after the process was ready. */
    exited(child: ChildProcess, activeTurn: boolean) {
      log?.report(`exit ${provider} ${role}`, `provider process exited ${name}${exitFields(child)} activeTurn=${activeTurn}`);
    },
  };
}
const versionField = (version?: string | null) => { const number = versionNumber(version); return number ? ` version=${number}` : ""; };
