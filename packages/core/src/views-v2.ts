import { z } from "zod";
import { Validator as InterpretedValidator } from "@cfworker/json-schema";
import { VIEW_LIMITS as V1_LIMITS, viewSchema, validateQueryBindings, evaluateQueryRows, type ViewOperation, operationSourceSchema, queryLayoutSchema } from "./views.ts";
export const VIEW_LIMITS = { ...V1_LIMITS, inputs: 8 } as const;
export type { ViewOperation } from "./views.ts";
export type SourceState = "idle" | "needs-input" | "loading" | "success" | "empty" | "failure" | "uncertain" | "unavailable";
const id = z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const label = viewSchema.shape.title;
const opaque = z.string().min(1).max(512).regex(/^[a-zA-Z0-9_.-]+$/, "Opaque Host reference required");
const operationBinding = z.strictObject({ operation: id, version: z.number().int().positive() });
export const reviewContributionSchema = z.strictObject({ id, title: label,
  read: operationBinding, propose: operationBinding.optional(), approve: operationBinding.optional(), reject: operationBinding.optional(), undo: operationBinding.optional() });
export type ReviewContribution = z.infer<typeof reviewContributionSchema>;
export const REVIEW_ACTIONS = ["read", "propose", "approve", "reject", "undo"] as const;
export const reviewSourceSchema = z.strictObject({ plugin: id, review: id, bundleRef: opaque });
const form = z.strictObject({ component: z.literal("InputForm"), source: z.literal("stats"),
  fields: z.array(z.strictObject({ component: z.enum(["Select", "TextInput", "DateInput", "NumberInput", "Checkbox"]), field: z.string().min(1).max(80), advanced: z.boolean().optional() })).max(VIEW_LIMITS.inputs)
    .refine(v => new Set(v.map(f => f.field)).size === v.length, "Duplicate input field"),
  submit: z.strictObject({ component: z.literal("SubmitButton"), label }) });
export const connectedSourceSchema = operationSourceSchema.extend({ kind: z.literal("operation") });
const queryBase = viewSchema.omit({ refresh: true, sources: true }).extend({ schemaVersion: z.literal(2), catalog: z.literal("litzio-v2"), profile: z.literal("query"), owner: id, layout: queryLayoutSchema });
export const operationQueryViewSchema = queryBase.extend({ refresh: z.literal("manual"), sources: z.strictObject({ stats: connectedSourceSchema }), form: form.optional() });
export const queryViewSchema = operationQueryViewSchema;
export type OperationQueryView = z.infer<typeof operationQueryViewSchema>;
export type ConnectedSource = z.infer<typeof connectedSourceSchema>;
export type QueryLayout = z.infer<typeof queryLayoutSchema>;
export const reviewViewSchema = z.strictObject({ kind: z.literal("litzio-view"), schemaVersion: z.literal(2), catalog: z.literal("litzio-v2"),
  profile: z.literal("review"), title: label, refresh: z.literal("manual"), sources: z.strictObject({ review: reviewSourceSchema }),
  layout: z.strictObject({ component: z.literal("Panel"), direction: z.literal("vertical"), children: z.array(z.strictObject({
    component: z.enum(["PageSurface", "SourceDocumentCompare", "ReviewList", "ReviewDetail"]), title: label, source: z.literal("review"),
  })).min(1).max(VIEW_LIMITS.panels) }) });
export const catalogViewSchema = z.union([queryViewSchema, reviewViewSchema]);
export type QueryView = z.infer<typeof queryViewSchema>;
export type ReviewView = z.infer<typeof reviewViewSchema>;
export type CatalogView = z.infer<typeof catalogViewSchema>;
export type ViewInputState = { state: "ready" | "needs-input"; missing: string[] };

type InputCheck = ((value: unknown) => boolean) & { errors?: readonly { instancePath: string; keyword: string; params: Record<string, any> }[] | null };
type InputCompiler = (schema: Record<string, unknown>) => InputCheck;
/** CSP-safe JSON Schema evaluator; same Core validation/diagnostics, no generated code. */
export function compilePortableViewInputSchema(schema: Record<string, unknown>): InputCheck {
  assertPersistableInputSchema(schema);
  const validator = new InterpretedValidator(structuredClone(schema), schema.$schema === "https://json-schema.org/draft/2020-12/schema" ? "2020-12" : "7", false);
  const check: InputCheck = value => {
    const nonFinite: NonNullable<InputCheck["errors"]>[number][] = [];
    const inspect = (v: unknown, path: string) => {
      if (typeof v === "number" && !Number.isFinite(v)) nonFinite.push({ instancePath: path, keyword: "type", params: {} });
      if (v && typeof v === "object") for (const [key, child] of Object.entries(v)) inspect(child, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`);
    };
    inspect(value, "");
    if (nonFinite.length) { check.errors = nonFinite; return false; }
    const result = validator.validate(value);
    check.errors = result.errors.filter(error => error.keyword !== "properties" && error.keyword !== "items").flatMap(error => {
      const instancePath = error.instanceLocation.slice(1);
      if (error.keyword !== "required") return [{ instancePath, keyword: error.keyword, params: {} }];
      let node = schema, input = value;
      for (const part of instancePath.split("/").slice(1).map(p => p.replaceAll("~1", "/").replaceAll("~0", "~"))) {
        node = record(node.type === "array" ? node.items : record(node.properties)[part]);
        input = input && typeof input === "object" ? (input as Record<string, unknown>)[part] : undefined;
      }
      return (Array.isArray(node.required) ? node.required as string[] : []).filter(name => !input || !Object.hasOwn(input, name)).map(missingProperty => ({ instancePath, keyword: "required", params: { missingProperty } }));
    });
    return result.valid;
  };
  return check;
}

import { compileOperationInputSchema as compileViewInputSchema } from "./operation-input.ts";
export { compileOperationInputSchema as compileViewInputSchema } from "./operation-input.ts";

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function secret(schema: Record<string, any>): boolean { return schema.secret === true || schema.writeOnly === true || schema.format === "password"; }
// This is a persistence capability check, not another JSON Schema evaluator.
// Ajv still validates the unchanged original schema. Fail closed whenever its
// applicators could attach secrecy outside the properties/items tree we inspect.
const persistedInputKeywords = new Set([
  "$schema", "$id", "$comment", "title", "description", "default", "examples", "deprecated", "readOnly", "writeOnly", "secret",
  "type", "enum", "const", "format", "minLength", "maxLength", "pattern", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minItems", "maxItems", "uniqueItems", "minProperties", "maxProperties", "required", "additionalProperties", "properties", "items",
]);
function assertPersistableInputSchema(schema: Record<string, unknown>): void {
  const ancestors = new Set<object>();
  const inspect = (node: unknown): void => {
    if (!node || typeof node !== "object" || Array.isArray(node) || ancestors.has(node)) throw new Error("Unsupported persisted input schema");
    ancestors.add(node);
    for (const [keyword, value] of Object.entries(node)) {
      if (!persistedInputKeywords.has(keyword)) throw new Error("Unsupported persisted input schema");
      if (keyword === "additionalProperties" && typeof value !== "boolean") throw new Error("Unsupported persisted input schema");
      if (keyword === "items") inspect(value);
      if (keyword === "properties") {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported persisted input schema");
        for (const child of Object.values(value)) inspect(child);
      }
    }
    ancestors.delete(node);
  };
  inspect(schema);
}

export type ViewInputIssue = { field?: string; keyword: string };
export class ViewInputError extends Error {
  constructor(message: string, readonly inputIssues: ViewInputIssue[]) { super(message); }
}
/** Only declared public field paths and validator keywords can leave input validation. */
function inputIssues(validator: InputCheck, schema: Record<string, unknown>): ViewInputIssue[] {
  return (validator.errors ?? []).map(error => {
    const parts = error.instancePath.split("/").slice(1).map(p => p.replaceAll("~1", "/").replaceAll("~0", "~"));
    if (error.keyword === "required") parts.push(error.params.missingProperty);
    let node = record(schema), visible = !secret(node);
    for (const part of parts) {
      if (node.type === "array" && /^\d+$/.test(part)) node = record(node.items);
      else if (Object.hasOwn(record(node.properties), part)) node = record(record(node.properties)[part]);
      else { visible = false; break; }
      if (secret(node)) visible = false;
    }
    const field = visible && parts.length ? "/" + parts.map(p => p.replaceAll("~", "~0").replaceAll("/", "~1")).join("/") : undefined;
    return { ...(field ? { field } : {}), keyword: error.keyword };
  });
}
function validateInputArgs(schema: Record<string, unknown>, args: unknown, compile: InputCompiler): void {
  const validator = compile(schema);
  if (!validator(args)) throw new ViewInputError("Invalid operation args", inputIssues(validator, schema));
}

/** Static mode tolerates only missing required fields explicitly bound by the form. */
export function validateViewInputs(view: OperationQueryView, operation: ViewOperation, mode: "static" | "execute" = "static", compile: InputCompiler = compileViewInputSchema): ViewInputState {
  const schema = operation.inputSchema, properties = record(schema.properties), args = view.sources.stats.args;
  assertPersistableInputSchema(schema);
  for (const name of Object.keys(args)) {
    if (!Object.hasOwn(properties, name) || secret(record(properties[name]))) throw new ViewInputError("Unknown or secret input binding", [{ keyword: Object.hasOwn(properties, name) ? "secret" : "additionalProperties" }]);
  }
  const inspectSecrets = (value: unknown, definition: Record<string, any>): void => {
    if (secret(definition)) throw new ViewInputError("Secret input cannot be persisted", [{ keyword: "secret" }]);
    if (typeof value === "string" && value.length > 512) throw new ViewInputError("Input string exceeds limit", [{ keyword: "maxLength" }]);
    if (Array.isArray(value)) for (const item of value) inspectSecrets(item, record(definition.items));
    else if (value && typeof value === "object") for (const [name, item] of Object.entries(value)) inspectSecrets(item, record(record(definition.properties)[name]));
  };
  inspectSecrets(args, schema);
  const fields = view.form?.fields ?? [];
  if (fields.length && (schema.type !== "object" || ["allOf", "anyOf", "oneOf", "if", "$ref", "dependentSchemas", "dependentRequired", "dependencies"].some(k => k in schema))) throw new Error("Unsupported form schema");
  for (const f of fields) {
    if (!Object.hasOwn(properties, f.field)) throw new Error("Unknown input binding");
    const p = record(properties[f.field]);
    if (secret(p) || ["$ref", "allOf", "anyOf", "oneOf", "if"].some(k => k in p)) throw new Error("Unsupported or secret input binding");
    const types = Array.isArray(p.type) ? p.type.filter((t: unknown) => t !== "null") : [p.type];
    if (types.length !== 1) throw new Error("Scalar input required");
    const type = types[0];
    const valid = f.component === "Select" ? Array.isArray(p.enum) && p.enum.length > 0 && p.enum.length <= 32 && ["string", "number", "integer", "boolean"].includes(type) && p.enum.every((v: unknown) => v === null ? Array.isArray(p.type) && p.type.includes("null") : typeof v === (type === "integer" ? "number" : type))
      : f.component === "TextInput" ? type === "string" && !p.format
      : f.component === "DateInput" ? type === "string" && p.format === "date"
      : f.component === "NumberInput" ? type === "number" || type === "integer" : type === "boolean";
    if (!valid) throw new Error("Input control/schema mismatch");
    const value = args[f.field];
    if (typeof value === "string" && value.length > 512) throw new ViewInputError("Input string exceeds limit", [{ keyword: "maxLength" }]);
    if (f.component === "TextInput" && typeof value === "string" && /[\r\n]/.test(value)) throw new ViewInputError("Single line input required", [{ field: "/" + f.field.replaceAll("~", "~0").replaceAll("/", "~1"), keyword: "pattern" }]);
  }
  const required = Array.isArray(schema.required) ? schema.required as string[] : [];
  const missing = required.filter(name => !Object.hasOwn(args, name));
  if (mode === "execute") {
    validateInputArgs(schema, args, compile);
    if (!operation.validateArgs(args)) throw new ViewInputError("Invalid operation args", []);
  } else {
    if (missing.some(name => !fields.some(f => f.field === name))) throw new ViewInputError("Missing required operation input", missing.map(field => !Object.hasOwn(properties, field) || secret(record(properties[field])) ? { keyword: "required" } : { field: "/" + field.replaceAll("~", "~0").replaceAll("/", "~1"), keyword: "required" }));
    // Remove only the form-bound missing requirements; preserve every other JSON Schema constraint.
    const partial = { ...schema, required: required.filter(name => !missing.includes(name)) };
    validateInputArgs(partial, args, compile);
    if (!missing.length && !operation.validateArgs(args)) throw new ViewInputError("Invalid operation args", []);
  }
  return { state: missing.length ? "needs-input" : "ready", missing };
}
function size(text: string, limit: number = VIEW_LIMITS.bytes) { if (new TextEncoder().encode(text).length > limit) throw new Error("View exceeds byte limit"); }
export function validateCatalogView(value: unknown, operations: readonly ViewOperation[] = []): CatalogView {
  const text = JSON.stringify(value); if (text === undefined) throw new Error("View must be JSON"); size(text);
  const view = catalogViewSchema.parse(value);
  if (view.profile === "query") {
    const s = view.sources.stats, op = operations.find(op => op.operation === s.operation && op.version === s.version);
    if (!op) throw new Error("Operation unavailable or missing row schema");
    validateViewInputs(view, op);
    // Input validation above permits incomplete forms. Reuse the sole output/transform binding validator.
    validateQueryBindings(view, [{ ...op, validateArgs: () => true }]);
  }
  const limit = catalogViewByteLimit(view);
  size(text, limit);
  size(JSON.stringify(ordered(view), null, 2) + "\n", limit);
  return view;
}
export function catalogViewByteLimit(_view: CatalogView): number { return VIEW_LIMITS.bytes; }
export function parseCatalogView(text: string, operations?: readonly ViewOperation[]): CatalogView {
  size(text); const view = validateCatalogView(JSON.parse(text), operations); size(text, catalogViewByteLimit(view)); return view;
}
function ordered(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordered);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, item]) => [k, ordered(item)]));
  return v;
}
export function serializeCatalogView(value: unknown, operations?: readonly ViewOperation[]): string {
  const view = validateCatalogView(value, operations);
  const text = JSON.stringify(ordered(view), null, 2) + "\n"; size(text, catalogViewByteLimit(view)); return text;
}
export function evaluateQueryView(value: unknown, data: unknown, operations: readonly ViewOperation[] = []) {
  const view = validateCatalogView(value, operations);
  if (view.profile !== "query") throw new Error("Query profile required");
  const s = view.sources.stats, op = operations.find(op => op.operation === s.operation && op.version === s.version)!;
  validateViewInputs(view, op, "execute");
  return evaluateQueryRows(view, data, operations);
}
function publicInputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  assertPersistableInputSchema(schema);
  if (secret(schema)) throw new Error("Secret input cannot be published");
  const properties = record(schema.properties), hidden = Object.keys(properties).filter(k => secret(record(properties[k])));
  return { ...schema, ...(schema.items ? { items: publicInputSchema(record(schema.items)) } : {}), ...(schema.properties ? { properties: Object.fromEntries(Object.entries(properties).filter(([k]) => !hidden.includes(k)).map(([k, p]) => [k, publicInputSchema(record(p))])) } : {}),
    ...(Array.isArray(schema.required) ? { required: schema.required.filter(k => !hidden.includes(k)) } : {}) };
}
export function createCatalogV2(operations: readonly ViewOperation[] = []) {
  return { schema: z.toJSONSchema(catalogViewSchema), limits: VIEW_LIMITS, operations: operations.map(op => ({ operation: op.operation, version: op.version,
    inputSchema: publicInputSchema(op.inputSchema), ...(op.inputSuggestions ? { inputSuggestions: op.inputSuggestions } : {}), ...(op.inputHints ? { inputHints: op.inputHints } : {}),
    rowSchema: Object.fromEntries(Object.entries(op.rowSchema).filter(([, p]) => !p.secret)) })) };
}
// Snapshot-local Core read-model path; never a DOM node or ProseMirror position.
import { documentTargetRefSchema } from "./document-target.ts";
export { documentTargetRefSchema } from "./document-target.ts";
export const reviewBaselineSchema = z.strictObject({ documentRevision: opaque, proposalRevision: opaque, sourceRevision: opaque.optional(), mappingRevision: opaque.optional() });
export const reviewBundleSchema = z.strictObject({ bundleRef: opaque, generation: opaque, documentRef: opaque,
  documentRevision: opaque, documentHash: opaque, sourceRevision: opaque.optional(), mappingRevision: opaque.optional() });
const bbox = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]);
export const reviewRegionKindSchema = z.enum(["heading", "text", "list", "table", "formula", "picture", "footnote", "code"]);
export type ReviewRegionKind = z.infer<typeof reviewRegionKindSchema>;
export const reviewPageSchema = z.strictObject({ generation: opaque, sourceRevision: opaque, pageNo: z.number().int().positive(),
  width: z.number().positive().finite(), height: z.number().positive().finite(), imageRef: opaque.optional(),
  origin: z.enum(["TOPLEFT", "BOTTOMLEFT"]), unit: z.enum(["pt", "px"]),
  regions: z.array(z.strictObject({ id: opaque, bbox, category: label, kind: reviewRegionKindSchema.optional(), status: z.enum(["supported", "unsupported", "decoration", "excluded"]), reason: label.optional() })).max(2000),
}).superRefine((page, ctx) => {
  if (new Set(page.regions.map(r => r.id)).size !== page.regions.length) ctx.addIssue({ code: "custom", message: "Duplicate region" });
  for (const r of page.regions) {
    const [x1, y1, x2, y2] = r.bbox;
    if (x1 < 0 || y1 < 0 || x2 < x1 || y2 < y1 || x2 > page.width || y2 > page.height) ctx.addIssue({ code: "custom", message: "Region outside page" });
  }
});
export const reviewMappingSchema = z.strictObject({ generation: opaque, documentRevision: opaque, documentHash: opaque, sourceRevision: opaque, mappingRevision: opaque,
  entries: z.array(z.strictObject({ sourceIds: z.array(opaque).min(1), targets: z.array(documentTargetRefSchema) })).max(2000), continuation: opaque.optional() });
const actionAvailability = z.strictObject({ action: z.enum(["approve", "reject", "undo"]), allowed: z.boolean(), reason: label.optional() })
  .refine(v => v.allowed || !!v.reason, "Unavailable action requires reason");
const content = z.discriminatedUnion("type", [z.strictObject({ type: z.literal("plain"), text: z.string().max(32768) }),
  z.strictObject({ type: z.literal("typed"), kind: id, value: z.json() })]);
export const reviewProposalSchema = z.strictObject({ id: opaque, kind: id, targets: z.array(documentTargetRefSchema).min(1), evidence: z.array(label),
  before: content, after: content, baseline: reviewBaselineSchema,
  state: z.enum(["pending", "approved", "rejected", "inapplicable", "stale"]), actions: z.array(actionAvailability).max(3),
}).superRefine((p, ctx) => {
  if (new Set(p.actions.map(a => a.action)).size !== p.actions.length || p.actions.some(a => a.allowed && (a.action === "approve" || a.action === "reject") && p.state !== "pending" || a.allowed && a.action === "undo" && p.state !== "approved")) ctx.addIssue({ code: "custom", message: "Action incompatible with proposal state" });
});
export const REVIEW_LIMITS = { pageRegions: 2000, items: 2000, jsonBytes: 1048576, imageBytes: 16777216, imagePixels: 25000000 } as const;
export type { DocumentTargetRef } from "./document-target.ts";
export type ReviewBaseline = z.infer<typeof reviewBaselineSchema>;
export type ReviewBundle = z.infer<typeof reviewBundleSchema>;
export type ReviewPage = z.infer<typeof reviewPageSchema>;
export type ReviewMapping = z.infer<typeof reviewMappingSchema>;
export type ReviewProposal = z.infer<typeof reviewProposalSchema>;

export { queryLeafSchema, queryLayoutSchema, queryLeaves } from "./views.ts";
