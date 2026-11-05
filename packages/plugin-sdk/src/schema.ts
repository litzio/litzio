import { Ajv, type ValidateFunction } from "ajv";
export function compileSchema(schema: Record<string, unknown>): ValidateFunction {
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && (typeof item !== "string" || !item.startsWith("#/"))) throw new Error("Only local JSON Schema references are supported");
      inspect(item);
    }
  };
  inspect(schema);
  return new Ajv({ strict: true, allErrors: true }).compile(schema);
}
