import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { FileText, FolderOpen, RotateCcw } from "lucide-react";
import { getEditableDocument, parse, type EditableDocument } from "@litzio/core";
import type { TemplateContent, TemplateList, TemplateSummary } from "../../shared/template-protocol.ts";
import { DocumentEditor } from "../DocumentEditor.tsx";
import { i18n } from "../i18n.ts";
import { messageOf } from "../document-session.ts";
import { templateLanguage, templateRequest } from "../template-api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { Notice } from "../ui/primitives.tsx";
import "./template-gallery.css";

const triggerFor = (item: TemplateSummary) => `template-${encodeURIComponent(item.id)}`;
const templateText = i18n.getFixedT(null, "templates");

export function TemplateGallery({ active, revision, disabled, onCreate, onOpenFolder }: {
  active: boolean; revision: number; disabled: boolean;
  onCreate(item: TemplateSummary, returnFocus: HTMLElement): void;
  onOpenFolder(path: string): Promise<string>;
}) {
  useTranslation();
  const language = templateLanguage();
  const [catalog, setCatalog] = useState<TemplateList>();
  const [problem, setProblem] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TemplateSummary>();
  const [preview, setPreview] = useState<{ id: string; document: EditableDocument; path: string }>();
  const [previewProblem, setPreviewProblem] = useState("");
  const [triggerId, setTriggerId] = useState<string | null>(null);
  const cache = useRef(new Map<string, { id: string; document: EditableDocument; path: string }>());
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressFocus = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const media = matchMedia("(max-width: 900px)"); const change = () => setNarrow(media.matches);
    media.addEventListener("change", change); return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  useEffect(() => {
    if (!active) { setOpen(false); clearTimeout(focusTimer.current); return; }
    const abort = new AbortController();
    setLoading(true); setProblem(""); cache.current.clear();
    void templateRequest<TemplateList>(`templates?language=${language}`, undefined, abort.signal)
      .then(setCatalog).catch(cause => { if (!abort.signal.aborted) setProblem(messageOf(cause)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [active, revision, language, refresh]);
  useEffect(() => {
    if (!selected || !open) return;
    const abort = new AbortController();
    setPreviewProblem("");
    const key = `${language}:${selected.id}`;
    const cached = cache.current.get(key);
    if (cached) { setPreview(cached); if (scroll.current) scroll.current.scrollTop = 0; return; }
    void templateRequest<TemplateContent>(`template?${new URLSearchParams({ id: selected.id, language })}`, undefined, abort.signal)
      .then(content => {
        if (abort.signal.aborted) return;
        const document = getEditableDocument(parse(content.source));
        const path = content.kind === "user" && catalog ? `${catalog.directory}/${content.name}.md` : "";
        const next = { id: content.id, document, path };
        cache.current.set(key, next); setPreview(next);
        if (scroll.current) scroll.current.scrollTop = 0;
      }).catch(cause => { if (!abort.signal.aborted) setPreviewProblem(messageOf(cause)); });
    return () => abort.abort();
  }, [selected, language, open, catalog]);
  const choose = (item: TemplateSummary, id: string) => { setSelected(item); setTriggerId(id); setOpen(true); };
  const sections = [{ kind: "builtin", label: templateText("Built-in templates") }, { kind: "user", label: templateText("User templates") }];
  return <section className="template-gallery" aria-label={i18n.t("Template gallery")}>
    <header className="template-gallery-header"><h1>{i18n.t("Template gallery")}</h1>
      <div className="template-gallery-actions">
        <Button size="sm" variant="ghost" disabled={disabled || !catalog} title={catalog?.directory}
          onClick={async () => { if (catalog) { const error = await onOpenFolder(catalog.directory); if (error) setProblem(error); } }}>
          <FolderOpen aria-hidden="true" />{templateText("Open template folder")}</Button>
        <Button size="icon-sm" variant="ghost" aria-label={i18n.t("Refresh")} disabled={loading} onClick={() => { setOpen(false); setRefresh(value => value + 1); }}><RotateCcw aria-hidden="true" /></Button>
      </div></header>
    {problem ? <Notice tone="error">{problem}</Notice> : null}
    {loading ? <p role="status">{i18n.t("Loading…")}</p> : null}
    {catalog?.problems.length ? <Notice tone="warning"><strong>{templateText("Some user templates could not be loaded.")}</strong>
      <ul>{catalog.problems.map(item => <li key={item.file} tabIndex={0} title={item.error} aria-label={`${item.file}: ${item.error}`}>{item.file}</li>)}</ul></Notice> : null}
    <Popover open={active && open} triggerId={triggerId} onOpenChange={(next, details) => {
      if (!next) { setOpen(false); return; }
      const id = details.trigger?.id;
      const item = catalog?.templates.find(item => triggerFor(item) === id);
      if (item && id) choose(item, id);
    }}>
      {catalog ? sections.map(section => <section key={section.kind} className="template-gallery-section" aria-label={section.label}>
        <h2>{section.label}</h2>
        {catalog.templates.some(item => item.kind === section.kind) ? <div className="template-gallery-cards">
          {catalog.templates.filter(item => item.kind === section.kind).map(item => <article key={item.id} className="template-card">
            <PopoverPrimitive.Trigger id={triggerFor(item)} className="template-card-preview" openOnHover delay={300} closeDelay={150}
              aria-label={templateText("Preview {{name}}", { name: item.name })} title={item.description || undefined}
              onFocus={event => {
                if (suppressFocus.current) { suppressFocus.current = false; return; }
                const id = event.currentTarget.id;
                clearTimeout(focusTimer.current); focusTimer.current = setTimeout(() => choose(item, id), 300);
              }} onBlur={() => clearTimeout(focusTimer.current)}>
              <FileText aria-hidden="true" /><span className="template-card-name">{item.name}</span>
              {item.kind === "builtin" ? <span className="template-card-badge">{templateText("Built-in")}</span> : null}
            </PopoverPrimitive.Trigger>
            <div className="template-card-footer"><Button size="sm" variant="secondary" disabled={disabled} onClick={event => { setOpen(false); onCreate(item, event.currentTarget); }}>
              {templateText("New document from template")}</Button></div>
          </article>)}
        </div> : <p className="template-gallery-empty">{section.kind === "user" ? templateText("No user templates yet.") : templateText("No templates available.")}</p>}
      </section>) : null}
      <PopoverContent keepMounted className="template-preview" side={narrow ? "bottom" : "right"} align="start" initialFocus={false} finalFocus={false}
        aria-label={templateText("Document preview")} onKeyDown={event => {
          if (event.key === "Escape") { const trigger = globalThis.document.getElementById(triggerId ?? ""); suppressFocus.current = globalThis.document.activeElement !== trigger; setOpen(false); trigger?.focus(); }
        }}>
        <div className="template-preview-header"><strong>{selected?.name}</strong><span>{i18n.t("Read-only")}</span></div>
        {selected?.description ? <p className="template-preview-description">{selected.description}</p> : null}
        <div ref={scroll} className="template-preview-scroll" role="region" tabIndex={0} aria-label={templateText("Preview content")}>
          {previewProblem ? <Notice tone="error">{previewProblem}</Notice> : null}
          {!preview || preview.id !== selected?.id ? <p role="status">{i18n.t("Loading…")}</p> : null}
          {preview ? <div hidden={!!previewProblem || preview.id !== selected?.id}><DocumentEditor preview readOnly document={preview.document} documentPath={preview.path}
            onStructuralReject={() => setPreviewProblem(templateText("Could not display this template."))} /></div> : null}
        </div>
      </PopoverContent>
    </Popover>
  </section>;
}
