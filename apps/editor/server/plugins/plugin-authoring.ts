import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateManifest } from "@litzio/plugin-sdk";

export function scaffoldPlugin(directory: string, id: string) {
  const manifest = validateManifest({ schemaVersion: 1, id, tier: "community", publisher: { id: "local", name: "Local author" }, name: id, version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js",
    contributes: { operations: [{ id: "greet", version: 1, effect: "read", scope: "host", assistant: true,
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
      outputSchema: { type: "object", properties: { greeting: { type: "string" } }, required: ["greeting"], additionalProperties: false } }] } });
  if (!path.isAbsolute(directory)) throw new Error("Use an absolute directory on the target Host");
  // Require a new directory; no pre-existing files are ever overwritten.
  mkdirSync(directory);
  const files = {
    "litzio-plugin.json": JSON.stringify({ ...manifest, contributes: { operations: manifest.contributes.operations }, secrets: undefined }, null, 2) + "\n",
    "package.json": JSON.stringify({ name: id, version: manifest.version, type: "module", private: true }, null, 2) + "\n",
    "host.js": `export function activate(context) {
  return {
    operations: {
      greet: ({ name }) => ({ greeting: "Hello, " + name + "!" }),
    },
    status: () => ({ available: true, message: "Ready", folders: [], decorations: [], accounts: [] }),
    dispose() {},
  };
}
`,
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(directory, name), content, { flag: "wx" });
  return { id, directory, files: Object.keys(files) };
}
