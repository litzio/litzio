import { lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isolatedHostEnvironment } from "../../../../test/helpers/isolated-host-environment.ts";

/** Only the runner-created directory is eligible for cleanup, never an env-supplied path. */
export function browserHostEnvironment(env: NodeJS.ProcessEnv): { env: NodeJS.ProcessEnv; cleanup(): void } {
  if (env.LITZIO_BROWSER_URL) return { env: {}, cleanup() {} };
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(path.join(parent, "litzio-browser-host-"));
  const identity = lstatSync(directory);
  return {
    env: {
      LITZIO_BROWSER_DAEMON_DIR: directory,
      ...isolatedHostEnvironment(directory),
      LITZIO_DATA_DIR: env.LITZIO_DATA_DIR ?? path.join(directory, "data"),
    },
    cleanup() {
      // Refuse replacement directories, symlinks/junctions and changed ancestors.
      // If ownership is ambiguous, leave the directory for inspection.
      const current = lstatSync(directory);
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino
        || realpathSync(directory) !== directory || path.dirname(directory) !== parent) {
        throw new Error(`Refusing to remove browser Host directory with changed ownership: ${directory}`);
      }
      rmSync(directory, { recursive: true });
    },
  };
}
