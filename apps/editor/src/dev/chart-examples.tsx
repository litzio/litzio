import { useState } from "react";
import { operationQueryViewSchema } from "@litzio/core/views-v2";
import { ViewRenderer } from "../views/ViewRenderer.tsx";
import { ChoiceGroup } from "../components/ui/choice-group.tsx";

const leaf = (type: "line" | "scatter") => ({ component: "Chart", type, title: type === "line" ? "예시: 월별 추이 · null 단절" : "예시: 좌표 · 중복과 null", source: "stats", data: "/rows", x: "x", y: "y" });
const view = operationQueryViewSchema.parse({ kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", owner: "litzio.statistics", title: "예시: Chart와 Panel", refresh: "manual", sources: { stats: { kind: "operation", operation: "fixture.chart", version: 1, args: {} } }, layout: { component: "Panel", direction: "horizontal", children: [leaf("line"), leaf("scatter")] } });
const rows = [{ x: 1, y: -2 }, { x: 2, y: 3 }, { x: 3, y: null }, { x: 4, y: 2 }, { x: 5, y: 1 }];
const scatter = { ...view, layout: { ...view.layout, children: [leaf("scatter"), leaf("scatter")] } };

export function ChartExamples() {
  const [width, setWidth] = useState("full");
  return <section aria-label="예시: Chart와 Panel" className="ui-gallery-section">
    <h2>예시: Chart와 Panel</h2>
    <ChoiceGroup aria-label="예시: 실제 배치 폭" value={width} onValueChange={setWidth} options={[{ value: "full", label: "전체 폭" }, { value: "960", label: "960px" }, { value: "959", label: "959px" }]} />
    <div data-testid="chart-example-width" style={{ width: width === "full" ? "100%" : `${width}px`, maxWidth: "100%" }}>
      <ViewRenderer view={view} rows={rows} fields={{ x: "순서", y: "값" }} />
    </div>
    <ViewRenderer view={operationQueryViewSchema.parse(scatter)} rows={[{ x: null, y: 1 }, { x: 1, y: null }, { x: 2, y: 2 }, { x: 2, y: 2 }]} />
  </section>;
}
