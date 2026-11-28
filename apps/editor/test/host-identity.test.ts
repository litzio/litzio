import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { isolatedHostEnvironment } from "../../../test/helpers/isolated-host-environment.ts";
import { DAEMON_PROTOCOL } from "../shared/daemon-version.ts";

test("daemon health serves requests during and after a failed account lookup", { skip: process.platform !== "win32", timeout: 15_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "litzio-host-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  Object.assign(process.env, isolatedHostEnvironment(root));
  fs.writeFileSync(path.join(root, "index.html"), "<title>Fixture</title>");

  const pending = Promise.withResolvers<{ stdout: string; stderr: string }>();
  // Cleanup may reject this before a Host has subscribed.
  void pending.promise.catch(() => {});
  const account = "DOMAIN\\FixtureUser";
  let attempts = 0;
  const original = childProcess.execFile;
  const execute = promisify(original);
  childProcess.execFile = Object.assign(original.bind(childProcess), {
    [promisify.custom]: (...args: Parameters<typeof execute>) => {
      if (!Array.isArray(args[1]) || !args[1].some(arg => arg.includes("[System.Security.Principal.WindowsIdentity]::GetCurrent().Name"))) return execute(...args);
      return ++attempts === 1 ? pending.promise : Promise.resolve({ stdout: account, stderr: "" });
    },
  });
  syncBuiltinESMExports();
  const { startHttpHost } = await import("../server/http-host.ts").finally(() => {
    childProcess.execFile = original;
    syncBuiltinESMExports();
  });
  const health = { pid: process.pid, startedAt: new Date().toISOString(), instanceId: randomUUID(),
    processStartedAt: "test", daemonHome: root, executable: process.execPath, roots: [], nonLoopback: false,
    launcher: "cli-run" as const, productVersion: "test", protocolVersion: DAEMON_PROTOCOL };
  const host = await startHttpHost({ roots: [], editorDir: root, port: 0, daemon: { health, stop() {} }, removeFile() {} });
  try {
    const get = async (route: string) => {
      const response = await fetch(host.url + route, { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 200, route);
      return response.json();
    };
    assert.equal(attempts, 1);
    const expectedHealth = { ...health, screenInstanceGuard: true };
    assert.deepEqual(await get("/daemon/health"), expectedHealth);
    assert.deepEqual(await get("/api/document"), { start: true });

    // The bounded read must observe the first, still-pending account lookup.
    const arrived = once(host.server, "request", { signal: AbortSignal.timeout(3000) }).then(() => {
      pending.reject(new Error("Simulated account lookup failure"));
    });
    const [capability] = await Promise.all([get("/api/host-capabilities"), arrived]);
    assert.deepEqual(capability, { fileDeletion: "trash" });
    assert.deepEqual(await get("/daemon/health"), expectedHealth);
    assert.equal(attempts, 1);

    const identity = { runAs: account };
    assert.deepEqual(await get("/api/host-capabilities"), { fileDeletion: "trash", identity });
    assert.deepEqual(await get("/daemon/health"), { ...expectedHealth, identity });
    assert.equal(attempts, 2);
  } finally {
    pending.reject(new Error("Test finished"));
    await host.close();
  }
});
