import { comparisonDescription } from "../comparison-description.ts";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DocumentEditor } from "../DocumentEditor.tsx";
import type { EditableDocument } from "@litzio/core";
import type { HostClient } from "../host-client.ts";
import { HostClientContext } from "../host-context.tsx";
import type { CompareResult } from "../../server/document-compare.ts";
import type { Comparison } from "./SourceCompare.tsx";
import { comparisonRows } from "../comparison-rows.ts";
import { type ComparisonLayout } from "../comparison-layout.ts";
import { Button } from "@/components/ui/button.tsx";
import { i18n } from "../i18n.ts";

class PreviewBoundary extends Component<{ children: ReactNode; fail(reason: string): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.fail(error.message); }
  render() { return this.state.failed ? null : this.props.children; }
}
function Snapshot({ document, path, layout }: { document: EditableDocument; path: string; layout: ComparisonLayout }) {
  return <section className="visual-snapshot" data-side={layout.side} aria-label={i18n.t(layout.side === "before" ? "Current disk file" : "Save preview")}>
    <div className="visual-snapshot-title">{i18n.t(layout.side === "before" ? "Current disk file" : "Save preview")}{document.title ? ` · ${document.title}` : ""}</div>
    <DocumentEditor readOnly preview document={document} documentPath={path} comparison={layout} onStructuralReject={() => {}} />
  </section>;
}
export default function VisualCompare({ result, client, path, onUnavailable }: {
  result: Comparison; client: HostClient; path: string; onUnavailable(reason: string): void;
}) {
  const [comparison, setComparison] = useState<CompareResult>();
  const [expanded, setExpanded] = useState(new Set<number>());
  const [current, setCurrent] = useState(0);
  const region = useRef<HTMLDivElement>(null);
  const toggle = useCallback((fold: number) => setExpanded(previous => { const next = new Set(previous); if (next.has(fold)) next.delete(fold); else next.add(fold); return next; }), []);
  useEffect(() => {
    if (result.missing) { onUnavailable(i18n.t("The disk file is missing. Use Source comparison.")); return; }
    const controller = new AbortController(); let live = true;
    const timeout = setTimeout(() => controller.abort(), 15000);
    void client.request("/api/document-compare", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ before: result.before, after: result.after }), signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      // Bound two full NodeView trees separately from Core's comparison budget.
      if (body.before.blocks.length + body.after.blocks.length > 1000) throw new Error(i18n.t("Visual preview exceeds 1000 blocks. Use Source comparison."));
      if (live) setComparison(body);
    }).catch(error => { if (live) onUnavailable(String(error.message ?? error)); }).finally(() => clearTimeout(timeout));
    return () => { live = false; clearTimeout(timeout); controller.abort(); };
  }, [client, result, onUnavailable]);
  const rows = useMemo(() => comparison ? comparisonRows(comparison.before, comparison.after, comparison.changes) : [], [comparison]);
  const descriptions = rows.map(row => comparisonDescription(row, comparison!.before, comparison!.after));
  const descriptionKey = descriptions.join("\n");
  const beforeLayout = useMemo<ComparisonLayout>(() => ({ rows, descriptions, expanded, toggle, side: "before" }), [rows, expanded, toggle, descriptionKey]);
  const afterLayout = useMemo<ComparisonLayout>(() => ({ rows, descriptions, expanded, toggle, side: "after" }), [rows, expanded, toggle, descriptionKey]);
  useEffect(() => {
    if (!comparison || !region.current) return;
    const node = region.current;
    // NodeViews expose preview failures locally; never silently certify a failed render.
    const inspect = () => {
      const failure = node.querySelector('[data-testid="figure-image-error"], .equation-preview-error, .mermaid-preview:not([aria-busy="true"]):not(:has(img))');
      if (failure) onUnavailable(failure.textContent ?? i18n.t("Comparison calculation failed."));
    };
    const observer = new MutationObserver(inspect); observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] }); inspect();
    return () => observer.disconnect();
  }, [comparison, onUnavailable]);
  function move(direction: number) {
    const count = comparison!.changes.length;
    const next = current === 0 ? (direction > 0 ? 1 : count) : (current - 1 + direction + count) % count + 1;
    setCurrent(next);
    const target = region.current?.querySelector<HTMLElement>(`[data-visual-change="${next}"]`);
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest" });
  }
  if (!comparison) return <p role="status">{i18n.t("Loading comparison…")}</p>;
  return <HostClientContext.Provider value={client}>
    <p>{i18n.t("Visual compares block meaning. Formatting-only source changes appear in Source.")}</p>
    <p>{i18n.t("Images use current Host files. Historical image bytes are not preserved; past appearance cannot be verified.")}</p>
    {comparison.documentChanged ? <p role="status">{i18n.t("Document metadata changed. See Source for details.")}</p> : null}
    <div className="recovery-diff-toolbar">
      <span role="status">{i18n.t("{{count}} changes", { count: comparison.changes.length })}</span>
      <Button size="sm" variant="secondary" disabled={!comparison.changes.length} onClick={() => move(-1)}>{i18n.t("Previous change")}</Button>
      <Button size="sm" variant="secondary" disabled={!comparison.changes.length} onClick={() => move(1)}>{i18n.t("Next change")}</Button>
      <span aria-live="polite">{current ? i18n.t("Change {{current}} of {{count}}", { current, count: comparison.changes.length }) : ""}</span>
    </div>
    <PreviewBoundary fail={onUnavailable}><div className="visual-comparison-scroll" ref={region} data-testid="visual-comparison" data-current={current} onKeyDownCapture={event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); event.stopPropagation(); }
    }}><div className="visual-comparison-grid">
      <Snapshot document={comparison.before} path={path} layout={beforeLayout} />
      <Snapshot document={comparison.after} path={path} layout={afterLayout} />
    </div></div></PreviewBoundary>
  </HostClientContext.Provider>;
}
