import type { PluginHost } from "./plugins/plugin-host.ts";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ViewInputError, serializeCatalogView, validateCatalogView, validateViewInputs, createCatalogV2, catalogViewSchema } from "@litzio/core/views-v2";
import { VIEW_TRANSPORT_LIMITS } from "../shared/view-limits.ts";
import { publicOperationError } from "./plugins/operation-result.ts";
import type { FileAccess } from "./file-access.ts";
import { query, ViewRefusal } from "./view-validation.ts";
import { runViewQuery } from "./view-query.ts";

const owner = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
export const viewRequestSchema = z.union([
  z.strictObject({ action: z.literal("catalog") }),
  z.strictObject({ action: z.literal("validate"), view: z.unknown(), plugin: owner.optional() }),
  z.strictObject({ action: z.literal("run"), view: z.unknown(), input: z.record(z.string(), z.unknown()).optional() }),
]);
export type ViewExecutionScope = { access: FileAccess; plugins?: PluginHost };
export async function executeViewOperation(value: unknown, scope: ViewExecutionScope): Promise<Awaited<ReturnType<typeof execute>>> {
  const result = await execute(value, scope);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") <= VIEW_TRANSPORT_LIMITS.responseBytes) return result;
  return { ...publicOperationError(undefined, "read"), error: "View response exceeds byte limit.", code: "invalid-view-request", receipt: { ...result.receipt, outcome: "failure" as const } };
}
async function execute(value: unknown, scope: ViewExecutionScope) {
  const receipt = { requestId: randomUUID(), operation: "view", version: 1, scope: "host", outcome: "failure" as "failure" | "success", timestamp: new Date().toISOString() };
  try {
    if (Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > VIEW_TRANSPORT_LIMITS.requestBytes) throw new Error("Request exceeds byte limit");
    const operations = scope.plugins?.viewOperations() ?? [];
    const supplied = value as { action?: unknown; input?: unknown } | null;
    if (supplied?.action === "run" && supplied.input !== undefined && !z.record(z.string(), z.unknown()).safeParse(supplied.input).success) {
      receipt.operation = "view.run";
      throw new ViewInputError("Invalid operation args", [{ keyword: "type" }]);
    }
    const input = viewRequestSchema.parse(value);
    receipt.operation = `view.${input.action}`;
    const success = { ...receipt, outcome: "success" as const };
    if (input.action === "catalog") {
      const catalog = createCatalogV2([]);
      const available = operations.flatMap(operation => {
        try { return createCatalogV2([operation]).operations.map(op => ({ ...op, plugin: scope.plugins?.viewOperationOwner(op.operation) })); }
        catch { return []; }
      });
      return { catalog: { ...catalog, operations: available }, views: scope.plugins?.viewContributions() ?? [], screens: scope.plugins?.viewScreens() ?? [], receipt: success };
    }
    if (input.action === "validate") {
      const parsed = catalogViewSchema.parse(input.view);
      if (parsed.profile === "review") {
        const view = validateCatalogView(parsed, operations);
        if (!scope.plugins) throw new ViewRefusal("unavailable");
        scope.plugins.reviews.validateSource(parsed.sources.review);
        return { view, plugin: parsed.sources.review.plugin, canonical: serializeCatalogView(view, operations), receipt: success };
      }
      const view = query(input.view, operations);
      if (scope.plugins?.viewOperationOwner(view.sources.stats.operation) !== view.owner || input.plugin !== undefined && input.plugin !== view.owner) throw new ViewRefusal("owner-mismatch");
      return { view, plugin: view.owner, inputState: validateViewInputs(view, operations.find(op => op.operation === view.sources.stats.operation && op.version === view.sources.stats.version)!), canonical: serializeCatalogView(view, operations), receipt: success };
    }
    const view = query(input.view, operations, input.input);
    if (scope.plugins?.viewOperationOwner(view.sources.stats.operation) !== view.owner) throw new ViewRefusal("owner-mismatch");
    const result = await runViewQuery(view, scope, operations, receipt);
    if ("error" in result) return { error: result.error, errorKind: result.errorKind, sourceReceipt: result.sourceReceipt, receipt: result.receipt };
    return { ...result };
  } catch (error) {
    if (error instanceof ViewInputError) return { error: "View inputs are invalid. Check the indicated fields.", code: "invalid-input" as const, inputIssues: error.inputIssues, receipt };
    const code = error instanceof ViewRefusal ? error.code : "invalid-view-request";
    const messages = { unavailable: "View source unavailable, version changed or output fields incompatible. Check plugin settings.", "owner-mismatch": "Query source does not belong to this plugin.", "invalid-view-request": "View request is invalid. Check the definition and inputs." };
    return { ...publicOperationError(undefined, "read"), error: messages[code], code, receipt };
  }
}
