import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { PLUGIN_ERROR_MESSAGES } from "@litzio/plugin-sdk";
import { RootAccess } from "../server/file-access.ts";

const safeWriteAdvice = " Check the target before retrying a write. Query the same requestId; do not resend start.";

test("K1 lifecycle, exclusive request identity, Root admission, publication and disable cleanup", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "litzio-job-"));
  const directory = path.join(root, "artifact"); cpSync(new URL("./fixtures/job-plugin", import.meta.url), directory, { recursive: true });
  const host = new PluginHost(path.join(root, "state.json"), { access: new RootAccess([root]) });
  try {
    await host.invoke("register", { directory });
    await host.invoke("trust", { id: "fixture.jobs", digest: (await host.list())[0]!.digest });
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
    const input = await start("# Imported\n\nOriginal text.\n");
    const sameId = { ...input, requestId: randomUUID(), output: "concurrent.md" };
    const simultaneous = await Promise.allSettled([host.invoke("job-start", sameId), host.invoke("job-start", sameId)]);
    assert.equal(simultaneous.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(simultaneous.filter(result => result.status === "rejected").length, 1);
    await host.jobs.execute({ action: "job-stop", requestId: sameId.requestId });
    await wait(sameId.requestId, "stopped");
    const listing = host.jobs.list("fixture.jobs");
    assert.equal(listing.jobs.filter(job => job.requestId === input.requestId).length, 1);
    assert.ok(listing.jobs[0]!.elapsedMs >= 0);
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
    const stopped = await start("# Stop"); const acknowledgement = await host.jobs.execute({ action: "job-stop", requestId: stopped.requestId });
    assert.ok("job" in acknowledgement);
    assert.equal(acknowledgement.job!.stopRequested, true); assert.equal(acknowledgement.job!.state, "running");
    await wait(stopped.requestId, "stopped"); assert.equal(existsSync(path.join(root, stopped.output)), false);
    await assert.rejects(host.invoke("job-start", { ...input, requestId: randomUUID(), file: "../outside.txt" }));
    await assert.rejects(host.invoke("job-start", { ...input, requestId: randomUUID(), output: "../outside.md" }));
    const collision = await start("# Collision"); writeFileSync(path.join(root, collision.output), "keep");
    await wait(collision.requestId, "uncertain"); assert.equal(readFileSync(path.join(root, collision.output), "utf8"), "keep");
    const pending = await start("# Disable"); await host.invoke("disable", { id: "fixture.jobs" });
    assert.equal(existsSync(path.join(root, pending.output)), false);
    await host.invoke("enable", { id: "fixture.jobs" });
    await host.invoke("reload", { id: "fixture.jobs" });
    const interrupted = await start("# Restart while active");
    await host.close();
    const restarted = new PluginHost(path.join(root, "state.json"), { access: new RootAccess([root]) });
    try {
      await restarted.start();
      assert.equal(restarted.jobs.list("fixture.jobs").jobs.length, 0);
      await assert.rejects(restarted.jobs.execute({ action: "job-status", requestId: interrupted.requestId }), /Unknown requestId/);
      assert.equal(existsSync(path.join(root, interrupted.output)), false);
    } finally { await restarted.close(); }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
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
    await host.invoke('trust',{id:'fixture.jobs',digest:(await host.list())[0]!.digest});
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
