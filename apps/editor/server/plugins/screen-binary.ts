import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Must run before esbuild's CommonJS module captures ESBUILD_BINARY_PATH.
const binary = fileURLToPath(new URL(process.platform === "win32" ? "./esbuild.exe" : "./esbuild", import.meta.url));
if (existsSync(binary)) {
  process.env.ESBUILD_BINARY_PATH = binary;
  // Bundled sync compilation cannot use esbuild's original worker __filename.
  process.env.ESBUILD_WORKER_THREADS = "0";
}
