import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const directory = new URL("./artifact/", import.meta.url); mkdirSync(directory, { recursive: true });
await build({ entryPoints: [new URL("./src/host.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], outfile: new URL("host.js", directory).pathname.replace(/^\/([A-Za-z]:)/, "$1"), bundle: true, platform: "node", format: "esm" });
const manifest = JSON.parse(readFileSync(new URL("./litzio-plugin.json", import.meta.url), "utf8")); manifest.entry = "host.js";
writeFileSync(new URL("litzio-plugin.json", directory), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(new URL("package.json", directory), JSON.stringify({ name: "@litzio/onedrive", version: manifest.version, type: "module" }) + "\n");
