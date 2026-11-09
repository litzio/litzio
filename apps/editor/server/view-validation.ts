import { validateQueryBindings, type ViewOperation } from "@litzio/core/views";
import { catalogViewSchema, validateCatalogView, type QueryView } from "@litzio/core/views-v2";

export class ViewRefusal extends Error {
  constructor(readonly code: "unavailable" | "owner-mismatch") { super(code); }
}
export function query(value: unknown, operations: readonly ViewOperation[], input?: Record<string, unknown>): QueryView {
  // Replace the entire args object before validation, including when definition args are incomplete.
  if (input !== undefined) {
    const envelope = value as QueryView;
    value = { ...envelope, sources: { ...envelope?.sources, stats: { ...envelope?.sources?.stats, args: input } } };
  }
  const parsed = catalogViewSchema.parse(value);
  if (parsed.profile === "query" && parsed.refresh === "manual") {
    const operation = operations.find(op => op.operation === parsed.sources.stats.operation && op.version === parsed.sources.stats.version);
    if (!operation) throw new ViewRefusal("unavailable");
    // Core owns binding semantics. A removed/private or incompatible output field
    // makes the source unavailable to this query definition.
    try { validateQueryBindings(parsed, [{ ...operation, validateArgs: () => true }]); }
    catch { throw new ViewRefusal("unavailable"); }
  }
  const view = validateCatalogView(parsed, operations);
  if (view.profile !== "query") throw new Error("Query profile required");
  return view;
}
