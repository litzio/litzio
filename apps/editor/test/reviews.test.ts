import { REVIEW_UNAVAILABLE_GUIDANCE } from "../shared/review.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { parse, serialize } from "@litzio/core";
import { textRevision } from "@litzio/file-commit";
import { createReviewAdapter } from "../src/views/review-api.ts";
import { createHostClient } from "../src/host-client.ts";
import { reviewViewSchema } from "@litzio/core/views-v2";
import { PluginReviews } from "../server/plugins/reviews.ts";
import { RootAccess } from "../server/file-access.ts";
import { nativeSource } from "./helpers/document.ts";
import { startHttpHost } from "../server/http-host.ts";
import { startFetchServer } from "../../../test/helpers/fetch-server.ts";
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const declaration = { id: "text", title: "Text review", ...Object.fromEntries(["read", "propose", "approve", "reject", "undo"].map(action => [action, { operation: action, version: 1 }])) } as any;
test("review baseline, Root/Host/generation, serialized writes, conflict and no replay", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "review-")), file = path.join(root, "doc.md"), source = path.join(root, "source.txt");
  try {
    const original = serialize(parse(nativeSource("Original.\n"))); writeFileSync(file, original); writeFileSync(source, "input");
    const revision = textRevision(original), sourceHash = createHash("sha256").update("input").digest("hex");
    const data = { review: "text", bundle: { generation: "g1", documentRevision: revision, documentHash: revision, sourceRevision: sourceHash }, pages: [{ generation: "g1", sourceRevision: sourceHash, pageNo: 1, width: 10, height: 10, unit: "px", origin: "TOPLEFT", regions: [] }], images: [{ ref: "image-1", path: "page.png", revision: "placeholder" }] };
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    writeFileSync(path.join(root, "page.png"), png); data.images[0]!.revision = createHash("sha256").update(png).digest("hex");
    Object.assign(data.pages[0]!, { imageRef: "image-1" });
    Object.assign(data.bundle, { mappingRevision: "map1" });
    Object.assign(data, { mapping: { generation: "g1", documentRevision: revision, documentHash: revision, sourceRevision: sourceHash, mappingRevision: "map1", entries: [] } });
    let calls = 0, lose = false;
    let approvalOverride: { kind: string; path: number[]; from: string; to: string } | undefined;
    let gate: Promise<void> | undefined, began: (() => void) | undefined;
    const reviews = new PluginReviews(new RootAccess([root]), () => declaration, async (name, input: any) => {
      calls++; began?.(); if (gate) await gate; if (lose) throw new Error("private-service-body");
      if (name.endsWith("approve") && approvalOverride) { input.proposal.after.text = approvalOverride.to; input.proposal.targets[0].path = approvalOverride.path; return { result: approvalOverride }; }
      return { result: name.endsWith("propose") ? { id: randomUUID(), kind: "text", targets: [{ path: [1], documentRevision: input.baseline.documentRevision, documentHash: input.baseline.documentRevision }], evidence: ["fixture"], before: { type: "plain", text: "Original." }, after: { type: "plain", text: "Changed." }, baseline: input.baseline, state: "pending", actions: [{ action: "approve", allowed: true }, { action: "reject", allowed: true }] } : { kind: "text", path: [1], from: "Original.", to: "Changed." } };
    });
    const bundle = reviews.publish("fixture", root, file, source, data);
    const base = { plugin: "fixture", review: "text", root, bundleRef: bundle.bundleRef, generation: "g1" };
    assert.throws(() => reviews.publish("fixture", root, file, source, { ...data, images: [{ ...data.images[0], path: "../outside.png" }] }));
    const image = await reviews.execute({ ...base, action: "read", kind: "image", pageNo: 1 }); assert.equal(image.data.width, 1);
    const read = () => reviews.execute({ ...base, action: "read", kind: "proposals" });
    const mutate = async (action: string, proposalId?: string) => reviews.execute({ ...base, action, proposalId, requestId: randomUUID(), baseline: (await read()).baseline });
    await assert.rejects(reviews.execute({ ...base, action: "read", root: os.tmpdir() }));
    await assert.rejects(reviews.execute({ ...base, action: "read", generation: "g2" }));
    const other = new PluginReviews(new RootAccess([root]), () => declaration, async () => ({}));
    await assert.rejects(other.execute({ ...base, action: "read" }));
    assert.equal((await other.execute({ ...base, action: "status", requestId: randomUUID() })).state, "unknown");
    assert.throws(() => reviews.publish("fixture", root, file, source, { ...data, pages: [{ ...data.pages[0], generation: "g2" }] }));
    await assert.rejects(reviews.execute({ ...base, action: "propose", requestId: randomUUID(), baseline: { ...(await read()).baseline, mappingRevision: "other-map" } }), /conflict/);
    assert.throws(() => reviews.publish("fixture", root, file, source, { ...data, mapping: { ...(data as any).mapping, generation: "g2" } }));
    const proposed = await mutate("propose"); let id = proposed.proposals[0].id;
    assert.equal(readFileSync(file, "utf8"), original);
    const assertActionSnapshot = (snapshot: any, proposalId: string, action: string) => {
      const proposal = snapshot.proposals.find((p: any) => p.id === proposalId);
      assert.deepEqual(proposal.baseline, snapshot.baseline, "V5 baseline equality for the returned snapshot");
      assert.ok(proposal.actions.some((a: any) => a.action === action && a.allowed));
      for (const target of proposal.targets) {
        assert.equal(target.documentRevision, snapshot.baseline.documentRevision);
        assert.equal(target.documentHash, textRevision(readFileSync(file, "utf8")), "V5 target hash matches the actual Read snapshot");
      }
    };
    assertActionSnapshot(proposed, id, "approve"); assertActionSnapshot(proposed, id, "reject");
    for (const mismatch of [{ to: "Other." }, { from: "Original" }, { path: [2] }]) {
      id = (await mutate("propose")).proposals.at(-1).id;
      approvalOverride = { kind: "text", path: [1], from: "Original.", to: "Changed.", ...mismatch };
      const refused = await mutate("approve", id);
      assert.equal(refused.receipt.outcome, "uncertain"); assert.equal(readFileSync(file, "utf8"), original, "An approval cannot replace the reviewed content or target");
      const observed = await read();
      assert.deepEqual(observed.data.find((p: any) => p.id === id).before, { type: "plain", text: "Original." });
      assert.deepEqual(observed.data.find((p: any) => p.id === id).after, { type: "plain", text: "Changed." });
    }
    approvalOverride = undefined;
    id = (await mutate("propose")).proposals.at(-1).id;
    const approved = await mutate("approve", id); assert.equal(approved.receipt.outcome, "success"); assert.match(readFileSync(file, "utf8"), /Changed/);
    assertActionSnapshot(approved, id, "undo");
    const undone = await mutate("undo", id); assert.equal(undone.receipt.outcome, "success"); assert.equal(readFileSync(file, "utf8"), original);
    const p2 = await mutate("propose");
    const p3 = await mutate("propose");
    for (const p of p3.proposals.filter((p: any) => p.state === "pending" && p.actions.some((a: any) => a.allowed))) { assertActionSnapshot(p3, p.id, "approve"); assertActionSnapshot(p3, p.id, "reject"); }
    const rejected = await mutate("reject", p3.proposals.at(-1).id); assert.equal(rejected.receipt.outcome, "success"); assert.equal(readFileSync(file, "utf8"), original);
    assertActionSnapshot(rejected, p2.proposals.at(-1).id, "approve");
    const request = { ...base, action: "propose", requestId: randomUUID(), baseline: (await read()).baseline }; lose = true;
    const uncertain = await reviews.execute(request); const count = calls;
    assert.equal(uncertain.receipt.outcome, "uncertain"); assert.ok(!JSON.stringify(uncertain).includes("private-service-body"));
    assert.deepEqual(await reviews.execute({ ...base, action: "status", requestId: request.requestId }), uncertain);
    await assert.rejects(reviews.execute(request), /Duplicate/); assert.equal(calls, count);
    assert.equal((await reviews.execute({ ...base, action: "status", requestId: randomUUID() })).state, "unknown");
    lose = false;
    const baseline = (await read()).baseline;
    let release!: () => void; gate = new Promise(resolve => release = resolve);
    const entered = new Promise<void>(resolve => began = resolve);
    const flight = reviews.execute({ ...base, action: "propose", requestId: randomUUID(), baseline }); await entered;
    await assert.rejects(reviews.execute({ ...base, action: "propose", requestId: randomUUID(), baseline }), /in progress/);
    writeFileSync(file, original + "External\n"); release();
    assert.equal((await flight).receipt.outcome, "uncertain");
    assert.equal(readFileSync(file, "utf8"), original + "External\n");
    assert.equal((await read()).state, "stale"); await assert.rejects(mutate("propose"), /stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Host admits only one concurrent change per proposal and retains the winning request ID", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "review-flight-")), file = path.join(root, "doc.md"), source = path.join(root, "input.txt");
  try {
    const original = serialize(parse(nativeSource("Original.\n"))), revision = textRevision(original);
    writeFileSync(file, original); writeFileSync(source, "input");
    const sourceRevision = createHash("sha256").update("input").digest("hex");
    let release!: () => void, entered!: () => void, approvals = 0;
    const gate = new Promise<void>(resolve => release = resolve), started = new Promise<void>(resolve => entered = resolve);
    const reviews = new PluginReviews(new RootAccess([root]), () => declaration, async (operation, input: any) => {
      if (operation === "propose") return { result: { id: "p1", kind: "text", targets: [{ path: [1], documentRevision: revision, documentHash: revision }], evidence: [], before: { type: "plain", text: "Original." }, after: { type: "plain", text: "Changed." }, state: "pending", baseline: input.baseline, actions: [{ action: "approve", allowed: true }, { action: "reject", allowed: true }] } };
      approvals++; entered(); await gate;
      return { result: { kind: "text", path: [1], from: "Original.", to: "Changed." } };
    });
    const bundle = reviews.publish("fixture", root, file, source, { review: "text", bundle: { generation: "g1", documentRevision: revision, documentHash: revision, sourceRevision }, pages: [], images: [] });
    const base = { plugin: "fixture", review: "text", root, bundleRef: bundle.bundleRef };
    const initial = await reviews.execute({ ...base, action: "read", kind: "snapshot" });
    const proposed = await reviews.execute({ ...base, action: "propose", requestId: randomUUID(), baseline: initial.snapshot.baseline });
    const requestId = randomUUID(), input = { ...base, action: "approve", proposalId: "p1", baseline: proposed.baseline, requestId };
    const first = reviews.execute(input); await started;
    const second = await reviews.execute({ ...input, requestId: randomUUID() });
    assert.equal(second.code, "confirmation-required"); assert.equal(second.pending.requestId, requestId);
    const during = await reviews.execute({ ...base, action: "read", kind: "snapshot" });
    assert.equal(during.snapshot.unresolved[0].requestId, requestId);
    assert.equal(during.snapshot.unresolved[0].verification, "pending");
    assert.equal((await reviews.execute({ ...base, action: "status", requestId })).verification, "pending");
    assert.ok(during.snapshot.proposals[0].actions.every((a: any) => !a.allowed));
    release(); const completed = await first;
    assert.equal(completed.receipt.outcome, "success"); assert.equal(approvals, 1);
    assert.match(readFileSync(file, "utf8"), /Changed/);
    const after = await reviews.execute({ ...base, action: "read", kind: "snapshot" });
    assert.deepEqual(after.snapshot.unresolved, []);
    await assert.rejects(reviews.execute({ ...input, requestId: randomUUID(), baseline: after.snapshot.baseline }), /unavailable/);
    const restarted = new PluginReviews(new RootAccess([root]), () => declaration, async () => ({}));
    const unknown = await restarted.execute({ ...base, action: "status", requestId });
    assert.equal(unknown.state, "unknown"); assert.equal(unknown.verification, "unavailable");
    assert.equal(unknown.guidance, REVIEW_UNAVAILABLE_GUIDANCE);
    await assert.rejects(restarted.execute({ ...input, requestId: randomUUID() }), /unavailable/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("K1 completed review bundle through product HTTP and CLI approval/rejection/Undo", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "review-http-")), previous = process.env.LITZIO_DATA_DIR;
  process.env.LITZIO_DATA_DIR = root;
  const oldSettings = process.env.LITZIO_PLUGINS_SETTINGS_FILE; process.env.LITZIO_PLUGINS_SETTINGS_FILE = path.join(root, "plugins.json");
  let host: Awaited<ReturnType<typeof startHttpHost>> | undefined;
  try {
    const source = serialize(parse(nativeSource("Original.\n"))), revision = textRevision(source);
    writeFileSync(path.join(root, "input.txt"), "input");
    const sourceHash = createHash("sha256").update("input").digest("hex");
    const review = { review: "text", bundle: { generation: "g1", documentRevision: revision, documentHash: revision, sourceRevision: sourceHash }, pages: [], images: [] };
    const artifact = path.join(root, "artifact"); mkdirSync(artifact);
    writeFileSync(path.join(artifact, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
    const operations = ["start", "status", "stop", "read", "propose", "approve", "reject", "undo"].map(id => ({ id, version: 1, effect: ["status", "read"].includes(id) ? "read" : "write", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "object" } }));
    writeFileSync(path.join(artifact, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id: "fixture.review", name: "Review fixture", tier: "community", publisher: { id: "fixture", name: "Fixture" }, version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations, reviews: [{ ...declaration, ...Object.fromEntries(["read", "propose", "approve", "reject", "undo"].map(action => [action, { operation: `fixture.review.${action}`, version: 1 }])) }], jobs: [{ id: "text", title: "Import", accept: [".txt"], start: "start", status: "status", stop: "stop", resultKind: "native-document" }] } }));
    writeFileSync(path.join(artifact, "host.js"), `export function activate() { const completed = ${JSON.stringify({ state: "completed", phase: "Done", document: { source }, review })}; return { operations: { start: async () => ({state:"running",phase:"Accepted"}), status: async () => completed, stop: async () => ({state:"stopped",phase:"Stopped"}), read: async () => ({}), propose: async input => ({ id: input.requestId, kind: 'text', targets: [{path:[1],documentRevision:input.baseline.documentRevision,documentHash:input.baseline.documentRevision}], evidence:['fixture'],before:{type:'plain',text:'Original.'},after:{type:'plain',text:'Changed.'},baseline:input.baseline,state:'pending',actions:[{action:'approve',allowed:true},{action:'reject',allowed:true}] }), approve: async input => { if(input.input?.uncertain) throw Error('Observation lost'); return {kind:'text',path:[1],from:'Original.',to:'Changed.'}; }, reject: async () => ({}), undo: async () => ({}) }, status: async () => ({available:true,message:"Fixture",folders:[],decorations:[],accounts:[]}), dispose: async () => {} }; }`);
    writeFileSync(path.join(root, "index.html"), "<html></html>");
    host = await startFetchServer(() => startHttpHost({ port: 0, roots: [root], editorDir: root, daemon: { health: { pid: process.pid, startedAt: new Date().toISOString(), instanceId: randomUUID(), processStartedAt: new Date().toISOString(), daemonHome: root, executable: process.execPath, roots: [root], nonLoopback: false, launcher: "cli-run", productVersion: "0.0.0", protocolVersion: DAEMON_PROTOCOL }, stop() {} } }));
    const address = host.server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`;
    const send = async (endpoint: string, body: any) => {
      const response = await fetch(origin + endpoint, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
      const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); return value;
    };
    await send("/api/plugins", { action: "register", directory: artifact });
    const listing = await send("/api/plugins", { action: "list" });
    await send("/api/plugins", { action: "trust", id: "fixture.review", digest: listing.plugins.find((p: any) => p.id === "fixture.review").digest });
    await send("/api/plugins", { action: "enable", id: "fixture.review" });
    const requestId = randomUUID(); const admitted = await send("/api/plugins", { action: "job-start", plugin: "fixture.review", job: "text", root, file: "input.txt", output: "doc.md", requestId });
    assert.equal(admitted.job.state, "running"); assert.equal(admitted.job.result, undefined);
    let job: any;
    for (let i = 0; i < 100; i++) { job = (await send("/api/plugins", { action: "job-status", requestId })).job; if (job.state === "completed") break; await new Promise(r => setTimeout(r, 20)); }
    assert.equal(job.state, "completed", JSON.stringify(job)); assert.ok(job.result.bundle);
    const base = { plugin: "fixture.review", review: "text", root, bundleRef: job.result.bundle.bundleRef, generation: "g1" };
    const read = () => send("/api/reviews", { ...base, action: "read", kind: "proposals" });
    const definition = { kind: "litzio-view", schemaVersion: 2, catalog: "litzio-v2", profile: "review", title: "Review", refresh: "manual",
      sources: { review: { plugin: base.plugin, review: base.review, bundleRef: base.bundleRef } },
      layout: { component: "VerticalPanel", children: [{ component: "ReviewDetail", title: "Change", source: "review" }] } };
    for (const action of ["validate", "propose"]) {
      const proposedView = await send("/api/views", { action, view: definition });
      assert.equal(proposedView.receipt.outcome, "success"); assert.equal(proposedView.view.profile, "review");
    }
    assert.equal((await read()).data.length, 0, "View proposals do not submit document changes");
    const client = createHostClient(origin);
    let loseResponse = false, statusOverride: string | undefined;
    const requests: any[] = [];
    const observation = {};
    const faultClient = { ...client, request: async (endpoint: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)); requests.push(body);
      if (body.action === "status" && statusOverride) return new Response(JSON.stringify({ state: statusOverride, verification: "pending", receipt: { requestId: body.requestId, outcome: statusOverride } }));
      const response = await client.request(endpoint, { ...init, headers: { ...init?.headers, Origin: origin } });
      if (loseResponse && ["approve", "reject", "undo"].includes(body.action)) { await response.arrayBuffer(); throw new Error("Lost write response"); }
      return response;
    } };
    const adapter = createReviewAdapter(faultClient, reviewViewSchema.parse(definition), root, new AbortController().signal, () => {}, observation);
    const snapshotRead = async () => ({ snapshot: await adapter.read(1) });
    const initial = (await snapshotRead()).snapshot;
    assert.equal(initial.page, undefined); assert.equal(initial.pageCount, 0);
    assert.equal(initial.documentPath, path.join(root, "doc.md")); assert.equal(initial.documentRevision, revision);
    const invalidView = await fetch(origin + "/api/views", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ action: "propose", view: { ...definition, sources: { review: { ...definition.sources.review, bundleRef: "other-host" } } } }) });
    assert.equal(invalidView.status, 400); await invalidView.arrayBuffer();

    const cli = async (action: string, proposalId?: string, expectedCode = 0, observedRequestId?: string) => {
      const inputFile = path.join(root, "request.json"); writeFileSync(inputFile, JSON.stringify({ bundleRef: base.bundleRef, generation: "g1", proposalId, baseline: (await read()).baseline, requestId: observedRequestId ?? randomUUID() }));
      const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../../packages/cli/src/cli.ts", import.meta.url)), "review", action, base.plugin, base.review, "--input", inputFile, "--root", root, "--host", origin, "--json"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      let stdout = "", stderr = ""; child.stdout.on("data", b => stdout += b); child.stderr.on("data", b => stderr += b);
      const code = await new Promise(resolve => child.once("exit", resolve)); assert.equal(code, expectedCode, stdout + stderr); return JSON.parse(stdout);
    };
    const p = await cli("propose"), id = p.proposals[0].id;
    const approve = await cli("approve", id); assert.equal(approve.receipt.outcome, "success"); assert.match(readFileSync(path.join(root, "doc.md"), "utf8"), /Changed/);
    const appliedSnapshot = (await snapshotRead()).snapshot;
    assert.equal(appliedSnapshot.mapping, undefined);
    assert.deepEqual(appliedSnapshot.proposals[0].baseline, appliedSnapshot.baseline);
    assert.equal(appliedSnapshot.proposals[0].targets[0].documentHash, appliedSnapshot.documentHash);
    const undo = await cli("undo", id); assert.equal(undo.receipt.outcome, "success"); assert.equal(readFileSync(path.join(root, "doc.md"), "utf8"), source);
    const p2 = await cli("propose"); const rejected = await cli("reject", p2.proposals.at(-1).id); assert.equal(rejected.proposals.at(-1).state, "rejected"); assert.equal(readFileSync(path.join(root, "doc.md"), "utf8"), source);
    assert.equal((await read()).data.at(-1).state, "rejected");
    const fresh = await send("/api/reviews", { ...base, action: "propose", requestId: randomUUID(), baseline: (await read()).baseline });
    const freshId = fresh.proposals.at(-1).id;
    const lostRequest = { ...base, action: "approve", proposalId: freshId, requestId: randomUUID(), baseline: (await read()).baseline };
    // Discard the successful response: the caller must observe status rather than replay.
    const lost = await fetch(origin + "/api/reviews", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(lostRequest) });
    await lost.arrayBuffer();
    const observed = await send("/api/reviews", { ...base, action: "status", requestId: lostRequest.requestId });
    assert.equal(observed.receipt.outcome, "success"); assert.equal(observed.proposals.at(-1).state, "approved");
    const replay = await fetch(origin + "/api/reviews", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(lostRequest) });
    assert.equal(replay.status, 400); await replay.arrayBuffer();
    const beforeUndo = await adapter.read(1);
    await adapter.act("undo", beforeUndo.proposals.find(p => p.id === freshId)!, beforeUndo.baseline);
    assert.equal((await adapter.read(1)).proposals.at(-1)!.state, "rejected");
    // Lost responses for all screen writes retain one ID, including across adapter recreation.
    const recover = async (action: "approve" | "reject" | "undo", proposalId: string) => {
      const current = await adapter.read(1), writesBefore = requests.filter(r => ["approve", "reject", "undo"].includes(r.action)).length;
      loseResponse = true;
      await assert.rejects(adapter.act(action, current.proposals.find(p => p.id === proposalId)!, current.baseline));
      const requestId = adapter.pending!.requestId;
      const reattached = createReviewAdapter(faultClient, reviewViewSchema.parse(definition), root, new AbortController().signal, () => {}, observation);
      for (const outcome of ["uncertain", "uncertain"]) {
        statusOverride = outcome;
        await assert.rejects(reattached.read(1));
        assert.equal(reattached.pending!.requestId, requestId); assert.equal(reattached.pending!.receipt!.outcome, outcome);
        await assert.rejects(reattached.act(action, current.proposals.find(p => p.id === proposalId)!, current.baseline));
      }
      loseResponse = false; statusOverride = undefined;
      const recovered = await reattached.read(1);
      assert.equal(reattached.pending, undefined);
      assert.equal(requests.filter(r => ["approve", "reject", "undo"].includes(r.action)).length, writesBefore + 1);
      assert.ok(requests.filter(r => r.action === "status").slice(-3).every(r => r.requestId === requestId));
      return recovered;
    };
    const nextProposal = async () => (await send("/api/reviews", { ...base, action: "propose", requestId: randomUUID(), baseline: (await read()).baseline })).proposals.at(-1).id;
    const recoverId = await nextProposal();
    assert.equal((await recover("approve", recoverId)).proposals.at(-1)!.state, "approved");
    await recover("undo", recoverId);
    await recover("reject", await nextProposal());
    const uncertainProposal = await nextProposal(), uncertainRequest = randomUUID();
    const unconfirmed = await send("/api/reviews", { ...base, action: "approve", proposalId: uncertainProposal, requestId: uncertainRequest, baseline: (await read()).baseline, input: { uncertain: true } });
    assert.equal(unconfirmed.receipt.outcome, "uncertain");
    assert.equal(unconfirmed.verification, "unavailable"); assert.equal(unconfirmed.guidance, REVIEW_UNAVAILABLE_GUIDANCE);
    for (const requestId of [uncertainRequest, randomUUID()]) {
      const cliStatus = await cli("status", undefined, 1, requestId);
      assert.equal(cliStatus.verification, "unavailable"); assert.equal(cliStatus.guidance, REVIEW_UNAVAILABLE_GUIDANCE);
      assert.equal(cliStatus.nextAction, "open-document");
      assert.equal(cliStatus.state, requestId === uncertainRequest ? "uncertain" : "unknown");
    }
    // Separate tabs and a reopened/reloaded tab have no shared client observation.
    for (const tab of ["other tab", "reopened tab", "reloaded app"]) {
      const freshAdapter = createReviewAdapter(faultClient, reviewViewSchema.parse(definition), root, new AbortController().signal, () => {});
      const freshSnapshot = await freshAdapter.read(1);
      assert.equal(freshAdapter.pending!.requestId, uncertainRequest, tab);
      assert.equal(freshSnapshot.unresolved!.find(p => p.proposalId === uncertainProposal)!.requestId, uncertainRequest);
      const locked = freshSnapshot.proposals.find(p => p.id === uncertainProposal)!;
      assert.ok(locked.actions.every(a => !a.allowed));
      const before = requests.length;
      await assert.rejects(freshAdapter.act("approve", locked, freshSnapshot.baseline));
      assert.equal(requests.length, before);
      await assert.rejects(freshAdapter.read(1), /Status checks cannot resolve/);
      assert.equal(requests.length, before, "Host marks the outcome unavailable; no endless status polling");
    }
    for (const action of ["approve", "reject", "undo"]) {
      const refused = await send("/api/reviews", { ...base, action, proposalId: uncertainProposal, requestId: randomUUID(), baseline: (await read()).baseline });
      assert.equal(refused.code, "confirmation-required"); assert.equal(refused.pending.requestId, uncertainRequest);
      assert.match(refused.error, /Verification required/);
    }

    assert.equal(readFileSync(path.join(root, "doc.md"), "utf8"), source);
  } finally {
    await host?.close();
    if (previous === undefined) delete process.env.LITZIO_DATA_DIR; else process.env.LITZIO_DATA_DIR = previous;
    if (oldSettings === undefined) delete process.env.LITZIO_PLUGINS_SETTINGS_FILE; else process.env.LITZIO_PLUGINS_SETTINGS_FILE = oldSettings;
    rmSync(root, { recursive: true, force: true });
  }
});
