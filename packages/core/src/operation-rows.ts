import { z } from "zod";

export const OPERATION_ROW_LIMIT = 2000;
const label = z.string().min(1).max(160).refine(v => !/[<>\u0000-\u001f]|(?:https?:|javascript:|data:)/i.test(v), "Plain label required");
export const rowSchema = z.record(z.string().max(80).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).refine(name => name !== "group" && name !== "value", "Reserved output field"), z.strictObject({
  type: z.enum(["string", "number", "boolean"]), label,
  date: z.boolean().default(false), nullable: z.boolean().default(false), secret: z.boolean().default(false),
})).refine(fields => Object.keys(fields).length > 0 && Object.keys(fields).length <= 64 && Object.values(fields).every(f => !f.date || f.type === "string"), "Invalid row schema");
export type RowSchema = z.infer<typeof rowSchema>;

/** Validate declared values and publish only public fields. Idempotent for public results. */
export function parseOperationRows(data: unknown, declaration: RowSchema): Record<string, string | number | boolean | null>[] {
  const fields = rowSchema.parse(declaration);
  const columns = Object.fromEntries(Object.entries(fields).map(([name, f]) => {
    let type: z.ZodType = f.date ? z.iso.datetime({ precision: 3 }) : f.type === "number" ? z.number().finite() : f.type === "boolean" ? z.boolean() : z.string().max(512);
    if (f.nullable) type = type.nullable();
    // Secrets may already have been removed at the common operation return boundary.
    if (f.secret) type = type.optional();
    return [name, type];
  }));
  const rows = z.array(z.object(columns)).max(OPERATION_ROW_LIMIT).parse(data);
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([name]) => !fields[name]!.secret))) as Record<string, string | number | boolean | null>[];
}
