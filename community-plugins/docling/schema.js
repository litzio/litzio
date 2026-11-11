import { readFileSync } from "node:fs";
import { compileSchema } from "@litzio/plugin-sdk";

// Upstream's Pydantic schema uses Python named regex groups. Translate only that
// spelling for ECMAScript; keep the vendored upstream artifact byte-for-byte.
const schema = JSON.parse(readFileSync(new URL("./schema/DoclingDocument-1.10.0.json", import.meta.url), "utf8"));
function regexDialect(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "pattern" && typeof child === "string") value[key] = child.replaceAll("(?P<", "(?<");
    else regexDialect(child);
  }
}
regexDialect(schema);
const validate = compileSchema(schema, "2020-12");

/** Validate without defaults, normalization or writes to the original document.
 * @returns {import("./schema/document.js").DoclingDocument}
 */
export function validateDoclingDocument(document) {
  if (document?.version !== "1.10.0") throw new Error(`Unsupported DoclingDocument version: ${String(document?.version)}`);
  if (!validate(document)) throw new Error(`Invalid DoclingDocument schema: ${JSON.stringify(validate.errors)}`);
  return document;
}
