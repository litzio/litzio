import { useState } from "react";
import { Row, Section } from "../components/ui/row.tsx";
import { SettingsRow, SettingsSelect, SettingsSwitch } from "../components/ui/settings.tsx";
import { PanelHeader } from "../components/ui/panel-header.tsx";
import { Status } from "../components/ui/status.tsx";
import { HostStatus } from "../components/HostStatus.tsx";
import { Button } from "../components/ui/button.tsx";
import { screenUI as ui } from "../views/screen-ui.ts";
export function SharedPartsExample() {
  const [value, setValue] = useState("ko"), [checked, setChecked] = useState(true);
  const options = [{value:"ko",label:"한국어"},{value:"en",label:"English"}];
  return <section className="ui-gallery-section shared-parts-example" aria-label="공용 정보 부품">
    <PanelHeader title="공용 정보 부품" level={2} actions={<Button variant="ghost" size="sm">닫기</Button>} />
    <Section title="표시 방식">
      <SettingsSelect label="언어" options={options} value={value} onChange={setValue}/>
      <SettingsSelect label="문서 언어" options={options} value={value} onChange={setValue}/>
      <SettingsSwitch label="자동 복구" checked={checked} onChange={setChecked}/>
      <SettingsRow label="복구 기록"><Button variant="outline">확인</Button><Button variant="outline">정리</Button></SettingsRow>
      <Row kind="fact" label="버전">0.0.3</Row>
      <Row kind="fact" label="저장 위치"><code>/documents/research/measurements/long-directory-name/measurement-report.md</code></Row>
    </Section>
    <ui.ScreenLayout width="full"><ui.Section title="플러그인 정보"><ui.Row kind="fact" label="측정 개수">1234</ui.Row><ui.Row kind="fact" label="최종 확인">2026-11-16</ui.Row></ui.Section></ui.ScreenLayout>
    <div style={{maxWidth:"var(--layout-settings-control-width)"}}><ui.ScreenLayout width="narrow"><ui.Section title="좁은 열"><ui.Row label="문서 작업"><ui.Button>열기</ui.Button><ui.Button>검사</ui.Button></ui.Row><ui.Row kind="fact" label="경로"><code>/documents/research/measurements/report.md</code></ui.Row></ui.Section></ui.ScreenLayout></div>
    <Section title="연결과 작업 상태"><div className="screen-toolbar">{(["pill","plain"] as const).map(variant => <div className="screen-toolbar" key={variant}>{(["ok","progress","warning","error","neutral"] as const).map((tone,index) => <Status key={tone} tone={tone} variant={variant} label={["연결됨","처리 중","확인 필요","연결 실패","대기 중"][index]}/>)}</div>)}<HostStatus runtime={{state:"connected"}} /></div></Section>
  </section>;
}
