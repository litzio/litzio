import { safePluginValue } from "./secret-redaction.ts";
export { safePluginValue };
import { PluginPublicError, PLUGIN_ERROR_MESSAGES, pluginErrorKind, type PluginErrorKind, compileSchema, type OperationDefinition } from "@litzio/plugin-sdk";

/** Common publication boundary, independent of plugin transport and lifetime. */
export function publicOperationResult(operation: Pick<OperationDefinition, "outputSchema">, result: unknown, secrets: readonly string[]): unknown {
  result = safePluginValue(result, secrets);
  if (!compileSchema(operation.outputSchema)(result)) throw new Error("Invalid operation result");
  return result;
}

/** Only explicit public failures may publish text; all other exceptions remain masked. */
export function publicOperationError(error: unknown, effect: "read" | "write", secrets: readonly string[] = []) {
  let kind: PluginErrorKind = "failed";
  try { kind = pluginErrorKind((error as { kind?: unknown } | null)?.kind); } catch { /* Untrusted property access. */ }
  if (error instanceof PluginPublicError && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.code) && !secrets.some(secret => secret && error.code.includes(secret))) {
    // Redact before normalization/truncation so a partial credential cannot escape.
    const message = Array.from(safePluginValue(publicErrorText(safePluginValue(error.message, secrets)), secrets)).slice(0, 1024).join("");
    if (message) return { errorKind: kind, error: message, code: error.code, message };
  }
  return { errorKind: kind, error: PLUGIN_ERROR_MESSAGES[kind] + (effect === "write" ? " Check the target before retrying a write." : "") };
}

/** Plain single-line text: no controls, bidi overrides or terminal escapes. */
function publicErrorText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, "").trim();
}

/** Do not serialize Ajv params/messages: they can contain input values or schema literals. */
export function publicInputIssues(errors: NonNullable<ReturnType<typeof compileSchema>["errors"]> | null | undefined, schema: Record<string, unknown>, secrets: readonly string[]) {
  const escape = (key: string) => key.replaceAll("~", "~0").replaceAll("/", "~1");
  const messages: Record<string, string> = { required: "Required field is missing.", type: "Expected the declared type.", enum: "Use one of the allowed values in the operation input schema.", const: "Use the value declared in the operation input schema.", format: "Must match the format declared in the operation input schema.", additionalProperties: "Unexpected field.", pattern: "Must match the pattern declared in the operation input schema." };
  return (errors ?? []).slice(0, 8).map(error => {
    // Preserve declared fields/array indices only; dynamic keys can contain secrets.
    const expand = (nodes: any[], seen = new Set<unknown>()): any[] => nodes.flatMap(node => {
      if (!node || typeof node !== "object" || seen.has(node)) return [];
      seen.add(node);
      const ref = typeof node.$ref === "string" && node.$ref.startsWith("#/")
        ? node.$ref.slice(2).split("/").reduce((value: any, part: string) => value?.[part.replaceAll("~1", "/").replaceAll("~0", "~")], schema) : undefined;
      return [node, ...expand([ref, node.if, node.then, node.else, ...Object.values(node.dependencies ?? {}), ...Object.values(node.dependentSchemas ?? {}), ...(node.allOf ?? []), ...(node.anyOf ?? []), ...(node.oneOf ?? [])], seen)];
    });
    let nodes: any[] = [schema];
    const segments = error.instancePath.split("/").slice(1).map(segment => {
      const key = segment.replaceAll("~1", "/").replaceAll("~0", "~");
      const candidates = expand(nodes);
      const properties = candidates.filter(node => node.properties && Object.hasOwn(node.properties, key)).map(node => node.properties[key]);
      if (properties.length) { nodes = properties; return segment; }
      const items = /^\d+$/.test(key) ? candidates.filter(node => node.type === "array").map(node => Array.isArray(node.items) ? node.items[Number(key)] : node.items) : [];
      if (items.length) { nodes = items; return segment; }
      nodes = []; return "*";
    });
    if (error.keyword === "required") segments.push(escape(String(error.params.missingProperty)));
    return { path: safePluginValue(publicErrorText(safePluginValue("/" + segments.join("/"), secrets)), secrets), reason: messages[error.keyword] ?? "Must satisfy the operation input schema." };
  });
}
