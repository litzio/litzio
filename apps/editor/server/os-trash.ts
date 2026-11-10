import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { WINDOWS_TRASH_SCRIPT, WINDOWS_TRASH_SOURCE } from "./windows-trash.ts";

const execute = promisify(execFile);
/** Only adapters with a non-mutating failure guarantee may use this error. */
export class TrashPreservedError extends Error {}
export async function osTrashAvailable(): Promise<boolean> {
  if (process.platform === "linux") return true;
  if (process.platform !== "win32") return false;
  try {
    const result = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::UserInteractive -and ([Environment]::OSVersion.Version -ge [Version]'6.2')"], { windowsHide: true });
    return result.stdout.trim() === "True";
  } catch { return false; }
}

type TrashOptions = {
  platform?: NodeJS.Platform;
  dataHome?: string;
  home?: string;
  rename?: typeof fs.rename;
};

/** Home trash only: rename must fail across devices, never copy/unlink. */
async function linuxTrash(file: string, options: TrashOptions): Promise<void> {
  const dataHome = options.dataHome ?? process.env.XDG_DATA_HOME;
  const trash = path.join(dataHome && path.isAbsolute(dataHome) ? dataHome : path.join(options.home ?? homedir(), ".local", "share"), "Trash");
  const files = path.join(trash, "files"), info = path.join(trash, "info");
  let phase = "create the home trash folders";
  try {
    await fs.mkdir(files, { recursive: true, mode: 0o700 });
    await fs.mkdir(info, { recursive: true, mode: 0o700 });
    phase = "write the trash information";
    for (let suffix = 0; ; suffix++) {
      const name = path.basename(file) + (suffix ? `.${suffix}` : "");
      const destination = path.join(files, name), metadata = path.join(info, name + ".trashinfo");
      let handle;
      try { handle = await fs.open(metadata, "wx", 0o600); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") continue; throw error; }
      try {
        // An orphaned files entry also reserves its name. Never overwrite it.
        let occupied = true;
        try { await fs.lstat(destination); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          occupied = false;
        }
        if (!occupied) {
          const date = new Date();
          const pad = (value: number) => String(value).padStart(2, "0");
          const deleted = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
          const original = path.resolve(file);
          const encoded = original.split(path.sep).map(part => encodeURIComponent(part)).join("/");
          await handle.writeFile(`[Trash Info]\nPath=${encoded}\nDeletionDate=${deleted}\n`);
          await handle.close();
          phase = "move the file to the home trash";
          await (options.rename ?? fs.rename)(file, destination);
          return;
        }
      } catch (error) {
        await handle.close();
        await fs.unlink(metadata);
        throw error;
      }
      await handle.close();
      await fs.unlink(metadata);
    }
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    // Deliberately path-free, including when the trash is outside allowed roots.
    const reason = code === "EXDEV" ? "The file and home trash are on different devices; per-device trash is unsupported." : `Could not ${phase}.`;
    throw new TrashPreservedError(`OS trash unavailable: ${reason}${code ? ` (${code})` : ""}`, { cause });
  }
}

/** OS-owned trash only; never fall back to unlink. Windows failures may be partial. */
export async function trashFile(file: string, options: TrashOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    try {
      await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-Command", WINDOWS_TRASH_SCRIPT],
        { windowsHide: true, env: { ...process.env, LITZIO_TRASH_FILE: file, LITZIO_TRASH_SOURCE: WINDOWS_TRASH_SOURCE } });
    } catch (error) {
      if (String((error as { stderr?: string }).stderr).includes("LITZIO_TRASH_UNAVAILABLE")) throw new TrashPreservedError("OS trash unavailable: an interactive Windows 8 or newer session is required.");
      throw error;
    }
  } else if (platform === "linux") {
    await linuxTrash(file, options);
  } else throw new TrashPreservedError("OS trash is unavailable on this platform.");
}
