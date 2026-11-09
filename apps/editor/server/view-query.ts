import type { randomUUID } from "node:crypto";
import type { PluginHost } from "./plugins/plugin-host.ts";
import type { ViewOperation } from "@litzio/core/views";
import { evaluateQueryView, validateViewInputs, type OperationQueryView } from "@litzio/core/views-v2";
import { type FileAccess } from "./file-access.ts";

export type ViewReceipt = { requestId: ReturnType<typeof randomUUID>; operation: string; version: number; scope: string; outcome: "failure" | "success"; timestamp: string };
/** Execute a registered query independently of generation and favorite storage. */
export async function runViewQuery(view: OperationQueryView, scope: { access: FileAccess; plugins?: PluginHost }, operations: readonly ViewOperation[], receipt: ViewReceipt) {
  const operation = operations.find(op => op.operation === view.sources.stats.operation && op.version === view.sources.stats.version)!;
  validateViewInputs(view, operation, "execute");
  const source = view.sources.stats;
  let data: unknown;
  const reply = await scope.plugins!.invokeOperation(source.operation, source.args);
  if ("error" in reply) return { error: reply.error, errorKind: reply.errorKind, sourceReceipt: reply.receipt, receipt };
  data = reply.result;
  const fields = Object.fromEntries(Object.entries(operations.find(op => op.operation === source.operation)!.rowSchema).filter(([, f]) => !f.secret).map(([name, f]) => [name, f.label]));
  return { args: source.args, fields, ...evaluateQueryView(view, data, operations), receipt: { ...receipt, outcome: "success" as const } };
}
