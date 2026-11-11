import assert from "node:assert/strict";
import test from "node:test";
import { getEditableDocument, parse, sentenceHash, checkTraceability, assignAnchors, serialize } from "@litzio/core";
import { toTiptapDocument } from "../src/tiptap-projection.ts";
import { collectSupportedEdits } from "../src/tiptap-edits.ts";
import { saveEdits } from "../server/document-replay.ts";
import { executeRequirementsOperation } from "../server/requirements.ts";
import { linksOf, requirementState, selectFromStd, selectFromSys, statusCounts, stdMarks, traceMatrix } from "../src/shell/requirements-view-model.ts";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Synthetic sentences only; no standard text is stored in the repository.
const STANDARD = "---\nlitzio: 1\n---\n\n# 1 Pumps\n\n(std-1-p1)=\n\nThe pump shall start within 2 s. The pump may idle.\n\n(std-1-p2)=\n\nThe valve should close.\n";
const SYSTEM = `---
litzio: 1
---

# 1 Pumps

\`\`\`{requirement} Pump start
:id: REQ-0001
:status: draft
:type: performance
:strength: shall
:source: std.md#std-1-p1~s1@${sentenceHash("The pump shall start within 2 s.")}

The system shall start the pump within 2 s.
\`\`\`
`;

test("a requirement block projects to an editor node and an attribute change replays through Core", () => {
  const document = getEditableDocument(parse(SYSTEM));
  const projected = toTiptapDocument(document);
  const node = projected.content!.find(item => item.type === "requirement")!;
  assert.equal(node.attrs!.id, "REQ-0001");
  assert.deepEqual(node.attrs!.sources, [`std.md#std-1-p1~s1@${sentenceHash("The pump shall start within 2 s.")}`]);
  const next = structuredClone(projected);
  const changed = next.content!.find(item => item.type === "requirement")!;
  Object.assign(changed.attrs!, { status: "approved", title: "Pump start time", body: "The system shall start the pump within 2 s of the start command." });
  const edits = collectSupportedEdits(document, next);
  assert.deepEqual(edits.requirements, [{ path: [2], changes: { title: "Pump start time", status: "approved", body: "The system shall start the pump within 2 s of the start command." } }]);
  const saved = saveEdits(SYSTEM, edits).markdown;
  assert.match(saved, /:id: REQ-0001\n:status: approved/);
  assert.match(saved, /\{requirement\} Pump start time/);
  assert.equal(collectSupportedEdits(document, projected).requirements, undefined, "unchanged blocks produce no edit");
});

test("the persistent ID cannot change through the editor or through replay", () => {
  const document = getEditableDocument(parse(SYSTEM));
  const projected = toTiptapDocument(document);
  const next = structuredClone(projected);
  next.content!.find(item => item.type === "requirement")!.attrs!.id = "REQ-9999";
  assert.throws(() => collectSupportedEdits(document, next), /identity cannot change/);
  assert.throws(() => saveEdits(SYSTEM, { headings: [], paragraphs: [], requirements: [{ path: [2], changes: { id: "REQ-9999" } as never }] }), /not allowed/);
  const badSource = structuredClone(projected);
  badSource.content!.find(item => item.type === "requirement")!.attrs!.sources = ["not a link"];
  assert.throws(() => collectSupportedEdits(document, badSource), /invalid source link/);
});

test("compare view model: selection, counts, marks, states and matrix follow the trace report", () => {
  const standard = getEditableDocument(assignAnchors(parse(STANDARD)));
  const report = checkTraceability(standard, getEditableDocument(parse(SYSTEM)), "std.md");
  const links = linksOf(report);
  assert.deepEqual(statusCounts(report), { requirements: 1, links: 1, uncovered: 2 });
  assert.equal(requirementState(report.requirements[0]), "ok");
  const stdKey = links[0].stdKey!;
  assert.deepEqual(selectFromStd(report, links, stdKey), { std: [stdKey], sys: [links[0].sysKey], sentences: ["std-1-p1~s1", "std-1-p1~s2"], requirements: ["REQ-0001"] });
  assert.deepEqual(selectFromSys(report, links, links[0].sysKey).std, [stdKey]);
  assert.deepEqual(stdMarks(report).get(stdKey), { covered: 1, uncovered: 1, excluded: 0 });
  assert.deepEqual(traceMatrix(report.sentences), [{ clause: "1", sentences: 3, covered: 1, excluded: 0, uncovered: 2, requirements: ["REQ-0001"] }]);
  const stale = checkTraceability(standard, getEditableDocument(parse(SYSTEM.replace(/@[0-9a-f]{12}/, "@000000000000"))), "std.md");
  assert.equal(requirementState(stale.requirements[0]), "error");
});

test("the Host operation reports documents only on request and writes nothing on check", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "litzio-req-"));
  const standard = path.join(dir, "std.md"), system = path.join(dir, "sys.md");
  writeFileSync(standard, serialize(assignAnchors(parse(STANDARD)))); writeFileSync(system, SYSTEM);
  const before = readFileSync(system, "utf8");
  const plain = executeRequirementsOperation("check", { standard, system });
  assert.equal(plain.documents, undefined);
  const withDocuments = executeRequirementsOperation("check", { standard, system, documents: true });
  assert.ok(withDocuments.documents!.system.blocks.some(block => block.block === "requirement"));
  assert.equal(readFileSync(system, "utf8"), before);
  assert.throws(() => executeRequirementsOperation("check", { standard, system: path.join(dir, "missing.md") }));
});
