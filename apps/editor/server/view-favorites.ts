import fs from "node:fs";
import path from "node:path";
import type { ViewOperation } from "@litzio/core/views";
import { VIEW_LIMITS, catalogViewByteLimit } from "@litzio/core/views-v2";
import { decodeUtf8 } from "@litzio/file-commit";
import { accessPath, inside, RootAccess } from "./file-access.ts";
import { hostPaths } from "./host-paths.ts";
import { query } from "./view-validation.ts";

export function favouritesDirectory(plugin: string, directory?: string): string {
  return path.join(directory ?? path.join(path.dirname(hostPaths().settingsFile("plugins")), "plugins"), plugin, "views");
}
export function openFavourite(directory: string, name: string, operations: readonly ViewOperation[], input?: Record<string, unknown>) {
  const boundary = new RootAccess([directory]);
  const file = accessPath(path.join(directory, `${name}.view.json`), boundary);
  if (!inside(fs.realpathSync(directory), fs.realpathSync(file)) || fs.lstatSync(file).isSymbolicLink()) throw new Error("Favourite must be a local regular file");
  if (fs.statSync(file).size > VIEW_LIMITS.assistantBytes) throw new Error("View exceeds byte limit");
  const text = decodeUtf8(fs.readFileSync(file));
  if (Buffer.byteLength(text) > VIEW_LIMITS.assistantBytes) throw new Error("View exceeds byte limit");
  const view = query(JSON.parse(text), operations, input);
  if (Buffer.byteLength(text) > catalogViewByteLimit(view)) throw new Error("View exceeds byte limit");
  return view;
}
