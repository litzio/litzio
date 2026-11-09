import type { ReactNode } from "react";
import type { QueryLayout } from "@litzio/core/views-v2";
export function ViewPanels({ layout, renderLeaf }: { layout: QueryLayout; renderLeaf(leaf: QueryLayout["children"][number], index: number): ReactNode }) {
  return <div className="view-panel-container"><div className="view-panels">{layout.children.map(renderLeaf)}</div></div>;
}
