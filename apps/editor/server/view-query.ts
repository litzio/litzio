import fs from "node:fs";
import type { randomUUID } from "node:crypto";
import type { PluginHost } from "./plugins/plugin-host.ts";
import { parseOperationRowResult, type ViewOperation } from "@litzio/core/views";
import { evaluateQueryView, validateViewInputs, type OperationQueryView } from "@litzio/core/views-v2";
import { accessPath, type FileAccess } from "./file-access.ts";
import { folderStatistics } from "./view-statistics.ts";

export type ViewReceipt = { requestId: ReturnType<typeof randomUUID>; operation: string; version: number; scope: string; outcome: "failure" | "success"; timestamp: string };
/** Execute a registered query independently of generation and favorite storage. */
export async function runViewQuery(view: OperationQueryView, input: { root?: string }, scope: { access: FileAccess; plugins?: PluginHost }, operations: readonly ViewOperation[], receipt: ViewReceipt) {
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
  const parsed = parseOperationRowResult(data, operation.rowSchema);
  const coverage = Array.isArray(parsed) ? undefined : { truncated: parsed.truncated, ...(parsed.total !== undefined ? { total: parsed.total } : {}), returned: parsed.rows.length };
  data = Array.isArray(parsed) ? parsed : parsed.rows;
  const fields = Object.fromEntries(Object.entries(operations.find(op => op.operation === source.operation)!.rowSchema).filter(([, f]) => !f.secret).map(([name, f]) => [name, f.label]));
  return { args: source.args, fields, ...(coverage ? { coverage } : {}), ...evaluateQueryView(view, data, operations), ...(root ? { target: { root } } : {}), receipt: { ...receipt, outcome: "success" as const } };
}
