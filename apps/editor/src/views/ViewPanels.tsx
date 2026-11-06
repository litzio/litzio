import type { ReactNode } from "react";
import type { z } from "zod";
import type { queryLayoutSchema, queryLeafSchema } from "@litzio/core/views";
import "./view-charts.css";

export function ViewPanels({ layout, renderLeaf }: { layout: z.infer<typeof queryLayoutSchema>; renderLeaf(leaf: z.infer<typeof queryLeafSchema>, index: number): ReactNode }) {
  let index = 0;
  const children = layout.children.map((child, key) => child.component === "Panel"
    ? <div key={key} className="view-panel-container"><div className="view-panels view-panels-horizontal">{child.children.map(leaf => renderLeaf(leaf, index++))}</div></div>
    : renderLeaf(child, index++));
  return <div className="view-panel-container"><div className={`view-panels${layout.direction === "horizontal" ? " view-panels-horizontal" : ""}`}>{children}</div></div>;
}
