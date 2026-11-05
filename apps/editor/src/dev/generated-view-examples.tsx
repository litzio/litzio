import { useMemo, useState } from "react";
import { parse, getEditableDocument } from "@litzio/core";
import { queryViewSchema, reviewViewSchema } from "@litzio/core/views-v2";
import { ViewRenderer } from "../views/Views.tsx";
import { QueryInputs, type InputSchema } from "../views/QueryInputs.tsx";
import { sourceFailure, ViewOperationError, inputIssueMessage } from "../views/source-state.ts";
import { ReviewRenderer, type ReviewAdapter, type ReviewSnapshot } from "../review/ReviewRenderer.tsx";
import { ChoiceGroup } from "../components/ui/choice-group.tsx";
import { Button } from "../components/ui/button.tsx";
import { Notice, FieldError } from "../ui/primitives.tsx";

const columns = ["key", "summary", "status", "assignee", "updated", "priority", "project", "type", "reporter", "created", "labels", "count"];
const query = queryViewSchema.parse({ kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "query", title: "Issue search", refresh: "manual",
  sources: { stats: { operation: "fixture.issues", version: 1, args: {} } },
  form: { component: "InputForm", source: "stats", fields: [{ component: "Select", field: "preset" }, { component: "TextInput", field: "text" }, { component: "DateInput", field: "date" }, { component: "Checkbox", field: "enabled" }], submit: { component: "SubmitButton", label: "Search" } },
  layout: { component: "VerticalPanel", children: [{ component: "Table", title: "Five columns", source: "stats", data: "/rows", columns: columns.slice(0, 5) }, { component: "Table", title: "Twelve columns", source: "stats", data: "/rows", columns }, { component: "BarChart", title: "Issue count", source: "stats", data: "/rows", x: "key", y: "count" }] } });
const schema: InputSchema = { properties: { preset: { type: "string", title: "Preset", enum: ["Assigned", "Reported", "All"] }, text: { type: "string", title: "Search text" }, date: { type: "string", format: "date", title: "Updated after" }, enabled: { type: "boolean", title: "Enabled" } } };
const rows = [1, 2, 3].map(n => Object.fromEntries(columns.map(c => [c, c === "count" ? n * 3 : c === "key" ? `ISSUE-${n}` : c === "summary" ? `Example issue ${n}: a readable summary` : c === "status" ? "Open" : c === "updated" ? "2026-11-06" : `${c} example`])));
const review = reviewViewSchema.parse({ kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "review", title: "Review changes", refresh: "manual", sources: { review: { plugin: "fixture.review", review: "sample", bundleRef: "bundle" } }, layout: { component: "VerticalPanel", children: ["PageSurface", "SourceDocumentCompare", "ReviewList", "ReviewDetail"].map(component => ({ component, title: component, source: "review" })) } });
const queryStates = ["success", "idle", "loading", "loading-previous", "empty", "auth", "forbidden", "not_found", "unavailable", "timeout", "new-view", "inputIssues", "common-input"];
const reviewStates = ["pending", "applied", "stale", "unavailable", "refreshing", "uncertain", "unverifiable", "no-undo", "no-pages"];

function reviewAdapter(mode: string): ReviewAdapter {
  let state: "pending" | "approved" | "rejected" = mode === "applied" || mode === "no-undo" ? "approved" : "pending";
  let reads = 0;
  return {
    pending: mode === "uncertain" || mode === "unverifiable" ? { requestId: "gallery-request", verification: mode === "unverifiable" ? "unavailable" : undefined } : undefined,
    async read(pageNo) {
      if (mode === "unavailable") throw new Error("Fixture unavailable");
      if (mode === "refreshing" && reads++ > 0) return new Promise(() => {});
      const document = getEditableDocument(parse(`---\nlitzio: 1\n---\n# Example document\n\n${state === "approved" ? "Corrected sentence." : "Original sentence."}\n`));
      const target = { path: [...document.blocks[1].path], documentRevision: "r1", documentHash: "h1" };
      const baseline = { documentRevision: "r1", proposalRevision: "p1", sourceRevision: "s1", mappingRevision: "m1" };
      const snapshot: ReviewSnapshot = { document, documentPath: "/gallery.md", documentRevision: mode === "stale" ? "old" : "r1", documentHash: "h1", baseline, pageCount: mode === "no-pages" ? 0 : 2,
        bundle: { bundleRef: "bundle", generation: "g1", documentRef: "doc", documentRevision: "r1", documentHash: "h1", sourceRevision: "s1", mappingRevision: "m1" },
        page: mode === "no-pages" ? undefined : { pageNo, generation: "g1", sourceRevision: "s1", width: 600, height: 400, origin: "TOPLEFT", unit: "px", imageRef: "image", regions: [{ id: "sentence", bbox: [40, 80, 550, 150], category: "Sentence", status: "supported" }, { id: "header", bbox: [40, 20, 550, 60], category: "Header", status: "excluded" }] },
        mapping: { generation: "g1", documentRevision: "r1", documentHash: "h1", sourceRevision: "s1", mappingRevision: "m1", entries: [{ sourceIds: ["sentence"], targets: [target] }] },
        proposals: [{ id: "change", kind: "text.replace", targets: [target], evidence: ["Compared with source."], before: { type: "plain", text: "Original sentence." }, after: { type: "plain", text: "Corrected sentence." }, baseline, state, actions: [{ action: "approve", allowed: state === "pending" }, { action: "reject", allowed: state === "pending" }, { action: "undo", allowed: state === "approved" && mode !== "no-undo", reason: "Undo unavailable for this change." }] }] };
      return snapshot;
    },
    async act(action) { state = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending"; },
    openDocument() {},
  };
}

export function GeneratedViewExamples({ state }: { state: string }) {
  const [profile, setProfile] = useState("query"), [queryState, setQueryState] = useState("success"), [reviewState, setReviewState] = useState("pending");
  const [args, setArgs] = useState<Record<string, unknown>>({});
  const mode = state === "error" ? "auth" : state === "disabled" ? "new-view" : queryState;
  const adapter = useMemo(() => reviewAdapter(reviewState), [reviewState]);
  const view = { ...query, sources: { stats: { ...query.sources.stats, args } } };
  const loading = mode.startsWith("loading");
  const failure = ["auth", "forbidden", "not_found", "unavailable", "timeout", "new-view"].includes(mode) ? sourceFailure(new ViewOperationError(mode, false, mode === "new-view" ? "unavailable" : undefined)) : undefined;
  return <section className="ui-gallery-section" aria-label="Generated views examples"><h2>Generated views</h2>
    <p>Production catalog v2 renderers. Fixtures and actions stay in memory; no Host calls or persistence. For refreshing review, press Refresh data.</p>
    <ChoiceGroup aria-label="View profile" value={profile} onValueChange={setProfile} options={["query", "review"].map(value => ({ value, label: value }))} />
    <div className="ui-gallery-row"><ChoiceGroup aria-label="Generated view state" value={profile === "query" ? mode : reviewState} onValueChange={profile === "query" ? setQueryState : setReviewState} options={(profile === "query" ? queryStates : reviewStates).map(value => ({ value, label: value }))} /></div>
    {profile === "query" ? <div className="views-page">
      <form className="view-query-form" onSubmit={event => { event.preventDefault(); setQueryState("success"); }}><QueryInputs view={view} schema={schema} errors={mode === "inputIssues" ? { text: inputIssueMessage("required") } : {}} change={(field, value, remove) => setArgs(previous => { const next = { ...previous }; if (remove) delete next[field]; else next[field] = value; return next; })} /><Button type="submit" disabled={loading || mode === "new-view"}>Search</Button></form>
      <FieldError id="gallery-query-common-error">{mode === "common-input" ? inputIssueMessage("additionalProperties") : undefined}</FieldError>
      {loading ? <Notice>Loading data…</Notice> : mode === "idle" ? <Notice>Data has not been queried. Refresh manually.</Notice> : mode === "empty" ? <Notice>No matching rows.</Notice> : null}
      {mode === "loading-previous" ? <Notice tone="warning">Previous query result · 09:00</Notice> : null}
      {failure ? <Notice tone="error">{failure.message}</Notice> : null}
      <div aria-busy={loading}><ViewRenderer view={view} rows={["idle", "loading", "empty", "new-view"].includes(mode) ? undefined : rows} /></div>
    </div> : <ReviewRenderer key={reviewState} view={review} adapter={adapter} />}
  </section>;
}

