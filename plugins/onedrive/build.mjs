import { artifactDigest } from "../../apps/editor/server/plugins/artifact-digest.mjs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
const directory = new URL("./artifact/", import.meta.url); rmSync(directory, { recursive: true, force: true }); mkdirSync(directory, { recursive: true });
await build({ entryPoints: [new URL("./src/host.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], outfile: new URL("host.js", directory).pathname.replace(/^\/([A-Za-z]:)/, "$1"), bundle: true, platform: "node", format: "esm" });
const manifest = JSON.parse(readFileSync(new URL("./litzio-plugin.json", import.meta.url), "utf8")); manifest.entry = "host.js";
writeFileSync(new URL("litzio-plugin.json", directory), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(new URL("package.json", directory), JSON.stringify({ name: "@litzio/onedrive", version: manifest.version, type: "module" }) + "\n");

writeFileSync(new URL("./digest.json", import.meta.url), JSON.stringify({ digest: artifactDigest(fileURLToPath(directory)) }) + "\n");
