import { z } from "zod";
import { catalogViewSchema, createCatalogV2, type ViewOperation } from "@litzio/core/views-v2";
// One authoring scope for Generate view and ordinary-chat view_catalog.
const generationSchema = z.toJSONSchema(catalogViewSchema);
function generationCatalog(operations?: readonly ViewOperation[]) {
  const catalog = createCatalogV2(operations?.filter(operation => {
    try { createCatalogV2([operation]); return true; } catch { return false; }
  }));
  return { ...catalog, schema: generationSchema };
}
const viewCatalog = generationCatalog();
export const VIEW_GENERATION_TIMEOUT_MS = 180_000;
/** Provider context, kept out of the human message/transcript by the existing context boundary. */
export const VIEW_GENERATION_CONTEXT = {
  instruction: "Propose a Litzio view for the user request. Return ONLY one complete JSON object, no Markdown. Do not call tools, read files, run commands or fetch URLs. The app supplies the root separately. Never include data, Host URL/hostId, secrets or conversation. Use only this catalog: query profile with fixed args or InputForm bindings to public scalar inputs, or review profile for an explicitly supplied completed bundle on this Host. Review sources contain only plugin/review/bundleRef; never invent or rebind these references. Use only PageSurface/SourceDocumentCompare/ReviewList/ReviewDetail for review; no form or action bindings. A view proposal never approves, rejects or undoes a document change. Grouping requires groupBy and aggregate together; output fields become group and value. Filters precede grouping, sorting, limit. Dates use UTC day/Monday week/month. No joins, expressions, HTML, JS, CSS, actions or invented fields. Explicitly refuse unsupported requests or missing review references.",
  catalog: viewCatalog,
};

export function viewGenerationContext(operations?: readonly ViewOperation[]) { return { ...VIEW_GENERATION_CONTEXT, catalog: generationCatalog(operations) }; }
