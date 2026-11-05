import type { PluginHost } from "./plugins/plugin-host.ts";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getEditableDocument, hasNativeMarker, parse } from "@litzio/core";
import { evaluateView, parseView, serializeView, validateView, VIEW_LIMITS, builtinViewOperations, type ViewOperation, type StatisticsRow } from "@litzio/core/views";
import { createFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { accessPath, fileErrorMessage, inside, RootAccess, type FileAccess } from "./file-access.ts";
import { hostPaths } from "./host-paths.ts";
import { validFileStem } from "../shared/file-operations.ts";

// An app-owned built-in source; this is not a plugin SDK folder-scope extension.
export const STATISTICS_PLUGIN_ID = "litzio.statistics";
export const STATISTICS_LIMITS = { files: 1000, fileBytes: 1048576, entries: 5000, depth: 16, favourites: 200 };
const name = z.string().min(1).max(100).refine(v => validFileStem(v) && v === v.trim() && v === v.normalize("NFC"), "Invalid favourite name");
const owner = z.literal(STATISTICS_PLUGIN_ID);
export const viewRequestSchema = z.union([
  z.strictObject({ action: z.literal("validate"), view: z.unknown() }),
  z.strictObject({ action: z.literal("save"), plugin: owner, name, view: z.unknown() }),
  z.strictObject({ action: z.literal("list"), plugin: owner }),
  z.strictObject({ action: z.literal("open"), plugin: owner, name }),
  z.strictObject({ action: z.literal("run"), root: z.string().min(1), view: z.unknown() }),
  z.strictObject({ action: z.literal("run"), root: z.string().min(1), plugin: owner, name }),
]);

function favouritesDirectory(plugin: string, directory?: string): string {
  return path.join(directory ?? path.join(path.dirname(hostPaths().settingsFile("plugins")), "plugins"), plugin, "views");
}
function openFavourite(directory: string, name: string, operations: readonly ViewOperation[]) {
  const boundary = new RootAccess([directory]);
  const file = accessPath(path.join(directory, `${name}.view.json`), boundary);
  if (!inside(fs.realpathSync(directory), fs.realpathSync(file)) || fs.lstatSync(file).isSymbolicLink()) throw new Error("Favourite must be a local regular file");
  if (fs.statSync(file).size > VIEW_LIMITS.bytes) throw new Error("View exceeds byte limit");
  return parseView(decodeUtf8(fs.readFileSync(file)), operations);
}

export function folderStatistics(root: string, folder: string | undefined, access: FileAccess): StatisticsRow[] {
  root = fs.realpathSync(accessPath(root, access));
  const boundary = new RootAccess([root]);
  const selected = accessPath(path.resolve(root, folder ?? "."), boundary);
  let files = 0, entries = 0;
  const rows: StatisticsRow[] = [];
  function walk(directory: string, depth: number): void {
    if (depth > STATISTICS_LIMITS.depth) throw new Error("Statistics depth limit exceeded");
    const row: StatisticsRow = { folder: path.relative(root, directory).split(path.sep).join("/") || ".", documents: 0, headings: 0, modified: null };
    const children: string[] = [];
    // Every directory gets a row, including empty folders; only native .md documents count.
    for (const entry of fs.readdirSync(accessPath(directory, boundary), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (++entries > STATISTICS_LIMITS.entries) throw new Error("Statistics entry limit exceeded");
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const file = accessPath(path.join(directory, entry.name), boundary);
      if (entry.isDirectory()) { children.push(file); continue; }
      if (!entry.isFile() || path.extname(file).toLowerCase() !== ".md") continue;
      if (++files > STATISTICS_LIMITS.files) throw new Error("Statistics file count limit exceeded");
      const info = fs.statSync(file);
      if (info.size > STATISTICS_LIMITS.fileBytes) throw new Error("Statistics document size limit exceeded");
      const bytes = fs.readFileSync(accessPath(file, boundary));
      if (bytes.length > STATISTICS_LIMITS.fileBytes) throw new Error("Statistics document size limit exceeded");
      const source = decodeUtf8(bytes);
      if (!hasNativeMarker(source)) continue;
      const document = getEditableDocument(parse(source));
      row.documents++;
      row.headings += document.blocks.filter(block => block.block === "heading").length;
      const modified = info.mtime.toISOString();
      if (row.modified === null || modified > row.modified) row.modified = modified;
    }
    rows.push(row);
    if (rows.length > VIEW_LIMITS.rows) throw new Error("Statistics row limit exceeded");
    for (const child of children) walk(child, depth + 1);
  }
  walk(selected, 0);
  return rows;
}

/** One target Host, no fallback, no automatic query on opening a definition. */
export async function executeViewOperation(value: unknown, scope: { access: FileAccess; directory?: string; plugins?: PluginHost }) {
  const receipt = { requestId: randomUUID(), operation: "view", version: 1, scope: "host" as string, outcome: "failure" as "failure" | "success", timestamp: new Date().toISOString() };
  try {
    const operations = scope.plugins?.viewOperations() ?? builtinViewOperations;
    const input = viewRequestSchema.parse(value);
    receipt.operation = `view.${input.action}`;
    if (input.action === "validate") return { view: validateView(input.view, operations), canonical: serializeView(input.view, operations), receipt: { ...receipt, outcome: "success" as const } };
    if (input.action === "run") {
      receipt.scope = "folder";
      const view = "view" in input ? validateView(input.view, operations) : openFavourite(favouritesDirectory(input.plugin, scope.directory), input.name, operations);
      const root = fs.realpathSync(accessPath(input.root, scope.access));
      const source = view.sources.stats;
      let data: unknown;
      if (source.operation === "folder.statistics") data = folderStatistics(root, source.args.folder as string | undefined, scope.access);
      else {
        const reply = await scope.plugins!.invokeOperation(source.operation, source.args);
        if (reply.receipt.outcome !== "success") throw new Error("View source failed");
        data = reply.result;
      }
      const fields = Object.fromEntries(Object.entries(operations.find(op => op.operation === source.operation)!.rowSchema).filter(([, f]) => !f.secret).map(([name, f]) => [name, f.label]));
      return { fields, ...evaluateView(view, data, operations), target: { root }, receipt: { ...receipt, outcome: "success" as const } };
    }
    // App data is deliberately separate from document Roots, and callers cannot pick a path.
    const directory = favouritesDirectory(input.plugin, scope.directory);
    if (input.action === "save") {
      const canonical = serializeView(input.view, operations);
      fs.mkdirSync(directory, { recursive: true });
      const boundary = new RootAccess([directory]);
      const file = accessPath(path.join(directory, `${input.name}.view.json`), boundary, true);
      // Preserve case-insensitive favourite identity on all OSes. Exclusive create still
      // resolves identical-name races; no reservation or replacement path is used.
      if (fs.readdirSync(directory).some(item => item.toLowerCase() === `${input.name}.view.json`.toLowerCase())) throw new Error("Favourite name already exists");
      if (fs.readdirSync(directory).length >= STATISTICS_LIMITS.favourites) throw new Error("Favourite count limit exceeded");
      createFile(file, canonical);
      return { name: input.name, revision: textRevision(canonical), receipt: { ...receipt, outcome: "success" as const } };
    }
    if (input.action === "list") {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; entries = []; }
      const favourites = entries.filter(entry => entry.isFile() && entry.name.endsWith(".view.json")).map(entry => entry.name.slice(0, -10)).sort();
      if (favourites.length > STATISTICS_LIMITS.favourites) throw new Error("Favourite count limit exceeded");
      return { favourites, receipt: { ...receipt, outcome: "success" as const } };
    }
    const view = openFavourite(directory, input.name, operations);
    return { view, name: input.name, receipt: { ...receipt, outcome: "success" as const } };
  } catch (error) { return { error: fileErrorMessage(error, scope.access), receipt }; }
}
