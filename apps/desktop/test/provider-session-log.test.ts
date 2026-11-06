import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openProviderSessionLog } from "../src/provider-session-log.ts";

test("Desktop refuses remote same-path targets and never accepts renderer paths", { skip: process.platform !== "win32" }, async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "litzio-log-open-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const id = "00000000-0000-4000-8000-000000000001", file = path.join(directory, "original.jsonl");
  writeFileSync(file, JSON.stringify({ type: "session_meta", payload: { id } }) + "\n");
  const opened: string[] = [], revealed: string[] = []; let calls = 0;
  const resolve = async () => { calls++; return { id, provider: "codex", path: file }; };
  const input = { hostId: "local", id, provider: "codex", action: "open" };
  const run = (value: typeof input) => openProviderSessionLog(value, resolve, value => { revealed.push(value); }, async value => { opened.push(value); });
  await assert.rejects(run({ ...input, hostId: "remote" })); assert.equal(calls, 0);
  await run(input); assert.deepEqual(opened, [file]); assert.deepEqual(revealed, []);
  await run({ ...input, action: "reveal" }); assert.deepEqual(revealed, [file]);
  await assert.rejects(openProviderSessionLog(input, async () => ({ id: "other", provider: "codex", path: file }), () => assert.fail("no reveal")));
  assert.deepEqual(await openProviderSessionLog(input, resolve, () => assert.fail("no false reveal"), async () => { throw new Error("launch failed"); }), { available: false, reason: "launch" });
});
