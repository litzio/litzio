import { TemplateHoverGallery } from "./template-hover-gallery.tsx";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, FolderOpen, LayoutTemplate, Settings } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { ChoiceGroup } from "../components/ui/choice-group.tsx";
import { Input } from "../components/ui/input.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog.tsx";
import "./template-gallery.css";

const templates = [
  { name: "AI 작업 보고서", description: "요청부터 변경 사항, 검증 근거와 남은 일까지. 사람과 비서가 같은 구조로 작업을 기록합니다.", builtin: true, sections: ["작업 요약", "요청과 범위", "변경 사항", "검증 결과", "남은 일"], example: "완료한 작업과 사용자가 확인할 결과를 간결하게 적습니다." },
  { name: "기술 문서", description: "배경과 설계, 사용 방법을 함께 정리하는 기술 문서의 기본 틀입니다.", builtin: true, sections: ["개요", "배경과 목표", "설계", "사용 방법", "참고 자료"], example: "이 문서가 설명하는 기술과 해결하려는 문제를 적습니다." },
  { name: "주간 프로젝트 회고", description: "이번 주의 진척과 다음 주의 우선순위를 공유합니다.", builtin: false, sections: ["이번 주 요약", "완료한 일", "배운 점", "다음 주 계획"], example: "팀이 함께 확인할 가장 중요한 진척을 적습니다." },
  { name: "고객 인터뷰 및 제품 개선 제안 정리 — 장기 사용자의 실제 작업 흐름을 중심으로", description: "인터뷰 맥락과 관찰한 사실, 해석을 구분하고 제품 개선 제안의 근거를 남깁니다. 여러 팀이 같은 자료를 읽어도 발언의 맥락을 잃지 않도록 후속 질문과 확인할 항목까지 함께 정리합니다.", builtin: false, sections: ["인터뷰 맥락", "관찰한 사실", "사용자 발언", "개선 제안", "후속 질문"], example: "인터뷰 참여자의 역할과 실제 작업 환경을 기록합니다." },
  { name: "설계 결정 기록", description: "선택지와 판단 근거를 남겨 다음 설계의 출발점으로 씁니다.", builtin: false, sections: ["상황", "선택지", "결정", "결과"], example: "결정이 필요한 상황과 제약을 설명합니다." },
  { name: "실험 노트", description: "가설, 관찰과 결론을 분리해 재현 가능한 실험 기록을 만듭니다.", builtin: false, sections: ["가설", "실험 조건", "관찰", "결론"], example: "이번 실험에서 확인하려는 질문을 적습니다." },
];

/** UI-only proposal: no semantic operation, Host API or file write. */
export function TemplateGallery() {
  const query = new URLSearchParams(location.search);
  const [variant, setVariant] = useState(query.get("variant") === "a" ? "a" : query.get("variant") === "b" ? "b" : "c");
  const [theme, setTheme] = useState(query.get("theme") === "dark" ? "dark" : "light");
  const [empty, setEmpty] = useState(query.get("empty") === "1");
  const [opened, setOpened] = useState(true);
  const [selected, setSelected] = useState(0);
  const [detail, setDetail] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [folder, setFolder] = useState("프로젝트 / 문서");
  const [filename, setFilename] = useState("새 문서.md");
  const [notice, setNotice] = useState("");
  const action = useRef<HTMLButtonElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const t = templates[selected]!;
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.lang = "ko"; }, [theme]);
  useEffect(() => { if (detail) detailHeading.current?.focus(); }, [detail]);
  const choose = (index: number) => { setSelected(index); setDetail(true); setNotice(""); };
  const preview = <section className="tg-preview" aria-label="선택한 템플릿 미리보기">
    <header><span className="tg-eyebrow">{t.builtin ? "기본 제공 · 읽기 전용" : "사용자 템플릿"}</span>
      <h2 ref={detailHeading} tabIndex={-1}>{t.name}</h2><p>{t.description}</p>
      <div className="tg-actions"><Button ref={action} onClick={() => { setFolder("프로젝트 / 문서"); setFilename(`${t.name}.md`); setSaving(true); }}>이 템플릿으로 새 문서</Button></div>
      <p className="tg-hint">{t.builtin ? "기본본은 보존됩니다. 새 문서로 복사해 고쳐 쓰세요." : "원본 템플릿을 유지하고 새 문서를 만듭니다."}</p>
    </header>
    <div className="tg-paper"><span className="tg-eyebrow">내용 미리보기</span><h3>{t.name}</h3>{t.sections.map((section, i) => <section key={section}><h4>{i + 1}. {section}</h4><p>{i === 0 ? t.example : `${section}에 필요한 내용과 근거를 작성합니다.`}</p></section>)}</div>
  </section>;
  const list = (builtin: boolean) => {
    const items = empty ? [] : templates.map((item, index) => ({ ...item, index })).filter(item => item.builtin === builtin && `${item.name} ${item.description}`.includes(search));
    return <section className="tg-group"><h2>{builtin ? "기본 제공" : "내 템플릿"} <span>{items.length}</span></h2>
      {items.length ? <div className={variant === "b" ? "tg-cards" : "tg-list"}>{items.map(item => <Button variant="ghost" type="button" className="tg-item" data-template-index={item.index} key={item.index} aria-pressed={variant === "a" ? selected === item.index : undefined} onClick={() => choose(item.index)}>
        {variant === "b" && <div className="tg-thumbnail" aria-hidden="true"><FileText />{item.sections.slice(0, 3).map(s => <span key={s}>{s}</span>)}</div>}
        <strong>{item.name}</strong><p>{item.description}</p><span className="tg-hint">{builtin ? "기본본 · 읽기 전용" : "사용자"}{variant === "b" ? " · 미리보기 →" : ""}</span>
      </Button>)}</div> : <p className="tg-empty">{empty ? (builtin ? "기본 템플릿이 없습니다." : "아직 저장한 템플릿이 없습니다. 일반 문서를 템플릿으로 저장하면 여기에 표시됩니다.") : "검색 결과가 없습니다."}</p>}
    </section>;
  };
  return <div className="tg-shell">
    <div className="tg-dev"><strong>#936 · 화면 시안</strong><ChoiceGroup aria-label="시안" value={variant} options={[{ value: "a", label: "A · 목록과 미리보기" }, { value: "b", label: "B · 카드와 상세" }, { value: "c", label: "C · 카드와 hover" }]} onValueChange={v => { setVariant(v); setDetail(false); }} />
      <Button size="sm" variant="ghost" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? "다크" : "라이트"}</Button><Button size="sm" variant="ghost" aria-pressed={empty} onClick={() => { setEmpty(!empty); setDetail(false); }}>빈 상태</Button>
    </div>
    <div className="tg-workspace"><aside className="tg-sidebar"><strong>Litzio</strong><span className="tg-explorer">탐색기</span><Button variant="ghost" aria-label="작업 폴더" title="작업 폴더" onClick={() => setOpened(false)}><FolderOpen /><span>작업 폴더</span></Button><Button variant="ghost" aria-label="템플릿 갤러리" title="템플릿 갤러리" aria-pressed={opened} onClick={() => setOpened(true)}><LayoutTemplate /><span>템플릿 갤러리</span></Button><span className="tg-sidebar-bottom"><Settings /><span>설정</span></span></aside>
      <main><div className="tg-tab"><LayoutTemplate />템플릿 갤러리</div>{opened ? <div className="tg-content">
        <header className="tg-title"><h1>템플릿 갤러리</h1><p>같은 틀에서 시작하고, 나만의 내용으로 완성하세요.</p></header>
        {variant === "b" && detail && !empty ? <><Button variant="ghost" onClick={() => { setDetail(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`.tg-item[data-template-index="${selected}"]`)?.focus()); }}><ArrowLeft />목록으로</Button>{preview}</> : <>
          <label className="tg-search">템플릿 찾기<Input value={search} onChange={e => setSearch(e.target.value)} placeholder="이름 또는 설명으로 검색" /></label>
          {variant === "c" ? <TemplateHoverGallery templates={templates} search={search} empty={empty} onCreate={(index, trigger) => { setSelected(index); action.current = trigger; setFolder("프로젝트 / 문서"); setFilename(`${templates[index]!.name}.md`); setSaving(true); }} /> : <div className={`tg-body tg-${variant}`}><div className="tg-catalog">{list(true)}{list(false)}</div>{variant === "a" && !empty && preview}</div>}
        </>}{notice && <p role="status">{notice}</p>}
      </div> : <div className="tg-welcome"><h1>어떤 문서를 만들까요?</h1><Button variant="secondary" onClick={() => setOpened(true)}><LayoutTemplate />템플릿 갤러리 열기</Button></div>}</main>
    </div>
    <Dialog open={saving} onOpenChange={setSaving}><DialogContent finalFocus={action}><DialogHeader><DialogTitle>새 문서의 저장 위치</DialogTitle><DialogDescription>선택한 템플릿: {t.name}. 저장 위치를 고르는 흐름의 화면 시안입니다.</DialogDescription></DialogHeader>
      <label>저장 폴더<select className="tg-folder" value={folder} onChange={e => setFolder(e.target.value)}><option>프로젝트 / 문서</option><option>개인 / 노트</option></select></label>
      <label>파일 이름<Input value={filename} onChange={e => setFilename(e.target.value)} /></label><p className="tg-hint">시안에서는 파일을 생성하지 않습니다.</p><DialogFooter><Button variant="secondary" onClick={() => setSaving(false)}>취소</Button><Button onClick={() => { setSaving(false); setNotice(`저장 위치 선택 완료: ${folder} / ${filename} (시안)`); }}>위치 선택 완료</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
