import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assignAnchors, checkTraceability, draftSystemDocument, exportReqif, extractCandidates, getEditableDocument, insertRequirement, nextRequirementId,
  normativeStrength, parse, parseSource, formatSource, sentenceHash, serialize, splitSentences, standardUnits, updateRequirement,
  type RequirementContent,
} from "../src/index.ts";

// Synthetic sentences only: no standard text is used as a fixture.
const STANDARD = `---
litzio: 1
title: Synthetic standard
---

# 1 Alpha

## 1.1 Pumps

(std-1-1-p1)=

The pump shall start within 2 s. The pump should log a start event. The pump may run dry for 5 s, e.g. during priming.

This paragraph is informative and has no requirement.

## 1.2 Valves

The valve shall close when pressure exceeds the limit. Note a: the valve may be manual.

(std-1-2-p2)=

The valve shall not leak.
`;
const SYSTEM = (extra = "") => `---
litzio: 1
title: Synthetic system
---

# 1 Pumps

\`\`\`{requirement} Pump start time
:id: REQ-0001
:status: draft
:type: performance
:strength: shall
:source: std.md#std-1-1-p1~s1@${sentenceHash("The pump shall start within 2 s.")}

The system shall start the pump within 2 s.
\`\`\`
${extra ? `\n${extra}` : ""}`;
const std = () => getEditableDocument(parse(STANDARD));
const sys = (extra?: string) => getEditableDocument(parse(SYSTEM(extra)));
const content = (id: string, over: Partial<RequirementContent> = {}): RequirementContent => ({ id, title: "T", status: "draft", type: "functional", strength: "shall", sources: [], parents: [], body: "Body.", ...over });

test("a requirement block round-trips canonically and appears as an editable block", () => {
  const document = parse(SYSTEM());
  assert.equal(serialize(document), SYSTEM());
  const block = getEditableDocument(document).blocks.find(item => item.block === "requirement");
  assert.ok(block && block.block === "requirement");
  assert.equal(block.id, "REQ-0001");
  assert.deepEqual(block.sources[0], { document: "std.md", anchor: "std-1-1-p1", sentence: 1, hash: sentenceHash("The pump shall start within 2 s.") });
  assert.equal(block.body, "The system shall start the pump within 2 s.");
});

test("an invalid requirement block is refused at native admission", () => {
  const missingId = SYSTEM().replace(":id: REQ-0001\n", "");
  assert.throws(() => parse(missingId), /needs :id:/);
  assert.throws(() => parse(SYSTEM().replace(":status: draft", ":status: wip")), /unsupported requirement status/);
  assert.throws(() => parse(SYSTEM().replace(":type: performance", ":color: red\n:type: performance")), /unsupported requirement option/);
  assert.throws(() => parse(SYSTEM().replace(/:source: .*\n/, ":source: broken-link\n")), /invalid source link/);
});

test("requirement operations keep the persistent ID and refuse duplicates", () => {
  let document = parse(SYSTEM());
  const end = document as unknown as { children: unknown[] };
  document = insertRequirement(document, end.children.length, content("REQ-0002", { sources: [{ document: "std.md", anchor: "std-1-1-p1", sentence: 2, hash: sentenceHash("The pump should log a start event.") }] }));
  assert.equal(getEditableDocument(document).blocks.filter(block => block.block === "requirement").length, 2);
  assert.throws(() => insertRequirement(document, 1, content("REQ-0002")), /already exists/);
  const path = getEditableDocument(document).blocks.find(block => block.block === "requirement" && block.id === "REQ-0002")!.path;
  const updated = updateRequirement(document, path, { status: "approved", title: "Renamed", body: "Changed body." });
  const block = getEditableDocument(updated).blocks.find(item => item.block === "requirement" && item.id === "REQ-0002")!;
  assert.ok(block.block === "requirement" && block.status === "approved" && block.title === "Renamed" && block.body === "Changed body.");
  assert.throws(() => updateRequirement(document, path, { id: "REQ-9999" }), /persistent/);
  assert.equal(nextRequirementId(getEditableDocument(updated), "REQ-"), "REQ-0003");
});

test("sentences, strengths and hashes", () => {
  assert.deepEqual(splitSentences("It shall work, e.g. for pumps. The valve may leak."), ["It shall work, e.g. for pumps.", "The valve may leak."]);
  assert.equal(normativeStrength("It shall not leak."), "shall");
  assert.equal(normativeStrength("It should leak."), "should");
  assert.equal(normativeStrength("Valid since May 2018."), undefined);
  assert.equal(normativeStrength("Note a: it may leak."), undefined);
  assert.equal(sentenceHash("The  pump\nshall start."), sentenceHash("The pump shall start."));
  assert.notEqual(sentenceHash("The pump shall start."), sentenceHash("The pump shall stop."));
  assert.deepEqual(parseSource(formatSource({ document: "a.md", anchor: "x-1", sentence: 3, hash: "0123456789ab" })), { document: "a.md", anchor: "x-1", sentence: 3, hash: "0123456789ab" });
});

test("assignAnchors labels only unlabelled normative paragraphs and is idempotent", () => {
  const anchored = assignAnchors(parse(STANDARD));
  const units = standardUnits(getEditableDocument(anchored));
  const labelled = units.filter(unit => unit.anchor);
  assert.deepEqual(labelled.map(unit => unit.anchor), ["std-1-1-p1", "std-1-2-p1", "std-1-2-p2"]);
  assert.equal(units.find(unit => unit.sentences.every(sentence => !sentence.strength))?.anchor, undefined);
  assert.equal(serialize(assignAnchors(anchored)), serialize(anchored));
});

test("traceability check reports covered, uncovered, orphan, broken, changed, moved and duplicate IDs", () => {
  const anchored = getEditableDocument(assignAnchors(parse(STANDARD)));
  const clean = checkTraceability(anchored, sys(), "std.md");
  assert.equal(clean.counts.covered, 1);
  assert.equal(clean.counts.uncovered, clean.counts.sentences - 1);
  assert.ok(clean.issues.some(issue => issue.kind === "uncovered"));
  assert.ok(clean.ok);

  const bad = (source: string, extra = "") => checkTraceability(anchored, sys(`\`\`\`{requirement} Extra\n:id: REQ-0002\n:status: draft\n:type: functional\n:strength: shall\n${source}\n\nBody.\n\`\`\`\n${extra}`), "std.md");
  assert.ok(bad("").issues.some(issue => issue.kind === "orphan" && issue.id === "REQ-0002"));
  assert.ok(bad(":source: std.md#nowhere~s1@abcdef012345").issues.some(issue => issue.kind === "broken-link"));
  assert.ok(bad(":source: other.md#std-1-1-p1~s1@abcdef012345").issues.some(issue => issue.kind === "broken-link"));
  assert.ok(bad(":source: std.md#std-1-1-p1~s1@abcdef012345").issues.some(issue => issue.kind === "source-changed" && issue.id === "REQ-0002"));
  const moved = bad(`:source: std.md#std-1-1-p1~s3@${sentenceHash("The pump should log a start event.")}`);
  assert.ok(moved.issues.some(issue => issue.kind === "source-moved"));
  assert.ok(moved.requirements.find(item => item.id === "REQ-0002")!.sources[0].sentence === 2);
  assert.ok(bad("", "\n```{requirement} Dup\n:id: REQ-0001\n:status: draft\n:type: functional\n:strength: shall\n\nBody.\n```\n").issues.some(issue => issue.kind === "duplicate-id"));
  assert.ok(!bad("").ok);
});

test("a changed standard sentence invalidates its link and exclusions are tied to the hash", () => {
  const anchored = assignAnchors(parse(STANDARD));
  const edited = getEditableDocument(parse(serialize(anchored).replace("start within 2 s", "start within 3 s")));
  assert.ok(checkTraceability(edited, sys(), "std.md").issues.some(issue => issue.kind === "source-changed"));
  const original = getEditableDocument(anchored);
  const report = checkTraceability(original, sys(), "std.md");
  const target = report.sentences.find(sentence => sentence.state === "uncovered")!;
  const excluded = checkTraceability(original, sys(), "std.md", [{ anchor: target.anchor, sentence: target.sentence, hash: target.hash }]);
  assert.equal(excluded.counts.excluded, 1);
  const stale = checkTraceability(original, sys(), "std.md", [{ anchor: target.anchor, sentence: target.sentence, hash: "000000000000" }]);
  assert.equal(stale.counts.excluded, 0);
});

test("extraction drafts a valid system document whose requirements link back to every candidate", () => {
  const anchored = getEditableDocument(assignAnchors(parse(STANDARD)));
  const empty = checkTraceability(anchored, { blocks: [] }, "std.md");
  const candidates = extractCandidates(anchored, empty);
  assert.equal(candidates.length, empty.counts.sentences);
  const source = draftSystemDocument(anchored, { title: "Draft", standardName: "std.md", idPrefix: "REQ-", intro: [{ heading: "1 Purpose" }, { paragraph: "Why." }] });
  const system = getEditableDocument(parse(source));
  const report = checkTraceability(anchored, system, "std.md");
  assert.equal(report.counts.requirements, candidates.length);
  assert.equal(report.counts.uncovered, 0);
  assert.ok(report.ok, JSON.stringify(report.issues));
  const first = system.blocks.find(block => block.block === "requirement");
  assert.ok(first?.block === "requirement" && first.body.startsWith("The pump shall"));
  assert.deepEqual(candidates.map(candidate => candidate.clause), ["1.1", "1.1", "1.1", "1.2", "1.2"]);
});

test("ReqIF export maps sections, requirements and trace relations and validates against the official XSD", (t) => {
  const anchored = getEditableDocument(assignAnchors(parse(STANDARD)));
  const system = getEditableDocument(parse(draftSystemDocument(anchored, { title: "Draft <&>", standardName: "std.md", idPrefix: "REQ-", intro: [{ heading: "1 Purpose" }, { paragraph: "Why & how." }] })));
  const xml = exportReqif(system, { creationTime: "2026-11-11T00:00:00+09:00" });
  assert.match(xml, /<REQ-IF-VERSION>1\.0<\/REQ-IF-VERSION>/);
  assert.equal((xml.match(/<SPEC-OBJECT IDENTIFIER="O-REQ-/g) ?? []).length, 5);
  assert.equal((xml.match(/<SPEC-RELATION /g) ?? []).length, 5);
  assert.match(xml, /LONG-NAME="ReqIF.ForeignID"/);
  assert.match(xml, /Draft &lt;&amp;&gt;/);
  const xsdDir = process.env.LITZIO_REQIF_XSD_DIR ?? "/workspace/spike-req/xsd";
  const script = new URL("../../../scripts/validate-reqif.py", import.meta.url).pathname;
  const probe = spawnSync("python3", ["-c", "import lxml"]);
  if (!existsSync(`${xsdDir}/reqif.local.xsd`) || probe.status !== 0) { t.diagnostic("official ReqIF XSD or python3+lxml unavailable: schema validation skipped"); return; }
  const file = join(mkdtempSync(join(tmpdir(), "reqif-")), "out.reqif");
  writeFileSync(file, xml);
  const result = spawnSync("python3", [script, file, xsdDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
