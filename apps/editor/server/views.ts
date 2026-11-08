import type { PluginHost } from "./plugins/plugin-host.ts";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getEditableDocument, hasNativeMarker, parse } from "@litzio/core";
import { validateQueryBindings, builtinViewOperations, type ViewOperation, type StatisticsRow } from "@litzio/core/views";
import { ViewInputError, evaluateQueryView, serializeCatalogView, validateCatalogView, validateViewInputs, createCatalogV2, catalogViewSchema, VIEW_LIMITS, catalogViewByteLimit, isOperationQueryView, type QueryView, type ViewProvenance } from "@litzio/core/views-v2";
import { isDeepStrictEqual } from "node:util";
import { VIEW_TRANSPORT_LIMITS } from "../shared/view-limits.ts";
import { publicOperationError } from "./plugins/operation-result.ts";
import { createFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { accessPath, inside, RootAccess, type FileAccess } from "./file-access.ts";
import { hostPaths } from "./host-paths.ts";
import { validFileStem } from "../shared/file-operations.ts";

// An app-owned built-in source; this is not a plugin SDK folder-scope extension.
export const STATISTICS_PLUGIN_ID = "litzio.statistics";
export const STATISTICS_LIMITS = { files: 1000, fileBytes: 1048576, entries: 5000, depth: 16, favourites: 200 };
const name = z.string().min(1).max(100).refine(v => validFileStem(v) && v === v.trim() && v === v.normalize("NFC"), "Invalid favourite name");
const owner = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const args = z.record(z.string(), z.unknown()).optional();
export const viewRequestSchema = z.union([
  z.strictObject({ action: z.literal("catalog") }),
  z.strictObject({ action: z.literal("validate"), view: z.unknown(), plugin: owner.optional() }),
  z.strictObject({ action: z.literal("propose"), view: z.unknown(), plugin: owner.optional() }),
  z.strictObject({ action: z.literal("save"), plugin: owner.optional(), name, view: z.unknown(), input: args }),
  z.strictObject({ action: z.literal("list"), plugin: owner }),
  z.strictObject({ action: z.literal("open"), plugin: owner, name }),
  z.strictObject({ action: z.literal("run"), root: z.string().min(1).optional(), view: z.unknown(), input: args }),
  z.strictObject({ action: z.literal("run"), root: z.string().min(1).optional(), plugin: owner, name, input: args }),
]);

class ViewRefusal extends Error {
  constructor(readonly code: "unavailable" | "owner-mismatch") { super(code); }
}
function query(value: unknown, operations: readonly ViewOperation[], input?: Record<string, unknown>): QueryView {
  // Replace the entire args object before validation, including when saved args are incomplete.
  if (input !== undefined) {
    const envelope = value as QueryView;
    if (envelope?.sources?.stats?.kind === "assistant") throw new Error("Assistant data does not accept input");
    value = { ...envelope, sources: { ...envelope?.sources, stats: { ...envelope?.sources?.stats, args: input } } };
  }
  const parsed = catalogViewSchema.parse(value);
  if (parsed.profile === "query" && parsed.refresh === "manual") {
    const operation = operations.find(op => op.operation === parsed.sources.stats.operation && op.version === parsed.sources.stats.version);
    if (!operation) throw new ViewRefusal("unavailable");
    // Core owns binding semantics. A removed/private or incompatible output field
    // makes the source unavailable to this definition, including saved favorites.
    try { validateQueryBindings(parsed, [{ ...operation, validateArgs: () => true }]); }
    catch { throw new ViewRefusal("unavailable"); }
  }
  const view = validateCatalogView(parsed, operations);
  if (view.profile !== "query") throw new Error("Query profile required");
  return view;
}

function favouritesDirectory(plugin: string, directory?: string): string {
  return path.join(directory ?? path.join(path.dirname(hostPaths().settingsFile("plugins")), "plugins"), plugin, "views");
}
function openFavourite(directory: string, name: string, operations: readonly ViewOperation[], input?: Record<string, unknown>) {
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
export type ViewProposalScope = { owner: string; provenance: readonly ViewProvenance[] };
export type ViewExecutionScope = { access: FileAccess; directory?: string; plugins?: PluginHost; proposal?: ViewProposalScope };
export async function executeViewOperation(value: unknown, scope: ViewExecutionScope): Promise<Awaited<ReturnType<typeof execute>>> {
  const result = await execute(value, scope);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= VIEW_TRANSPORT_LIMITS.responseBytes) return result;
  return { ...publicOperationError(undefined, "read"), error: "View response exceeds byte limit.", code: "invalid-view-request", receipt: { ...result.receipt, outcome: "failure" as const } };
}
async function execute(value: unknown, scope: ViewExecutionScope) {
  const receipt = { requestId: randomUUID(), operation: "view", version: 1, scope: "host" as string, outcome: "failure" as "failure" | "success", timestamp: new Date().toISOString() };
  try {
    if (Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > VIEW_TRANSPORT_LIMITS.requestBytes) throw new Error("Request exceeds byte limit");
    const operations = scope.plugins?.viewOperations() ?? builtinViewOperations;
    // Replacement args must be an object; classify its envelope error as input,
    // without serializing Zod diagnostics or the rejected value.
    const supplied = value as { action?: unknown; input?: unknown } | null;
    if ((supplied?.action === "run" || supplied?.action === "save") && supplied.input !== undefined && !z.record(z.string(), z.unknown()).safeParse(supplied.input).success) {
      receipt.operation = `view.${supplied.action}`;
      throw new ViewInputError("Invalid operation args", [{ keyword: "type" }]);
    }
    const input = viewRequestSchema.parse(value);
    receipt.operation = `view.${input.action}`;
    const success = { ...receipt, outcome: "success" as const };
    const operationOwner = (operation: string) => operation === "folder.statistics" ? STATISTICS_PLUGIN_ID : scope.plugins?.viewOperationOwner(operation);
    if (input.action === "catalog") {
      const catalog = createCatalogV2([]);
      // Runtime operations may use schemas that cannot safely persist view input.
      // Isolate that refusal to the individual operation, preserving Core's check.
      const available = operations.flatMap(operation => {
        try { return createCatalogV2([operation]).operations.map(op => ({ ...op, plugin: operationOwner(op.operation) })); }
        catch { return []; }
      });
      return { catalog: { ...catalog, operations: available }, views: scope.plugins?.viewContributions() ?? [], screens: scope.plugins?.viewScreens() ?? [], receipt: success };
    }
    const registeredOwner = (id: string) => id === STATISTICS_PLUGIN_ID || id === "litzio.assistant" || scope.plugins?.hasViewOwner(id);
    const ownerOf = (view: QueryView) => {
      if (isOperationQueryView(view) && operationOwner(view.sources.stats.operation) !== view.owner) throw new ViewRefusal("owner-mismatch");
      return view.owner;
    };
    const describe = (view: QueryView): { view: QueryView; plugin: string; inputState: { state: "ready" | "needs-input"; missing: string[] }; provenanceStatus?: "unverified" | "verified" } => ({ view, plugin: ownerOf(view),
      ...(isOperationQueryView(view) ? { inputState: validateViewInputs(view, operations.find(op => op.operation === view.sources.stats.operation && op.version === view.sources.stats.version)!) }
        : { inputState: { state: "ready" as const, missing: [] }, provenanceStatus: "unverified" as "unverified" | "verified" }) });
    if (input.action === "validate" || input.action === "propose") {
      const parsed = catalogViewSchema.parse(input.view);
      if (parsed.profile === "review") {
        const view = validateCatalogView(parsed, operations);
        if (!scope.plugins) throw new ViewRefusal("unavailable");
        scope.plugins.reviews.validateSource(parsed.sources.review);
        return { view, plugin: parsed.sources.review.plugin, canonical: serializeCatalogView(view, operations), receipt: success };
      }
      const view = query(input.view, operations);
      if (!registeredOwner(view.owner)) throw new ViewRefusal("owner-mismatch");
      const description = describe(view);
      let provenanceStatus = description.provenanceStatus;
      if (input.plugin !== undefined && input.plugin !== view.owner || scope.proposal && scope.proposal.owner !== view.owner) throw new ViewRefusal("owner-mismatch");
      if (input.action === "propose" && scope.proposal && !isOperationQueryView(view)) {
        if (!view.sources.stats.provenance.every(item => scope.proposal!.provenance.some(allowed => isDeepStrictEqual(item, allowed)))) throw new Error("Provenance outside request");
        provenanceStatus = "verified";
      }
      return { ...description, ...(provenanceStatus ? { provenanceStatus } : {}), canonical: serializeCatalogView(view, operations), receipt: success };
    }
    if (input.action === "run") {
      const view = "view" in input ? query(input.view, operations, input.input) : openFavourite(favouritesDirectory(input.plugin, scope.directory), input.name, operations, input.input);
      if ("plugin" in input && ownerOf(view) !== input.plugin) throw new ViewRefusal("owner-mismatch");
      ownerOf(view);
      if (!isOperationQueryView(view)) {
        if (input.input !== undefined) throw new Error("Assistant data does not accept input");
        const source = view.sources.stats;
        return { fields: Object.fromEntries(Object.entries(source.rowSchema).map(([name, field]) => [name, field.label])),
          ...evaluateQueryView(view, undefined, operations), provenance: source.provenance, generatedAt: source.generatedAt,
          ...(source.method === undefined ? {} : { method: source.method }), provenanceStatus: "unverified" as const, receipt: success };
      }
      const operation = operations.find(op => op.operation === view.sources.stats.operation && op.version === view.sources.stats.version)!;
      validateViewInputs(view, operation, "execute");
      const source = view.sources.stats;
      let data: unknown;
      let root: string | undefined;
      if (source.operation === "folder.statistics") {
        receipt.scope = "folder";
        if (!input.root) throw new Error("Connected query requires Root");
        root = fs.realpathSync(accessPath(input.root, scope.access));
        data = folderStatistics(root, source.args.folder as string | undefined, scope.access);
      }
      else {
        const reply = await scope.plugins!.invokeOperation(source.operation, source.args);
        if ("error" in reply) return { error: reply.error, errorKind: reply.errorKind, sourceReceipt: reply.receipt, receipt };
        data = reply.result;
      }
      const fields = Object.fromEntries(Object.entries(operations.find(op => op.operation === source.operation)!.rowSchema).filter(([, f]) => !f.secret).map(([name, f]) => [name, f.label]));
      return { args: source.args, fields, ...evaluateQueryView(view, data, operations), ...(root ? { target: { root } } : {}), receipt: { ...receipt, outcome: "success" as const } };
    }
    // App data is deliberately separate from document Roots, and callers cannot pick a path.
    const savedView = input.action === "save" ? query(input.view, operations, input.input) : undefined;
    const plugin = savedView ? ownerOf(savedView) : input.plugin;
    if (!plugin || input.plugin !== undefined && input.plugin !== plugin) throw new ViewRefusal("owner-mismatch");
    const directory = favouritesDirectory(plugin, scope.directory);
    if (input.action === "save") {
      if (!registeredOwner(plugin) || scope.proposal && scope.proposal.owner !== plugin) throw new ViewRefusal("owner-mismatch");
      const canonical = serializeCatalogView(savedView, operations);
      fs.mkdirSync(directory, { recursive: true });
      const boundary = new RootAccess([directory]);
      const file = accessPath(path.join(directory, `${input.name}.view.json`), boundary, true);
      // Preserve case-insensitive favourite identity on all OSes. Exclusive create still
      // resolves identical-name races; no reservation or replacement path is used.
      if (fs.readdirSync(directory).some(item => item.toLowerCase() === `${input.name}.view.json`.toLowerCase())) throw new Error("Favourite name already exists");
      if (fs.readdirSync(directory).length >= STATISTICS_LIMITS.favourites) throw new Error("Favourite count limit exceeded");
      createFile(file, canonical);
      return { plugin, name: input.name, ...(!isOperationQueryView(savedView!) ? { provenanceStatus: "unverified" as const } : {}), revision: textRevision(canonical), receipt: { ...receipt, outcome: "success" as const } };
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
    if (ownerOf(view) !== plugin) throw new ViewRefusal("owner-mismatch");
    return { ...describe(view), name: input.name, receipt: { ...receipt, outcome: "success" as const } };
  } catch (error) {
    if (error instanceof ViewInputError) return { error: "View inputs are invalid. Check the indicated fields.", code: "invalid-input" as const, inputIssues: error.inputIssues, receipt };
    const code = error instanceof ViewRefusal ? error.code : "invalid-view-request";
    const messages = { unavailable: "View source unavailable, version changed or output fields incompatible. Create a new view or check plugin settings.", "owner-mismatch": "Favourite source does not belong to this plugin.", "invalid-view-request": "View request is invalid or favourite storage is unavailable. Check the definition, inputs and favourite name." };
    return { ...publicOperationError(undefined, "read"), error: messages[code], code, receipt };
  }
}
