import { JobObservations } from "../src/job-observations.ts";
import { randomUuid } from "../src/uuid.ts";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { createHostServices } from "../server/host-services.ts";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { PluginJobs } from "../server/plugins/jobs.ts";
import { JobHistory, retainJobHistory, JOB_HISTORY_LIMIT, JOB_HISTORY_WARNING } from "../server/plugins/job-history.ts";
import { JOB_FILE_MAX_BYTES, PLUGIN_ERROR_MESSAGES } from "@litzio/plugin-sdk";
import { RootAccess } from "../server/file-access.ts";

const safeWriteAdvice = " Check the target before retrying a write. Query the same requestId; do not resend start.";

test("K1 restored uncertainty is bounded and a just-finished old request remains queryable", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-archive-cap-"));
  t.after(() => { for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file)); fs.rmdirSync(root); });
  const file = path.join(root, "jobs.json");
  writeFileSync(path.join(root, "input.txt"), "Input");
  const binding = { id: "text", title: "Text", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" as const };
  for (const state of ["uncertain", "completed"] as const) {
    const entries = Array.from({ length: JOB_HISTORY_LIMIT + 1 }, (_, i) => ({ requestId: randomUUID(), plugin: "fixture.jobs", job: "text", root, startedAt: i + 10, finishedAt: i + 20, elapsedMs: 10, state, effect: "write", stopRequested: false }));
    writeFileSync(file, JSON.stringify({ version: 1, jobs: entries }));
    for (let cycle = 0; cycle < 3; cycle++) {
      const jobs = new PluginJobs(new RootAccess([root]), () => binding, async name => ({ result: name.endsWith(".status")
        ? { state: "completed", phase: "Done", document: { source: "---\nlitzio: 1\n---\n\n# Result\n" } }
        : { state: "running", phase: "Waiting" } }), () => "write", undefined, undefined, file);
      const requestId = randomUUID();
      // A long-running request started before every archived record but finishes now.
      const now = t.mock.method(Date, "now", () => 1);
      await jobs.execute({ action: "job-start", plugin: "fixture.jobs", job: "text", requestId, root, file: "input.txt", output: `${state}-${cycle}.md` });
      now.mock.restore();
      const completed = await jobs.execute({ action: "job-status", requestId });
      assert.ok("job" in completed); assert.equal(completed.job.state, "completed");
      const result = await jobs.execute({ action: "job-result", requestId });
      assert.ok("job" in result); assert.ok(result.job.result?.revision);
      assert.equal(jobs.list().jobs.length, JOB_HISTORY_LIMIT);
      assert.equal(JSON.parse(readFileSync(file, "utf8")).jobs.length, JOB_HISTORY_LIMIT);
    }
  }
});

test("K1 restored uncertainty always retains safe advice even when saved effect is changed to read", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-forged-effect-"));
  t.after(() => { for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file)); fs.rmdirSync(root); });
  const file = path.join(root, "jobs.json"), requestId = randomUUID();
  writeFileSync(path.join(root, "input.txt"), "Input");
  const binding = { id: "text", title: "Text", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" as const };
  const jobs = new PluginJobs(new RootAccess([root]), () => binding, async () => ({ result: { state: "running", phase: "Waiting" } }), () => "write", undefined, undefined, file);
  await jobs.execute({ action: "job-start", plugin: "fixture.jobs", job: "text", requestId, root, file: "input.txt", output: "result.md" });
  const saved = JSON.parse(readFileSync(file, "utf8")); saved.jobs[0].effect = "read";
  writeFileSync(file, JSON.stringify(saved));
  const restarted = new PluginJobs(new RootAccess([root]), () => { throw new Error("no replay"); }, async () => { throw new Error("no replay"); }, () => "read", undefined, undefined, file);
  for (const action of ["job-status", "job-stop"] as const) {
    const value = await restarted.execute({ action, requestId });
    assert.ok("job" in value); assert.equal(value.job.state, "uncertain");
    assert.equal(value.job.error, PLUGIN_ERROR_MESSAGES.unavailable + safeWriteAdvice);
    assert.deepEqual(value.job, restarted.list().jobs[0]);
  }
  assert.equal(JSON.parse(readFileSync(file, "utf8")).jobs[0].effect, undefined);
});

test("K1 only current daemon running jobs are exempt in memory and on disk", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-retention-"));
  t.after(() => { for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file)); fs.rmdirSync(root); });
  const file = path.join(root, "jobs.json"), startedAt = Date.now();
  writeFileSync(path.join(root, "input.txt"), "Input");
  const binding = { id: "text", title: "Text", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" as const };
  for (const state of ["completed", "running"] as const) {
    // Seed history instead of performing 999 redundant filesystem publications.
    // Two real admissions cross the cap with an older, still-running first job.
    const entries = Array.from({ length: JOB_HISTORY_LIMIT - 1 }, (_, i) => ({ requestId: randomUUID(), plugin: "fixture.jobs", job: "text", root, startedAt: startedAt - 100_000 + i, elapsedMs: 10, state, stopRequested: false }));
    writeFileSync(file, JSON.stringify({ version: 1, jobs: entries }));
    const jobs = new PluginJobs(new RootAccess([root]), () => binding, async () => ({ result: { state: "running", phase: "Waiting" } }), () => "write", undefined, undefined, file);
    const first = randomUUID();
    const now = t.mock.method(Date, "now", () => startedAt - 200_000);
    await jobs.execute({ action: "job-start", plugin: "fixture.jobs", job: "text", requestId: first, root, file: "input.txt", output: "first.md" });
    now.mock.restore();
    await jobs.execute({ action: "job-start", plugin: "fixture.jobs", job: "text", requestId: randomUUID(), root, file: "input.txt", output: "second.md" });
    const memory = jobs.list().jobs.map(job => job.requestId).sort();
    const disk = JSON.parse(readFileSync(file, "utf8")).jobs.map((job: { requestId: string }) => job.requestId).sort();
    assert.deepEqual(disk, memory, "memory and file must retain exactly the same IDs");
    assert.ok(disk.includes(first), "unfinished work cannot be evicted ahead of completed history");
    assert.equal(disk.length, JOB_HISTORY_LIMIT + 1);
    const restarted = new PluginJobs(new RootAccess([root]), () => { throw new Error("no replay"); }, async () => { throw new Error("no replay"); }, () => "read", undefined, undefined, file);
    assert.deepEqual(restarted.list().jobs.map(job => job.requestId).sort(), memory.filter(id => id !== entries[0].requestId));
    const value = await restarted.execute({ action: "job-status", requestId: first });
    assert.ok("job" in value); assert.equal(value.job.state, "uncertain");
  }
  // A fresh completion must retain a result slot even while >1000 live requests
  // are exempt. Ownership comes from this daemon, never from serialized state.
  const running = Array.from({ length: JOB_HISTORY_LIMIT + 1 }, (_, i) => ({ requestId: randomUUID(), plugin: "fixture.jobs", job: "text", root, startedAt: i, elapsedMs: 10, state: "running" as const, phase: "", stopRequested: false }));
  const completed = { ...running[0], requestId: randomUUID(), startedAt: 0, finishedAt: startedAt, state: "completed" as const };
  const live = new Set(running.map(job => job.requestId));
  const retained = retainJobHistory([...running, completed], live);
  assert.equal(retained.length, running.length + 1); assert.ok(retained.includes(completed));
  new JobHistory(file).save([...running, completed], live);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).jobs.length, retained.length);
  const restarted = new PluginJobs(new RootAccess([root]), () => { throw new Error("no replay"); }, async () => { throw new Error("no replay"); }, () => "read", undefined, undefined, file);
  assert.equal(restarted.list().jobs.length, JOB_HISTORY_LIMIT);
  assert.ok(restarted.list().jobs.some(job => job.requestId === completed.requestId));
});

test("K1 restored uncertainty uses common safe advice regardless of admitted effect without replay", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-restored-advice-"));
  t.after(() => { for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file)); fs.rmdirSync(root); });
  const file = path.join(root, "jobs.json");
  writeFileSync(path.join(root, "input.txt"), "Input");
  const binding = { id: "text", title: "Text", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" as const };
  for (const [startEffect, statusEffect] of [["write", "read"], ["read", "read"], ["read", "write"]] as const) {
    const effect = startEffect === "write" || statusEffect === "write" ? "write" : "read";
    if (existsSync(file)) fs.unlinkSync(file);
    const jobs = new PluginJobs(new RootAccess([root]), () => binding, async () => ({ result: { state: "running", phase: "Private phase" } }), name => name.endsWith(".start") ? startEffect : statusEffect, undefined, undefined, file);
    const requestId = randomUUID();
    await jobs.execute({ action: "job-start", plugin: "fixture.jobs", job: "text", requestId, root, file: "input.txt", output: `${effect}.md` });
    await jobs.execute({ action: "job-status", requestId });
    const restarted = new PluginJobs(new RootAccess([root]), () => { throw new Error("no replay"); }, async () => { throw new Error("no replay"); }, () => effect === "write" ? "read" : "write", undefined, undefined, file);
    for (const action of ["job-status", "job-stop"] as const) {
      const value = await restarted.execute({ action, requestId });
      assert.ok("job" in value); assert.equal(value.job.state, "uncertain");
      assert.equal(value.job.errorKind, "unavailable");
      assert.equal(value.job.error, PLUGIN_ERROR_MESSAGES.unavailable + safeWriteAdvice);
      assert.deepEqual(value.job, restarted.list().jobs[0]);
    }
    assert.equal(JSON.parse(readFileSync(file, "utf8")).jobs[0].effect, undefined);
  }
});

test("K1 durable history serializes concurrent changes, allowlists fields and never resumes observations", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-history-"));
  t.after(() => { for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file)); fs.rmdirSync(root); });
  const historyFile = path.join(root, "jobs.json");
  writeFileSync(path.join(root, "input.txt"), "private input payload");
  const binding = { id: "text", title: "Text", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" as const };
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const jobs = new PluginJobs(new RootAccess([root]), () => binding, async (name, raw) => {
    const input = raw as { requestId: string };
    return { result: name.endsWith(".status") && input.requestId !== ids[2]
      ? { state: "completed", phase: "private phase", document: { source: "---\nlitzio: 1\n---\n\n# Private result contents\n" } }
      : { state: "running", phase: "private phase" } };
  }, () => "write", undefined, undefined, historyFile);
  await Promise.all(ids.map((requestId, i) => jobs.execute({ action: "job-start", plugin: "fixture.jobs", job: "text", requestId, root, file: "input.txt", output: `result-${i}.md` })));
  await Promise.all(ids.map(requestId => jobs.execute({ action: "job-status", requestId })));
  await jobs.execute({ action: "job-stop", requestId: ids[2] });
  const saved = readFileSync(historyFile, "utf8");
  assert.ok(!/private|Private|document|secret|error|phase/.test(saved));
  assert.equal(JSON.parse(saved).jobs.length, ids.length);
  assert.equal(fs.readdirSync(root).filter(file => file.endsWith(".tmp")).length, 0);
  let calls = 0;
  const restored = () => new PluginJobs(new RootAccess([root]), () => { throw new Error("must not resolve old bindings"); }, async () => { calls++; throw new Error("must not replay"); }, () => "write", undefined, undefined, historyFile);
  const restarted = restored();
  const list = restarted.list().jobs;
  assert.equal(list.filter(job => job.state === "completed").length, 2);
  const uncertain = list.find(job => job.requestId === ids[2])!;
  assert.equal(uncertain.state, "uncertain"); assert.equal(uncertain.stopRequested, true);
  for (const action of ["job-status", "job-stop"] as const) {
    const value = await restarted.execute({ action, requestId: ids[2] });
    assert.ok("job" in value); assert.deepEqual(value.job, uncertain);
  }
  const again = restored();
  assert.deepEqual(again.list().jobs.find(job => job.requestId === ids[2]), uncertain, "uncertain elapsed time is frozen across restarts");
  const result = await again.execute({ action: "job-result", requestId: ids[0] });
  assert.ok("job" in result); assert.equal(result.job.state, "completed");
  await assert.rejects(again.execute({ action: "job-start", plugin: "fixture.jobs", job: "text", requestId: ids[2], root, file: "input.txt" }), /Duplicate requestId/);
  assert.equal(calls, 0);
  assert.equal(again.hasActive("fixture.jobs"), false, "archived uncertainty cannot lock future configuration");

  // A failed history write refuses start before invoking the plugin. Recovery
  // flushes the current snapshot instead of wedging the observation chain.
  const save = JobHistory.prototype.save;
  let failSave = true, invocations = 0;
  t.mock.method(JobHistory.prototype, "save", function (this: JobHistory, ...args: Parameters<typeof save>) {
    if (failSave) throw new Error("History storage unavailable");
    return save.apply(this, args);
  });
  const input = { action: "job-start", plugin: "fixture.jobs", job: "text", requestId: randomUUID(), root, file: "input.txt", output: "recovered.md" };
  await assert.rejects(jobs.execute(input), /History storage unavailable/);
  assert.ok(!jobs.list().jobs.some(job => job.requestId === input.requestId));
  failSave = false;
  const storage = new PluginJobs(new RootAccess([root]), () => binding, async () => { invocations++; return { result: { state: "running", phase: "Accepted" } }; }, () => "write", undefined, undefined, historyFile);
  await storage.execute(input);
  failSave = true;
  await assert.rejects(storage.execute({ action: "job-status", requestId: input.requestId }), /History storage unavailable/);
  failSave = false;
  await storage.execute({ action: "job-status", requestId: input.requestId });
  assert.equal(invocations, 3);
});

test("K1 damaged history preserves original bytes and retention keeps newest records", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-history-boundary-"));
  t.after(() => { for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file)); fs.rmdirSync(root); });
  const historyFile = path.join(root, "jobs.json");
  const open = () => new PluginJobs(new RootAccess([root]), () => { throw new Error("unavailable"); }, async () => { throw new Error("no replay"); }, () => "write", undefined, undefined, historyFile);
  for (const bytes of ["{broken", '{"version":999,"jobs":[]}', '{"version":1,"jobs":[{"requestId":"invalid"}]}']) {
    writeFileSync(historyFile, bytes);
    const before = new Set(fs.readdirSync(root));
    const jobs = open();
    assert.equal(jobs.list().jobs.length, 0); assert.equal(jobs.list().warning, JOB_HISTORY_WARNING);
    const preserved = fs.readdirSync(root).find(file => !before.has(file))!;
    assert.ok(preserved.includes(".corrupt-")); assert.equal(readFileSync(path.join(root, preserved), "utf8"), bytes);
    assert.deepEqual(JSON.parse(readFileSync(historyFile, "utf8")), { version: 1, jobs: [] });
  }
  const entries = Array.from({ length: JOB_HISTORY_LIMIT + 2 }, (_, i) => ({ requestId: randomUUID(), plugin: "fixture.jobs", job: "text", root, file: "input.txt", startedAt: i, elapsedMs: 100, finishedAt: i + 100, state: "completed", effect: "write", stopRequested: false }));
  writeFileSync(historyFile, JSON.stringify({ version: 1, jobs: [...entries].reverse() }));
  const jobs = open();
  assert.equal(jobs.list().jobs.length, JOB_HISTORY_LIMIT);
  assert.equal(jobs.list().jobs[0].requestId, entries.at(-1)!.requestId);
  assert.equal(jobs.list().warning, undefined);
  await assert.rejects(jobs.execute({ action: "job-status", requestId: entries[0].requestId }), /Unknown requestId/);
  assert.equal(JSON.parse(readFileSync(historyFile, "utf8")).jobs[0].requestId, entries[2].requestId);
});

test("request IDs use v4 UUIDs without secure-context randomUUID", () => {
  const original = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues: original.getRandomValues.bind(original) } });
    assert.match(randomUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally { Object.defineProperty(globalThis, "crypto", { configurable: true, value: original }); }
});

test("K1 lifecycle, exclusive request identity, Root admission, publication and disable cleanup", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-"));
  const directory = path.join(root, "artifact"); cpSync(new URL("./fixtures/job-plugin", import.meta.url), directory, { recursive: true });
  const manifestPath = path.join(directory, "litzio-plugin.json");
  writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, "utf8")), requiresSdk: ">=0.4.0 <1.0.0", secrets: [{ id: "pat", title: "Access token", scope: "connection", required: false }] }));
  let secret = "original";
  const secrets = { supported: true, async read() { return secret; }, async status() { return !!secret; }, async set(_p: string, _n: string, value: string) { secret = value; }, async delete() { secret = ""; } };
  const host = new PluginHost(path.join(root, "state.json"), { access: new RootAccess([root]), secrets });
  try {
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: "fixture.jobs", registrationId: (await host.list()).find(p => p.id === "fixture.jobs")!.registrationId });
    await host.invoke("enable", { id: "fixture.jobs" });
    const start = async (text: string) => {
      const requestId = randomUUID(); const file = `${requestId}.txt`, output = `${requestId}.md`;
      writeFileSync(path.join(root, file), text);
      const input = { requestId, plugin: "fixture.jobs", job: "text", root, file, output };
      await host.invoke("job-start", input); return input;
    };
    const wait = async (requestId: string, state: string) => {
      for (let i = 0; i < 100; i++) {
        const result = await host.jobs.execute({ action: "job-status", requestId });
        assert.ok("job" in result);
        if (result.job!.state === state) return result.job!;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Job did not reach ${state}: ${JSON.stringify(await host.jobs.execute({ action: "job-status", requestId }))}`);
    };
    writeFileSync(path.join(root, "batch-a.txt"), "# A"); writeFileSync(path.join(root, "batch-b.txt"), "# B");
    writeFileSync(path.join(root, "batch-a.bin"), "preserved");
    const batchIds = [randomUUID(), randomUUID()];
    const batch = await host.jobs.execute({ requestIds: batchIds, action: "job-start-many", plugin: "fixture.jobs", job: "file", root, files: ["batch-a.txt", "batch-b.txt"] });
    assert.ok("files" in batch); assert.equal(batch.files[0]!.job?.output, "batch-a-2.bin"); assert.equal(batch.files[1]!.requestId, batchIds[1]);
    await wait(batch.files[0]!.requestId!, "completed");
    await wait(batch.files[1]!.requestId!, "completed");
    assert.equal(readFileSync(path.join(root, "batch-a.bin"), "utf8"), "preserved");
    await assert.rejects(host.jobs.execute({ action: "job-start-many", plugin: "fixture.jobs", job: "file", root, files: Array.from({ length: 51 }, (_, i) => `${i}.txt`) }));
    const input = await start("# Imported\n\nOriginal text.\n");
    const sameId = { ...input, requestId: randomUUID(), output: "concurrent.md" };
    const simultaneous = await Promise.allSettled([host.invoke("job-start", sameId), host.invoke("job-start", sameId)]);
    assert.equal(simultaneous.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(simultaneous.filter(result => result.status === "rejected").length, 1);
    await host.jobs.execute({ action: "job-stop", requestId: sameId.requestId });
    await wait(sameId.requestId, "stopped");
    const beforeSettings = readFileSync(path.join(root, "state.json"), "utf8");
    await assert.rejects(host.invoke("settings", { id: "fixture.jobs", settings: {} }), /running or uncertain/);
    assert.equal(readFileSync(path.join(root, "state.json"), "utf8"), beforeSettings);
    await assert.rejects(host.setSecret("fixture.jobs", "pat", "replacement"), /running or uncertain/);
    await assert.rejects(host.invoke("secret-delete", { id: "fixture.jobs", name: "pat" }), /running or uncertain/);
    assert.equal(secret, "original");
    const listing = host.jobs.list("fixture.jobs");
    assert.equal(listing.jobs.filter(job => job.requestId === input.requestId).length, 1);
    assert.ok(listing.jobs[0]!.elapsedMs >= 0);
    assert.ok(listing.jobs[0]!.startedAt! > 0);
    assert.equal(host.jobs.list("fixture.other").jobs.length, 0);
    await assert.rejects(host.jobs.execute({ action: "job-result", requestId: input.requestId }), /before completion/);
    assert.equal(existsSync(path.join(root, input.output)), false);
    const completed = await wait(input.requestId, "completed");
    assert.ok(completed.result?.revision); assert.match(readFileSync(completed.result!.path, "utf8"), /Original text/);
    assert.equal(readFileSync(path.join(root, input.file), "utf8"), "# Imported\n\nOriginal text.\n");
    const stopAfterComplete = await host.jobs.execute({ action: "job-stop", requestId: input.requestId });
    assert.ok("job" in stopAfterComplete); assert.equal(stopAfterComplete.job.state, "completed");
    const [parallelA, parallelB] = await Promise.all([start("# Parallel A"), start("# Parallel B")]);
    const [racingStatus, racingStop] = await Promise.all([
      host.jobs.execute({ action: "job-status", requestId: parallelA.requestId }),
      host.jobs.execute({ action: "job-stop", requestId: parallelA.requestId }),
    ]);
    assert.ok("job" in racingStatus && "job" in racingStop);
    await wait(parallelA.requestId, "stopped"); await wait(parallelB.requestId, "completed");
    assert.equal(existsSync(path.join(root, parallelA.output)), false);
    const racing = await start("COMPLETE-ON-STOP");
    await host.jobs.execute({ action: "job-stop", requestId: racing.requestId });
    const raceResult = await wait(racing.requestId, "completed");
    assert.match(readFileSync(raceResult.result!.path, "utf8"), /Completed during Stop/);
    assert.equal(raceResult.stopRequested, true);
    const failures = await Promise.all((["auth", "forbidden", "not_found", "unavailable", "timeout", "failed", "raw-service-private", undefined] as const).map(async kind => {
      const input = await start(kind ? `FAIL:${kind}` : "FAIL");
      return { input, kind: kind === "raw-service-private" || kind === undefined ? "failed" as const : kind };
    }));
    for (const { input, kind } of failures) {
      const failure = await wait(input.requestId, "failed");
      assert.equal(failure.errorKind, kind); assert.ok([PLUGIN_ERROR_MESSAGES[kind], PLUGIN_ERROR_MESSAGES[kind] + safeWriteAdvice].includes(failure.error!));
      assert.equal(failure.phase, "Failed");
      assert.equal(existsSync(path.join(root, input.output)), false);
    }
    const raw = await start("FAIL-RAW");
    const rejected = await wait(raw.requestId, "uncertain");
    await assert.rejects(host.invoke("settings", { id: "fixture.jobs", settings: {} }), /running or uncertain/);
    await assert.rejects(host.setSecret("fixture.jobs", "pat", "replacement"), /running or uncertain/);
    await assert.rejects(host.invoke("secret-delete", { id: "fixture.jobs", name: "pat" }), /running or uncertain/);
    assert.equal(secret, "original");
    assert.equal(readFileSync(path.join(root, "state.json"), "utf8"), beforeSettings);
    assert.equal(rejected.errorKind, "failed"); assert.equal(rejected.error, PLUGIN_ERROR_MESSAGES.failed + safeWriteAdvice);
    for (const { input } of [...failures, { input: raw }]) {
      const status = await host.jobs.execute({ action: "job-status", requestId: input.requestId });
      assert.ok(!JSON.stringify(status).includes("raw-service-private"));
    }
    const list = await host.jobs.execute({ action: "job-list" });
    assert.ok(!JSON.stringify(list).includes("raw-service-private"));
    const thrown = await start("THROW");
    // Observe start completion through list so the first assertion cannot mask it with a read failure.
    for (let i = 0; host.jobs.list().jobs.find(job => job.requestId === thrown.requestId)?.state === "running" && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 10));
    const thrownSnapshot = host.jobs.list().jobs.find(job => job.requestId === thrown.requestId)!;
    assert.equal(thrownSnapshot.state, "uncertain"); assert.equal(thrownSnapshot.errorKind, "unavailable");
    assert.equal(thrownSnapshot.error, PLUGIN_ERROR_MESSAGES.unavailable + safeWriteAdvice);
    const observedThrow = await host.jobs.execute({ action: "job-status", requestId: thrown.requestId });
    assert.ok("job" in observedThrow); assert.ok(observedThrow.job.error?.endsWith(safeWriteAdvice));
    assert.ok(!JSON.stringify(observedThrow).includes("raw-write-private"));
    assert.ok(!JSON.stringify(host.jobs.list()).includes("raw-write-private"));
    await assert.rejects(host.invoke("job-start", { ...thrown }), /Duplicate requestId/);
    const uncertain = await start("UNCERTAIN"); const observation = await wait(uncertain.requestId, "uncertain");
    assert.equal(observation.errorKind, "unavailable"); assert.ok([PLUGIN_ERROR_MESSAGES.unavailable, PLUGIN_ERROR_MESSAGES.unavailable + safeWriteAdvice].includes(observation.error!));
    assert.ok(!JSON.stringify(await host.jobs.execute({ action: "job-status", requestId: uncertain.requestId })).includes("raw-service-private"));
    assert.ok(!JSON.stringify(await host.jobs.execute({ action: "job-list" })).includes("raw-service-private"));
    assert.equal(existsSync(path.join(root, uncertain.output)), false);
    const stopped = await start("HOLD # Stop"); const acknowledgement = await host.jobs.execute({ action: "job-stop", requestId: stopped.requestId });
    assert.ok("job" in acknowledgement);
    assert.equal(acknowledgement.job!.stopRequested, true); assert.equal(acknowledgement.job!.state, "running");
    await wait(stopped.requestId, "stopped"); assert.equal(existsSync(path.join(root, stopped.output)), false);
    await assert.rejects(host.invoke("job-start", { ...input, requestId: randomUUID(), file: "../outside.txt" }));
    await assert.rejects(host.invoke("job-start", { ...input, requestId: randomUUID(), output: "../outside.md" }));
    const collision = await start("# Collision"); writeFileSync(path.join(root, collision.output), "keep");
    await wait(collision.requestId, "uncertain"); assert.equal(readFileSync(path.join(root, collision.output), "utf8"), "keep");
    const pending = await start("HOLD # Disable"); await host.invoke("disable", { id: "fixture.jobs" });
    assert.equal(existsSync(path.join(root, pending.output)), false);
    await host.invoke("enable", { id: "fixture.jobs" });
    await host.invoke("reload", { id: "fixture.jobs" });
    const interrupted = await start("HOLD # Restart while active");
    await host.close();
    const restarted = new PluginHost(path.join(root, "state.json"), { access: new RootAccess([root]) });
    try {
      await restarted.start();
      assert.ok(restarted.jobs.list("fixture.jobs").jobs.some(job => job.requestId === input.requestId));
      const restored = await restarted.jobs.execute({ action: "job-status", requestId: interrupted.requestId });
      assert.ok("job" in restored); assert.equal(restored.job.state, "uncertain");
      const result = await restarted.jobs.execute({ action: "job-result", requestId: input.requestId });
      assert.ok("job" in result); assert.deepEqual(result.job.result, { path: completed.result!.path, revision: completed.result!.revision });
      assert.equal(result.job.finishedAt, completed.finishedAt);
      await restarted.invoke("unregister", { id: "fixture.jobs" });
      assert.ok(restarted.jobs.list("fixture.jobs").jobs.some(job => job.requestId === input.requestId));
      await assert.rejects(restarted.jobs.execute({ action: "job-start", ...interrupted }), /Duplicate requestId/);
      writeFileSync(completed.result!.path, "Externally changed");
      await assert.rejects(restarted.jobs.execute({ action: "job-result", requestId: input.requestId }), /changed/);
      fs.unlinkSync(completed.result!.path);
      await assert.rejects(restarted.jobs.execute({ action: "job-result", requestId: input.requestId }));
      assert.equal(existsSync(path.join(root, interrupted.output)), false);
    } finally { await restarted.close(); }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("K1 admission classifies safe start failures and reserves numbered sibling outputs", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-start-reasons-"));
  fs.mkdirSync(path.join(root, "nested"));
  for (const file of ["report.txt", "report.text", "wrong.pdf"]) writeFileSync(path.join(root, "nested", file), "input");
  writeFileSync(path.join(root, "nested/report.md"), "preserved");
  const binding = { id: "text", title: "Text", accept: [".txt", ".text"], start: "start", status: "status", stop: "stop", resultKind: "native-document" as const };
  let enabled = true, fail = false, complete = false;
  const jobs = new PluginJobs(new RootAccess([root]), () => {
    if (!enabled) throw Object.assign(new Error("private registration detail"), { kind: "unavailable" });
    return binding;
  }, async name => fail ? { error: "private plugin exception", errorKind: "failed" } : { result: complete && name.endsWith(".status") ? { state: "completed", phase: "Done", document: { source: "---\nlitzio: 1\n---\n\n# Result\n" } } : { state: "running", phase: "Waiting" } }, () => "write");
  const batch = async (files: string[]) => {
    const result = await jobs.execute({ action: "job-start-many", plugin: "fixture.jobs", job: "text", root, files });
    assert.ok("files" in result); return result;
  };
  try {
    const first = await batch(["nested/report.txt", "nested/report.text"]);
    assert.deepEqual(first.files.map(item => item.job?.output), ["nested/report-2.md", "nested/report-3.md"]);
    const concurrent = await batch(["nested/report.txt"]);
    assert.equal(concurrent.files[0]!.job?.output, "nested/report-4.md");
    const explicit = { action: "job-start", plugin: "fixture.jobs", job: "text", root, file: "nested/report.txt", requestId: randomUUID(), output: "nested/report.md" };
    await assert.rejects(jobs.execute(explicit), (error: unknown) => {
      const refused = error as Error & { reason: { kind: string; path: string } };
      assert.equal(refused.reason.kind, "result_exists"); assert.equal(refused.reason.path, "nested/report.md"); return true;
    });
    assert.equal(readFileSync(path.join(root, "nested/report.md"), "utf8"), "preserved");
    assert.equal((await batch(["nested/wrong.pdf"])).files[0]!.startFailure?.kind, "unsupported_input");
    assert.equal((await batch(["nested/missing.txt"])).files[0]!.startFailure?.kind, "other");
    enabled = false;
    assert.equal((await batch(["nested/report.txt"])).files[0]!.startFailure?.kind, "unavailable");
    enabled = true; fail = true;
    const failed = (await batch(["nested/report.txt"])).files[0]!.job!;
    assert.equal(failed.startFailure?.kind, "start_failed");
    assert.equal(failed.state, "uncertain");
    assert.equal(failed.errorKind, "failed");
    assert.ok(!JSON.stringify(jobs.list()).includes("private"));
    // A writer outside this daemon can race the reservation. Exclusive publication
    // must preserve that file; it must not silently overwrite or resend start.
    const reserved = first.files[0]!.job!;
    writeFileSync(path.join(root, reserved.output!), "external writer");
    fail = false; complete = true;
    const raced = await jobs.execute({ action: "job-status", requestId: reserved.requestId });
    assert.ok("job" in raced); assert.equal(raced.job.state, "uncertain");
    assert.equal(readFileSync(path.join(root, reserved.output!), "utf8"), "external writer");
  } finally { await jobs.close(); rmSync(root, { recursive: true, force: true }); }
});


test("K1 start/status/stop cannot publish subprocess results rejected by output schema", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-publication-"));
  const directory = path.join(root, "artifact"); cpSync(new URL("./fixtures/job-plugin", import.meta.url), directory, {recursive:true});
  const file = path.join(directory, 'litzio-plugin.json'), manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const operation of manifest.contributes.operations) operation.outputSchema = {type:'object',properties:{validated:{type:'boolean'}},required:['validated']};
  writeFileSync(file, JSON.stringify(manifest));
  const complete = {state:'completed',phase:'Complete',document:{source:'---\nlitzio: 1\n---\n\n# Private partial result\n'}};
  writeFileSync(path.join(directory, 'host.js'), `export function activate(){const complete=()=>(${JSON.stringify(complete)});return {operations:{start:complete,status:complete,stop:complete},status:()=>({available:true,message:'ready',folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
  const host = new PluginHost(path.join(root, 'state.json'), {access:new RootAccess([root])});
  try {
    writeFileSync(path.join(root, 'input.txt'), 'Original');
    await host.invoke('register',{directory});
    await host.invoke('trust',{id:'fixture.jobs',registrationId:(await host.list()).find(p => p.id === "fixture.jobs")!.registrationId});
    await host.invoke('enable',{id:'fixture.jobs'});
    const requestId = randomUUID();
    await host.invoke('job-start',{plugin:'fixture.jobs',job:'text',requestId,root,file:'input.txt',output:'result.md'});
    for (const action of ['job-status','job-stop']) {
      const reply = await host.jobs.execute({action,requestId});
      assert.ok('job' in reply); assert.equal(reply.job.state,'uncertain'); assert.equal(reply.job.errorKind,'failed');
      assert.equal('result' in reply.job,false); assert.equal(existsSync(path.join(root,'result.md')),false);
    }
    assert.equal(readFileSync(path.join(root,'input.txt'),'utf8'),'Original');
  } finally {await host.close();rmSync(root,{recursive:true,force:true});}
});

// Real child-process time: short fixtures cannot detect a job lifetime tied to the 10s RPC timer.
test("K1 accepted work survives the RPC budget; completion, failure, stop and process loss", { concurrency: true, timeout: 35_000 }, async t => {
  await Promise.all(["complete", "fail", "stop", "reload", "disable", "crash", "bad-start", "host-close"].map(mode => t.test(mode, async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "litzio-long-job-"));
    const directory = path.join(root, "artifact");
    cpSync(new URL("./fixtures/job-plugin", import.meta.url), directory, { recursive: true });
    writeFileSync(path.join(directory, "host.js"), `
      export function activate() {
        const jobs = new Map();
        return {
          operations: {
            async start(input) {
              if (${JSON.stringify(mode)} === "bad-start") await new Promise(resolve => setTimeout(resolve, 11000));
              const item = { state: "running", phase: "Accepted" };
              const timer = setTimeout(() => {
                if (${JSON.stringify(mode)} === "fail") Object.assign(item, {state:"failed",phase:"private",errorKind:"unavailable"});
                else if (${JSON.stringify(mode)} === "complete") Object.assign(item, {state:"completed",phase:"Complete",document:{source:"---\\nlitzio: 1\\n---\\n\\n# Long result\\n"}});
              }, 11000);
              jobs.set(input.requestId, {item,timer});
              return {...item};
            },
            status(input) {
              if (${JSON.stringify(mode)} === "crash") process.exit(1);
              return jobs.get(input.requestId).item;
            },
            stop(input) {
              const {item,timer} = jobs.get(input.requestId);
              if (${JSON.stringify(mode)} === "stop") { clearTimeout(timer); Object.assign(item,{state:"stopped",phase:"Stopped"}); }
              return item;
            }
          },
          status: () => ({available:true,message:"Ready",folders:[],decorations:[],accounts:[]}),
          dispose() { for (const {timer} of jobs.values()) clearTimeout(timer); }
        };
      }
    `);
    // Compose with an isolated settings path; K1 state remains in the service's PluginHost.
    let services: ReturnType<typeof createHostServices> | undefined;
    if (mode === "host-close") {
      const previous = process.env.LITZIO_PLUGINS_SETTINGS_FILE;
      try {
        process.env.LITZIO_PLUGINS_SETTINGS_FILE = path.join(root, "state.json");
        services = createHostServices(new RootAccess([root]));
      } finally {
        if (previous === undefined) delete process.env.LITZIO_PLUGINS_SETTINGS_FILE;
        else process.env.LITZIO_PLUGINS_SETTINGS_FILE = previous;
      }
      await services.plugins.start();
    }
    const host = services?.plugins.host ?? new PluginHost(path.join(root, "state.json"), { access: new RootAccess([root]) });
    try {
      writeFileSync(path.join(root, "input.txt"), "Original");
      await host.invoke("register", { directory });
      await host.invoke("trust", { id: "fixture.jobs", registrationId: (await host.list()).find(p => p.id === "fixture.jobs")!.registrationId });
      await host.invoke("enable", { id: "fixture.jobs" });
      const requestId = randomUUID();
      const input = { plugin: "fixture.jobs", job: "text", requestId, root, file: "input.txt", output: "result.md" };
      const started = Date.now();
      const accepted = await host.jobs.execute({ action: "job-start", ...input });
      assert.ok("job" in accepted);
      if (mode === "bad-start") {
        assert.equal(accepted.job.state, "uncertain");
        assert.equal(accepted.job.errorKind, "timeout");
        assert.match(accepted.job.error!, /K1 start must accept work and return running within 10 seconds/);
        assert.match(accepted.job.error!, /do not resend start/);
      } else {
        assert.equal(accepted.job.state, "running");
        assert.ok(Date.now() - started < 10_000, "admission returns within the RPC budget");
        await new Promise(resolve => setTimeout(resolve, 10_200));
        assert.equal(host.jobs.list().jobs[0]!.state, "running");
        assert.ok(host.jobs.list().jobs[0]!.elapsedMs > 10_000);
        if (mode === "reload" || mode === "disable") await host.invoke(mode, { id: "fixture.jobs" });
        if (mode === "host-close") {
          await Promise.all([services!.close(), services!.close()]);
          await services!.close();
          await assert.rejects(services!.plugins.invoke("pluginsList"), /closing/);
        }
        if (mode === "stop") await host.jobs.execute({ action: "job-stop", requestId });
        const deadline = Date.now() + 5_000;
        let snapshot;
        do {
          const result = await host.jobs.execute({ action: "job-status", requestId });
          assert.ok("job" in result); snapshot = result.job;
          if (snapshot.state !== "running") break;
          await new Promise(resolve => setTimeout(resolve, 100));
        } while (Date.now() < deadline);
        assert.equal(snapshot!.state, mode === "complete" ? "completed" : mode === "fail" ? "failed" : mode === "stop" ? "stopped" : "uncertain");
        if (["reload", "disable", "crash", "host-close"].includes(mode)) {
          assert.match(snapshot!.error!, /do not resend start/);
          assert.equal(snapshot!.errorKind, "unavailable");
          if (mode === "reload") {
            const again = await host.jobs.execute({ action: "job-status", requestId });
            assert.ok("job" in again); assert.deepEqual(again.job.error, snapshot!.error);
          }
        }
        if (mode === "fail") assert.equal(snapshot!.errorKind, "unavailable");
      }
      assert.equal(existsSync(path.join(root, "result.md")), mode === "complete");
      assert.equal(readFileSync(path.join(root, "input.txt"), "utf8"), "Original");
      await assert.rejects(host.jobs.execute({ action: "job-start", ...input }), /Duplicate requestId/);
    } finally { if (services) await services.close(); else await host.close(); rmSync(root, { recursive: true, force: true }); }
  })));
});

test("K1 snapshots preserve keys and redact only the publishing plugin's secret values", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-redaction-"));
  const values = new Map([["fixture.a", "phase"], ["fixture.b", "foreign-private"]]);
  const host = new PluginHost(path.join(root, "state.json"), {
    access: new RootAccess([root]),
    secrets: { supported: true, async read(id) { return values.get(id); }, async status(id) { return values.has(id); }, async set() {}, async delete() {} },
  });
  const stdout = process.stdout.write, stderr = process.stderr.write;
  try {
    writeFileSync(path.join(root, "input.txt"), "Original");
    for (const id of values.keys()) {
      const directory = path.join(root, id);
      cpSync(new URL("./fixtures/job-plugin", import.meta.url), directory, { recursive: true });
      const manifestFile = path.join(directory, "litzio-plugin.json");
      const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
      manifest.id = id;
      manifest.requiresSdk = ">=0.4.0 <1.0.0";
      manifest.secrets = [{ id: "pat", title: "Access token", scope: "connection", required: true }];
      for (const operation of manifest.contributes.operations) operation.outputSchema = {
        type: "object", required: ["state", "phase"], additionalProperties: false,
        properties: { state: { type: "string" }, phase: { type: "string" } },
      };
      writeFileSync(manifestFile, JSON.stringify(manifest));
      writeFileSync(path.join(directory, "host.js"), `export function activate() {
        return { operations: {
          start: () => ({state:"running",phase:"phase foreign-private"}),
          status: () => ({state:"running",phase:"phase foreign-private"}),
          stop: () => ({state:"stopped",phase:"phase foreign-private"})
        }, status: () => ({available:true,message:"Ready",folders:[],decorations:[],accounts:[]}), dispose() {} };
      }`);
      await host.invoke("register", { directory });
      await host.invoke("trust", { id, registrationId: (await host.list()).find(plugin => plugin.id === id)!.registrationId });
      await host.invoke("enable", { id });
    }
    for (const [plugin, expected] of [["fixture.a", "[secret] foreign-private"], ["fixture.b", "phase [secret]"]]) {
      const requestId = randomUUID();
      const start = await host.jobs.execute({ action: "job-start", plugin, job: "text", requestId, root, file: "input.txt", output: `${plugin}.md` });
      assert.ok("job" in start); assert.equal(start.job.phase, expected); assert.equal(start.job.state, "running");
      const status = await host.jobs.execute({ action: "job-status", requestId });
      assert.ok("job" in status); assert.equal(status.job.phase, expected); assert.equal(status.job.state, "running");
      const listed = await host.jobs.execute({ action: "job-list", plugin });
      assert.ok("jobs" in listed); assert.equal(listed.jobs[0]!.phase, expected); assert.equal(listed.jobs[0]!.plugin, plugin);
      const stop = await host.jobs.execute({ action: "job-stop", requestId });
      assert.ok("job" in stop); assert.equal(stop.job.phase, expected); assert.equal(stop.job.state, "stopped");
      assert.equal(host.jobs.list(plugin).jobs[0]!.phase, expected);
    }
    assert.equal(process.stdout.write, stdout);
    assert.equal(process.stderr.write, stderr);
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("public SDK authoring crosses the external plugin boundary and K1 official file creation", async context => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sdk-authoring-"));
  const directory = path.join(root, "artifact"); cpSync(new URL("./fixtures/job-plugin", import.meta.url), directory, { recursive: true });
  const manifestPath = path.join(directory, "litzio-plugin.json"), manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.contributes.operations.push({ id: "inspect", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } });
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(path.join(directory, "host.js"), `import { authorDocument } from '@litzio/plugin-sdk';
    import { writeFileSync, readFileSync } from 'node:fs';
    export function activate() { let authored, latest;  return { operations: {
      start: input => { latest = input; if(input.resultFile) writeFileSync(input.resultFile.path, 'partial'); return {state:'running',phase:'Accepted'}; },
      status: async input => { if(!input.resultFile && readFileSync(input.file,'utf8').startsWith('{')) return {state:'completed',phase:'Done',document:JSON.parse(readFileSync(input.file,'utf8'))}; if(input.resultFile) { const mode = readFileSync(input.file,'utf8'); if(['failed','uncertain','stopped'].includes(mode)) return {state:mode,phase:'Stopped'}; writeFileSync(input.resultFile.path, Buffer.from([0,255,128,1])); return {state:'completed',phase:'Done',file:{path:mode === 'wrong-path' ? input.file : input.resultFile.path}}; } authored = await authorDocument({inputs:[{key:'source-z',blocks:[{kind:'heading',level:1,text:'Imported'},{kind:'paragraph',text:'Literal *text*'}]},{key:'excluded',blocks:[]}]}); return {state:'completed',phase:'Done',document:{source:authored.source}}; },
      stop: () => ({state:'stopped',phase:'Stopped'}), inspect: input => input.staging ? latest.resultFile : authored,
    }, status: () => ({available:true,message:'Ready',folders:[],decorations:[],accounts:[]}), dispose() {} }; }`);
  const host = new PluginHost(path.join(root, "state.json"), { access: new RootAccess([root]) });
  try {
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: manifest.id, registrationId: (await host.list()).find(p => p.id === manifest.id)!.registrationId });
    await host.invoke("enable", { id: manifest.id });
    writeFileSync(path.join(root, "input.txt"), "Original input");
    const requestId = randomUUID();
    await host.invoke("job-start", { requestId, plugin: manifest.id, job: "text", root, file: "input.txt", output: "result.md" });
    const response = await host.jobs.execute({ action: "job-status", requestId });
    assert.ok("job" in response); assert.equal(response.job.state, "completed", JSON.stringify(response));
    const authored = (await host.invokeOperation(`${manifest.id}.inspect`, {})).result as any;
    const saved = readFileSync(response.job.result!.path, "utf8");
    const { parse, serialize, getEditableDocument } = await import("@litzio/core");
    assert.equal(saved, authored.source); assert.equal(serialize(parse(saved)), saved);
    assert.equal(response.job.result!.revision, authored.documentRevision);
    assert.deepEqual(authored.inputs[0].targets.map((target: any) => target.path), getEditableDocument(parse(saved)).blocks.map(block => block.path));
    assert.deepEqual(authored.inputs[1], { key: "excluded", targets: [] });
    assert.equal(readFileSync(path.join(root, "input.txt"), "utf8"), "Original input");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
    const imageDocument = { authoring: { inputs: [{ key: "picture", blocks: [{ kind: "figure", imageAsset: "image", imageAlt: "Picture", caption: "Imported picture", enumerator: "A.3" }] }] }, images: [{ key: "image", mime: "image/png", base64: png }] };
    const createImages = async (document = imageDocument, output = "images.md", beforeStatus?: () => void) => {
      writeFileSync(path.join(root, "input.txt"), JSON.stringify(document));
      const requestId = randomUUID();
      await host.invoke("job-start", { requestId, plugin: manifest.id, job: "text", root, file: "input.txt", output });
      beforeStatus?.();
      const reply = await host.jobs.execute({ action: "job-status", requestId });
      assert.ok("job" in reply); return reply.job;
    };
    const assets = path.join(root, "assets");
    const imageJob = await createImages();
    assert.equal(imageJob.state, "completed", JSON.stringify(imageJob));
    const imageSource = readFileSync(path.join(root, "images.md"), "utf8");
    assert.match(imageSource, /\.\/assets\/images-[a-f0-9]{64}-[a-f0-9]{64}\.png/);
    assert.match(imageSource, /:enumerator: A\.3/);
    assert.deepEqual(imageJob.result?.inputs, [{ key: "picture", targets: [{ path: getEditableDocument(parse(imageSource)).blocks[0].path, documentRevision: imageJob.result!.revision, documentHash: imageJob.result!.revision }] }]);
    const imageFiles = fs.readdirSync(assets);
    assert.equal(imageFiles.length, 1);
    assert.deepEqual(readFileSync(path.join(assets, imageFiles[0])), Buffer.from(png, "base64"));
    fs.unlinkSync(path.join(root, "images.md"));
    assert.equal((await createImages()).state, "completed");
    assert.deepEqual(fs.readdirSync(assets), imageFiles);
    // An existing explicit output is refused before admission, preserving both files.
    await assert.rejects(createImages(), { reason: { kind: "result_exists", path: "images.md" } });
    assert.equal(readFileSync(path.join(root, "images.md"), "utf8"), imageSource);
    assert.deepEqual(fs.readdirSync(assets), imageFiles);
    // A file created after admission still fails exclusive publication as uncertain,
    // without overwriting the document or removing already published/reused images.
    fs.unlinkSync(path.join(root, "images.md"));
    const raced = await createImages(imageDocument, "images.md", () => writeFileSync(path.join(root, "images.md"), imageSource));
    assert.equal(raced.state, "uncertain");
    assert.equal(readFileSync(path.join(root, "images.md"), "utf8"), imageSource);
    assert.deepEqual(fs.readdirSync(assets), imageFiles);
    assert.deepEqual(readFileSync(path.join(assets, imageFiles[0])), Buffer.from(png, "base64"));
    const badSemantic = structuredClone(imageDocument);
    badSemantic.authoring.inputs[0].blocks[0].enumerator = "bad\nnumber";
    assert.equal((await createImages(badSemantic, "failed.md")).state, "uncertain");
    assert.equal(existsSync(path.join(root, "failed.md")), false);
    const retained = fs.readdirSync(assets);
    assert.equal(retained.length, imageFiles.length + 1); // Failed authoring retains shareable images.
    for (const file of retained) assert.deepEqual(readFileSync(path.join(assets, file)), Buffer.from(png, "base64"));
    const invalidImage = structuredClone(imageDocument); invalidImage.images[0].base64 = Buffer.from("not a PNG").toString("base64");
    assert.equal((await createImages(invalidImage, "invalid.md")).state, "uncertain");
    assert.equal(existsSync(path.join(root, "invalid.md")), false);
    assert.deepEqual(fs.readdirSync(assets), retained); // Invalid bytes publish nothing.
    const { createAuthoredDocumentFile } = await import("../server/document-authoring.ts");
    const concurrent = path.join(root, "concurrent.md");
    const outcomes = await Promise.allSettled([
      createAuthoredDocumentFile(concurrent, badSemantic, new RootAccess([root])),
      createAuthoredDocumentFile(concurrent, imageDocument, new RootAccess([root])),
    ]);
    assert.equal(outcomes[0].status, "rejected"); assert.equal(outcomes[1].status, "fulfilled");
    const concurrentFigure = getEditableDocument(parse(readFileSync(concurrent, "utf8"))).blocks.find(block => block.block === "figure");
    assert.ok(concurrentFigure?.block === "figure");
    assert.deepEqual(readFileSync(path.join(root, concurrentFigure.imageUrl)), Buffer.from(png, "base64"));
    const startFile = async (mode: string, output?: string) => {
      const requestId = randomUUID();
      writeFileSync(path.join(root, "input.txt"), mode);
      await host.invoke("job-start", { requestId, plugin: manifest.id, job: "file", root, file: "input.txt", ...(output ? { output } : {}) });
      const staging = (await host.invokeOperation(`${manifest.id}.inspect`, { staging: true })).result as { path: string; maxBytes: number };
      assert.equal(staging.maxBytes, JOB_FILE_MAX_BYTES);
      assert.equal(readFileSync(staging.path, "utf8"), "partial");
      return { requestId, staging };
    };
    const complete = await startFile("success");
    const [a, b] = await Promise.all(["job-status", "job-status"].map(action => host.jobs.execute({ action, requestId: complete.requestId })));
    for (const reply of [a, b]) {
      assert.ok("job" in reply); assert.equal(reply.job.state, "completed");
      assert.equal(reply.job.result!.kind, "file");
      assert.equal(reply.job.result!.path, path.join(root, "input.bin"));
      assert.deepEqual(readFileSync(reply.job.result!.path), Buffer.from([0,255,128,1]));
    }
    assert.equal(existsSync(path.dirname(complete.staging.path)), false);
    const collision = await startFile("success");
    const refused = await host.jobs.execute({ action: "job-status", requestId: collision.requestId });
    assert.ok("job" in refused); assert.equal(refused.job.state, "completed");
    assert.equal(refused.job.output, "input-2.bin");
    assert.deepEqual(readFileSync(path.join(root, "input.bin")), Buffer.from([0,255,128,1]));
    assert.equal(existsSync(path.dirname(collision.staging.path)), false);
    for (const output of ["bad.md", "../outside.bin"]) await assert.rejects(startFile("success", output));
    for (const mode of ["failed", "uncertain", "stopped", "wrong-path", "oversize", "stop", "lost"]) {
      const output = `${mode}.bin`, run = await startFile(mode, output);
      if (mode === "oversize") {
        const open = fs.promises.open.bind(fs.promises);
        context.mock.method(fs.promises, "open", async (...args: Parameters<typeof fs.promises.open>) => {
          const handle = await open(...args);
          if (args[0] === run.staging.path) {
            const stat = handle.stat.bind(handle);
            handle.stat = (async () => ({ ...await stat(), size: JOB_FILE_MAX_BYTES + 1, isFile: () => true })) as typeof handle.stat;
          }
          return handle;
        });
      }
      let result;
      try {
        if (mode === "lost") host.jobs.lost(manifest.id);
        result = await host.jobs.execute({ action: mode === "stop" ? "job-stop" : "job-status", requestId: run.requestId });
      } finally { context.mock.restoreAll(); }
      assert.ok("job" in result);
      assert.equal(result.job.state, ["failed", "stopped"].includes(mode) ? mode : mode === "stop" ? "stopped" : "uncertain");
      assert.equal(existsSync(path.join(root, output)), false);
      assert.equal(existsSync(path.dirname(run.staging.path)), false);
      await assert.rejects(host.invoke("job-start", { requestId: run.requestId, plugin: manifest.id, job: "file", root, file: "input.txt" }), /Duplicate requestId/);
    }

  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});

test("K1 observations retain a stop acknowledgement after an older poll succeeds or fails", async () => {
  for (const lost of [false, true]) {
    const observations = new JobObservations();
    let snapshot = { state: "running", stopRequested: false };
    const pending = Promise.withResolvers<typeof snapshot>();
    const older = observations.observe("job-a", "poll", () => pending.promise,
      value => { snapshot = value; }, () => { snapshot = { ...snapshot, state: "uncertain" }; });
    const stop = Promise.withResolvers<typeof snapshot>();
    const action = observations.observe("job-a", "action", () => stop.promise,
      value => { snapshot = value; }, error => { throw error; });
    let polled = false;
    await observations.observe("job-a", "poll", async () => { polled = true; return snapshot; }, value => { snapshot = value; }, error => { throw error; });
    assert.equal(polled, false, "a poll cannot supersede an in-flight stop");
    stop.resolve({ state: "running", stopRequested: true }); await action;
    assert.equal(snapshot.stopRequested, true);
    if (lost) pending.reject(new Error("older observation lost"));
    else pending.resolve({ state: "running", stopRequested: false });
    await older;
    assert.deepEqual(snapshot, { state: "running", stopRequested: true });
    await observations.observe("job-a", "poll", async () => ({ state: "stopped", stopRequested: true }), value => { snapshot = value; }, error => { throw error; });
    assert.equal(snapshot.state, "stopped", "fresh observations resume after the acknowledgement");
  }
});
