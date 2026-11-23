import { useState } from "react";
import type { ScreenItemListGroup, ScreenItemListItem } from "@litzio/plugin-sdk";
import { ScreenFrame } from "../components/ui/task-header.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";

const NAMES = ["측정 기록 교환 규격", "설비 점검 절차서", "시험 장비 교정 기준", "부품 납품 검사 지침", "제어기 통신 규약 해설", "현장 안전 작업 수칙", "전원 장치 시험 계획서", "소프트웨어 형상 관리 절차"];
const STATES = [
  { group: "converting", tone: "progress", label: "변환 중" },
  { group: "review", tone: "warning", label: "검토 중" },
  { group: "review", tone: "warning", label: "검토 중" },
  { group: "draft", tone: "neutral", label: "초안" },
  { group: "done", tone: "ok", label: "검토 완료" },
] as const;
const GROUPS: ScreenItemListGroup[] = [
  { id: "converting", title: "변환 중" }, { id: "review", title: "검토 중" }, { id: "draft", title: "초안" }, { id: "done", title: "검토 완료" },
];
const WHEN = ["오늘 14:20", "어제", "11월 18일", "11월 3일", "2025년 12월 9일"];

/** Synthetic documents only; opening records the choice locally. */
function items(count: number): ScreenItemListItem[] {
  return Array.from({ length: count }, (_, index) => {
    const state = STATES[index % STATES.length];
    const name = NAMES[index % NAMES.length] + (index < NAMES.length ? "" : ` ${Math.floor(index / NAMES.length) + 1}판`);
    const vary = Math.floor(index / STATES.length) + index, warnings = state.group === "done" ? 0 : vary % 4;
    return { id: `document-${index}`, label: name, status: { tone: state.tone, label: state.label }, group: state.group, details: [`${12 + (index * 13) % 140}쪽`, warnings ? `변환 경고 ${warnings}개` : null, WHEN[vary % WHEN.length]] };
  });
}

export function ItemListExample() {
  const [count, setCount] = useState("5"), [grouping, setGrouping] = useState("status"), [opened, setOpened] = useState("없음");
  const grouped = grouping === "status";
  return <div className="task-surface"><ScreenFrame title="Item list"><ui.ScreenLayout
    actions={<ui.Toolbar label="Item list example"><ui.Select hideLabel label="Example items" value={count} options={["5", "30", "300"].map(value => ({ value, label: `${value} items` }))} onValueChange={setCount} />
      <ui.Select hideLabel label="Example grouping" value={grouping} options={[{ value: "status", label: "Grouped by status" }, { value: "none", label: "No groups" }]} onValueChange={setGrouping} /></ui.Toolbar>}>
    <ui.ItemList key={`${count}-${grouping}`} items={items(Number(count))} groups={grouped ? GROUPS : undefined} hideStatusLabel={grouped} onOpen={item => setOpened(item.label)} />
    <p className="type-helper">Opened: <output aria-label="Opened item">{opened}</output></p>
  </ui.ScreenLayout></ScreenFrame></div>;
}
