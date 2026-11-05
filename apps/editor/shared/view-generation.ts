import { z } from "zod";
import { queryViewSchema, createCatalogV2, type ViewOperation } from "@litzio/core/views-v2";
// Exposure gate: V3 may enable form after its renderer is integrated; review
// remains closed until V4/V5 Host and screen integration is complete.
const generationSchema = z.toJSONSchema(queryViewSchema.omit({ form: true }));
function generationCatalog(operations?: readonly ViewOperation[]) {
  const catalog = createCatalogV2(operations?.filter(operation => {
    try { createCatalogV2([operation]); return true; } catch { return false; }
  }));
  return { ...catalog, schema: generationSchema, limits: { ...catalog.limits, inputs: 0 } };
}
const viewCatalog = generationCatalog();
export const VIEW_GENERATION_TIMEOUT_MS = 180_000;
/** Provider context, kept out of the human message/transcript by the existing context boundary. */
export const VIEW_GENERATION_CONTEXT = {
  instruction: "Propose a Litzio view for the user request. Return ONLY one complete JSON object, no Markdown. Do not call tools, read files, run commands or fetch URLs. The app supplies the root separately. Never include data, Host URL/hostId, secrets or conversation. Use only this catalog: query profile with fixed args only, no InputForm or review profile. Grouping requires groupBy and aggregate together; output fields become group and value. Filters precede grouping, sorting, limit. Dates use UTC day/Monday week/month. No joins, expressions, HTML, JS, CSS, actions or invented fields. Explicitly refuse unsupported requests.",
  catalog: viewCatalog,
};

export function viewGenerationContext(operations?: readonly ViewOperation[]) { return { ...VIEW_GENERATION_CONTEXT, catalog: generationCatalog(operations) }; }
