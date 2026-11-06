import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ResetGuard } from "../../editor/server/reset-guard.ts";

test("reset excludes all live actor roles and new writers; dead PID generations do not block", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const guard = new ResetGuard(root, pid => pid === process.pid ? "current" : undefined);
  for (const role of ["desktop", "host", "cli"] as const) {
    const done = guard.actor(role);
    assert.throws(() => guard.exclusive(), /Close .*PID/);
    done();
  }
  fs.writeFileSync(path.join(root, "actor-dead.json"), JSON.stringify({ pid: process.pid, started: "previous", role: "host" }));
  const done = guard.exclusive();
  assert.throws(() => guard.actor("host"), /reset is in progress/);
  assert.throws(() => guard.exclusive(), /reset is in progress/);
  done();
  assert.deepEqual(fs.readdirSync(root), []);
  const writer = guard.actor("cli"); writer();
  guard.blockAfterFailedShutdown();
  assert.throws(() => guard.exclusive(), /could not confirm shutdown/);
});

test("malformed and interrupted exclusive ownership is never silently reclaimed", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-guard-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "exclusive.json"), guard = new ResetGuard(root, () => "now");
  fs.writeFileSync(file, "{}"); assert.throws(() => guard.exclusive(), /Invalid reset guard/);
  const value = JSON.stringify({ pid: process.pid, started: "previous", role: "reset" });
  fs.writeFileSync(file, value); assert.throws(() => guard.exclusive(), /interrupted/);
  assert.equal(fs.readFileSync(file, "utf8"), value);
});

test("mandatory reset identity remains available with a damaged optional-cleanup environment", { skip: process.platform !== "win32" }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-guard-environment-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previous = process.env.SystemRoot;
  process.env.SystemRoot = "C:\\missing-reset-environment";
  try {
    const done = new ResetGuard(root).actor("desktop");
    assert.equal(process.env.SystemRoot, "C:\\missing-reset-environment");
    done(); assert.deepEqual(fs.readdirSync(root), []);
  } finally { if (previous === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = previous; }
});
