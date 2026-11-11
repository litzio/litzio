import type { ReviewLedger } from "@litzio/plugin-sdk";
/** UI admission only: the Host still validates every submitted proposal and decision. */
export function pageExclusionReason(state: {ledger: ReviewLedger; snapshot: {inputs: {key:string}[]}} | undefined, pages: number[]): string | undefined {
  if (!state?.snapshot || !state.ledger || !pages.length) return;
  const existing = new Set(state.snapshot.inputs.map(input=>input.key));
  const insertion = state.ledger.groups.flatMap(group=>group.targets).find(target=>
    target.patch.operations.some(op=>op.type === "insert" && existing.has(String(op.insertedKey))) &&
    (!target.pages.length && !target.regions.length || [...target.pages,...target.regions.map(region=>region.page)].some(page=>pages.includes(page))));
  return insertion ? "삽입 블록이 있어 이 쪽의 묶음 제외를 지원하지 않습니다. 부분 제외하지 않습니다." : undefined;
}
