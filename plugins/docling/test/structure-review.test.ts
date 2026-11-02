import assert from "node:assert/strict";
import fs, { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { AiTaskRecord, AiTaskRequest, AiTaskService, JsonValue } from "@litzio/plugin-api/ai";
import type { PluginHostContext } from "@litzio/plugin-api/host";
import { getEditableDocument, parse } from "@litzio/core";
import { activate } from "../src/host.ts";
import { convertDoclingFile } from "../src/conversion/files.ts";
import { addDoclingCorrection } from "../src/conversion/correction-files.ts";
import { checkDoclingCorrection, emptyCorrections } from "../src/conversion/corrections.ts";
import { REVIEW_FILE, type StructureReviewer } from "../src/structure-review.ts";
import { structureReviewSource, structureReviewSuggestions } from "./structure-review-fixture.ts";

type View = ReturnType<StructureReviewer["list"]>;
class FakeService implements AiTaskService {
  requests: AiTaskRequest[] = [];
  materials: Record<string, string>[] = [];
  records = new Map<string, AiTaskRecord>();
  status = async () => ({ adapter: "Fake", available: true, loginRequired: false });
  async start(request: AiTaskRequest) {
    assert.equal(this.records.has(request.id), false, "consumer must observe duplicate UUIDs without starting again");
    this.requests.push(structuredClone(request));
    this.materials.push(Object.fromEntries(request.materials.map(m => [m.name, readFileSync(m.path, "utf8")])));
    const record: AiTaskRecord = { status: "running", canCancel: true, job: { kind: "ai-task", id: request.id, caller: request.caller, task: request.task,
      baseline: request.baseline, startedAt: Date.now(), state: "running" } };
    this.records.set(request.id, record); return record;
  }
  current = (id: string) => this.records.get(id) ?? null;
  async cancel(id: string) { const record = this.records.get(id)!; record.status = "cancelled"; record.job.state = "cancelled"; record.job.failure = "cancelled"; record.canCancel = false; return record; }
  complete(result: unknown = { proposals: structureReviewSuggestions }) {
    const record = this.records.get(this.requests.at(-1)!.id)!;
    record.status = "success"; record.canCancel = false; record.job.state = "success"; record.job.result = structuredClone(result) as JsonValue;
  }
}
function setup(t: test.TestContext, original = structureReviewSource()) {
  const root = mkdtempSync(path.join(tmpdir(), "docling-review-")), input = path.join(root, "source.json"), folder = path.join(root, "result");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(input, original); convertDoclingFile(input, folder);
  const service = new FakeService(); let enabled = true, feature = true, reviewFeature = true, owner = randomUUID();
  const context = {
    session: new Map(), settingsFile: path.join(root, "settings.json"), features: () => ({ conversion: feature, review: reviewFeature }),
    aiTasks: () => enabled ? service : undefined,
    requestOwner: () => owner, isRequestOwnerAlive: (id: string) => id === owner,
    resolvePath: (file: string) => {
      const relative = path.relative(root, file);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Outside Root");
      return file;
    },
  } as unknown as PluginHostContext;
  let plugin = activate(context);
  const call = <T = View>(operation: string, args = {}): T => plugin.operations[`review-${operation}`]({ folder, ...args });
  const start = (id: string = randomUUID()) => call<Promise<View>>("start", { id });
  const readReview = () => JSON.parse(readFileSync(path.join(folder, REVIEW_FILE), "utf8"));
  const ledger = () => JSON.parse(readFileSync(path.join(folder, "corrections.json"), "utf8"));
  const markdown = () => readFileSync(path.join(folder, "document.md"), "utf8");
  const blocks = () => getEditableDocument(parse(markdown())).blocks;
  return { root, folder, input, original, service, context, call, start, readReview, ledger, markdown, blocks,
    enable: (value: boolean) => { enabled = value; }, feature: (value: boolean) => { feature = value; }, reviewFeature: (value: boolean) => { reviewFeature = value; },
    reactivate: (restart = false) => { if (restart) { context.session.clear(); owner = randomUUID(); } plugin = activate(context); },
  };
}
function files(folder: string) {
  return readdirSync(folder, { recursive: true, withFileTypes: true }).filter(x => x.isFile()).map(x =>
    [path.relative(folder, path.join(x.parentPath, x.name)), readFileSync(path.join(x.parentPath, x.name)).toString("hex")]).sort();
}

async function failPublishedCleanup(t: test.TestContext, folder: string, operation: () => unknown, count = 1) {
  const remove = fs.rmSync, retained: string[] = [];
  const fault = t.mock.method(fs, "rmSync", ((file, options) => {
    if (String(file).startsWith(path.join(path.dirname(folder), `.${path.basename(folder)}.previous-`)) && retained.length < count) {
      retained.push(String(file)); throw Object.assign(new Error("Injected review backup EACCES"), { code: "EACCES" });
    }
    return remove(file, options);
  }) as typeof remove);
  syncBuiltinESMExports();
  let problem: unknown;
  try { await assert.rejects(async () => { await operation(); }, error => { problem = error; return /published; cleanup failed.*Injected review backup EACCES/su.test(String(error)); }); }
  finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(retained.length, count);
  assert.ok(retained.every(file => existsSync(file)), "diagnostics retain the complete previous generation");
  assert.equal(existsSync(path.join(path.dirname(folder), `.${path.basename(folder)}.corrections.lock`)), false);
  return problem;
}

test("initial published cleanup failure reports the warning but admits review instead of stranding running work", async t => {
  const f = setup(t), id = randomUUID();
  await failPublishedCleanup(t, f.folder, () => f.start(id));
  assert.equal(f.service.requests.length, 1, "successful publication must continue AI admission despite backup cleanup failure");
  const running = f.call("status");
  assert.equal(running.task!.status, "running"); assert.equal(running.canCancel, true);
  assert.ok(f.service.requests[0].materials.every(m => existsSync(m.path)));
  await f.start(id); assert.equal(f.service.requests.length, 1, "observing the warned request must not replay it");
  const cancelled = await f.call<Promise<View>>("cancel");
  assert.equal(cancelled.task!.status, "cancelled");
  assert.ok(f.service.requests[0].materials.every(m => !existsSync(m.path)));
  await f.start(); f.service.complete();
  assert.equal(f.call("status").task!.status, "success", "a new explicit review must remain usable");
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("admission and both published cleanup failures retain all diagnostics and leave a restartable uncertain task", async t => {
  const f = setup(t), id = randomUUID(), admit = f.service.start.bind(f.service), admissionError = new Error("Injected admission failure");
  f.service.start = async () => { throw admissionError; };
  const problem = await failPublishedCleanup(t, f.folder, () => f.start(id), 2);
  assert.ok(problem instanceof AggregateError);
  assert.ok(problem.errors.includes(admissionError));
  assert.equal(problem.errors.filter(error => /published; cleanup failed/u.test(error.message)).length, 2);
  const failed = f.call("status");
  assert.equal(failed.task!.status, "uncertain"); assert.match(failed.task!.error!, /Injected admission failure/u);
  assert.equal(readdirSync(f.folder).some(name => name.startsWith(".structure-review-")), false);
  await f.start(id); assert.equal(f.service.requests.length, 0, "failed admission must not replay");
  f.service.start = admit;
  await f.start(); f.service.complete(); assert.equal(f.call("status").task!.status, "success");
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

for (const status of ["success", "error", "uncertain", "cancelled"] as const) test(`${status} publication cleanup failure leaves terminal review and removes inputs`, async t => {
  const f = setup(t), running = await f.start(), request = f.service.requests[0];
  if (status === "success") f.service.complete();
  else if (status !== "cancelled") {
    const receipt = f.service.current(running.task!.id)!;
    receipt.status = status; receipt.job.failure = status === "error" ? "provider" : "uncertain";
    receipt.job.error = `Injected ${status}`; receipt.canCancel = false;
  }
  await failPublishedCleanup(t, f.folder, () => f.call(status === "cancelled" ? "cancel" : "status"));
  f.reactivate();
  const done = f.call("status"); assert.equal(done.task!.status, status); assert.equal(done.canCancel, false);
  assert.ok(request.materials.every(m => !existsSync(m.path)));
  const proposals = structuredClone(done.proposals);
  await f.start(running.task!.id); assert.equal(f.service.requests.length, 1);
  assert.deepEqual(f.call("proposals").proposals, proposals, "terminal observation must not duplicate or replace published proposals");
  await f.start(); await f.call<Promise<View>>("cancel");
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

for (const action of ["approve", "reject", "undo"] as const) test(`${action} publication cleanup failure retains the whole decision without repeating it`, async t => {
  const f = setup(t), before = f.markdown(); await f.start(); f.service.complete();
  const proposal = f.call("status").proposals[0];
  if (action === "undo") f.call("approve", { id: proposal.id });
  await failPublishedCleanup(t, f.folder, () => f.call(action, { id: proposal.id }));
  const state = action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending";
  const saved = f.call("proposals").proposals.find(p => p.id === proposal.id)!;
  assert.equal(saved.state, state); assert.equal(saved.history.at(-1)!.state, state);
  assert.throws(() => f.call(action, { id: proposal.id }), /required approval state|Only an unapproved/u);
  assert.deepEqual(f.call("proposals").proposals.find(p => p.id === proposal.id), saved);
  assert.equal(f.ledger().entries.length, action === "approve" ? 1 : 0);
  if (action === "approve") {
    assert.ok(f.blocks().some(b => b.block === "heading" && b.level === 2 && b.text === "Subsection"));
    f.call("undo", { id: proposal.id });
  }
  assert.equal(f.markdown(), before);
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("initial publication rollback does not admit AI work and allows a new explicit start", async t => {
  const f = setup(t), before = files(f.folder), rename = fs.renameSync;
  const fault = t.mock.method(fs, "renameSync", ((from, to) => {
    if (String(from).includes(".corrections-") && String(to) === f.folder) throw new Error("Injected initial publication failure");
    return rename(from, to);
  }) as typeof rename);
  syncBuiltinESMExports();
  try { await assert.rejects(() => f.start(), /Injected initial publication failure/u); }
  finally { fault.mock.restore(); syncBuiltinESMExports(); }
  assert.deepEqual(files(f.folder), before); assert.equal(f.service.requests.length, 0);
  await f.start(); await f.call<Promise<View>>("cancel");
});

test("status during delayed admission preserves live request materials through same-Host reactivation", async t => {
  const f = setup(t), id = randomUUID();
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), paused = new Promise<void>(resolve => { release = resolve; });
  const admit = f.service.start.bind(f.service);
  let request: AiTaskRequest;
  f.service.start = async value => {
    request = value; entered(); await paused;
    return admit(value); // Like B, material reads precede receipt creation.
  };
  const starting = f.start(id).then(value => ({ value, error: null }), error => ({ value: null, error }));
  await reached;
  let during: View, materialsPresent: boolean;
  try {
    assert.equal(f.service.current(id), null);
    f.reactivate();
    during = f.call("status");
    materialsPresent = request!.materials.every(m => existsSync(m.path));
  } finally { release(); }
  const outcome = await starting;
  assert.deepEqual({ status: during.task!.status, materialsPresent, startError: outcome.error?.code ?? null },
    { status: "running", materialsPresent: true, startError: null });
  assert.equal(during.canCancel, false);
  assert.equal(during.task!.finishedAt, undefined);
  assert.equal(outcome.value!.task!.status, "running");
  assert.ok(request!.materials.every(m => existsSync(m.path)), "admitted work retains materials until terminal observation");
  f.service.complete();
  const done = f.call("status");
  assert.equal(done.task!.status, "success");
  assert.ok(done.proposals.every(p => p.state === "pending"));
  assert.ok(request!.materials.every(m => !existsSync(m.path)));
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("restart without a receipt or live admission marks the saved request uncertain without replay", async t => {
  const f = setup(t), running = await f.start(), request = f.service.requests[0];
  f.service.records.delete(running.task!.id); // Persisted pre-receipt state after losing the admitting Host.
  f.reactivate(true);
  const stopped = f.call("status");
  assert.equal(stopped.task!.status, "uncertain"); assert.equal(stopped.task!.failure, "uncertain");
  assert.ok(request.materials.every(m => !existsSync(m.path)));
  await f.start(running.task!.id); assert.equal(f.service.requests.length, 1);
});

test("whole-document request, dry-run partition, approval/rejection/undo and current-ledger revalidation preserve source bytes", async t => {
  const f = setup(t), before = f.markdown();
  const running = await f.start(), id = running.task!.id;
  assert.equal(running.task!.status, "running"); assert.deepEqual(running.proposals, []);
  const request = f.service.requests[0];
  assert.equal(request.caller, "docling"); assert.equal(request.task, "docling-structure-review");
  assert.deepEqual(Object.keys(f.service.materials[0]).sort(), ["corrections.json", "document.json", "rejected-proposals.json"]);
  assert.equal(f.service.materials[0]["document.json"], f.original);
  assert.deepEqual(JSON.parse(f.service.materials[0]["corrections.json"]), f.ledger());
  assert.deepEqual(JSON.parse(f.service.materials[0]["rejected-proposals.json"]), []);
  assert.match(request.instruction, /WHOLE/); assert.ok(request.schema);
  await f.start(id.toUpperCase()); assert.equal(f.service.requests.length, 1);
  await assert.rejects(() => f.start(), /already running/);
  f.service.complete({ proposals: [...structureReviewSuggestions, { ...structureReviewSuggestions[0], self_ref: "#/texts/999" }] });
  const done = f.call("status");
  assert.equal(done.task!.status, "success"); assert.equal(f.markdown(), before); assert.deepEqual(f.ledger().entries, []);
  assert.deepEqual(done.proposals.map(p => p.state), ["pending", "pending", "pending", "inapplicable"]);
  assert.match(done.proposals[3].validationError!, /does not exist/);
  assert.ok(f.service.requests[0].materials.every(m => !existsSync(m.path)));
  const [heading, merge, furniture, invalid] = done.proposals;
  assert.throws(() => f.call("approve", { id: invalid.id }), /approval state/);
  f.call("approve", { id: heading.id });
  const entry = f.ledger().entries[0]; assert.equal(entry.reason, heading.suggestion.reason); assert.deepEqual(JSON.parse(entry.aiEvidence), heading.suggestion.evidence);
  assert.ok(f.blocks().some(b => b.block === "heading" && b.level === 2 && b.text === "Subsection"));
  f.call("approve", { id: merge.id });
  assert.ok(f.blocks().some(b => b.block === "paragraph" && b.text === "A paragraph split across pages."));
  f.call("reject", { id: furniture.id }); assert.equal(f.ledger().entries.length, 2);
  assert.throws(() => f.call("approve", { id: furniture.id }), /approval state/);
  f.call("undo", { id: merge.id }); f.call("undo", { id: heading.id }); assert.equal(f.markdown(), before);
  assert.deepEqual(f.call("proposals").proposals.find(p => p.id === heading.id)!.history.map(h => h.state), ["approved", "pending"]);
  f.reactivate(true); assert.equal(f.call("proposals").proposals.find(p => p.id === furniture.id)!.state, "rejected");
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("rerun replaces only unreviewed pending results and sends current corrections/rejections; furniture approval regenerates", async t => {
  const f = setup(t); await f.start(); f.service.complete(); const initial = f.call("status").proposals;
  f.call("approve", { id: initial[0].id }); f.call("reject", { id: initial[1].id });
  await f.start();
  assert.deepEqual(JSON.parse(f.service.materials[1]["corrections.json"]), f.ledger());
  assert.deepEqual(JSON.parse(f.service.materials[1]["rejected-proposals.json"]), [initial[1].suggestion]);
  assert.equal(f.call("status").proposals.find(p => p.id === initial[2].id)!.state, "pending", "old pending remains until complete success");
  f.service.complete({ proposals: [structureReviewSuggestions[2]] });
  const next = f.call("status").proposals;
  assert.equal(next.some(p => p.id === initial[2].id), false);
  assert.deepEqual(next.slice(0, 2).map(p => p.state), ["approved", "rejected"]);
  f.call("approve", { id: next[2].id });
  assert.ok(!f.blocks().some(b => "text" in b && b.text === "Synthetic Journal 2026"));
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("approval rechecks current corrections and dependent undo fails without changing proposal state", async t => {
  const f = setup(t); await f.start();
  f.service.complete({ proposals: [...structureReviewSuggestions, { ...structureReviewSuggestions[0], value: { level: 3 } }] });
  const proposals = f.call("status").proposals;
  f.call("approve", { id: proposals[0].id });
  const before = files(f.folder);
  assert.throws(() => f.call("approve", { id: proposals[3].id }), /Conflicts/); assert.deepEqual(files(f.folder), before);
  // A current classification can be a merge prerequisite. Removal must use A's full replay.
  f.call("undo", { id: proposals[0].id });
  addDoclingCorrection(f.folder, { id: "external-heading", self_ref: "#/texts/2", operation: "heading", value: { level: 2 }, reason: "Current ledger", approvedAt: new Date().toISOString() });
  assert.throws(() => f.call("approve", { id: proposals[1].id }), /consecutive body/);
  assert.equal(f.call("proposals").proposals[1].state, "pending");
});

test("undo of an approved merge prerequisite preserves both approval histories on refusal", async t => {
  const source = JSON.parse(structureReviewSource()); source.texts[2].label = "section_header"; source.texts[2].level = 1;
  const f = setup(t, JSON.stringify(source));
  await f.start(); f.service.complete({ proposals: [{ ...structureReviewSuggestions[0], self_ref: "#/texts/2", value: { level: null } }] });
  const prerequisite = f.call("status").proposals[0]; f.call("approve", { id: prerequisite.id });
  await f.start(); f.service.complete({ proposals: [structureReviewSuggestions[1]] });
  const merge = f.call("status").proposals.find(p => p.suggestion.operation === "merge-paragraphs")!;
  f.call("approve", { id: merge.id }); const before = files(f.folder);
  assert.throws(() => f.call("undo", { id: prerequisite.id }), /consecutive body/);
  assert.deepEqual(files(f.folder), before);
});

test("all proposals become stale on source drift, including during work; ledger changes alone are not stale", async t => {
  const f = setup(t); await f.start(); writeFileSync(f.input, f.original + "\n");
  f.service.complete(); const stale = f.call("status");
  assert.ok(stale.proposals.every(p => p.stale)); assert.ok(stale.proposals.every(p => p.state === "pending"));
  assert.throws(() => f.call("approve", { id: stale.proposals[0].id }), /stale/);
  await assert.rejects(() => f.start(), /source SHA-256 mismatch/);
  writeFileSync(f.input, f.original);
  f.call("approve", { id: stale.proposals[0].id }); assert.ok(f.call("proposals").proposals.every(p => !p.stale));
  writeFileSync(f.input, Buffer.from([0xff])); assert.ok(f.call("proposals").proposals.every(p => p.stale));
  rmSync(f.input); assert.ok(f.call("proposals").proposals.every(p => p.stale));
  writeFileSync(f.input, f.original);
  assert.equal(readFileSync(f.input, "utf8"), f.original);
});

test("disabled service is explicit; accepted work drains across disable and reactivation; cancellation exposes no proposal", async t => {
  const f = setup(t); f.enable(false);
  const off = await f.start(); assert.equal(off.available, false); assert.equal(f.service.requests.length, 0); assert.equal(existsSync(path.join(f.folder, REVIEW_FILE)), false);
  f.enable(true); await f.start(); f.enable(false); f.reactivate();
  assert.equal(f.call("status").canCancel, true);
  const cancelled = await f.call<Promise<View>>("cancel"); assert.equal(cancelled.task!.status, "cancelled"); assert.deepEqual(cancelled.proposals, []);
  assert.ok(f.service.requests[0].materials.every(m => !existsSync(m.path)));
  f.enable(true); f.reviewFeature(false);
  await assert.rejects(() => f.start(), /feature is disabled/);
  assert.equal(f.call("status").available, true);
  assert.throws(() => f.call("reject", { id: randomUUID() }), /feature is disabled/);
  f.reviewFeature(true);
  f.enable(true); f.feature(false); await assert.rejects(() => f.start(), /feature is disabled/);
});

test("restart observes uncertain receipts, never replays automatically, and retains older reviewed proposals", async t => {
  const f = setup(t); const running = await f.start();
  const receipt = f.service.current(running.task!.id)!; receipt.status = "uncertain"; receipt.job.state = "error"; receipt.job.failure = "uncertain"; receipt.canCancel = false;
  f.reactivate(true);
  assert.equal(f.call("status").task!.status, "uncertain");
  await f.start(running.task!.id); assert.equal(f.service.requests.length, 1);
  await f.start(); assert.equal(f.service.requests.length, 2);
  await f.call<Promise<View>>("cancel");
});

for (const failure of ["provider", "timeout", "format", "uncertain"] as const) test(`${failure} keeps existing pending proposals and publishes no partial result`, async t => {
  const f = setup(t); await f.start(); f.service.complete(); const before = f.call("status").proposals;
  await f.start(); const receipt = f.service.current(f.service.requests.at(-1)!.id)!;
  receipt.status = failure === "uncertain" ? "uncertain" : "error"; receipt.job.state = "error"; receipt.job.failure = failure; receipt.job.error = `Fixture ${failure}`;
  receipt.job.result = { proposals: structureReviewSuggestions }; receipt.canCancel = false;
  const done = f.call("status"); assert.equal(done.task!.failure, failure); assert.deepEqual(done.proposals, before);
});

test("schema violations and mismatched receipt identity cannot publish proposals", async t => {
  const f = setup(t); await f.start(); f.service.complete({ proposals: [{ arbitrary: "partial" }] });
  assert.equal(f.call("status").task!.failure, "format"); assert.deepEqual(f.call("proposals").proposals, []);
  await f.start(); const receipt = f.service.current(f.service.requests.at(-1)!.id)!; receipt.job.baseline = "different";
  assert.throws(() => f.call("status"), /does not match/);
  assert.equal(f.readReview().task.status, "running");
});

test("approval publication failure rolls back Markdown, map, correction and proposal state together", async t => {
  const f = setup(t); await f.start(); f.service.complete(); const proposal = f.call("status").proposals[0], before = files(f.folder);
  const rename = fs.renameSync;
  fs.renameSync = ((from, to) => { if (String(from).includes(".corrections-") && String(to) === f.folder) throw new Error("Injected review publication failure"); return rename(from, to); }) as typeof rename;
  syncBuiltinESMExports();
  try { assert.throws(() => f.call("approve", { id: proposal.id }), /Injected review publication/); }
  finally { fs.renameSync = rename; syncBuiltinESMExports(); }
  assert.deepEqual(files(f.folder), before); assert.deepEqual(readdirSync(f.root).sort(), ["result", "source.json"]);
});

test("dry-run exposes the exact correction checks without mutating input or ledger", () => {
  const input = structureReviewSource(), ledger = emptyCorrections("source.json", input), before = structuredClone(ledger);
  const { evidence: _evidence, ...suggestion } = structureReviewSuggestions[0];
  checkDoclingCorrection(input, ledger, { ...suggestion, id: "dry-run", approvedAt: new Date().toISOString() });
  assert.deepEqual(ledger, before);
  assert.throws(() => checkDoclingCorrection(input, ledger, { ...suggestion, self_ref: "#/texts/999", id: "missing", approvedAt: new Date().toISOString() }), /does not exist/);
  assert.deepEqual(ledger, before); assert.equal(input, structureReviewSource());
});
