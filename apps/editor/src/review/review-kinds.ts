import type { EditableBlock } from "@litzio/core";
import type { ReviewSnapshot } from "./ReviewRenderer.tsx";

export type ReviewKind = "heading" | "text" | "list" | "table" | "formula" | "picture" | "footnote" | "code" | "unmapped";
const aliases: Record<string,ReviewKind> = {heading:"heading",title:"heading",section_header:"heading",text:"text",paragraph:"text",sentence:"text",caption:"text",list:"list",list_item:"list",table:"table",formula:"formula",equation:"formula",picture:"picture",image:"picture",figure:"picture",footnote:"footnote",endnote:"footnote",code:"code",code_block:"code"};
export function blockKind(block: EditableBlock | undefined): ReviewKind {
  return block ? aliases[block.block] ?? "text" : "unmapped";
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
    return [region.id,region.status !== "supported" || !block ? "unmapped" : aliases[region.category.toLowerCase().replace(/[\s-]+/g,"_")] ?? blockKind(block)] as const;
  })));
}
