// Destructive to a disposable account only. CI runs this after building the actual NSIS package.
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { _electron as electron } from "@playwright/test";
import { cliDaemon, desktopRecord, assertExited, assertNoDiscovery } from "./daemon-fixture.ts";
import { CliIntegration } from "../../src/cli-integration.ts";
import { windowsEnvironment } from "../../src/windows-environment.ts";
import { brand } from "../../../../brand.ts";
import { installedUninstallCommand } from "./installed-app.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const work = path.resolve(desktop, "../../tmp/desktop-uninstall");
process.env.LITZIO_DAEMON_DIR = path.join(work, "daemon");
process.env.LITZIO_DATA_DIR = path.join(work, "host-data");
const local = process.env.LOCALAPPDATA!;
const logFolder = path.join(local, brand.folders.cli, "uninstall-logs");
const bin = path.join(local, brand.folders.cli, "bin");
const environment = windowsEnvironment();
function entries(): string {
  return installedUninstallCommand();
}

test("NSIS removal cleans owned CLI entries, preserves user files and survives optional cleanup failures", {
  skip: process.platform !== "win32" || process.env.CI !== "true", timeout: 10 * 60_000,
}, async () => {
  assert.equal(entries(), "", "requires an uninstalled disposable Windows account");
  assert.ok(!existsSync(bin) || readdirSync(bin).length === 0, "existing CLI files must not be changed");
  assert.ok(!existsSync(logFolder), "existing uninstall logs must not be changed");
  const original = (await environment.read()).user;
  const longPath = { value: `${original.value};${'C:\\한글 도구\\"quoted";%VAR%\\bin;;'.repeat(180)}`, kind: "ExpandString" as const };
  assert.ok(longPath.value.length > 4000);
  const version = JSON.parse(readFileSync(path.join(desktop, "package.json"), "utf8")).version;
  const installer = path.join(desktop, "release", `${brand.executableName}-Setup-${version}.exe`);
  mkdirSync(work, { recursive: true });
  try {
    await environment.write(original, longPath);
    assert.deepEqual((await environment.read()).user, longPath, "long raw Unicode/quote/variable PATH round-trips");
    // A stale snapshot must fail without overwriting the longer value.
    await assert.rejects(environment.write(original, original), /User PATH changed/);
    assert.deepEqual((await environment.read()).user, longPath);
    for (const silent of [false, true]) for (const fault of ["empty", "user", "owner", "foreign", "helper", "environment"] as const) {
      const healthy = fault === "empty" || fault === "user";
      if (healthy && !silent) continue;
      // Full is the default for direct invocation and release verification.
      if (process.env.LITZIO_TEST_LIFECYCLE_SCOPE === "representative" &&
        (!silent || !["empty", "user", "foreign"].includes(fault))) continue;
      const label = `${silent ? "silent" : "interactive"}-${fault}`;
      const install = path.join(work, label);
      const setup = spawnSync(installer, ["/S", `/D=${install}`], { timeout: 60_000, encoding: "utf8" });
      assert.equal(setup.status, 0, `${label}: ${setup.stderr}`);
      const registration = entries();
      assert.ok(registration.toLowerCase().includes(install.toLowerCase()), `${label}: registration ${registration} must identify ${install}`);
      const integration = new CliIntegration(path.join(install, `${brand.executableName}.exe`), local, environment);
      await integration.setEnabled(true);
      const registered = (await environment.read()).user;
      const userFile = path.join(bin, "user-note.txt");
      if (fault === "user") writeFileSync(userFile, "Preserve user files.\n");
      if (fault === "owner") writeFileSync(integration.record, "damaged owner");
      if (fault === "foreign") writeFileSync(integration.shim, "user owned script");
      if (fault === "helper") unlinkSync(path.join(install, "resources", "uninstall-cli.cjs"));
      const ownerBefore = readFileSync(integration.record);
      const shimBefore = readFileSync(integration.shim);
      const logsBefore = new Set(existsSync(logFolder) ? readdirSync(logFolder) : []);
      // _?= runs the real installed uninstaller without its detached self-copy. Copying it to
      // our scratch keeps its own executable outside the application tree it must remove.
      const uninstaller = path.join(work, `${label}.exe`);
      copyFileSync(path.join(install, `Uninstall ${brand.executableName}.exe`), uninstaller);
      const args = [...(silent ? ["/S"] : []), "/currentuser", `_?=${install}`];
      const temporary = path.join(work, `${label}-temporary`);
      mkdirSync(temporary, { recursive: true });
      const env = { ...process.env, TEMP: temporary, TMP: temporary,
        ...(fault === "environment" ? { SystemRoot: path.join(work, "missing-windows") } : {}) };
      let live: Awaited<ReturnType<typeof electron.launch>> | undefined;
      let liveProcess: ChildProcess | undefined;
      let owned: ReturnType<typeof desktopRecord> | undefined;
      let other: Awaited<ReturnType<typeof cliDaemon>> | undefined;
      const channel = version.includes("-") ? "beta" : "stable";
      const otherChannel = channel === "beta" ? "stable" : "beta";
      let status: number | null;
      try {
        if (silent && fault === "empty") {
          // Exercise real locks once, without repeating Desktop startup for optional-CLI faults.
          const cli = await cliDaemon(path.join(integration.junction, `${brand.executableName}.exe`), otherChannel);
          try {
            const refused = spawnSync(uninstaller, args, { env, encoding: "utf8", timeout: 60_000 });
            assert.equal(refused.status, 1, "CLI-owned daemon blocks removal");
            assert.equal(entries(), registration, "blocked removal preserves registration");
            assert.equal(existsSync(integration.executable), true);
            await cli.alive();
          } finally { await cli.stop(); }
          other = await cliDaemon(path.join(desktop, "release/win-unpacked", `${brand.executableName}.exe`), otherChannel);
          live = await electron.launch({ executablePath: integration.executable, args: [`--user-data-dir=${path.join(work, "profile")}`, "--lang=en-US"], timeout: 60_000 });
          // ElectronApplication.process() cannot be called after Playwright disposes it.
          liveProcess = live.process();
          const page = await live.firstWindow();
          await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached", timeout: 30_000 });
          owned = desktopRecord(channel, version);
        }
        if (silent) {
          // Playwright must service stderr and detach its Node inspector when Electron
          // quits. spawnSync blocks that callback, making the real installer correctly
          // refuse the still-running inspected process. Keep the same 60s deadline.
          const child = spawn(uninstaller, args, { env, stdio: "ignore", timeout: 60_000 });
          status = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
        } else {
          const child = spawn(uninstaller, args, { env, stdio: "ignore" });
          const completed = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
          try {
            const output = execFileSync("powershell.exe", ["-NoProfile", "-File",
              path.join(desktop, "test/packaged/uninstall-dialogs.ps1"), String(child.pid)], { encoding: "utf8", timeout: 60_000 });
            writeFileSync(path.join(work, `${label}-dialogs.txt`), output);
            assert.match(output, /CLI cleanup incomplete/, "interactive uninstall displays the cleanup warning");
            status = await completed;
          } catch (error) {
            const failure = error as Error & { stdout?: string; stderr?: string };
            writeFileSync(path.join(work, `${label}-dialogs.txt`), `${failure.stdout ?? ""}\n${failure.stderr ?? failure.message}`);
            spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
            await completed;
            throw error;
          }
        }
        if (owned) {
          assertExited(owned); assertNoDiscovery(channel);
          await other!.alive();
        }
      } finally {
        try { if (live && liveProcess?.exitCode === null) await live.close(); }
        finally { await other?.stop(); }
      }
      assert.equal(status!, 0, `${label}: app removal must succeed despite optional cleanup failure`);
      assert.equal(entries(), "", `${label}: uninstall registration removed`);
      assert.equal(existsSync(integration.executable), false, `${label}: app executable removed`);
      if (healthy) {
        assert.deepEqual((await environment.read()).user, longPath, `${label}: only the CLI PATH entry was removed`);
        for (const entry of [integration.record, integration.shim, integration.junction])
          assert.throws(() => lstatSync(entry), { code: "ENOENT" });
        if (fault === "user") {
          assert.equal(readFileSync(userFile, "utf8"), "Preserve user files.\n");
          // Remove only this test's preserved file and empty directory after asserting the outcome.
          unlinkSync(userFile);
          rmdirSync(bin);
        } else assert.equal(existsSync(bin), false, "uninstall must remove an empty owned bin");
        assert.deepEqual(existsSync(logFolder) ? readdirSync(logFolder) : [], [...logsBefore],
          `${label}: successful cleanup, including a nonempty bin, must not report a failure`);
        console.log(`${label}: app and owned CLI entries removed; user files preserved`);
        continue;
      }
      assert.deepEqual(readFileSync(integration.record), ownerBefore, "uncertain files preserved");
      assert.deepEqual(readFileSync(integration.shim), shimBefore);
      assert.ok(lstatSync(integration.junction).isSymbolicLink(), "junction preserved, including dangling target");
      const logs = readdirSync(logFolder).filter(name => !logsBefore.has(name));
      assert.equal(logs.length, 1, `${label}: durable cleanup diagnostic`);
      const diagnostic = readFileSync(path.join(logFolder, logs[0]!)).toString("utf16le");
      writeFileSync(path.join(work, `${label}-cleanup.txt`), diagnostic);
      assert.match(diagnostic, /CLI cleanup incomplete/);
      assert.ok(diagnostic.includes(bin));
      assert.match(diagnostic, /Environment Variables > User Path/);
      assert.match(diagnostic, fault === "owner" ? /ownership file is unrecognized/
        : fault === "foreign" ? /Another file already uses/
        : fault === "helper" ? /Cleanup helper is missing/ : /powershell\.exe.*ENOENT|ENOENT.*powershell\.exe/s,
      `${label}: diagnostic identifies the injected failure`);
      const expected = fault === "owner" || fault === "foreign" ? longPath : registered;
      assert.deepEqual((await environment.read()).user, expected, `${label}: report actual PATH outcome`);
      await environment.write(expected, longPath);
      // Only fixture entries, whose unchanged contents and identity were just verified.
      unlinkSync(integration.junction); unlinkSync(integration.shim); unlinkSync(integration.record);
      console.log(`${label}: app removed; warning recorded; uncertain files preserved`);
    }
  } finally {
    await environment.write((await environment.read()).user, original);
  }
  assert.deepEqual((await environment.read()).user, original);
});
