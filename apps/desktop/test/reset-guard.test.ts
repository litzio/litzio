import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { ResetGuard } from "../../editor/server/reset-guard.ts";

const actorFiles = (root: string) => fs.readdirSync(root).filter(name => name.startsWith("actor-"));

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
  // A closed open-handle owner whose PID now belongs to a live process (here: this one).
  fs.writeFileSync(path.join(root, "actor-reused.json"), JSON.stringify({ pid: process.pid, started: "windows-open-handle", role: "cli" }));
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
    const done = new ResetGuard(root, undefined, null).actor("desktop");
    assert.equal(process.env.SystemRoot, "C:\\missing-reset-environment");
    done(); assert.deepEqual(fs.readdirSync(root), []);
  } finally { if (previous === undefined) delete process.env.SystemRoot; else process.env.SystemRoot = previous; }
});

test("a writer that exits without releasing keeps reset blocked only while its process lives", { skip: process.platform !== "win32" }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-guard-handle-"));
  const source = new URL("../../editor/server/reset-guard.ts", import.meta.url).href;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
    `const { ResetGuard } = await import(${JSON.stringify(source)}); new ResetGuard(${JSON.stringify(root)}).actor("cli"); process.stdout.write("ready"); setInterval(() => {}, 1000);`],
  { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } fs.rmSync(root, { recursive: true, force: true }); });
  await once(child.stdout!, "data");
  // Live open-handle owners need no OS identity query; only the reset's own identity is asked.
  const guard = new ResetGuard(root, pid => pid === process.pid ? "current" : assert.fail(`queried PID ${pid}`));
  assert.throws(() => guard.exclusive(), new RegExp(`Close cli \\(PID ${child.pid}\\)`));
  assert.equal(actorFiles(root).length, 1, "a refused reset keeps the live owner");
  const exited = once(child, "exit"); child.kill(); await exited; // TerminateProcess: no release runs.
  assert.equal(actorFiles(root).length, 1, "a forced exit leaves the file");
  const done = guard.exclusive(); done();
  assert.deepEqual(fs.readdirSync(root), []);
});

test("an unenforced exclusive open falls back to the OS creation identity", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-guard-fallback-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Flag 0 opens with normal sharing, as if the platform ignored the exclusive flag.
  const guard = new ResetGuard(root, pid => pid === process.pid ? "current" : undefined, 0);
  const done = guard.actor("host");
  const [file] = actorFiles(root);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, file!), "utf8")).started, "current");
  assert.throws(() => guard.exclusive(), /Close host \(PID/);
  done(); assert.deepEqual(fs.readdirSync(root), []);
});
