import { useEffect, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { getEditableDocument, parse } from "@litzio/core";
import { FileText } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Popover, PopoverContent } from "../components/ui/popover.tsx";
import { DocumentEditor } from "../DocumentEditor.tsx";
import source0 from "./templates/0.md?raw";
import source1 from "./templates/1.md?raw";
import source2 from "./templates/2.md?raw";
import source3 from "./templates/3.md?raw";
import source4 from "./templates/4.md?raw";
import source5 from "./templates/5.md?raw";
import "./template-hover-gallery.css";

// Public Core projection and the actual Read editor, not a parallel Markdown renderer.
const documents = [source0, source1, source2, source3, source4, source5].map(source => getEditableDocument(parse(source)));
type Template = { name: string; description: string; builtin: boolean; sections: string[] };
export function TemplateHoverGallery({ templates, search, empty, onCreate }: {
  templates: Template[]; search: string; empty: boolean;
  onCreate(index: number, trigger: HTMLButtonElement): void;
}) {
  const [active, setActive] = useState<number | null>(null);
  return <div className="tg-hover-gallery"><p className="tg-hint">카드에 마우스를 올리거나 Tab으로 이동하면 문서 미리보기가 열립니다. Escape로 닫습니다.</p>
    {[true, false].map(builtin => {
      const items = empty ? [] : templates.map((t, index) => ({ ...t, index })).filter(t => t.builtin === builtin && `${t.name} ${t.description}`.includes(search));
      return <section className="tg-group" key={String(builtin)}><h2>{builtin ? "기본 제공" : "내 템플릿"} <span>{items.length}</span></h2>
        <div className="tg-cards">{items.map(item => <HoverCard key={item.index} item={item} open={active === item.index}
          onOpen={open => setActive(current => open ? item.index : current === item.index ? null : current)}
          onCreate={trigger => { setActive(null); onCreate(item.index, trigger); }} />)}</div>
        {!items.length && <p className="tg-empty">{empty ? builtin ? "기본 템플릿이 없습니다." : "아직 저장한 템플릿이 없습니다. 일반 문서를 템플릿으로 저장하면 여기에 표시됩니다." : "검색 결과가 없습니다."}</p>}
      </section>;
    })}
  </div>;
}

function HoverCard({ item, open, onOpen, onCreate }: {
  item: Template & { index: number }; open: boolean; onOpen(value: boolean): void; onCreate(trigger: HTMLButtonElement): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const suppressFocus = useRef(false);
  const [problem, setProblem] = useState("");
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width:900px)").matches);
  useEffect(() => { const media = matchMedia("(max-width:900px)"); const change = () => setNarrow(media.matches); media.addEventListener("change", change); return () => media.removeEventListener("change", change); }, []);
  return <article className="tg-hover-card">
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverPrimitive.Trigger openOnHover delay={0} closeDelay={0}
        onFocus={() => { if (!suppressFocus.current) onOpen(true); }} onBlur={() => { suppressFocus.current = false; }} render={<Button ref={trigger} variant="ghost" className="tg-item" />}
        aria-label={`${item.name} 미리보기`}>
        <div className="tg-thumbnail" aria-hidden="true"><FileText />{item.sections.slice(0, 3).map(section => <span key={section}>{section}</span>)}</div>
        <strong>{item.name}</strong><p>{item.description}</p><span className="tg-hint">{item.builtin ? "기본본 · 읽기 전용" : "사용자 템플릿"} · 미리보기</span>
      </PopoverPrimitive.Trigger>
      <PopoverContent className="tg-document-popover" side={narrow ? "bottom" : "right"} align="start" initialFocus={false} finalFocus={false}
        aria-label={`${item.name} 문서 미리보기`} tabIndex={0}
        onKeyDown={event => { if (event.key === "Escape") { suppressFocus.current = true; onOpen(false); trigger.current?.focus(); } }}>
        <div className="tg-popover-heading"><strong>문서 미리보기</strong><span>읽기 전용 · Esc 닫기</span></div>
        <div className="tg-preview-scroll" role="region" tabIndex={0} aria-label="미리보기 내용 스크롤">
          {problem ? <p role="alert">{problem}</p> : <DocumentEditor key={item.index} readOnly document={documents[item.index]!}
            documentPath={`template-gallery-mock/${item.index}.md`} onStructuralReject={reason => setProblem(String(reason ?? "미리보기 오류"))} />}
        </div>
      </PopoverContent>
    </Popover>
    <div className="tg-card-footer"><Button size="sm" variant="secondary" onClick={event => onCreate(event.currentTarget)}>이 템플릿으로 새 문서</Button></div>
  </article>;
}
