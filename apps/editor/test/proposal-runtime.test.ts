import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { buildAiAgent } from "../../../packages/cli/scripts/build-ai-agent.ts";
import { digest, PluginStore } from "../server/plugin-store.ts";
import type { ProposalInput } from "../server/proposal-runtime.ts";

const root = mkdtempSync(path.join(tmpdir(), "litzio-proposal-tests-"));
const bundle = path.join(root, "bundle");
before(() => buildAiAgent(bundle));
after(() => rmSync(root, { recursive: true, force: true }));
const input = (): ProposalInput => ({ id: randomUUID(), source: "---\nlitzio: 1\n---\n\nOriginal paragraph.\n", index: 0, instruction: "fixture:delay", adapter: "fake" });
async function done(store: PluginStore, id: string) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = store.getProposal(id)!;
    if (value.status !== "running") return value;
    await delay(20);
  }
  throw new Error("Proposal never completed.");
}

test("headless proposals share UUIDs across Hosts, drain after disable, and never replay", async () => {
  const directory = path.join(root, "shared");
  const first = new PluginStore(directory), second = new PluginStore(directory);
  try {
    first.register(path.join(bundle, "manifest.json"));
    const request = input(); request.id = request.id.toUpperCase();
    const admitted = await first.proposals.start(request);
    assert.equal(admitted.id, request.id.toLowerCase());
    assert.equal((await second.proposals.start(request)).id, admitted.id);
    await assert.rejects(second.proposals.start({ ...request, instruction: "conflict" }), /conflicts/);
    first.unregister("ai-agent");
    await assert.rejects(second.proposals.start(input()), /not registered/);
    const completed = await done(second, request.id);
    assert.equal(completed.status, "success");
    assert.match(completed.result!.after, /A clearer proposal/);
    assert.match(completed.result!.before, /Original paragraph/);
    assert.deepEqual(await second.proposals.start(request), completed, "same UUID reads its original result after disable");
  } finally { await first.proposals.close(); await second.proposals.close(); first.close(); second.close(); }
});

test("an interrupted proposal is uncertain even in the identical live PID and is never replayed", async () => {
  const directory = path.join(root, "interrupted"), first = new PluginStore(directory);
  const request = input();
  first.register(path.join(bundle, "manifest.json"));
  const fingerprint = digest(JSON.stringify({ source: request.source, index: request.index, instruction: request.instruction, adapter: request.adapter }));
  first.admitProposal(request.id, fingerprint);
  first.close();
  const second = new PluginStore(directory);
  try {
    const receipt = second.getProposal(request.id)!;
    assert.equal(receipt.status, "uncertain");
    assert.equal(receipt.result, undefined);
    assert.deepEqual(await second.proposals.start(request), receipt);
  } finally { await second.proposals.close(); second.close(); }
});

test("Host shutdown waits for the actual worker exit and records no partial proposal", async () => {
  const store = new PluginStore(path.join(root, "close"));
  try {
    store.register(path.join(bundle, "manifest.json"));
    const request = { ...input(), instruction: "fixture:timeout" };
    await store.proposals.start(request);
    await delay(100);
    await store.proposals.close();
    const receipt = store.getProposal(request.id)!;
    assert.equal(receipt.status, "error");
    assert.match(receipt.error!, /Host closed/);
    assert.equal(receipt.result, undefined);
    await assert.rejects(store.proposals.start(input()), /closing/);
  } finally { await store.proposals.close(); store.close(); }
});
