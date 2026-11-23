import { useState } from "react";
import type { ScreenItemListItem } from "@litzio/plugin-sdk";
import { ScreenFrame } from "../components/ui/task-header.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";

/** Synthetic documents only; one list step, as a plugin opening an item from its list. */
const DOCUMENTS: ScreenItemListItem[] = [
  { id: "inspection", label: "설비 점검 절차서", status: { tone: "warning", label: "검토 중" }, details: ["25쪽"] },
  { id: "calibration", label: "시험 장비 교정 기준", status: { tone: "neutral", label: "초안" }, details: ["12쪽"] },
  { id: "safety", label: "현장 안전 작업 수칙", status: { tone: "ok", label: "검토 완료" }, details: ["8쪽"] },
];
const LONG_LIST_NAME = "2026년 하반기 설비 점검과 장비 교정 기록, 현장 안전 작업 수칙과 부품 납품 검사 지침에서 변환한 문서 가운데 검토를 기다리는 문서와 지난 분기에 돌려받은 문서";

export function ScreenBackExample() {
  const [opened, setOpened] = useState<ScreenItemListItem | null>(DOCUMENTS[0]);
  const [longName, setLongName] = useState(false), [disabled, setDisabled] = useState(false), [narrow, setNarrow] = useState(false);
  const toggle = (label: string, pressed: boolean, set: (value: boolean) => void) =>
    <ui.Button aria-pressed={pressed} onClick={() => set(!pressed)}>{label}</ui.Button>;
  return <div className="task-surface"><ScreenFrame title="Return to list"><ui.ScreenLayout width={narrow ? "narrow" : "full"}
    description={opened ? `${opened.label} · ${opened.details?.[0]}` : undefined}
    back={opened ? { label: longName ? LONG_LIST_NAME : "변환한 문서", onBack: () => setOpened(null), disabled } : undefined}
    status={opened?.status && <ui.Status tone={opened.status.tone} label={opened.status.label} />}
    actions={opened && <><ui.Button>PDF 고르기</ui.Button><ui.Button>문서 열기</ui.Button><ui.Button variant="default">검토 완료</ui.Button></>}>
    <ui.Toolbar label="Return example">{toggle("Long list name", longName, setLongName)}{toggle("Disable return", disabled, setDisabled)}{toggle("Narrow width", narrow, setNarrow)}</ui.Toolbar>
    {opened ? <ui.Section title="문서 정보"><ui.Row kind="fact" label="쪽 수">{opened.details?.[0]}</ui.Row><ui.Row kind="fact" label="상태">{opened.status?.label}</ui.Row></ui.Section>
      : <ui.ItemList items={DOCUMENTS} onOpen={setOpened} />}
  </ui.ScreenLayout></ScreenFrame></div>;
}
