import { Ajv, type ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import { fullFormats } from "ajv-formats/dist/formats.js";
export function compileSchema(schema: Record<string, unknown>, dialect?: "2020-12"): ValidateFunction {
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string" && !item.startsWith("#/")) throw new Error("Only local JSON Schema references are supported");
      inspect(item);
    }
  };
  inspect(schema);
  if (dialect === "2020-12") {
    const validator = new Ajv2020({ strictSchema: false, strictTypes: false, strictTuples: false, allErrors: true, formats: { ...fullFormats, path: true } });
    return validator.compile(schema);
  }
  return new Ajv({ strict: true, allErrors: true }).compile(schema);
}
