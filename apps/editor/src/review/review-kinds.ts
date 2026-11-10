import type { EditableBlock } from "@litzio/core";
import type { ReviewRegionKind } from "@litzio/core/views-v2";
import type { ReviewSnapshot } from "./ReviewRenderer.tsx";

export type ReviewKind = ReviewRegionKind | "unmapped";
export function blockKind(block: EditableBlock | undefined): ReviewKind {
  if (!block) return "unmapped";
  switch (block.block) {
    case "heading": case "list": case "table": case "footnote": case "code": return block.block;
    case "equation": return "formula";
    case "figure": return "picture";
    default: return "text";
  }
}
/** Provider category names are evidence; actual correspondence decides whether anything was converted. */
export function regionKinds(s: ReviewSnapshot): Map<string,ReviewKind> {
  const blocks = new Map(s.document.blocks.map(block=>[JSON.stringify(block.path),block]));
  const mapped = new Map<string,EditableBlock>();
  for (const entry of s.mapping?.entries ?? []) {
    const block = entry.targets.map(target=>blocks.get(JSON.stringify(target.path))).find(Boolean);
    if (block) for (const id of entry.sourceIds) mapped.set(id,block);
  }
  return new Map((s.pages ?? (s.page ? [s.page]:[])).flatMap(page=>page.regions.map(region=>{
    const block = mapped.get(region.id);
    return [region.id,region.status !== "supported" || !block ? "unmapped" : region.kind ?? blockKind(block)] as const;
  })));
}
