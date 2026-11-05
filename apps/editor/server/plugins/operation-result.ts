import { safePluginValue } from "./secret-redaction.ts";
export { safePluginValue };
import { compileSchema, type OperationDefinition } from "@litzio/plugin-sdk";
import { parseOperationRows } from "@litzio/core/views";

/** Common publication boundary, independent of plugin transport and lifetime. */
export function publicOperationResult(operation: Pick<OperationDefinition, "outputSchema" | "rowSchema">, result: unknown): unknown {
  result = safePluginValue(result);
  if (!compileSchema(operation.outputSchema)(result)) throw new Error("Invalid operation result");
  return operation.rowSchema ? parseOperationRows(result, operation.rowSchema) : result;
}
