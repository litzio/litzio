import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { accessPath, type FileAccess } from "./file-access.ts";

// Short-lived notification leases only: no document, listing or browser session is retained.
const LEASE_MS = 15_000;
const DEBOUNCE_MS = 150;
const watches = new Map<string, { version: string; dev: number; ino: number; dispose(): void; renew(): void }>();

export function folderVersion(requestedRoot: string | undefined, access: FileAccess): { version: string } {
  if (!requestedRoot?.trim()) throw new Error("folder path is required");
  const root = fs.realpathSync(accessPath(requestedRoot.trim(), access));
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) throw new Error("folder path must point to a directory");
  let entry = watches.get(root);
  if (entry && (entry.dev !== stat.dev || entry.ino !== stat.ino)) { entry.dispose(); entry = undefined; }
  if (!entry) {
    let watcher: fs.FSWatcher | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout>;
    const dispose = () => {
      clearTimeout(expiry);
      watcher?.close();
      clearTimeout(debounce);
      watches.delete(root);
    };
    const current = { version: randomUUID(), dev: stat.dev, ino: stat.ino, dispose, renew() {
      clearTimeout(expiry);
      expiry = setTimeout(dispose, LEASE_MS);
      expiry.unref();
    } };
    try {
      watcher = fs.watch(root, { recursive: true, persistent: false }, () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { current.version = randomUUID(); }, DEBOUNCE_MS);
        debounce.unref();
      });
      watcher.on("error", dispose);
    } catch { /* Unsupported filesystems still have the browser's periodic/focus fallback. */ }
    entry = current;
    watches.set(root, entry);
  }
  entry.renew();
  return { version: entry.version };
}
