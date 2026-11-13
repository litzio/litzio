import { useState } from "react";
import { screenUI as ui } from "../views/screen-ui.ts";

export function ScreenPartsExample({ state }: { state: string }) {
  const [range, setRange] = useState([0, 4]);
  const [kind, setKind] = useState<"line" | "bar">("line");
  const rows = [10, 18, 12, 24, 16].map((value, time) => ({ time, value })).slice(range[0], range[1] + 1);
  return <ui.ScreenLayout title="Screen parts" description="Production components; select a range and hover or focus the chart for values.">
    <ui.Toolbar label="Measurements tools"><ui.Button disabled={state === "disabled"} onClick={() => setKind(kind === "line" ? "bar" : "line")}>Switch chart</ui.Button><ui.SummaryCard label="Total" value={rows.reduce((sum, row) => sum + row.value, 0)} /></ui.Toolbar>
    {state === "error" && <ui.Notice tone="error">Example load failure. Previous values are kept.</ui.Notice>}
    <ui.Slider label="Visible range" min={0} max={4} value={range} onValueChange={setRange} disabled={state === "disabled"} />
    <ui.Chart title="Measurements" data={rows} xKey="time" yKey="value" kind={kind} baseline={15} />
    <ui.Chart title="Empty measurements" data={[]} xKey="time" yKey="value" />
    <ui.DataTable title="Measurements" rows={rows} columns={["time", "value"]} fields={{ value: { type: "number" } }} />
  </ui.ScreenLayout>;
}
