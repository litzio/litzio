// Install and update for real on Windows: two test builds whose update host is a local stand-in for
// GitHub Releases, the per-user NSIS installer run silently, and the update the user asks for in
// Settings: download, the Editor refusing the restart with unsaved work, then installing after Save
// and starting the new version. Nothing is published; only the update host differs from a release.
//   pnpm --filter @litzio/desktop test:update
//   LITZIO_TEST_UPDATE_CHANNEL=beta pnpm --filter @litzio/desktop test:update
// It installs the configured product for the current user and uninstalls it afterwards.
// An existing installation or user data refuses the test.
import assert from "node:assert/strict";
import { brand } from "../../../../brand.ts";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { _electron as electron, type Page } from "@playwright/test";
import { RELEASE_REPOSITORY } from "../../src/update-policy.ts";
import { readUpdateInfo } from "../../scripts/verify-release.ts";
import { readPreferences, writePreferences } from "../../src/preferences.ts";
import { windowsEnvironment } from "../../src/windows-environment.ts";
import { verifyPackagedCli } from "./cli-check.ts";
import { daemonDirectory, processStart, readDaemonRecord } from "../../../editor/server/daemon-state.ts";
import { DAEMON_PROTOCOL, sameInstance } from "../../../editor/server/daemon-protocol.ts";
import { cliDaemon, desktopRecord, assertExited, assertNoDiscovery } from "./daemon-fixture.ts";
import { installedDirectory } from "./installed-app.ts";
import { installationPort } from "../../src/installation-lifecycle.ts";
import { fetchPublicRelease } from "./public-download.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = path.resolve(desktop, "../..");
const work = path.join(repo, "tmp", "desktop-update");
const HOST = "127.0.0.1:47320";
const LIVE = process.argv.includes("--github");
const PUBLISHED_BASE = process.env.LITZIO_TEST_PUBLISHED_BASE === "1";
const BETA = LIVE || PUBLISHED_BASE || process.env.LITZIO_TEST_UPDATE_CHANNEL === "beta";
// NSIS relaunches through the Windows shell, which does not inherit process-only overrides.
// Like installation/PATH/userData, shared state belongs to a clean disposable test account.
const sharedData = path.join(os.homedir(), brand.folders.shared);
process.env.LITZIO_DAEMON_DIR = LIVE ? path.join(work, "daemon") : path.join(sharedData, "daemon");
process.env.LITZIO_DATA_DIR = LIVE ? path.join(work, "host-data") : sharedData;
// Litzio Beta candidate pair; IeumDoc beta.4 cannot update to Litzio beta.5.
// Both Litzio releases must be public before this opt-in harness can run.
const [OLD, NEW] = LIVE || PUBLISHED_BASE ? ["0.0.2", "0.0.3-beta.1"]
  : BETA ? ["0.1.0-beta.1", "0.1.0-beta.2"] : ["0.0.1", "0.0.2"];
// The public beta.3 predates native documents (#232) and edits leading frontmatter as a body block.
const NATIVE_PREFIX = LIVE && OLD === "0.0.1-beta.3" ? "" : "---\nlitzio: 1\n---\n\n";
const CHANNEL_FILE = `${brand.updates.channels[BETA ? "beta" : "stable"]}.yml`;
const { owner, repo: name } = RELEASE_REPOSITORY;
const appData = path.join(process.env.APPDATA!, brand.folders.desktopData);
const updaterCache = path.join(process.env.LOCALAPPDATA!, `${brand.appName}-updater`);
const defaultInstall = path.join(process.env.LOCALAPPDATA!, "Programs", brand.appName);

function powershell(script: string): string {
  return execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
}

/** The folder of the per-user installation, from its uninstall entry (which has no InstallLocation), or "". */
function installedEntry(): string {
  return installedDirectory();
}

/** Package one test build and keep its installer and metadata. */
function packageVersion(version: string): string {
  const out = path.join(work, `v${version}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  execFileSync("pnpm --filter @litzio/desktop package", { cwd: repo, shell: process.env.ComSpec ?? "cmd.exe", stdio: "inherit",
    env: { ...process.env, LITZIO_TEST_VERSION: version, LITZIO_TEST_UPDATE_HOST: HOST, LITZIO_RELEASE: "", LITZIO_REQUIRE_SIGNED_UPDATES: "" } });
  for (const file of [`${brand.executableName}-Setup-${version}.exe`, `${brand.executableName}-Setup-${version}.exe.blockmap`, CHANNEL_FILE]) {
    copyFileSync(path.join(desktop, "release", file), path.join(out, file));
  }
  return out;
}

/** Opt-in, public read/download only. Both releases must already exist; no publication API calls. */
async function publicBeta(versions = [OLD, NEW], startVersion = OLD): Promise<string> {
  const folder = path.join(work, `public-${startVersion}`);
  mkdirSync(folder, { recursive: true });
  for (const version of versions) {
    const result = await fetchPublicRelease(`https://api.github.com/repos/${owner}/${name}/releases/tags/v${version}`, process.env.GH_TOKEN ? { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}` } } : {});
    assert.equal(result.status, 200, `Public v${version} is required; real GitHub update validation remains Pending`);
    const release = await result.json() as { tag_name: string; draft: boolean; prerelease: boolean; assets: { id: number; name: string; size: number; digest: string; browser_download_url: string }[] };
    assert.equal(release.tag_name, `v${version}`); assert.equal(release.draft, false); assert.equal(release.prerelease, version.includes("-beta."));
    const manifest = `${brand.updates.channels[version.includes("-beta.") ? "beta" : "stable"]}.yml`;
    const installer = `${brand.executableName}-Setup-${version}.exe`;
    assert.deepEqual(release.assets.map((asset) => asset.name).sort(), [installer, `${installer}.blockmap`, manifest].sort());
    const download = async (assetName: string) => {
      const asset = release.assets.find((asset) => asset.name === assetName)!;
      assert.equal(asset.browser_download_url, `https://github.com/${owner}/${name}/releases/download/v${version}/${assetName}`);
      const response = await fetchPublicRelease(process.env.GH_TOKEN
        ? `https://api.github.com/repos/${owner}/${name}/releases/assets/${asset.id}` : asset.browser_download_url,
      process.env.GH_TOKEN ? { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/octet-stream" } } : undefined);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, asset.size);
      assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, asset.digest);
      return bytes;
    };
    const metadata = readUpdateInfo((await download(manifest)).toString("utf8"));
    assert.equal(metadata.version, version); assert.equal(metadata.path, installer);
    assert.ok(Array.isArray(metadata.files) && metadata.files.length === 1);
    const file = metadata.files[0]; assert.equal(file.url, installer); assert.equal(file.sha512, metadata.sha512);
    if (version === startVersion) {
      const bytes = await download(installer);
      assert.equal(createHash("sha512").update(bytes).digest("base64"), file.sha512);
      assert.equal(bytes.length, file.size);
      writeFileSync(path.join(folder, installer), bytes);
    }
  }
  return folder;
}

/** GitHub Releases with one published release, the new version. */
function releases(folder: string, requests: string[]): http.Server {
  return http.createServer((request, response) => {
    const url = request.url ?? "";
    requests.push(url);
    if (url === `/${owner}/${name}/releases.atom`) {
      return response.writeHead(200).end(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>` +
        `<link rel="alternate" type="text/html" href="https://github.com/${owner}/${name}/releases/tag/v${NEW}"/><title>v${NEW}</title><content>Test</content></entry></feed>`);
    }
    if (url === `/api/v3/repos/${owner}/${name}/releases/latest`) {
      // The first Beta distribution has no Stable release to fall back to.
      return BETA ? response.writeHead(404).end() : response.writeHead(200).end(JSON.stringify({ tag_name: `v${NEW}` }));
    }
    const asset = new RegExp(`^/${owner}/${name}/releases/download/v${NEW.replaceAll(".", "\\.")}/([^/]+)$`).exec(url);
    const file = asset ? path.join(folder, decodeURIComponent(asset[1]!)) : "";
    if (file && existsSync(file)) return response.writeHead(200).end(readFileSync(file));
    response.writeHead(404).end();
  });
}

/** FileVersion retains Beta identifiers; Windows ProductVersion is numeric and loses them. */
function appProcesses(folder: string): { pid: number; version: string }[] {
  // Windows PowerShell 5.1: no ConvertTo-Json -AsArray, so the array is passed as -InputObject.
  const raw = powershell(`ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter "Name='${brand.executableName.replaceAll("'", "''")}.exe'" | ` +
    `Where-Object { $_.ExecutablePath -like '${folder.replaceAll("'", "''")}\\*' } | ` +
    `ForEach-Object { @{ pid = $_.ProcessId; version = (Get-Item $_.ExecutablePath).VersionInfo.FileVersion } })`);
  return raw ? [JSON.parse(raw)].flat() : [];
}

function requireCleanUser(): void {
  assert.equal(installedEntry(), "", `${brand.name.en} is already installed; use a separate Windows test account`);
  for (const folder of [appData, updaterCache, defaultInstall, ...(!LIVE ? [sharedData] : [])]) assert.equal(existsSync(folder), false, `${folder} exists; this test would change it`);
}

test("installs per user, then updates from Settings only after the open document is saved", { skip: PUBLISHED_BASE, timeout: 15 * 60_000 }, async (t) => {
  requireCleanUser();
  const cliEnvironment = windowsEnvironment();
  const originalUserPath = !LIVE ? (await cliEnvironment.read()).user : null;
  const cliBin = path.join(process.env.LOCALAPPDATA!, brand.folders.cli, "bin");
  if (!LIVE) assert.equal(existsSync(cliBin), false, "CLI integration already exists; use a disposable Windows account");
  const freshTerminalEnvironment = async () => {
    const snapshot = await cliEnvironment.read();
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
    env.Path = cliEnvironment.expand(`${snapshot.machine};${snapshot.user.value}`);
    return env;
  };
  rmSync(work, { recursive: true, force: true });
  const oldBuild = LIVE ? await publicBeta() : packageVersion(OLD);
  const newBuild = LIVE ? "" : packageVersion(NEW);
  const install = path.join(work, "install");
  const documents = path.join(work, "documents");
  mkdirSync(documents, { recursive: true });
  const documentFile = path.join(documents, "update.md");
  writeFileSync(documentFile, `${NATIVE_PREFIX}# Update\n\nAlpha.\n`);
  const requests: string[] = [];
  const server = LIVE ? null : releases(newBuild, requests);
  if (server) await new Promise<void>((resolve) => server.listen(47320, "127.0.0.1", resolve));
  let installedAt = "";
  let ownsData = false;
  let other: Awaited<ReturnType<typeof cliDaemon>> | undefined;
  const channel = BETA ? "beta" : "stable";
  const otherChannel = BETA ? "stable" : "beta";
  const rendererTail: string[] = [];
  const observeRenderer = (page: Page) => {
    const append = (message: string) => {
      rendererTail.push(`${new Date().toISOString()} ${message}`);
      if (rendererTail.length > 100) rendererTail.shift();
    };
    page.on("console", message => append(`console ${message.type()}: ${message.text()}`));
    page.on("pageerror", error => append(`pageerror: ${error.stack ?? error.message}`));
    page.on("close", () => append("observed renderer closed; installer-relaunched renderer is not attached"));
  };
  const diagnoseOtherHealth = async (error: unknown) => {
    if (!other) return;
    const record = other.record;
    const evidence: Record<string, unknown> = {
      at: new Date().toISOString(), channel: otherChannel, record,
      error: String(error),
      rendererTail: [...rendererTail],
      rendererCoverage: "Playwright-launched windows only; renderer exit/load failures after installer relaunch are in desktop.log",
    };
    const tail = (file: string) => {
      try { return readFileSync(file, "utf8").split(/\r?\n/).slice(-100).join("\n"); }
      catch (error) { return { unavailable: String(error) }; }
    };
    // Snapshot before the independent probe (which must never turn failure into success).
    evidence.desktopLog = tail(path.join(appData, "logs/desktop.log"));
    evidence.daemonLogs = Object.fromEntries(([channel, otherChannel] as const).map(value =>
      [value, tail(path.join(daemonDirectory(value), "daemon.log"))]));
    try {
      const started = processStart(record.pid);
      evidence.process = { pid: record.pid, alive: started !== undefined, observedStartedAt: started ?? null,
        expectedStartedAt: record.processStartedAt, sameCreationTime: started === record.processStartedAt };
    } catch (error) { evidence.process = { unknown: String(error) }; }
    try {
      evidence.freshConnection = await new Promise((resolve, reject) => {
        // agent:false creates a new socket, separate from fetch's connection pool.
        const request = http.get(record.url + "/daemon/health", { agent: false,
          headers: { Connection: "close", "X-Litzio-Protocol": DAEMON_PROTOCOL, Origin: record.url },
          signal: AbortSignal.timeout(10_000) }, response => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", chunk => { body += chunk; });
          response.on("error", reject);
          response.on("end", () => {
            let health;
            try { health = JSON.parse(body); } catch { /* Preserve non-JSON responses too. */ }
            resolve({ status: response.statusCode, body, reusedSocket: request.reusedSocket,
              sameInstance: !!health && sameInstance(record, health), protocolMatches: health?.protocolVersion === DAEMON_PROTOCOL });
          });
        });
        request.on("error", reject);
      });
    } catch (error) { evidence.freshConnection = { error: String(error) }; }
    console.error("Other-channel health failure evidence:", JSON.stringify(evidence));
    writeFileSync(path.join(work, "other-health-diagnostics.json"), JSON.stringify(evidence, null, 2));
  };
  const diagnose = (stage: string, error: unknown) => {
    // Log the original failure before cleanup can replace it. Read-only OS/daemon evidence.
    const evidence: Record<string, unknown> = { stage, error: error instanceof Error ? error.stack : error };
    try {
      if (installedAt) {
        const port = installationPort(path.join(installedAt, `${brand.executableName}.exe`));
        evidence.processes = port.processes(); evidence.records = port.records();
      }
      evidence.desktopLog = existsSync(path.join(appData, "logs/desktop.log")) ? readFileSync(path.join(appData, "logs/desktop.log"), "utf8") : null;
      evidence.daemonLogs = Object.fromEntries((["stable", "beta"] as const).map(channel => {
        const log = path.join(daemonDirectory(channel), "daemon.log");
        return [channel, existsSync(log) ? readFileSync(log, "utf8") : null];
      }));
    } catch (diagnosticError) { evidence.diagnosticError = String(diagnosticError); }
    console.error("Update failure evidence:", JSON.stringify(evidence));
    writeFileSync(path.join(work, `${stage}-diagnostics.json`), JSON.stringify(evidence, null, 2));
  };
  try {
    // Per-user and silent: no administrator rights and no wizard.
    const started = Date.now();
    requireCleanUser(); // Downloads/builds can take minutes; recheck before installing.
    const setup = spawnSync(path.join(oldBuild, `${brand.executableName}-Setup-${OLD}.exe`), ["/S", `/D=${install}`], { stdio: "ignore" });
    assert.equal(setup.status, 0, "the installer failed");
    const registered = installedEntry();
    assert.equal(path.resolve(registered).toLowerCase(), path.resolve(install).toLowerCase(), "the registered installation is not owned by this test");
    installedAt = registered;
    ownsData = true;
    const exe = path.join(installedAt, `${brand.executableName}.exe`);
    assert.equal(existsSync(exe), true);
    console.log(`installed ${OLD} in ${Date.now() - started} ms at ${installedAt}`);
    const prefs = { channel: BETA ? "beta" as const : "stable" as const, seenUpdate: OLD, backgroundNoticeShown: false };
    const preferencesFile = path.join(appData, "preferences.json");
    const canary = path.join(appData, "update-test-canary.txt");
    mkdirSync(appData, { recursive: true });
    writeFileSync(canary, "Preserve existing user data.\n");

    let app = await electron.launch({ executablePath: exe, args: ["--lang=en-US", documentFile], timeout: 60_000 });
    let page = await app.firstWindow();
    observeRenderer(page);
    page.on("dialog", () => {});
    // Public beta.4 uses "Ready"; current builds use the stable lowercase operation ID.
    await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached", timeout: 30_000 });
    // The installer relaunches without arguments. Persist the test's language for that launch too;
    // public beta.4 is English-only, but shares this origin/profile with the updated app.
    await page.evaluate(prefix => localStorage.setItem(`${prefix}.uiLanguage`, "en"), brand.storagePrefix);
    const phase = () => page.getByTestId("update-status").getAttribute("data-phase");
    await page.getByRole("button", { name: /^Settings/ }).click();
    // LIVE starts an older published build whose Settings has no categories.
    if (await page.getByRole("button", { name: "About & updates", exact: true }).count())
      await page.getByRole("button", { name: "About & updates", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").innerText(), OLD);
    if (!LIVE) {
      assert.deepEqual((await cliEnvironment.read()).user, originalUserPath, "installation must not opt in");
      const cli = page.getByTestId("cli-integration");
      await cli.getByText("Off", { exact: true }).waitFor();
      await cli.getByRole("button", { name: "Turn on", exact: true }).click();
      await cli.getByText("Installed", { exact: true }).waitFor();
      verifyPackagedCli(exe, brand.cliCommand, documents, OLD, await freshTerminalEnvironment());
      await cli.getByRole("button", { name: "Turn off", exact: true }).click();
      await cli.getByText("Off", { exact: true }).waitFor();
      assert.deepEqual((await cliEnvironment.read()).user, originalUserPath, "disable preserves the original raw PATH and registry kind");
      assert.equal(existsSync(cliBin), false, "disable must remove an empty owned bin");
      await cli.getByRole("button", { name: "Turn on", exact: true }).click();
      await cli.getByText("Installed", { exact: true }).waitFor();
      await t.test("CLI ownership refusal and recovery", { skip: !BETA }, async () => {
        // A damaged ownership record disables Repair, but Turn off must still unregister PATH.
        writeFileSync(path.join(cliBin, "owner.json"), "damaged owner");
        await page.reload();
        await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached" });
        await page.getByRole("button", { name: /^Settings/ }).click();
        await page.getByRole("button", { name: "About & updates", exact: true }).click();
        await cli.getByText("Broken path", { exact: true }).waitFor();
        assert.equal(await cli.getByRole("button", { name: "Repair", exact: true }).isDisabled(), true);
        await cli.getByRole("button", { name: "Turn off", exact: true }).click();
        await page.locator('[data-testid="cli-integration"][aria-busy="false"]').waitFor();
        assert.equal(await cli.getByTestId("cli-status").innerText(), "Off");
        assert.deepEqual((await cliEnvironment.read()).user, originalUserPath);
        assert.equal(readFileSync(path.join(cliBin, "owner.json"), "utf8"), "damaged owner");
        // Fixture-only cleanup after verifying preservation, then continue the update with CLI on.
        for (const name of ["app", `${brand.cliCommand}.cmd`, "owner.json"]) unlinkSync(path.join(cliBin, name));
        await cli.getByRole("button", { name: "Refresh status", exact: true }).click();
        await page.locator('[data-testid="cli-integration"][aria-busy="false"]').waitFor();
        await cli.getByRole("button", { name: "Turn on", exact: true }).click();
        await cli.getByText("Installed", { exact: true }).waitFor();
      });
    }
    assert.equal(await page.getByRole("radio", { name: BETA ? /^Beta/ : /^Stable/ }).isChecked(), true, "first install uses its own channel");
    // CLI verification can outlast the scheduled initial check. Wait for its actual offer,
    // which replaces Check for updates with Download update; manual checking is exercised
    // after relaunch below. All offer/no-download/consent assertions remain the same.
    await page.getByRole("button", { name: "Download update" }).waitFor({ timeout: 30_000 });
    assert.match(await page.getByTestId("update-status").innerText(), new RegExp(`${brand.name.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ${NEW.replaceAll(".", "\\.")} \\(${BETA ? "Beta" : "Stable"}\\) is available`));
    if (!LIVE) {
      assert.ok(requests.some((url) => url.endsWith(`/${CHANNEL_FILE}`)), "the installed channel fetched its update metadata");
      assert.equal(requests.some((url) => url.endsWith(".exe")), false, "finding the update downloaded nothing");
    }
    await page.getByRole("button", { name: "Download update" }).click();
    await page.getByRole("button", { name: "Restart to update" }).waitFor({ timeout: 120_000 });
    assert.equal(await phase(), "downloaded");
    if (!LIVE) assert.ok(requests.some((url) => url.endsWith(`${brand.executableName}-Setup-${NEW}.exe`)), "the installer was downloaded from the release");

    if (!LIVE) {
      await t.test("CLI daemon blocks update without stopping either channel", { skip: !BETA }, async () => {
        const cli = await cliDaemon(path.join(cliBin, "app", `${brand.executableName}.exe`), otherChannel);
        try {
          await page.getByRole("button", { name: "Restart to update" }).click();
          await page.getByTestId("update-problem").waitFor();
          assert.match(await page.getByTestId("update-problem").innerText(), /CLI daemon.*Stop it/);
          await cli.alive();
          desktopRecord(channel, OLD);
          assert.equal(await phase(), "downloaded");
        } finally { await cli.stop(); }
      });
      // The other channel uses a DIFFERENT installation; replacing this tree must leave it alive.
      other = await cliDaemon(path.join(desktop, "release/win-unpacked", `${brand.executableName}.exe`), otherChannel);
    }

    // Normal quit with a downloaded update is not consent to install. Restart the old app,
    // then explicitly download again (the updater may reuse its checksum-verified cache).
    const quitDaemon = !LIVE ? desktopRecord(channel, OLD) : undefined;
    await app.close();
    if (quitDaemon) { assertExited(quitDaemon); assertNoDiscovery(channel); }
    await other?.alive();
    const versionAfterQuit = powershell(`(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.FileVersion`);
    assert.equal(versionAfterQuit, OLD, "normal quit did not update the installed app");
    writePreferences(preferencesFile, prefs);
    app = await electron.launch({ executablePath: exe, args: ["--lang=en-US", documentFile], timeout: 60_000 });
    page = await app.firstWindow();
    observeRenderer(page);
    page.on("dialog", () => {});
    await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached" });
    await page.getByRole("button", { name: /^Settings/ }).click();
    if (await page.getByRole("button", { name: "About & updates", exact: true }).count())
      await page.getByRole("button", { name: "About & updates", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").innerText(), OLD);
    await page.getByRole("button", { name: "Check for updates" }).click();
    await page.getByRole("button", { name: "Download update" }).click();
    await page.getByRole("button", { name: "Restart to update" }).waitFor({ timeout: 120_000 });

    // Fault probes share the fixture but have separate results; Beta runs them once.
    await t.test("missing restart IPC answer refuses installation", { skip: !BETA }, async () => {
      // A missing IPC answer refuses after the deadline and re-enables the window. Only the
      // test removes/restores the listener; the shipped bridge has no such control.
      await app.evaluate(({ ipcMain }) => {
        (globalThis as unknown as { restartListeners: Function[] }).restartListeners = ipcMain.listeners("desktop:restart-check-result");
        ipcMain.removeAllListeners("desktop:restart-check-result");
      });
      try {
        await page.getByRole("button", { name: "Restart to update" }).click();
        await page.getByTestId("update-problem").waitFor({ timeout: 15_000 });
        assert.equal(await page.getByTestId("update-problem").innerText(), "Could not confirm that your work is saved.");
        assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isEnabled()), true);
        assert.equal(await phase(), "downloaded");
      } finally {
        await app.evaluate(({ ipcMain }) => {
          const stored = globalThis as unknown as { restartListeners?: ((...args: unknown[]) => void)[] };
          for (const listener of stored.restartListeners ?? []) ipcMain.on("desktop:restart-check-result", listener);
          delete stored.restartListeners;
        });
      }
    });
    await t.test("renderer restart callback failure refuses installation", { skip: !BETA }, async () => {
      // A renderer callback failure is also a refusal, not an implicit permission to install.
      await page.evaluate(() => window.litzioDesktop!.onRestartCheck(() => { throw new Error("renderer check failed"); }));
      await page.getByRole("button", { name: "Restart to update" }).click();
      await page.getByTestId("update-problem").waitFor();
      assert.equal(await page.getByTestId("update-problem").innerText(), "Could not confirm that your work is saved.");
      await page.reload();
      await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached" });
    });

    await t.test("dirty document blocks update; Save permits install and preserves data", async () => {
      // Stable skipped the fault probes and still has Settings open.
      if (await page.getByTestId("settings-dialog").count()) {
        await page.keyboard.press("Escape");
        await page.getByTestId("settings-dialog").waitFor({ state: "detached" });
      }
      // Unsaved work refuses the restart and stays.
      await page.getByText("Alpha.", { exact: true }).click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Saved before the update.");
      await page.getByRole("button", { name: /^Settings/ }).click();
      await page.getByRole("button", { name: "About & updates", exact: true }).click();
      await page.getByRole("button", { name: "Restart to update" }).click();
      await page.getByTestId("update-problem").waitFor();
      assert.match(await page.getByTestId("update-problem").innerText(), /Save your changes, then restart to update/);
      await page.keyboard.press("Escape");
      await page.getByTestId("settings-dialog").waitFor({ state: "detached" });
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);

      await page.keyboard.press("Control+S");
      await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent === "Saved");
      const savedPreferences = readPreferences(preferencesFile, OLD);
      if (!LIVE) assert.equal(savedPreferences.seenUpdate, NEW, "viewing About acknowledges the offered update");
      const oldDaemon = !LIVE ? desktopRecord(channel, OLD) : undefined;
      const closed = new Promise<void>((resolve) => app.once("close", () => resolve()));
      await page.getByRole("button", { name: /^Settings/ }).click();
      await page.getByRole("button", { name: "About & updates", exact: true }).click();
      await page.getByRole("button", { name: "Restart to update" }).click();
      await closed;
      const restarted = Date.now();
      // The installer starts the new version without arguments, so it logs to the default user data.
      const log = path.join(appData, "logs", "desktop.log");
      const shown = () => (!oldDaemon || readDaemonRecord(daemonDirectory(channel))?.productVersion === NEW) && existsSync(log) && new RegExp(`started ${NEW.replaceAll(".", "\\.")} [^\\n]*\\n[^\\n]*window shown`).test(readFileSync(log, "utf8"));
      while (!shown()) {
        if (Date.now() - restarted > 180_000) throw new Error(`The updated app/daemon did not start: ${JSON.stringify(readDaemonRecord(daemonDirectory(channel)))}\n${existsSync(log) ? readFileSync(log, "utf8") : "no log"}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (oldDaemon) {
        assertExited(oldDaemon);
        const current = desktopRecord(channel, NEW);
        assert.notEqual(current.instanceId, oldDaemon.instanceId);
        await other?.alive();
      }
      assert.ok(appProcesses(installedAt).some((process) => process.version === NEW), "the new version is running");
      console.log(`installed ${NEW} and showed its window ${Date.now() - restarted} ms after the restart`);
      assert.equal(readFileSync(documentFile, "utf8"), `${NATIVE_PREFIX}# Update\n\nAlpha. Saved before the update.\n`);
      assert.deepEqual(readPreferences(preferencesFile, NEW), savedPreferences, "saved channel and preferences survived installation");
      assert.equal(readFileSync(canary, "utf8"), "Preserve existing user data.\n");
      assert.ok(readFileSync(log, "utf8").includes(`started ${NEW} (${prefs.channel})`), "the new app loaded the preserved channel");
      if (!LIVE) verifyPackagedCli(exe, brand.cliCommand, documents, NEW, await freshTerminalEnvironment());
    });
  } catch (error) {
    diagnose("update", error);
    throw error;
  } finally {
    try {
      try {
        if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
        if (installedAt && !LIVE) {
          const executable = path.join(installedAt, `${brand.executableName}.exe`);
          const daemon = readDaemonRecord(daemonDirectory(channel));
          const report = path.join(work, "prepare-cleanup.txt");
          const prepared = spawnSync(executable, [path.join(installedAt, "resources/prepare-installation.cjs"), "--prepare-installation", report], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 30_000, encoding: "utf8",
          });
          if (prepared.status !== 0) diagnose("cleanup", { status: prepared.status, stderr: prepared.stderr, report: existsSync(report) ? readFileSync(report, "utf16le") : null });
          assert.equal(prepared.status, 0, `graceful post-update cleanup: ${prepared.stderr} ${existsSync(report) ? readFileSync(report, "utf16le") : ""}`);
          if (daemon) assertExited(daemon);
          assertNoDiscovery(channel);
          try { await other?.alive(); }
          catch (error) {
            try { await diagnoseOtherHealth(error); }
            catch (diagnosticError) { console.error("Other-channel diagnostics failed:", diagnosticError); }
            throw error;
          }
        }
      } finally {
        // Always release only this test's owned installation, even when the graceful
        // cleanup assertion fails. The assertion still fails; production never force-kills.
        for (const process of installedAt ? (() => { try { return appProcesses(installedAt); } catch { return []; } })() : []) {
          spawnSync("taskkill", ["/PID", String(process.pid), "/T", "/F"], { stdio: "ignore" });
        }
        if (installedAt) {
          const uninstall = spawnSync(path.join(installedAt, `Uninstall ${brand.executableName}.exe`), ["/S", "/currentuser"], { stdio: "ignore" });
          // The uninstaller copies itself and returns at once; wait for the entry to go.
          for (let wait = 0; wait < 60 && installedEntry(); wait++) await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log(`uninstall: ${uninstall.status}; entry ${installedEntry() ? "remains" : "removed"}`);
        }
      }
    } finally {
      // A failed cleanup assertion must not leave the CLI fixture keeping the runner alive.
      await other?.stop();
    }
    // This test made these folders (it refused to run when they existed).
    if (ownsData) for (const folder of [appData, updaterCache, ...(!LIVE ? [sharedData] : [])]) rmSync(folder, { recursive: true, force: true });
  }
  assert.equal(installedEntry(), "", "the uninstaller left its entry");
  if (!LIVE) {
    assert.deepEqual((await cliEnvironment.read()).user, originalUserPath, "uninstall restores only our PATH entry");
    for (const name of [`${brand.cliCommand}.cmd`, "owner.json", "app"]) assert.equal(existsSync(path.join(cliBin, name)), false, `uninstall left ${name}`);
    assert.equal(existsSync(cliBin), false, "uninstall must remove an empty owned bin before the next channel runs");
  }
});


// The old installer comes from GitHub; only the candidate is built. Rebuilding the old
// version here would miss installer bootstrap defects. Release verification runs this as a separate early step.
// beta.9 and earlier assets were withdrawn on 2026-11-12 for CVE-2026-111497.
// 0.0.2 Stable includes the helper: this no longer covers beta.6's helperless first update.
test("published 0.0.2 Stable upgrades to the candidate and preserves installed data", {
  skip: !PUBLISHED_BASE || LIVE, timeout: 5 * 60_000,
}, async () => {
  requireCleanUser();
  const started = Date.now();
  rmSync(work, { recursive: true, force: true });
  const published = "0.0.2";
  const oldBuild = await publicBeta([published], published);
  const oldSetup = path.join(oldBuild, `${brand.executableName}-Setup-${published}.exe`);
  const digest = createHash("sha256").update(readFileSync(oldSetup)).digest("hex");
  assert.equal(digest, "7271f9bd7c22ee3da5bcfe4cbfc263d6e1ddf77ef51819204f065786efee1e4c", "the exact public 0.0.2 Stable installer, not a rebuilt version");
  console.log(`verified public v${published}: SHA-256 ${digest}`);
  const candidateBuild = packageVersion(NEW);
  const candidate = path.join(candidateBuild, `${brand.executableName}-Setup-${NEW}.exe`);
  const server = releases(candidateBuild, []);
  const install = path.join(work, "published-stable-install");
  const documentFile = path.join(work, "published-stable.md");
  const bytes = "---\nlitzio: 1\n---\n\n# Published update\n\nPreserve this document.\n";
  writeFileSync(documentFile, bytes);
  const environment = windowsEnvironment();
  const originalPath = (await environment.read()).user;
  let ownsInstallation = false;
  let oldApp: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(47320, "127.0.0.1", resolve);
    });
    requireCleanUser();
    const initial = spawnSync(oldSetup, ["/S", `/D=${install}`], { timeout: 60_000, encoding: "utf8" });
    assert.ifError(initial.error); assert.equal(initial.status, 0);
    assert.equal(path.resolve(installedEntry()).toLowerCase(), install.toLowerCase());
    ownsInstallation = true;
    const exe = path.join(install, `${brand.executableName}.exe`);
    assert.equal(powershell(`(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.FileVersion`), published);
    assert.equal(existsSync(path.join(install, "resources/prepare-installation.cjs")), true, "public 0.0.2 Stable includes the lifecycle helper");
    assertNoDiscovery("stable");
    oldApp = await electron.launch({ executablePath: exe, args: ["--lang=en-US", documentFile], timeout: 60_000 });
    const page = await oldApp.firstWindow();
    await page.locator('[data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached", timeout: 30_000 });
    await page.getByRole("button", { name: /^Settings/ }).click();
    await page.getByRole("button", { name: "About & updates", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").innerText(), published);
    assert.equal(await page.getByRole("radio", { name: /^Stable/ }).isChecked(), true, "public Stable starts on Stable");
    // A Stable user opts into Beta before installing a Beta candidate.
    await page.getByRole("radio", { name: /^Beta/ }).check();
    assert.equal(await page.getByRole("radio", { name: /^Beta/ }).isChecked(), true);
    await page.waitForFunction(() => window.litzioDesktop?.info().then(info => info.channel === "beta"));
    await oldApp.close(); oldApp = undefined;
    const canary = path.join(appData, "published-update-canary.txt");
    writeFileSync(canary, "Preserve existing 0.0.2 Stable user data.\n");
    const preferencesFile = path.join(appData, "preferences.json");
    const preferences = readPreferences(preferencesFile, published);
    assert.equal(preferences.channel, "beta", "the user's Beta choice was persisted by the public app");
    // Same NSIS command-line transaction used by electron-updater; updater UI/dirty guards
    // remain in the existing two cases. No app-update config or old ASAR is modified.
    const updated = spawnSync(candidate, ["--updated", "/S", "--force-run"], { timeout: 60_000, encoding: "utf8" });
    assert.ifError(updated.error);
    assert.equal(updated.status, 0, "public 0.0.2 Stable -> candidate NSIS update must succeed");
    const log = path.join(appData, "logs/desktop.log");
    const deadline = Date.now() + 30_000;
    while (!(readDaemonRecord(daemonDirectory("beta"))?.productVersion === NEW && existsSync(log) && readFileSync(log, "utf8").split(`starting ${NEW}`).at(-1)!.includes("window shown"))) {
      if (Date.now() >= deadline) throw new Error(`Updated 0.0.2 Stable app/daemon did not start: ${existsSync(log) ? readFileSync(log, "utf8") : "no log"}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    desktopRecord("beta", NEW);
    assert.equal(powershell(`(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.FileVersion`), NEW);
    assert.equal(readFileSync(documentFile, "utf8"), bytes);
    assert.equal(readFileSync(canary, "utf8"), "Preserve existing 0.0.2 Stable user data.\n");
    assert.deepEqual(readPreferences(preferencesFile, NEW), preferences);
    assert.deepEqual((await environment.read()).user, originalPath, "first update does not opt in to CLI/PATH");
    console.log(`public 0.0.2 Stable -> ${NEW}: installed, launched and preserved data`);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await oldApp?.close();
    if (ownsInstallation) {
      const exe = path.join(install, `${brand.executableName}.exe`);
      const helper = path.join(install, "resources/prepare-installation.cjs");
      if (existsSync(helper)) {
        const record = readDaemonRecord(daemonDirectory("beta"));
        const report = path.join(work, "published-cleanup.txt");
        const result = spawnSync(exe, [helper, "--prepare-installation", report], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 30_000, encoding: "utf8" });
        assert.equal(result.status, 0, existsSync(report) ? readFileSync(report, "utf16le") : result.stderr);
        if (record) assertExited(record);
        assertNoDiscovery("stable");
        assertNoDiscovery("beta");
      }
      const removal = path.join(work, "published-stable-uninstall.exe");
      copyFileSync(path.join(install, `Uninstall ${brand.executableName}.exe`), removal);
      const removed = spawnSync(removal, ["/S", "/currentuser", `_?=${install}`], { timeout: 60_000, encoding: "utf8" });
      assert.ifError(removed.error); assert.equal(removed.status, 0);
      assert.equal(installedEntry(), "");
      assert.equal(existsSync(exe), false);
      for (const folder of [appData, updaterCache, sharedData]) rmSync(folder, { recursive: true, force: true });
    }
    assert.deepEqual((await environment.read()).user, originalPath);
    console.log(`public 0.0.2 Stable update case: ${Date.now() - started} ms (download, install, update, startup, cleanup)`);
  }
});
