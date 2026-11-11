import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EditableDocument, TraceReport, TraceIssue } from "@litzio/core";
import { DocumentEditor } from "../DocumentEditor.tsx";
import { useHostClient } from "../host-context.tsx";
import { i18n } from "../i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Notice } from "../ui/primitives.tsx";
import { messageOf } from "../document-session.ts";
import type { ReadingPosition } from "../document-reading.ts";
import { scrollAnchors, scrollPosition } from "../review/compare-geometry.ts";
import { requirementStrengthLabel } from "../requirement-labels.ts";
import {
  blockKey, linksOf, NO_SELECTION, requirementState, selectFromSentence, selectFromStd, selectFromSys, sentenceKey, statusCounts, stdMarks, traceMatrix,
  type Selection,
} from "./requirements-view-model.ts";
import "./requirements-compare.css";

type Loaded = { report: TraceReport; standard: EditableDocument; system: EditableDocument; revision: string };
type Panel = "candidates" | "check" | "matrix";
type Wire = { key: string; d: string; selected: boolean; state: "ok" | "warn" | "error" };
const EMPTY: ReadingPosition = { blocks: [], height: 0 };
const STORAGE = "litzio.requirements-compare";

/** The last pair of documents compared, so reopening the tab continues where the review left off. */
function remembered(): { standard: string; system: string } {
  try { const value = JSON.parse(localStorage.getItem(STORAGE) ?? "{}"); return { standard: String(value.standard ?? ""), system: String(value.system ?? "") }; }
  catch { return { standard: "", system: "" }; }
}

export function RequirementsCompare({ paths, active }: { paths: readonly string[]; active: boolean }) {
  useTranslation();
  const client = useHostClient();
  const [standardPath, setStandardPath] = useState(() => remembered().standard || paths[0] || "");
  const [systemPath, setSystemPath] = useState(() => remembered().system || paths[1] || "");
  const [loaded, setLoaded] = useState<Loaded>();
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [panel, setPanel] = useState<Panel>("candidates");
  const [filter, setFilter] = useState("");
  const [sync, setSync] = useState(true);
  const [left, setLeft] = useState<ReadingPosition>(EMPTY);
  const [right, setRight] = useState<ReadingPosition>(EMPTY);
  const [wires, setWires] = useState<Wire[]>([]);
  const host = useRef<HTMLDivElement>(null), leftPane = useRef<HTMLDivElement>(null), rightPane = useRef<HTMLDivElement>(null);
  const leftContent = useRef<HTMLDivElement>(null), rightContent = useRef<HTMLDivElement>(null);
  const suppressed = useRef(new Map<HTMLElement, number>());

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const response = await client.request("/api/requirements", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, standard: standardPath, system: systemPath, ...extra }) });
    const value = await response.json();
    if (!response.ok || value.error) throw new Error(value.error ?? i18n.t("Data unavailable."));
    return value;
  }, [client, standardPath, systemPath]);

  const load = useCallback(async () => {
    if (!standardPath.trim() || !systemPath.trim()) { setProblem(i18n.t("Enter the standard and system document paths.")); return; }
    setBusy(true); setProblem("");
    try {
      const value = await call("check", { documents: true });
      setLoaded({ report: value.report, standard: value.documents.standard, system: value.documents.system, revision: `${value.revisions.standard}:${value.revisions.system}` });
      try { localStorage.setItem(STORAGE, JSON.stringify({ standard: standardPath, system: systemPath })); } catch { /* optional memory */ }
    } catch (cause) { setProblem(messageOf(cause)); }
    finally { setBusy(false); }
  }, [call, standardPath, systemPath]);
  useEffect(() => { if (active && !loaded && standardPath && systemPath) void load(); }, [active]);

  const report = loaded?.report;
  const links = useMemo(() => report ? linksOf(report) : [], [report]);
  const marks = useMemo(() => report ? stdMarks(report) : new Map(), [report]);
  const counts = report ? statusCounts(report) : undefined;
  const sysStates = useMemo(() => new Map((report?.requirements ?? []).map(item => [blockKey(item.path), requirementState(item)])), [report]);

  const select = useCallback((make: (report: TraceReport, links: ReturnType<typeof linksOf>) => Selection) => { if (report) setSelection(make(report, links)); }, [report, links]);
  const onStdSelect = useCallback((key: string | undefined) => { if (key) select((r, l) => selectFromStd(r, l, key)); }, [select]);
  const onSysSelect = useCallback((key: string | undefined) => { if (key) select((r, l) => selectFromSys(r, l, key)); }, [select]);
  const reveal = useCallback((key: string) => {
    const block = left.blocks.find(item => item.key === blockKey((report?.sentences.find(s => sentenceKey(s) === key)?.path) ?? []));
    const pane = leftPane.current, content = leftContent.current;
    if (!block || !pane || !content) return;
    pane.scrollTo({ top: Math.max(0, content.offsetTop + block.top - pane.clientHeight * 0.3) });
  }, [left, report]);

  // Connector wires: one per linked block pair, drawn only while both ends are inside their panes.
  useLayoutEffect(() => {
    const root = host.current, lp = leftPane.current, rp = rightPane.current, lc = leftContent.current, rc = rightContent.current;
    if (!root || !lp || !rp || !lc || !rc || !loaded) { setWires([]); return; }
    let frame = 0, anchors: [number, number][] | undefined;
    const lb = new Map(left.blocks.map(block => [block.key, block])), rb = new Map(right.blocks.map(block => [block.key, block]));
    const pairs = new Map<string, { stdKey: string; sysKey: string; state: "ok" | "warn" | "error" }>();
    for (const link of links) if (link.stdKey) pairs.set(`${link.stdKey}|${link.sysKey}`, { stdKey: link.stdKey, sysKey: link.sysKey, state: link.state === "ok" ? "ok" : link.state === "moved" ? "warn" : "error" });
    const geometry = () => {
      const hr = root.getBoundingClientRect(), lr = lp.getBoundingClientRect(), rr = rp.getBoundingClientRect();
      const lcr = lc.getBoundingClientRect(), rcr = rc.getBoundingClientRect();
      const measuring = !anchors, points: [number, number][] = [[0, 0]], lines: Wire[] = [];
      for (const pair of pairs.values()) {
        const a = lb.get(pair.stdKey), b = rb.get(pair.sysKey);
        if (!a || !b) continue;
        const ay = lcr.top + a.top + Math.min(a.height / 2, 24), by = rcr.top + b.top + Math.min(b.height / 2, 24);
        if (measuring) points.push([ay - lr.top + lp.scrollTop, by - rr.top + rp.scrollTop]);
        if (ay < lr.top || ay > lr.bottom || by < rr.top || by > rr.bottom) continue;
        const x1 = lr.right - hr.left, x2 = rr.left - hr.left, bend = Math.max(0, (x2 - x1) / 2);
        lines.push({ key: `${pair.stdKey}|${pair.sysKey}`, state: pair.state, d: `M${x1},${ay - hr.top} C${x1 + bend},${ay - hr.top} ${x2 - bend},${by - hr.top} ${x2},${by - hr.top}`,
          selected: selection.std.includes(pair.stdKey) && selection.sys.includes(pair.sysKey) });
      }
      if (measuring) { points.push([lp.scrollHeight, rp.scrollHeight]); anchors = scrollAnchors(points); }
      return { anchors: anchors!, lines: lines.sort((x, y) => Number(x.selected) - Number(y.selected)) };
    };
    const refresh = () => { frame = 0; setWires(geometry().lines); };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh); };
    const scroll = (event: Event) => {
      const from = event.target as HTMLElement;
      if (from !== lp && from !== rp) { schedule(); return; }
      const expected = suppressed.current.get(from); suppressed.current.delete(from);
      if (sync && !(expected !== undefined && Math.abs(from.scrollTop - expected) < 1)) {
        const to = from === lp ? rp : lp, centre = from.clientHeight * 0.35;
        const position = scrollPosition(anchors ?? geometry().anchors, from.scrollTop + centre, from === rp) - to.clientHeight * 0.35;
        to.scrollTop = Math.max(0, position); suppressed.current.set(to, to.scrollTop);
      }
      schedule();
    };
    root.addEventListener("scroll", scroll, true);
    const invalidate = () => { anchors = undefined; schedule(); };
    const observer = new ResizeObserver(invalidate);
    for (const element of [root, lp, rp, lc, rc]) observer.observe(element);
    schedule();
    return () => { root.removeEventListener("scroll", scroll, true); observer.disconnect(); cancelAnimationFrame(frame); };
  }, [loaded, left, right, links, selection, sync]);

  const act = async (action: "adopt" | "exclude", keys: string[], undo = false) => {
    setBusy(true); setProblem("");
    try { await call(action, { keys, ...(undo ? { undo: true } : {}) }); await load(); }
    catch (cause) { setProblem(messageOf(cause)); setBusy(false); }
  };
  const download = async () => {
    setBusy(true); setProblem("");
    try {
      const value = await call("export");
      const url = URL.createObjectURL(new Blob([value.reqif], { type: "application/xml" }));
      const link = globalThis.document.createElement("a");
      link.href = url; link.download = `${(systemPath.split(/[\\/]/).pop() ?? "requirements").replace(/\.md$/i, "")}.reqif`; link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setProblem(messageOf(cause)); }
    finally { setBusy(false); }
  };

  const candidates = report?.sentences.filter(sentence => sentence.state === "uncovered" && (!filter || `${sentenceKey(sentence)} ${sentence.clause} ${sentence.text}`.toLowerCase().includes(filter.toLowerCase()))) ?? [];
  const excluded = report?.sentences.filter(sentence => sentence.state === "excluded") ?? [];
  const selectedSentences = report?.sentences.filter(sentence => selection.sentences.includes(sentenceKey(sentence))) ?? [];
  return (
    <section className="reqc" aria-label={i18n.t("Requirements comparison")} data-testid="reqc">
      <form className="reqc-bar" onSubmit={event => { event.preventDefault(); void load(); }}>
        <label className="reqc-path"><span>{i18n.t("Standard requirements document")}</span>
          <Input list="reqc-paths" data-testid="reqc-standard" value={standardPath} onChange={event => setStandardPath(event.target.value)} /></label>
        <label className="reqc-path"><span>{i18n.t("System requirements document")}</span>
          <Input list="reqc-paths" data-testid="reqc-system" value={systemPath} onChange={event => setSystemPath(event.target.value)} /></label>
        <datalist id="reqc-paths">{paths.map(path => <option key={path} value={path} />)}</datalist>
        <Button type="submit" size="sm" disabled={busy} data-testid="reqc-compare">{i18n.t("Compare")}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !loaded} data-testid="reqc-export" onClick={() => void download()}>{i18n.t("Export ReqIF")}</Button>
        <label className="reqc-sync"><input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)} /> {i18n.t("Synchronized scrolling")}</label>
      </form>
      {problem ? <Notice tone="error" role="alert">{problem}</Notice> : null}
      <div className="reqc-status" role="status" data-testid="reqc-status">
        {counts ? <>
          <span data-testid="reqc-count-requirements">{i18n.t("Requirements {{count}}", { count: counts.requirements })}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="reqc-count-links">{i18n.t("Links {{count}}", { count: counts.links })}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="reqc-count-uncovered" data-warn={counts.uncovered > 0}>{i18n.t("Not extracted {{count}}", { count: counts.uncovered })}</span>
          {report!.counts.broken + report!.counts.changed + report!.counts.orphans + report!.counts.duplicates > 0
            ? <span className="reqc-status-errors" data-testid="reqc-count-errors">{i18n.t("{{count}} problems to check", { count: report!.counts.broken + report!.counts.changed + report!.counts.orphans + report!.counts.duplicates })}</span> : null}
        </> : <span>{busy ? i18n.t("Loading…") : i18n.t("Choose two documents to compare.")}</span>}
      </div>
      <div className="reqc-panes" ref={host} data-testid="reqc-panes">
        <div className="reqc-pane" data-side="standard" ref={leftPane} tabIndex={0} aria-label={i18n.t("Standard requirements document")}>
          <p className="reqc-pane-title">{i18n.t("Standard requirements document")}</p>
          <div className="reqc-content" ref={leftContent}>
            {loaded ? <DocumentEditor key={`std:${loaded.revision.split(":")[0]}`} readOnly preview showHeadingLevels={false} document={loaded.standard} documentPath={standardPath} onStructuralReject={() => {}}
              onReadingLayout={setLeft} onReadingSelection={onStdSelect} /> : null}
            <div className="reqc-marks" aria-hidden="true">
              {left.blocks.map(block => {
                const mark = marks.get(block.key), chosen = selection.std.includes(block.key);
                if (!mark && !chosen) return null;
                const state = mark?.uncovered ? "uncovered" : mark?.covered ? "covered" : mark?.excluded ? "excluded" : "none";
                return <div key={block.key} data-state={state} data-selected={chosen} style={{ top: block.top, height: block.height }}>
                  {mark?.uncovered ? <span className="reqc-badge" data-testid="reqc-unextracted">{i18n.t("Not extracted")}{mark.uncovered > 1 ? ` ${mark.uncovered}` : ""}</span> : null}
                </div>;
              })}
            </div>
          </div>
        </div>
        <svg className="reqc-wires" aria-hidden="true" data-testid="reqc-wires">
          {wires.map(wire => <path key={wire.key} d={wire.d} data-state={wire.state} data-selected={wire.selected} />)}
        </svg>
        <div className="reqc-pane" data-side="system" ref={rightPane} tabIndex={0} aria-label={i18n.t("System requirements document")}>
          <p className="reqc-pane-title">{i18n.t("System requirements document")}</p>
          <div className="reqc-content" ref={rightContent}>
            {loaded ? <DocumentEditor key={`sys:${loaded.revision}`} readOnly preview showHeadingLevels={false} document={loaded.system} documentPath={systemPath} onStructuralReject={() => {}}
              onReadingLayout={setRight} onReadingSelection={onSysSelect} /> : null}
            <div className="reqc-marks" aria-hidden="true">
              {right.blocks.map(block => {
                const state = sysStates.get(block.key), chosen = selection.sys.includes(block.key);
                if (!state && !chosen) return null;
                return <div key={block.key} data-state={state ?? "none"} data-selected={chosen} style={{ top: block.top, height: block.height }} />;
              })}
            </div>
          </div>
        </div>
      </div>
      {selectedSentences.length || selection.requirements.length ? <div className="reqc-detail" data-testid="reqc-detail">
        {selection.requirements.length ? <p><strong>{i18n.t("Requirements")}</strong> {selection.requirements.join(", ")}</p> : null}
        {selectedSentences.map(sentence => <p key={sentenceKey(sentence)} className="reqc-detail-sentence" data-state={sentence.state}>
          <code>{sentenceKey(sentence)}</code> <span className="reqc-chip">{sentence.strength}</span> {sentence.text}</p>)}
      </div> : null}
      <div className="reqc-panel" data-testid="reqc-panel">
        <div className="reqc-tabs" role="tablist">
          {(["candidates", "check", "matrix"] as const).map(id => <Button key={id} type="button" size="sm" variant="ghost" role="tab" aria-selected={panel === id} data-testid={`reqc-tab-${id}`} onClick={() => setPanel(id)}>
            {id === "candidates" ? i18n.t("Candidate review") : id === "check" ? i18n.t("Traceability check") : i18n.t("Traceability matrix")}
            {id === "candidates" && counts ? ` (${counts.uncovered})` : id === "check" && report ? ` (${report.issues.filter(issue => issue.kind !== "uncovered").length})` : ""}
          </Button>)}
        </div>
        {!report ? null : panel === "candidates" ? <div className="reqc-list" data-testid="reqc-candidates">
          <Input className="reqc-filter" placeholder={i18n.t("Filter by clause or text")} aria-label={i18n.t("Filter by clause or text")} value={filter} onChange={event => setFilter(event.target.value)} />
          {candidates.slice(0, 200).map(sentence => <div key={sentenceKey(sentence)} className="reqc-row" data-testid="reqc-candidate" onClick={() => { setSelection(selectFromSentence(report, links, sentenceKey(sentence))); reveal(sentenceKey(sentence)); }}>
            <code>{sentence.clause}</code><span className="reqc-chip">{requirementStrengthLabel(sentence.strength ?? "shall")}</span>
            <span className="reqc-text">{sentence.text}</span>
            <Button size="sm" variant="outline" disabled={busy} data-testid="reqc-adopt" onClick={event => { event.stopPropagation(); void act("adopt", [sentenceKey(sentence)]); }}>{i18n.t("Adopt")}</Button>
            <Button size="sm" variant="outline" disabled={busy} data-testid="reqc-exclude" onClick={event => { event.stopPropagation(); void act("exclude", [sentenceKey(sentence)]); }}>{i18n.t("Exclude")}</Button>
          </div>)}
          {candidates.length > 200 ? <p className="reqc-more">{i18n.t("Showing the first {{count}} candidates. Filter to narrow the list.", { count: 200 })}</p> : null}
          {candidates.length === 0 ? <p className="reqc-more">{i18n.t("No open candidates.")}</p> : null}
          {excluded.length ? <details className="reqc-excluded"><summary>{i18n.t("Excluded {{count}}", { count: excluded.length })}</summary>
            {excluded.map(sentence => <div key={sentenceKey(sentence)} className="reqc-row" data-testid="reqc-excluded-row"><code>{sentence.clause}</code><span className="reqc-text">{sentence.text}</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("exclude", [sentenceKey(sentence)], true)}>{i18n.t("Restore")}</Button></div>)}
          </details> : null}
        </div> : panel === "check" ? <div className="reqc-list" data-testid="reqc-check">
          {report.issues.filter(issue => issue.kind !== "uncovered").length === 0
            ? <p className="reqc-more" data-testid="reqc-check-ok">{i18n.t("No problems found. Normative sentences not extracted: {{count}}.", { count: report.counts.uncovered })}</p>
            : report.issues.filter(issue => issue.kind !== "uncovered").map((issue, index) => <IssueRow key={index} issue={issue} />)}
        </div> : <div className="reqc-list" data-testid="reqc-matrix">
          <table className="reqc-matrix"><thead><tr><th>{i18n.t("Clause")}</th><th>{i18n.t("Sentences")}</th><th>{i18n.t("Linked")}</th><th>{i18n.t("Excluded")}</th><th>{i18n.t("Not extracted")}</th><th>{i18n.t("Requirements")}</th></tr></thead>
            <tbody>{traceMatrix(report.sentences).map(row => <tr key={row.clause} data-warn={row.uncovered > 0}><td>{row.clause}</td><td>{row.sentences}</td><td>{row.covered}</td><td>{row.excluded}</td><td>{row.uncovered}</td>
              <td className="reqc-ids">{row.requirements.slice(0, 6).join(", ")}{row.requirements.length > 6 ? ` +${row.requirements.length - 6}` : ""}</td></tr>)}</tbody></table>
        </div>}
      </div>
    </section>
  );
}

function IssueRow({ issue }: { issue: TraceIssue }) {
  return <div className="reqc-row" data-testid="reqc-issue" data-severity={issue.severity}><code>{issue.kind}</code><span className="reqc-text">{issue.message}</span></div>;
}
