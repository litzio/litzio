import assert from "node:assert/strict";
import test from "node:test";
import type { SavedBlock, SaveRequest } from "../shared/document-protocol.ts";
import type { DocumentEditorHandle } from "../src/DocumentEditor.tsx";
import { SaveConflictError } from "../src/document-session.ts";
import { appliedDocument, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { createContentEditSession } from "../src/views/screen-document-view-editing.ts";
import { loadEditableDocument, nativeSource } from "./helpers/document.ts";

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
    snapshot: { kind: "native", path: "/docs/view.md", source, document: snapshot, revision: "r0", endnotesInPlace: true },
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
