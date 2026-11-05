import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { PluginHost } from "../server/plugins/plugin-host.ts";
import { RootAccess } from "../server/file-access.ts";

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
    const failed = await start("FAIL"); await wait(failed.requestId, "failed"); assert.equal(existsSync(path.join(root, failed.output)), false);
    const uncertain = await start("UNCERTAIN"); await wait(uncertain.requestId, "uncertain");
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
    await host.close();
    const restarted = new PluginHost(path.join(root, "state.json"), new RootAccess([root]));
    try {
      assert.equal(restarted.jobs.list("fixture.jobs").jobs.length, 0);
      await assert.rejects(restarted.jobs.execute({ action: "job-status", requestId: pending.requestId }), /Unknown requestId/);
      assert.equal(existsSync(path.join(root, pending.output)), false);
    } finally { await restarted.close(); }
  } finally { await host.close(); rmSync(root, { recursive: true, force: true }); }
});
