import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScreenFrame } from "../components/ui/task-header.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";

export function ScreenFrameExample() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);
  return <div className="task-surface"><ScreenFrame title="Screen frame"><ui.ScreenLayout width="narrow"
    status={<ui.Status tone={current === 1 ? "progress" : "ok"} label={current === 1 ? "Processing" : "Ready"}/>}
    actions={current > 0 && <ui.Button variant={current === 2 ? "default" : "outline"} onClick={()=>setCurrent(current === 1 ? 2 : 0)}>{current === 1 ? "Finish example" : "Start again"}</ui.Button>}>
    <ui.Steps steps={["Choose source", "Process", "Result"]} current={current}/>
    {current === 0 ? <ui.EmptyState title="Choose a source" action={<ui.Button variant="default" onClick={()=>setCurrent(1)}>Load example</ui.Button>}/> : current === 1 ? <><ui.Progress value={0.65} label="Processing measurements"/><ui.Progress label="Waiting for service"/></> : <ui.SummaryCard label="Loaded measurements" value={4}/>}
    <ui.Toolbar>{(["ok", "progress", "warning", "error", "neutral"] as const).map(tone=><ui.Status key={tone} tone={tone} label={{ok:t("Connected"),progress:t("Loading…"),warning:t("Warning"),error:t("Error"),neutral:t("Ready")}[tone]}/>)}</ui.Toolbar>
  </ui.ScreenLayout></ScreenFrame></div>;
}
