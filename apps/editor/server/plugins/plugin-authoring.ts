import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { accessPath, canonicalFilePath, LOCAL_FILE_ACCESS, type FileAccess } from "../file-access.ts";
import { SDK_VERSION, validateManifest } from "@litzio/plugin-sdk";

import { authoringTemplate } from "./authoring-templates.ts";

export function scaffoldPlugin(directory: string, id: string, access: FileAccess = LOCAL_FILE_ACCESS, creationScope: FileAccess = LOCAL_FILE_ACCESS, template: "greet" | "query" | "file" | "screen" | "chart" = "greet", expectedDirectory?: string) {
  if (!["greet", "query", "file", "screen", "chart"].includes(template)) throw new Error("Unknown plugin template");
  const example = template === "greet" ? undefined : authoringTemplate(id, template);
  let manifest = validateManifest({ schemaVersion: 1, id, tier: "community", publisher: { id: "local", name: "Local author" }, name: "인사말 예제", version: "0.1.0", requiresSdk: `>=${SDK_VERSION} <1.0.0`, entry: "host.js",
    contributes: { operations: [{ id: "greet", version: 1, effect: "read", scope: "host", assistant: true,
      inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
      outputSchema: { type: "object", properties: { greeting: { type: "string" } }, required: ["greeting"], additionalProperties: false } }] } });
  if (example) manifest = validateManifest({ ...manifest, ...example.manifest });
  if (!path.isAbsolute(directory)) throw new Error("Use an absolute directory on the target Host");
  // Require a new directory; no pre-existing files are ever overwritten.
  directory = accessPath(accessPath(directory, access, true), creationScope, true);
  const expected = expectedDirectory ?? path.join(canonicalFilePath(path.dirname(directory)), path.basename(directory));
  const checkDirectory = () => {
    if (path.relative(expected, canonicalFilePath(directory)) !== "") throw new Error("Plugin scaffold directory changed; inspect created files before retrying");
  };
  mkdirSync(directory);
  checkDirectory();
  const files: Record<string, string> = {
    "litzio-plugin.json": JSON.stringify(manifest, null, 2) + "\n",
    "package.json": JSON.stringify({ name: id, version: manifest.version, type: "module", private: true }, null, 2) + "\n",
    "jsconfig.json": JSON.stringify({ compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", paths: { "@litzio/plugin-sdk": ["./plugin-sdk.d.ts"] } }, include: ["host.js", "plugin-sdk.d.ts"] }, null, 2) + "\n",
    // Starter declarations are editor hints, not a standalone runtime SDK.
    "plugin-sdk.d.ts": `export declare const SDK_VERSION: string;
export type PluginErrorKind = "auth" | "forbidden" | "not_found" | "unavailable" | "timeout" | "failed";
export declare class PluginOperationError extends Error { readonly kind: PluginErrorKind; constructor(kind: PluginErrorKind); }
export declare const JOB_FILE_MAX_BYTES: number;
export type JobInput = { requestId: string; root: string; file: string; output: string; resultFile?: { path: string; maxBytes: number } };
export type PluginContext = { secrets?: Readonly<Record<string, string>>; settings: Readonly<Record<string, unknown>>; platform: string; env: Readonly<Record<string, string | undefined>>; isDirectory(path: string): boolean };
`,
    "host.js": `import { SDK_VERSION, PluginOperationError } from "@litzio/plugin-sdk";
// Host-provided SDK: do not install/bundle it; standalone node host.js is unsupported.
/** @param {import("@litzio/plugin-sdk").PluginContext} context */
export function activate(context) {
  return {
    operations: {
      // External service failure example: throw new PluginOperationError("auth");
      // K1 start: create requestId state, launch background work with a catch handler,
      // then return {state:"running",phase:"Accepted"} within 10s. Never await completion.
      // status reports completion/failure; stop/dispose cancel all owned resources.
      greet: ({ name }) => ({ greeting: "Hello, " + name + "!" }),
    },
    status: () => ({ available: true, message: "Ready (SDK " + SDK_VERSION + ")", folders: [], decorations: [], accounts: [] }),
    dispose() {},
  };
}
`,
  };
  if (example) { files["host.js"] = example.source; if ("screen" in example && example.screen) files["screen.jsx"] = example.screen; }
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), content, { flag: "wx" });
    checkDirectory();
  }
  return { id, directory, files: Object.keys(files) };
}
