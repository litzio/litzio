import { z } from "zod";

export const OPERATION_ROW_LIMIT = 2000;
const label = z.string().min(1).max(160).refine(v => !/[<>\u0000-\u001f]|(?:https?:|javascript:|data:)/i.test(v), "Plain label required");
export const rowSchema = z.record(z.string().max(80).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).refine(name => name !== "group" && name !== "value", "Reserved output field"), z.strictObject({
  type: z.enum(["string", "number", "boolean"]), label,
  linkField: z.string().min(1).max(80).optional(),
  date: z.boolean().default(false), nullable: z.boolean().default(false), secret: z.boolean().default(false),
})).refine(fields => Object.keys(fields).length > 0 && Object.values(fields).every(f => !f.date || f.type === "string"), "Invalid row schema").refine(fields => Object.entries(fields).every(([name, f]) => !f.linkField ||
  f.type === "string" && !f.secret && f.linkField !== name && Object.hasOwn(fields, f.linkField) &&
  fields[f.linkField]!.type === "string" && !fields[f.linkField]!.secret), "Link target must be another public string field; link columns must be public strings");
export type RowSchema = z.infer<typeof rowSchema>;

/** Validate declared values and publish only public fields. Idempotent for public results. */
export function parseOperationRows(data: unknown, declaration: RowSchema, limits = { rows: OPERATION_ROW_LIMIT, string: 512 }, strict = false): Record<string, string | number | boolean | null>[] {
  const fields = rowSchema.parse(declaration);
  const columns = Object.fromEntries(Object.entries(fields).map(([name, f]) => {
    let type: z.ZodType = f.date ? z.iso.datetime({ precision: 3 }) : f.type === "number" ? z.number().finite() : f.type === "boolean" ? z.boolean() : z.string().max(limits.string);
    if (f.nullable) type = type.nullable();
    // Secrets may already have been removed at the common operation return boundary.
    if (f.secret) type = type.optional();
    return [name, type];
  }));
  const rows = z.array(strict ? z.strictObject(columns) : z.object(columns)).max(limits.rows).parse(data);
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([name]) => !fields[name]!.secret))) as Record<string, string | number | boolean | null>[];
}
