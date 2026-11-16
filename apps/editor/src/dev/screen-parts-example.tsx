import { useTranslation } from "react-i18next";
import { useRef, useState } from "react";
import { screenUI as ui } from "../views/screen-ui.ts";

import { useScreenConfirmation } from "../views/screen-confirmation.tsx";
import { useHostClient } from "../host-context.tsx";

export function ScreenPartsExample({ state }: { state: string }) {
  const {t}=useTranslation();
  const lifetime = useRef(new AbortController());
  const {confirm, dialog} = useScreenConfirmation(useHostClient(), lifetime);
  const [selectedKey,setSelectedKey] = useState<string | number>();
  const [confirmation,setConfirmation] = useState("");
  const [range, setRange] = useState([0, 4]);
  const [kind, setKind] = useState<"line" | "bar">("line");
  const rows = [10, 18, 12, 24, 16].map((value, time) => ({ time, value })).slice(range[0], range[1] + 1);
  return <ui.ScreenLayout title="Screen parts">
    <ui.Toolbar label="Measurements tools"><label>Threshold<ui.Input aria-label="Threshold" defaultValue="15"/></label><ui.Select label="Chart kind" value={kind} options={[{value:"line",label:"Line"},{value:"bar",label:"Bar"}]} onValueChange={value=>setKind(value as "line" | "bar")} disabled={state === "disabled"}/><ui.Button variant="destructive" onClick={()=>confirm({title:"Clear measurements?",message:"This removes the loaded measurements.",confirmLabel:"Clear"}).then(value=>setConfirmation(String(value))).catch(error=>setConfirmation(error.name))}>Clear measurements</ui.Button><details hidden={!confirmation}><summary>{t("Details")}</summary><output aria-label="Confirmation result">{confirmation}</output></details><ui.Button disabled={state === "disabled"} onClick={() => setKind(kind === "line" ? "bar" : "line")}>Switch chart</ui.Button></ui.Toolbar><ui.Toolbar><ui.SummaryCard label="Count" value={rows.length} description="Loaded measurements" /><ui.SummaryCard label="Total" value={rows.reduce((sum, row) => sum + row.value, 0)} /></ui.Toolbar>
    {state === "error" && <ui.Notice tone="error">Example load failure. Previous values are kept.</ui.Notice>}
    <ui.Section title={t("Dataset")}><ui.Row kind="fact" label={t("Records")}>{rows.length}</ui.Row><ui.Row kind="fact" label={t("Selection")}>{selectedKey ?? t("None")}</ui.Row><ui.Row label={t("Connection")}><ui.Status variant="plain" tone="ok" label={t("Connected")} /></ui.Row></ui.Section>
    <ui.Slider label="Visible range" min={0} max={4} value={range} onValueChange={setRange} disabled={state === "disabled"} />
    <ui.Chart title="Measurements" data={rows} xKey="time" yKey="value" kind={kind} baseline={15} />
    <ui.Chart title="Long time labels" data={Array.from({length:60}, (_, i) => ({time:`2026-11-13T00:${String(i).padStart(2,"0")}:00Z`,value:i}))} xKey="time" yKey="value" showValues={false} />
    <ui.Chart title="Empty measurements" data={[]} xKey="time" yKey="value" />
    <ui.DataTable title="Measurements" rowKey="time" selectedKey={selectedKey} onSelectRow={row=>setSelectedKey(row.time as number)} rows={rows} columns={["time", "value"]} fields={{ value: { type: "number" } }} />
    <ui.DataTable title="Wide measurements" columns={Array.from({length:12},(_,i)=>`Column ${i+1}`)} rows={[Object.fromEntries(Array.from({length:12},(_,i)=>[`Column ${i+1}`,`Value ${i+1}`]))]} />
    <ui.DataTable title="Long descriptions" columns={["description", "value"]} rows={[{description:"A long description with spaces. ".repeat(20),value:1},{description:"unbroken_identifier_".repeat(30),value:2}]} fields={{value:{type:"number"}}}/>
    {dialog}
  </ui.ScreenLayout>;
}
