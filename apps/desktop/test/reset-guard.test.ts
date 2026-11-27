import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { ResetGuard } from "../../editor/server/reset-guard.ts";
import { processStart } from "../../editor/server/daemon-state.ts";

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

test("a writer killed at any registration step blocks reset while alive and is reclaimed after it exits", { skip: process.platform !== "win32" }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-guard-steps-"));
  const children: ReturnType<typeof spawn>[] = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const source = new URL("../../editor/server/reset-guard.ts", import.meta.url).href;
  // Each child stops forever at one step: after creating an empty record, after writing it but before
  // the exclusive open, or after the open but before checking for a reset.
  const block = { created: `fs.writeFileSync = (file, ...rest) => { if (!String(file).includes("actor-")) return original.writeFileSync(file, ...rest); original.closeSync(original.openSync(file, "wx")); stop(); }`,
    written: `fs.openSync = (file, ...rest) => { if (String(file).includes("actor-") && typeof rest[0] === "number") stop(); return original.openSync(file, ...rest); }`,
    locked: `fs.existsSync = file => { if (String(file).endsWith("exclusive.json")) stop(); return original.existsSync(file); }` };
  for (const [step, patch] of Object.entries(block)) {
    const guardDir = path.join(root, step), marker = path.join(root, `${step}.ready`);
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `import fs from "node:fs";
      const original = { ...fs }; const stop = () => { original.writeFileSync(${JSON.stringify(marker)}, ""); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); };
      ${patch};
      const { ResetGuard } = await import(${JSON.stringify(source)}); new ResetGuard(${JSON.stringify(guardDir)}).actor("cli");`], { windowsHide: true, stdio: "ignore" });
    children.push(child);
    while (!fs.existsSync(marker)) await new Promise(resolve => setTimeout(resolve, 20));
    const [record] = actorFiles(guardDir), read = () => fs.readFileSync(path.join(guardDir, record!), "utf8");
    if (step === "created") assert.equal(read(), "");
    else if (step === "written") assert.equal(JSON.parse(read()).pid, child.pid);
    else assert.throws(read, { code: "EBUSY" });
    // The writer is alive: an open handle or, without one, its PID's creation before the record refuses reset.
    const guard = new ResetGuard(guardDir, pid => pid === process.pid ? "reset" : processStart(pid));
    assert.throws(() => guard.exclusive(), new RegExp(`Close cli \\(PID ${child.pid}\\)`), step);
    const exited = once(child, "exit"); child.kill(); await exited; // TerminateProcess: no release runs.
    assert.equal(actorFiles(guardDir).length, 1, `${step}: a forced exit leaves the record`);
    guard.exclusive()();
    assert.deepEqual(fs.readdirSync(guardDir), [], step);
  }
});

test("a record without an open handle is judged by its filename PID's creation time", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-reset-guard-pid-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // The parent of this test process is alive; its record has lost (or never had) the exclusive open.
  const ticks = (ms: number) => String(BigInt(Math.round(ms * 10_000)) + 621_355_968_000_000_000n);
  const record = () => {
    const file = path.join(root, `actor-${process.ppid}-host-${Math.random().toString(16).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify({ pid: process.ppid, role: "host", lease: "open-handle" }));
    return fs.statSync(file).birthtimeMs;
  };
  const resetWith = (creation: (birth: number) => string | undefined) => {
    const birth = record();
    return () => new ResetGuard(root, pid => pid === process.pid ? "reset" : creation(birth), 0).exclusive()();
  };
  for (const creation of [(birth: number) => ticks(birth - 5_000), () => undefined, () => "boot-id:1234"]) {
    assert.throws(resetWith(creation), new RegExp(`Close host \\(PID ${process.ppid}\\)`), "an older, unknown or incomparable creation refuses");
    for (const name of actorFiles(root)) fs.unlinkSync(path.join(root, name));
  }
  resetWith(birth => ticks(birth + 60_000))();
  assert.deepEqual(fs.readdirSync(root), [], "a process created after the record reuses the PID");
  // Without an enforced exclusive open, a live writer in this process is still protected.
  const done = new ResetGuard(root, pid => pid === process.pid ? "reset" : undefined, 0).actor("desktop");
  assert.throws(() => new ResetGuard(root, () => ticks(0), 0).exclusive(), /Close desktop \(PID/);
  done(); assert.deepEqual(fs.readdirSync(root), []);
});
