import { prepareScreenNpm } from "./screen-npm.ts";
import { hostPaths } from "../host-paths.ts";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Use the Host's Node/Electron runtime and bundled npm, never a system npm executable.
 * Command-line cache and log folders override project and user npmrc files.
 */
export async function installScreenDependencies(directory: string, npmData: { cache: string; logs: string }) {
  for (const folder of [npmData.cache, npmData.logs]) mkdirSync(folder, { recursive: true });
  const archive = fileURLToPath(new URL("./npm.tar.gz", import.meta.url));
  const npm = existsSync(archive) ? await prepareScreenNpm(archive, path.join(hostPaths().plugins, ".npm-cache")) : undefined;
  const entry = npm?.entry ?? path.join(path.dirname(createRequire(import.meta.url).resolve("npm/package.json")), "bin/npm-cli.js");
  return new Promise<{ installed: true; npm?: { extracted: boolean; milliseconds: number } }>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, "install", "--install-links", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", "--fetch-retries=0", "--fetch-timeout=30000", `--cache=${npmData.cache}`, `--logs-dir=${npmData.logs}`], { cwd: directory, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let diagnostics = "";
    child.stderr.on("data", data => { diagnostics = (diagnostics + data).slice(-4096); });
    child.on("error", () => reject(new Error("Unable to start bundled npm with the Host runtime. Repair the Litzio installation.")));
    child.on("exit", code => {
      if (code === 0) resolve({ installed: true, ...(npm ? { npm: { extracted: npm.extracted, milliseconds: npm.milliseconds } } : {}) });
      else {
        const kind = diagnostics.match(/(?:code|errno)\s+(E[A-Z_]+|[45]\d\d)/)?.[1] ?? "failed";
        reject(new Error(`Package download failed (${kind}). Check registry access, proxy and your existing npm configuration; lifecycle scripts and native builds are unsupported.`));
      }
    });
  });
}
