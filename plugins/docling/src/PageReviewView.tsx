import { useRef, useState } from "react";
import type { UiHost } from "@litzio/plugin-api/ui";
import type { ComparisonSnapshot } from "./comparison/compare.ts";
import "./page-review.css";

export function PageReviewView({ host, snapshot, loading, conversionEnabled, onChanged }: {
  host: UiHost; snapshot: ComparisonSnapshot; loading: boolean; conversionEnabled: boolean; onChanged(): Promise<void>;
}) {
  const [selection, setSelection] = useState<number[]>([]), [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState("");
  const pending = useRef(false);
  const ko = host.text("Source pages") !== "Source pages";
  const copy: Record<string, string> = {
    "Select page": "페이지 선택", "Exclude selected pages": "선택 페이지 제외", "Exclusion reason": "제외 이유 (필수)",
    "Undo exclusion": "제외 해제", "Selected pages": "선택한 페이지", "Approved exclusions": "승인된 제외 항목",
    "Select pages and enter a reason before excluding them. Original files and images are preserved.": "페이지를 선택하고 제외 이유를 입력하세요. 원본 파일과 이미지는 보존됩니다.",
  };
  const text = (key: string) => ko && copy[key] ? copy[key] : host.text(key);
  const pages = Object.values(snapshot.map.pages).sort((a, b) => a.page_no - b.page_no);
  const exclusions = [...new Map(pages.flatMap(page => page.exclusion ? [[page.exclusion.id, page.exclusion] as const] : [])).values()];
  const disabled = busy || loading || !conversionEnabled;
  async function change(id?: string) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setProblem("");
    try {
      const folder = snapshot.path.replace(/[\\/][^\\/]+$/, "");
      await host.requestJson("api/plugin-operation", "POST", { plugin: "docling", operation: id ? "remove-correction" : "add-correction",
        args: id ? { folder, id } : { folder, entry: { id: `pages-${Date.now()}-${Math.random().toString(16).slice(2)}`, operation: "exclude-pages",
          value: { pages: selection }, reason: reason.trim(), approvedAt: new Date().toISOString() } } });
      setSelection([]); setReason("");
      await onChanged();
    } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="docling-page-review" aria-label={text("Page review")} aria-busy={busy || loading}>
    <header className="docling-page-review-header"><h1>{text("Page review")}</h1>
      <p>{text("Select pages and enter a reason before excluding them. Original files and images are preserved.")}</p>
      <div className="docling-page-review-controls">
        <span>{text("Selected pages")}: {selection.join(", ") || "—"}</span>
        <label>{text("Exclusion reason")}<host.Input value={reason} disabled={disabled} onChange={event => setReason(event.target.value)} /></label>
        <host.Button variant="default" disabled={disabled || !selection.length || !reason.trim()} onClick={() => void change()}>{text("Exclude selected pages")}</host.Button>
      </div>
      {problem ? <p role="alert">{problem}</p> : null}
    </header>
    <div className="docling-page-review-scroll">
      {exclusions.length ? <section className="docling-page-exclusions" aria-label={text("Approved exclusions")}>
        <h2>{text("Approved exclusions")}</h2>
        {exclusions.map(entry => <div key={entry.id}><span>{entry.pages.join(", ")} · {entry.reason}</span>
          <host.Button variant="secondary" disabled={disabled} onClick={() => void change(entry.id)}>{text("Undo exclusion")} ({entry.pages.join(", ")})</host.Button></div>)}
      </section> : null}
      <div className="docling-page-grid">{pages.map(page => <article key={page.page_no} className="docling-page-card" data-page={page.page_no} data-excluded={!!page.exclusion}>
        <div className="docling-page-card-heading"><label><input type="checkbox" aria-label={`${text("Select page")} ${page.page_no}`} checked={selection.includes(page.page_no)} disabled={disabled || !!page.exclusion}
          onChange={event => setSelection(value => event.target.checked ? [...value, page.page_no].sort((a, b) => a - b) : value.filter(n => n !== page.page_no))} />{text("Source page")} {page.page_no}</label>
          {page.exclusion ? <span>{text("Excluded")}</span> : null}</div>
        <div className="docling-page-preview" style={{ aspectRatio: `${page.size.width} / ${page.size.height}` }}>
          {page.image?.uri ? <img loading="lazy" decoding="async" src={host.imageUrl(snapshot.path, page.image.uri)} alt={`${text("Source page")} ${page.page_no}`} /> : <p>{text("Page image unavailable")}</p>}
        </div>
      </article>)}</div>
    </div>
  </section>;
}
