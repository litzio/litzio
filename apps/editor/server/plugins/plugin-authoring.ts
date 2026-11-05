import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";
import { validateManifest } from "@litzio/plugin-sdk";

export function scaffoldPlugin(directory: string, id: string, access: FileAccess = LOCAL_FILE_ACCESS, creationScope: FileAccess = LOCAL_FILE_ACCESS) {
  const manifest = validateManifest({ schemaVersion: 1, id, tier: "community", publisher: { id: "local", name: "Local author" }, name: id, version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js",
    contributes: { operations: [{ id: "greet", version: 1, effect: "read", scope: "host", assistant: true,
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
      outputSchema: { type: "object", properties: { greeting: { type: "string" } }, required: ["greeting"], additionalProperties: false } }] } });
  if (!path.isAbsolute(directory)) throw new Error("Use an absolute directory on the target Host");
  // Require a new directory; no pre-existing files are ever overwritten.
  directory = accessPath(accessPath(directory, access, true), creationScope, true);
  mkdirSync(directory);
  const files = {
    "litzio-plugin.json": JSON.stringify({ ...manifest, contributes: { operations: manifest.contributes.operations }, secrets: undefined }, null, 2) + "\n",
    "package.json": JSON.stringify({ name: id, version: manifest.version, type: "module", private: true }, null, 2) + "\n",
    "host.js": `export function activate(context) {
  return {
    operations: {
      // External service failure example: throw Object.assign(new Error(), { kind: "auth" });
      // SDK equivalent (bundle dependency): throw new PluginOperationError("auth");
      // K1 start: create requestId state, launch background work with a catch handler,
      // then return {state:"running",phase:"Accepted"} within 10s. Never await completion.
      // status reports completion/failure; stop/dispose cancel all owned resources.
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
