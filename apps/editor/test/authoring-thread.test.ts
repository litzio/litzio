import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { authorDocument } from "@litzio/core";
import { textRevision } from "@litzio/file-commit";
import { createAuthoredDocumentFile, regenerateAuthoredDocumentFile } from "../server/document-authoring.ts";
import { stopAuthoringThread } from "../server/authoring-thread.ts";
import { nativeSource } from "./helpers/document.ts";
import { largeAuthoringRequest, measureAuthoringSave } from "./helpers/large-authoring.ts";

// #1763: the Host must keep answering while the shared authoring path builds a large
// document. The Host runs in its own process; this client measures it from outside.
test("Host answers health and small reads while a large authored document is saved", { timeout: 300_000 }, async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-health-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const editor = path.join(base, "editor"), root = path.join(base, "root");
  fs.mkdirSync(editor); fs.mkdirSync(root);
  fs.writeFileSync(path.join(editor, "index.html"), "<!doctype html><title>Fixture</title>");
  const small = path.join(root, "small.md");
  fs.writeFileSync(small, "# Small\n\nStill readable.\n");

  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./helpers/host-process.ts", import.meta.url)), editor, root],
    { windowsHide: true, stdio: ["pipe", "pipe", "inherit"] });
  const exited = new Promise(resolve => child.once("exit", resolve));
  t.after(async () => { child.stdin.end(); const timer = setTimeout(() => child.kill(), 10_000); await exited; clearTimeout(timer); });
  const { url, protocol } = JSON.parse(await new Promise<string>((resolve, reject) => {
    child.once("exit", code => reject(new Error(`Host exited before listening: ${code}`)));
    createInterface({ input: child.stdout }).once("line", resolve);
  })) as { url: string; protocol: string };

  const request = largeAuthoringRequest();
  const maxima: number[] = [];
  let first: { target: string; receipt: Awaited<ReturnType<typeof measureAuthoringSave>>["receipt"] } | undefined;
  for (let run = 1; run <= 3; run++) {
    const target = path.join(root, `large-${run}.md`);
    const save = await measureAuthoringSave(url, protocol, target, small, request);
    t.diagnostic(`run ${run}: ${save.summary}`);
    maxima.push(save.maximum);
    save.check();
    if (run === 1) first = { target, receipt: save.receipt };
  }
  t.diagnostic(`health maxima: ${maxima.map(Math.round).join(", ")} ms`);
  // After probing: computing the expectation blocks this client, which would let
  // the Host close idle keep-alive sockets under it. Same bytes, figure references
  // and receipt as Core authoring on the caller thread.
  const expected = await authorDocument(request.authoring, Object.fromEntries(request.images.map(image => [image.key, `./assets/${image.key}.png`])));
  assert.equal(fs.readFileSync(first!.target, "utf8"), expected.source);
  assert.deepEqual(first!.receipt, { path: first!.target, source: expected.source, revision: expected.documentRevision,
    identity: first!.receipt.identity, inputs: expected.inputs });
  for (const image of request.images) assert.deepEqual(fs.readFileSync(path.join(root, "assets", `${image.key}.png`)), Buffer.from(image.base64, "base64"));
});

// The main thread is free while the thread computes, so these races are now
// reachable inside one Host. Publication must still refuse to overwrite or to
// report success: exclusive create, revision check, and failed thread calls.
test("authoring off the main thread never overwrites a concurrent writer or reports a failed thread as saved", { timeout: 120_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-authoring-race-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Large enough that computing outlasts the next macrotask by a wide margin.
  const medium = largeAuthoringRequest(300);
  const titled = (title: string) => ({ ...medium, authoring: { ...medium.authoring, title } });
  const whileComputing = () => new Promise(resolve => setImmediate(resolve));
  const settledSources = async (calls: Promise<{ revision: string }>[]) => {
    const outcomes = await Promise.allSettled(calls);
    const fulfilled = outcomes.filter(outcome => outcome.status === "fulfilled");
    assert.equal(fulfilled.length, 1, JSON.stringify(outcomes.map(outcome => outcome.status)));
    return { winner: fulfilled[0]!.value, rejected: outcomes.find(outcome => outcome.status === "rejected")!.reason as Error };
  };

  // Same name, two creators in one Host: one publishes, the other is a conflict.
  const same = path.join(root, "same.md");
  const created = await settledSources([createAuthoredDocumentFile(same, titled("First")), createAuthoredDocumentFile(same, titled("Second"))]);
  assert.match(created.rejected.message, /file already exists/);
  assert.equal(textRevision(fs.readFileSync(same, "utf8")), created.winner.revision);

  // Same revision, two replacements: the second sees a changed file and writes nothing.
  const replaced = path.join(root, "replaced.md");
  fs.writeFileSync(replaced, nativeSource("# Original\n"));
  const base = textRevision(fs.readFileSync(replaced, "utf8"));
  const replacements = await settledSources([regenerateAuthoredDocumentFile(replaced, titled("One"), base), regenerateAuthoredDocumentFile(replaced, titled("Two"), base)]);
  assert.match(replacements.rejected.message, /changed after it was read/);
  assert.equal(textRevision(fs.readFileSync(replaced, "utf8")), replacements.winner.revision);

  // An external writer during computation keeps its file in both write modes.
  const external = path.join(root, "external.md"), externalText = nativeSource("# Written elsewhere\n");
  const creating = createAuthoredDocumentFile(external, medium);
  await whileComputing(); fs.writeFileSync(external, externalText);
  await assert.rejects(creating, /file already exists/);
  assert.equal(fs.readFileSync(external, "utf8"), externalText);
  const edited = `${externalText}\nEdited elsewhere.\n`;
  const replacing = regenerateAuthoredDocumentFile(external, medium, textRevision(externalText));
  await whileComputing(); fs.writeFileSync(external, edited);
  await assert.rejects(replacing, /changed after it was read/);
  assert.equal(fs.readFileSync(external, "utf8"), edited);

  // A thread that dies mid-call fails the pending call; the next call starts a new thread.
  const lost = path.join(root, "lost.md");
  const stopped = createAuthoredDocumentFile(lost, medium);
  await whileComputing(); await stopAuthoringThread();
  await assert.rejects(stopped, /Document authoring stopped before completion/);
  assert.equal(fs.existsSync(lost), false);
  const recovered = await createAuthoredDocumentFile(path.join(root, "recovered.md"), medium);
  assert.equal(textRevision(fs.readFileSync(recovered.path, "utf8")), recovered.revision);
});
