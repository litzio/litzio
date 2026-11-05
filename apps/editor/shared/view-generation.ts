import { viewCatalog } from "@litzio/core/views";
/** Provider context, kept out of the human message/transcript by the existing context boundary. */
export const VIEW_GENERATION_CONTEXT = {
  instruction: "Propose a Litzio view for the user request. Return ONLY one complete JSON object, no Markdown. Do not call tools, read files, run commands or fetch URLs. The app supplies the root separately. Never include data, Host URL/hostId, secrets or conversation. Use only this catalog. Grouping requires groupBy and aggregate together; output fields become group and value. Filters precede grouping, sorting, limit. Dates use UTC day/Monday week/month. No joins, expressions, HTML, JS, CSS, actions or invented fields. Explicitly refuse unsupported requests.",
  catalog: viewCatalog,
};
