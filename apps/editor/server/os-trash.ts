import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** OS-owned trash only. Failure must preserve the file; never fall back to unlink. */
export async function trashFile(file: string): Promise<void> {
  if (process.platform === "win32") {
    await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "$ErrorActionPreference='Stop'; Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:LITZIO_TRASH_FILE, 'OnlyErrorDialogs', 'SendToRecycleBin', 'ThrowException')"],
    { windowsHide: true, env: { ...process.env, LITZIO_TRASH_FILE: file } });
  } else if (process.platform === "linux") {
    await execute("gio", ["trash", "--", file]);
  } else throw new Error("OS trash is unavailable on this platform.");
}
