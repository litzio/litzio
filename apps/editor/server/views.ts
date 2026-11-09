import type { PluginHost } from "./plugins/plugin-host.ts";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { builtinViewOperations } from "@litzio/core/views";
import { ViewInputError, evaluateQueryView, serializeCatalogView, validateCatalogView, validateViewInputs, createCatalogV2, catalogViewSchema, isOperationQueryView, type QueryView, type ViewProvenance } from "@litzio/core/views-v2";
import { isDeepStrictEqual } from "node:util";
import { VIEW_TRANSPORT_LIMITS } from "../shared/view-limits.ts";
import { publicOperationError } from "./plugins/operation-result.ts";
import { createFile, textRevision } from "@litzio/file-commit";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";
import { validFileStem } from "../shared/file-operations.ts";

import { STATISTICS_PLUGIN_ID, STATISTICS_LIMITS } from "./view-statistics.ts";
export { STATISTICS_PLUGIN_ID, STATISTICS_LIMITS, folderStatistics } from "./view-statistics.ts";
import { query, ViewRefusal } from "./view-validation.ts";
import { favouritesDirectory, openFavourite } from "./view-favorites.ts";
import { runViewQuery } from "./view-query.ts";

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
      const result = await runViewQuery(view, input, scope, operations, receipt);
      if ("error" in result) return { error: result.error, errorKind: result.errorKind, sourceReceipt: result.sourceReceipt, receipt: result.receipt };
      return { ...result };
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
