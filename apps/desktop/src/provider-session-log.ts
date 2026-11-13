import type { ProviderLogFailure } from "../../editor/shared/assistant.ts";
import { spawn } from "node:child_process";
import path from "node:path";
import { sessionIdPattern, validateProviderLog } from "../../editor/server/provider-session-log.ts";

/** Main resolves only its own local daemon; renderer paths and remote origins never reach the OS. */
export async function openProviderSessionLog(input: { id: unknown; provider: unknown; action: unknown }, resolve: (id: string, provider: string) => Promise<any>, reveal: (file: string) => void, open = openNotepad) {
  const { id, provider, action } = input;
  if (process.platform !== "win32" || typeof id !== "string" || !sessionIdPattern.test(id) || !["codex", "copilot"].includes(provider as string) || !["open", "reveal"].includes(action as string)) throw new Error("Provider logs can only be opened from the local Windows Desktop Host.");
  const result = await resolve(id, provider as string);
  if (result.available === false) return result as ProviderLogFailure;
  if (result.id !== id || result.provider !== provider || typeof result.path !== "string") throw new Error("Provider log identity changed.");
  let file: string;
  try { file = validateProviderLog(result.path, provider as "codex" | "copilot", id); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { available: false as const, reason: code === "ENOENT" ? "missing" as const : code === "EACCES" || code === "EPERM" ? "denied" as const : "unverified" as const };
  }
  if (action === "reveal") { reveal(file); return; }
  try { await open(file); } catch { return { available: false as const, reason: "launch" as const }; }
}
function openNotepad(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(process.env.SystemRoot ?? "C:/Windows", "System32", "notepad.exe"), [file], { shell: false, stdio: "ignore", windowsHide: false });
    child.once("error", () => reject(new Error("Could not start Notepad. Use Show log location instead.")));
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
