import { createRoot } from "react-dom/client";
import { useMemo, useState } from "react";
import { parse, getEditableDocument } from "@litzio/core";
import type { ReviewView } from "@litzio/core/views-v2";
import { ReviewRenderer, type ReviewSnapshot, type ReviewAdapter } from "../../../src/review/ReviewRenderer.tsx";
import { Button } from "../../../src/components/ui/button.tsx";
import { TooltipProvider } from "../../../src/components/ui/tooltip.tsx";
import "../../../src/index.css";
import "../../../src/styles.css";
import "katex/dist/katex.min.css";
const view: ReviewView = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "review", title: "Review changes", refresh: "manual", sources: { review: { plugin: "fixture.review", review: "sample", bundleRef: "bundle" } }, layout: { component: "VerticalPanel", children: [{ component: "SourceDocumentCompare", title: "Compare", source: "review" }, { component: "ReviewList", title: "Changes", source: "review" }] } };
function Fixture() {
  const [mode, setMode] = useState("normal"), [held, setHeld] = useState(false), [count, setCount] = useState(0);
  const adapter = useMemo<ReviewAdapter>(() => {
    let state: "pending" | "approved" | "rejected" = "pending", revision = "r1", release: (() => void) | undefined;
    function snapshot(pageNo: number): ReviewSnapshot {
      const document = getEditableDocument(parse(`---\nlitzio: 1\n---\n# 검토 문서\n\n${state === "approved" ? "정정된 문장입니다." : "검토할 문장입니다."}\n\n${Array.from({length: 18}, (_, i) => `추가 문단 ${i + 1}. 원본과 비교하며 읽습니다.`).join("\n\n")}\n`));
      const target = { path: [...document.blocks[1].path], documentRevision: revision, documentHash: revision };
      const baseline = { documentRevision: revision, proposalRevision: revision, sourceRevision: "s1", mappingRevision: "m1" };
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="55" y="105" font-size="24">Original page ${pageNo}</text><text x="55" y="180" font-size="18">A sentence for review.</text><path d="M55 260H540M55 300H540M55 340H540" stroke="#888"/></svg>`;
      return { bundle: { bundleRef: "bundle", generation: "g1", documentRef: "doc", documentRevision: revision, documentHash: revision, sourceRevision: "s1", mappingRevision: "m1" },
        baseline, documentRevision: mode === "stale" ? "old" : revision, documentHash: revision, document, documentPath: "/fixture.md", pageCount: 2,
        imageUrl: mode === "no-image" ? undefined : `data:image/svg+xml,${encodeURIComponent(svg)}`,
        page: { generation: "g1", sourceRevision: "s1", pageNo, width: 600, height: 800, origin: pageNo === 1 ? "TOPLEFT" : "BOTTOMLEFT", unit: "px", imageRef: "image", regions: [
          { id: "text", bbox: pageNo === 1 ? [45,130,550,200] : [45,600,550,670], category: "Sentence", status: "supported" },
          { id: "decoration", bbox: [45,230,550,350], category: "Divider", status: "decoration" },
          { id: "unknown", bbox: [45,400,300,450], category: "Unknown region", status: "unsupported", reason: "Unsupported content" },
          { id: "excluded", bbox: [45,500,300,550], category: "Header", status: "excluded" }] },
        mapping: { generation: "g1", documentRevision: revision, documentHash: revision, sourceRevision: "s1", mappingRevision: "m1", entries: [{ sourceIds: ["text"], targets: [target] }] },
        proposals: [{ id: "p1", kind: "text.replace", targets: [target], evidence: ["Checked against the source page."], before: { type: "plain", text: "검토할 문장입니다." }, after: { type: "plain", text: "정정된 문장입니다." }, baseline, state,
          actions: [{ action: "approve", allowed: state === "pending", reason: "Only pending changes can be approved." }, { action: "reject", allowed: state === "pending", reason: "Only pending changes can be rejected." }, { action: "undo", allowed: state === "approved" && mode !== "no-undo", reason: "There is no applied change to undo." }] }] };
    }
    return { read: async pageNo => { if (mode === "unavailable") throw Error("Unavailable"); if (release) await new Promise<void>(resolve => { release = resolve; }); return snapshot(pageNo); },
      act: async action => { setCount(c => c + 1); state = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending"; revision = revision === "r1" ? "r2" : "r1"; if (mode === "hold") { release = () => {}; setHeld(true); } },
      openDocument: () => { document.title = "Opened result"; },
      // Fixture control releases a completed write's read, never exposes a production approval tool.
      release: () => { const resolve = release; release = undefined; resolve?.(); setHeld(false); },
    } as ReviewAdapter;
  }, [mode]);
  return <TooltipProvider><div style={{ padding: 16 }}><div className="review-toolbar" aria-label="Fixture controls">{["normal", "stale", "unavailable", "no-image", "no-undo", "hold"].map(v => <Button key={v} variant="outline" onClick={() => { setMode(v); setHeld(false); }}>{v}</Button>)}<span>Actions: {count}</span>{held && <Button onClick={() => (adapter as ReviewAdapter & { release(): void }).release()}>Complete refresh</Button>}</div><ReviewRenderer key={mode} view={view} adapter={adapter} /></div></TooltipProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
