// RunAsNode helper runs outside the app profile, after the UI and its writers exit.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { localResetLocations, executeAppReset } from "../../editor/server/app-reset.ts";
import { processStart } from "../../editor/server/daemon-state.ts";

type Request = { parentPid: number; parentStarted: string; profile: string; updaterCache: string; revision: string;
  removeFolders: boolean; receipt: string; executable: string; args: string[] };
let cancelled = false;
process.on("message", message => { if ((message as { cancel?: boolean })?.cancel) cancelled = true; });
process.once("message", async message => {
  const request = message as Request;
  if (!Number.isSafeInteger(request.parentPid) || !request.parentStarted || !path.isAbsolute(request.profile) || !path.isAbsolute(request.receipt) || !path.isAbsolute(request.executable)) process.exit(1);
  process.send?.({ waiting: true });
  const deadline = Date.now() + 30_000;
  while (!cancelled && processStart(request.parentPid) === request.parentStarted && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  if (cancelled || fs.existsSync(request.receipt + ".cancel")) process.exit(0);
  let result: unknown;
  try {
    result = processStart(request.parentPid) === request.parentStarted
      ? { outcome: "refused", reason: "Desktop exit was not confirmed; no data was deleted." }
      : executeAppReset(localResetLocations(request.profile, request.updaterCache, { packaged: true }),
        { confirmed: true, revision: request.revision, removeFolders: request.removeFolders });
  } catch { result = { outcome: "failure", reason: "The reset operation failed. Inspect local data before trying again." }; }
  // A receipt write failure must still reopen Desktop, which reports the missing result.
  try { fs.writeFileSync(request.receipt, JSON.stringify(result), { mode: 0o600 }); } catch {}
  // Keep only the result file outside the deleted profile. The next start reads/removes it.
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  // The helper is hidden; the relaunched user-facing GUI must be visible.
  const child = spawn(request.executable, [...request.args, `--app-reset-result=${request.receipt}`], { detached: true, windowsHide: false, stdio: "ignore", env });
  child.unref();
  if (process.connected) process.disconnect();
});
