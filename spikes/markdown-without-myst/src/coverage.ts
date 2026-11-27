/** Which read-model features the corpus actually exercises (so "same" is not vacuous). */
import { parse, serialize } from "../../../packages/core/src/index.ts";
import { coreModel } from "./model.ts";
import { generatedDocuments, nativeDocuments, syntheticDocuments, type Input } from "./corpus.ts";

export function featureCounts(inputs: Input[]): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  const visit = (value: unknown, where: string) => {
    if (Array.isArray(value)) { value.forEach(item => visit(item, where)); return; }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (typeof object.kind === "string" && where === "inline") add(`inline:${object.kind}${object.role ? `(${object.role})` : ""}`);
    if (typeof object.block === "string") {
      add(`block:${object.block}`);
      for (const key of ["enumerator", "enumerated", "label", "caption", "notes", "grid", "checklist", "style", "delimiter", "start", "mermaidSource", "language"]) {
        if (object[key] !== undefined && object[key] !== "" && !(Array.isArray(object[key]) && !(object[key] as unknown[]).length)) add(`field:${object.block}.${key}`);
      }
      if ((object.block === "admonition" || object.block === "quote") && Array.isArray(object.content) && !object.content.length) add(`empty:${object.block}`);
      if (object.block === "equation" && object.latex === "") add("empty:equation");
      if (object.block === "admonition") add(`admonition:${object.variant}`);
    }
    if (object.checked !== undefined) add("field:item.checked");
    if (object.title !== undefined && object.kind === "link") add("field:link.title");
    for (const [key, item] of Object.entries(object)) visit(item, key === "content" || key === "children" || key === "caption" || key === "notes" ? "inline" : where);
  };
  for (const { source } of inputs) {
    try { const canonical = serialize(parse(source)); visit(coreModel(parse(canonical), canonical).blocks, "block"); } catch { /* refused */ }
  }
  return Object.fromEntries(Object.entries(counts).sort());
}

if (import.meta.main) {
  console.log(JSON.stringify(featureCounts([...nativeDocuments(), ...generatedDocuments(), ...syntheticDocuments([300])]), null, 0));
}
