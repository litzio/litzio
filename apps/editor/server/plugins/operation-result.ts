import { safePluginValue } from "./secret-redaction.ts";
export { safePluginValue };
import { PLUGIN_ERROR_MESSAGES, pluginErrorKind, type PluginErrorKind, compileSchema, type OperationDefinition } from "@litzio/plugin-sdk";
import { parseOperationRows } from "@litzio/core/views";

/** Common publication boundary, independent of plugin transport and lifetime. */
export function publicOperationResult(operation: Pick<OperationDefinition, "outputSchema" | "rowSchema">, result: unknown, secrets: readonly string[]): unknown {
  result = safePluginValue(result, secrets);
  if (!compileSchema(operation.outputSchema)(result)) throw new Error("Invalid operation result");
  return operation.rowSchema ? parseOperationRows(result, operation.rowSchema) : result;
}

/** Never publish exception text, stack, response bodies or plugin-authored advice. */
export function publicOperationError(error: unknown, effect: "read" | "write") {
  let kind: PluginErrorKind = "failed";
  try { kind = pluginErrorKind((error as { kind?: unknown } | null)?.kind); } catch { /* Untrusted property access. */ }
  return { errorKind: kind, error: PLUGIN_ERROR_MESSAGES[kind] + (effect === "write" ? " Check the target before retrying a write." : "") };
}
