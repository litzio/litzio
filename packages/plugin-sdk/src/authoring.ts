import { parse } from "@babel/parser";
import { compileSchema } from "./schema.ts";
import type { PluginManifest } from "./index.ts";

// Inspect syntax only. Never import, evaluate, or activate an untrusted artifact.
// Dynamic registration cannot be proven statically and is reported, not guessed.
export function validatePluginSource(source: string, manifest: PluginManifest): string[] {
  const errors: string[] = [];
  const ast = parse(source, { sourceType: "module" });
  const candidates: any[] = [];
  for (const statement of ast.program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const fn = statement.declaration;
    if (fn?.type !== "FunctionDeclaration" || fn.id?.name !== "activate") continue;
    for (const returned of fn.body.body) {
      if (returned.type !== "ReturnStatement" || returned.argument?.type !== "ObjectExpression") continue;
      for (const name of ["status", "dispose"]) {
        const property = returned.argument.properties.find((p: any) => !p.computed && (p.key?.name ?? p.key?.value) === name) as any;
        const fn = property?.type === "ObjectMethod" ? property : property?.value;
        if (!fn || !["ObjectMethod", "ArrowFunctionExpression", "FunctionExpression"].includes(fn.type)) errors.push(`SDK instance requires a literal ${name} function.`);
      }
      if (returned.argument.properties.some(p => p.type === "SpreadElement" || p.computed)) errors.push("Dynamic instance properties cannot be validated.");
      for (const property of returned.argument.properties) {
        if (property.type === "ObjectProperty" && !property.computed && (property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : null) === "operations") candidates.push(property.value);
      }
    }
  }
  if (candidates.length !== 1 || candidates[0].type !== "ObjectExpression") return ["Use one literal operations object in the host entry so handlers can be checked without execution."];
  const handlers = new Map<string, any>();
  for (const property of candidates[0].properties) {
    if (property.type === "SpreadElement" || property.computed) { errors.push("Dynamic operations keys cannot be validated."); continue; }
    const key = property.key.name ?? property.key.value;
    const fn = property.type === "ObjectMethod" ? property : property.value;
    if (handlers.has(key)) errors.push(`Duplicate handler: ${key}`);
    handlers.set(key, fn);
    if (!["ObjectMethod", "ArrowFunctionExpression", "FunctionExpression"].includes(fn.type)) errors.push(`Handler ${key} must be a literal function.`);
  }
  for (const key of handlers.keys()) if (!manifest.contributes.operations.some(op => op.id === key)) errors.push(`Undeclared operation handler: ${key}`);
  for (const op of manifest.contributes.operations) {
    const fn = handlers.get(op.id);
    if (!fn) { errors.push(`Missing handler: ${op.id}`); continue; }
    // JSON literals can be checked; computed responses remain subject to runtime output validation.
    const returned = fn.body?.type === "BlockStatement" ? fn.body.body.filter((n: any) => n.type === "ReturnStatement").map((n: any) => n.argument) : [fn.body];
    for (const expression of returned) {
      const literal = jsonLiteral(expression);
      if (literal.known && !compileSchema(op.outputSchema)(literal.value)) errors.push(`Output schema mismatch: ${op.id}`);
    }
  }
  return errors;
}
function jsonLiteral(node: any): { known: boolean; value?: unknown } {
  if (!node) return { known: false };
  if (["StringLiteral", "NumericLiteral", "BooleanLiteral"].includes(node.type)) return { known: true, value: node.value };
  if (node.type === "NullLiteral") return { known: true, value: null };
  if (node.type === "ObjectExpression") {
    const value: Record<string, unknown> = Object.create(null);
    for (const property of node.properties) {
      if (property.type !== "ObjectProperty" || property.computed) return { known: false };
      const item = jsonLiteral(property.value); if (!item.known) return item;
      value[property.key.name ?? property.key.value] = item.value;
    }
    return { known: true, value };
  }
  if (node.type === "ArrayExpression") {
    const items = node.elements.map(jsonLiteral);
    return items.every((item: any) => item.known) ? { known: true, value: items.map((item: any) => item.value) } : { known: false };
  }
  return { known: false };
}
