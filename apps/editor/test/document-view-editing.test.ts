import assert from "node:assert/strict";
import test from "node:test";
import type { SavedBlock, SaveRequest } from "../shared/document-protocol.ts";
import type { DocumentEditorHandle } from "../src/DocumentEditor.tsx";
import { SaveConflictError } from "../src/document-session.ts";
import { appliedDocument, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { createContentEditSession } from "../src/views/screen-document-view-editing.ts";
import { loadEditableDocument, nativeSource } from "./helpers/document.ts";
import { getSchema } from "@tiptap/core";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { history, undoDepth } from "@tiptap/pm/history";
import { declaredDeletions, editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { holdInput, isInputHeld, ReadOnlyBoundary } from "../src/read-only-boundary.ts";
import { isDocumentViewChange, rebaseTopLevel, replaceTopLevel } from "../src/document-view-change.ts";
import { collectSupportedEdits } from "../src/tiptap-document.ts";
import { structuralEditKinds } from "../src/editor-save.ts";
import { convertBlock, documentViewChange, mergeParagraphWithPrevious, parse } from "@litzio/plugin-sdk";
import { toTiptapBlock } from "../src/tiptap-document.ts";

// The view's Save sequencing (#1976): one Save at a time, revisions continued by its own Saves,
// conflict and failure handling. The editor is a stand-in with the handle's Save contract;
// browser scenario document-view-editing covers the live editor and the HTTP Host.
const source = nativeSource("# Title\n\nFirst paragraph.\n\nSecond paragraph.\n");
const snapshot = loadEditableDocument(source);

function fixture() {
  const opening = toTiptapDocument(snapshot);
  let current = structuredClone(opening), saved = structuredClone(opening), pending: TiptapJSON | null = null;
  let composing = false;
  const editor: DocumentEditorHandle = {
    beginSave() { pending = structuredClone(current); return pending; },
    finishSave(succeeded = false) { if (succeeded && pending) saved = pending; pending = null; },
    showSaveErrors() {},
    hasDocumentChanges: () => JSON.stringify(appliedDocument(current)) !== JSON.stringify(appliedDocument(saved)),
    isComposing: () => composing,
  } as unknown as DocumentEditorHandle;
  const type = (text: string) => { (current.content![1]!.content![0] as { text: string }).text += text; };
  const requests: { body: SaveRequest; resolve(revision: string, blocks?: SavedBlock[]): void; reject(error: Error): void }[] = [];
  const saves: { previousRevision: string; revision: string; blocks?: SavedBlock[] }[] = [];
  let changes = 0;
  const session = createContentEditSession({
    snapshot: { kind: "native", path: "/docs/view.md", source, document: snapshot, revision: "r0", endnotesInPlace: true, normalizationPending: false },
    editor: () => editor,
    requestSave: body => new Promise((resolve, reject) => requests.push({ body, resolve: (revision, blocks) => resolve({ revision, ...(blocks ? { blocks } : {}) }), reject })),
    onChange: () => { changes++; },
    onSave: save => saves.push(save),
  });
  return { session, type, requests, saves, setComposing(value: boolean) { composing = value; }, changes: () => changes };
}

const settle = () => new Promise(resolve => setTimeout(resolve));

test("content Saves run one at a time and continue revisions the view accepts", async () => {
  const { session, type, requests, saves } = fixture();
  assert.equal(await session.flush(), true, "nothing to save");
  assert.equal(requests.length, 0);
  type(" One");
  session.dirty(true);
  assert.equal(session.state, "unsaved");
  const first = session.flush();
  type(" Two");
  const second = session.flush();
  const third = session.flush();
  await settle();
  assert.equal(session.state, "saving");
  assert.equal(requests.length, 1, "a second Save waits for the first");
  assert.equal(requests[0]!.body.revision, "r0");
  assert.equal(requests[0]!.body.describe, true, "the view asks the Host to describe each Save");
  assert.equal(requests[0]!.body.paragraphs?.[0]?.content[0]?.kind === "text" && requests[0]!.body.paragraphs[0].content[0].text, "First paragraph. One");
  // The Host's description reaches the screen code unchanged.
  const described = [{ path: [2], nodes: [{ path: [2], type: "paragraph", text: "First paragraph. One" }] }] as unknown as SavedBlock[];
  requests[0]!.resolve("r1", described);
  assert.equal(await first, true);
  await settle();
  assert.equal(requests.length, 2, "queued triggers share one later Save");
  assert.equal(requests[1]!.body.revision, "r1");
  // The second Save replays the first one's edits over the opening source.
  assert.deepEqual(requests[1]!.body.base, { source, savedEdits: requestsWithoutTarget(requests[0]!.body) });
  requests[1]!.resolve("r2");
  assert.equal(await second, true);
  assert.equal(await third, true);
  assert.deepEqual(saves, [{ previousRevision: "r0", revision: "r1", blocks: described }, { previousRevision: "r1", revision: "r2" }]);
  assert.equal(session.state, "clean");
  assert.equal(session.revision, "r2");
  for (const revision of ["r0", "r1", "r2"]) assert.equal(session.accepts(revision), true, revision);
  assert.equal(session.accepts("elsewhere"), false);
});

function requestsWithoutTarget(body: SaveRequest) {
  const { path: _path, revision: _revision, base: _base, describe: _describe, ...edits } = body;
  return edits;
}

test("a conflict keeps the edits and stops saving; a failure retries only on request or a new edit", async () => {
  const conflict = fixture();
  conflict.type(" Mine");
  conflict.session.dirty(true);
  const attempt = conflict.session.flush();
  await settle();
  conflict.requests[0]!.reject(new SaveConflictError("Document changed outside the editor."));
  assert.equal(await attempt, false);
  assert.equal(conflict.session.state, "conflict");
  assert.equal(conflict.session.pending(), true, "the edits stay unsaved");
  conflict.type(" More");
  conflict.session.edited();
  assert.equal(await conflict.session.flush(true), false);
  assert.equal(conflict.requests.length, 1, "no Save is sent against a changed file");
  assert.equal(conflict.session.accepts("r0"), true);

  const failure = fixture();
  failure.type(" Mine");
  failure.session.dirty(true);
  const failed = failure.session.flush();
  await settle();
  failure.requests[0]!.reject(new Error("Host unavailable"));
  assert.equal(await failed, false);
  assert.equal(failure.session.state, "failed");
  assert.match(failure.session.error!.message, /Host unavailable/);
  assert.equal(await failure.session.flush(), false, "leaving another block does not resend the same failure");
  assert.equal(failure.requests.length, 1);
  failure.session.edited();
  const retried = failure.session.flush();
  await settle();
  assert.equal(failure.requests.length, 2, "a further edit retries");
  failure.requests[1]!.resolve("r1");
  assert.equal(await retried, true);
  assert.equal(failure.session.state, "clean");
  assert.equal(failure.session.error, undefined);
});

test("a Save during composition waits for the composition to end", async () => {
  const { session, type, requests, setComposing } = fixture();
  type(" 한");
  session.dirty(true);
  setComposing(true);
  assert.equal(await session.flush(), false);
  assert.equal(requests.length, 0);
  type("글");
  setComposing(false);
  session.compositionEnded();
  await settle();
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.body.paragraphs?.[0]?.content[0]?.kind === "text" && requests[0]!.body.paragraphs[0].content[0].text, "First paragraph. 한글");
  requests[0]!.resolve("r1");
});

// A change shown before its write (#1995) passes the structure lock and the read-only boundary
// only as the transaction document-view-change.ts built; the same steps from anywhere else are refused.
const changeSource = nativeSource("# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n");
function lockedState(source = changeSource) {
  const opening = loadEditableDocument(source);
  const baseline = toTiptapDocument(opening);
  const schema = getSchema(editorExtensions());
  const rejected: unknown[] = [];
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [history(), structureGuardPlugin(baseline, reason => rejected.push(reason ?? "refused"), [], true)] });
  return { opening, state, rejected };
}
const attrs = { title: null, status: null, headingNumbering: null, referenceTemplates: null };
const merged = { type: "heading", attrs: { sourcePath: "new:merged", level: 2 }, content: [{ type: "text", text: "First and second" }] };

test("only a document view change replaces locked blocks, outside history", () => {
  const { state, rejected } = lockedState();
  const change = replaceTopLevel(state, 1, 2, [merged], attrs);
  assert.equal(isDocumentViewChange(change.tr), true);
  const shown = state.apply(change.tr);
  assert.deepEqual(shown.doc.content.content.map(node => node.textContent), ["Title", "First and second", "Third paragraph."]);
  assert.deepEqual(change.replaced.map(node => node.content?.[0]?.text), ["First paragraph.", "Second paragraph."]);
  assert.equal(undoDepth(shown), 0, "the change is not an undo step");
  // The same steps built anywhere else, or carrying any copy of its metas, stay refused.
  for (const forge of [
    (tr: Transaction) => tr,
    (tr: Transaction) => { for (const name of ["documentViewChange", "documentViewChange$"]) tr.setMeta(name, true); return tr; },
    (tr: Transaction) => { for (const [name, value] of Object.entries((change.tr as unknown as { meta: Record<string, unknown> }).meta)) tr.setMeta(name, value); return tr; },
  ]) {
    const start = state.doc.child(0).nodeSize, end = start + state.doc.child(1).nodeSize + state.doc.child(2).nodeSize;
    const tr = forge(state.tr.replaceWith(start, end, state.schema.nodeFromJSON(merged)));
    assert.equal(isDocumentViewChange(tr), false);
    assert.equal(state.applyTransaction(tr).state.doc.eq(state.doc), true, "refused");
  }
  assert.equal(rejected.length, 3);
  // Read-only views refuse document changes except a document view change; so does held input.
  const [hold, boundary] = ReadOnlyBoundary.config.addProseMirrorPlugins!.call({ editor: { isEditable: false } } as never);
  const filter = boundary!.spec.filterTransaction!;
  assert.equal(filter(change.tr, state), true);
  assert.equal(filter(state.tr.insertText("x", 2), state), false);
  const held = EditorState.create({ schema: state.schema, doc: state.doc, plugins: [hold!] });
  const holding = held.apply(holdInput(held.tr, true));
  assert.equal(isInputHeld(holding), true);
  assert.equal(holding.applyTransaction(holding.tr.insertText("x", 2)).state.doc.eq(holding.doc), true, "held input changes nothing");
  assert.equal(holding.applyTransaction(replaceTopLevel(holding, 1, 2, [merged], attrs).tr).state.doc.childCount, 3);
  assert.equal(holding.apply(holdInput(holding.tr, false)).applyTransaction(holding.tr.insertText("x", 2)).state.doc.eq(holding.doc), false);
  // Putting back what it replaced restores the opening blocks.
  const back = replaceTopLevel(shown, 1, 1, change.replaced, change.attrs);
  assert.equal(shown.apply(back.tr).doc.eq(state.doc), true);
});

test("the written file becomes the opening snapshot of later content edits", () => {
  const { state, rejected } = lockedState();
  const shown = state.apply(replaceTopLevel(state, 1, 2, [merged], attrs).tr);
  // The official write produced this file; its read model rebases the editor without replacing the shown block.
  const written = loadEditableDocument(nativeSource("# Title\n\n## First and second\n\nThird paragraph.\n"));
  const rebase = rebaseTopLevel(shown, toTiptapDocument(written));
  assert.equal(rebase.replaced, 0, "blocks already showing the written content are kept");
  const rebased = shown.apply(rebase.tr);
  assert.deepEqual(rebased.doc.content.content.map(node => node.attrs.sourcePath), written.blocks.map(block => block.path.join(",")));
  assert.deepEqual(declaredDeletions(rebased), []);
  // A content edit after the rebase is collected against the written file's paths.
  const third = rebased.doc.child(0).nodeSize + rebased.doc.child(1).nodeSize;
  const edited = rebased.apply(rebased.tr.insertText(" Edited", third + 1 + "Third paragraph.".length));
  assert.equal(rejected.length, 0);
  const edits = collectSupportedEdits(written, editorDocumentJSON(edited));
  assert.deepEqual(edits.paragraphs?.map(edit => edit.path), [written.blocks[2]!.path]);
  assert.deepEqual(structuralEditKinds(edits), []);
  // Structure stays locked after the rebase.
  const split = edited.applyTransaction(edited.tr.split(third + 3));
  assert.equal(split.state.doc.eq(edited.doc), true);
  assert.equal(rejected.length, 1);
});

test("a change from documentViewChange keeps unchanged document fields, so the view redraws only the changed blocks", () => {
  const { opening, state } = lockedState();
  const before = parse(changeSource);
  const change = documentViewChange(before, convertBlock(mergeParagraphWithPrevious(before, [3]), [2], { block: "heading", level: 2 }));
  assert.deepEqual([change.from, change.removed, change.blocks.length], [1, 2, 1]);
  assert.equal(opening.blocks.length, 4);
  const { tr } = replaceTopLevel(state, change.from, change.removed, change.blocks.map(toTiptapBlock), {
    title: change.document.title, status: change.document.status ?? null,
    headingNumbering: change.document.headingNumbering, referenceTemplates: change.document.referenceTemplates ?? null });
  assert.deepEqual(tr.steps.map(step => step.constructor.name), ["ReplaceStep"], JSON.stringify(tr.steps.map(step => step.toJSON())));
});

test("putting back a change that removed every block restores the document exactly", () => {
  // Removing the last block leaves the empty paragraph the schema requires; putting the change
  // back replaces that paragraph too, so no block the document never had remains to type into.
  const { state } = lockedState(nativeSource("Only paragraph.\n"));
  const change = replaceTopLevel(state, 0, 1, [], attrs);
  const shown = state.apply(change.tr);
  assert.equal(shown.doc.childCount, 1);
  assert.equal(shown.doc.child(0).textContent, "");
  assert.equal(change.inserted, 1);
  const back = shown.apply(replaceTopLevel(shown, 0, change.inserted, change.replaced, change.attrs).tr);
  assert.equal(back.doc.eq(state.doc), true);
  // An ordinary change counts the blocks it put in place.
  assert.equal(replaceTopLevel(state, 0, 1, [merged, merged], attrs).inserted, 2);
});
