import { z } from "zod";
import { Ajv } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
/** Compile without coercion/default insertion. The caller's original schema remains authoritative. */
export function compileOperationInputSchema(schema: Record<string, unknown>) {
  const inspect = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    for (const [k, item] of Object.entries(v)) {
      if (k === "$ref" && (typeof item !== "string" || !item.startsWith("#/"))) throw new Error("Only local JSON Schema references are supported");
      inspect(item);
    }
  };
  inspect(schema);
  const Validator = schema.$schema === "https://json-schema.org/draft/2020-12/schema" ? Ajv2020 : Ajv;
  const ajv = new Validator({ strict: true, allErrors: true });
  ajv.addKeyword({ keyword: "secret", schemaType: "boolean", valid: true });
  ajv.addFormat("date-time", v => z.iso.datetime({ precision: 3 }).safeParse(v).success);
  ajv.addFormat("date", v => z.iso.date().safeParse(v).success);
  ajv.addFormat("password", () => true);
  return ajv.compile(schema);
}
