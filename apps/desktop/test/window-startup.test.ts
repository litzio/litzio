// Execute main's actual wiring with in-memory Electron/filesystem ports. Never launch the app.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RemoteHostRegistry } from "../../editor/server/remote-host-registry.ts";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { test, after } from "node:test";
const registryRoot = mkdtempSync(path.join(tmpdir(), "litzio-desktop-host-test-"));
after(() => {
  if (!path.resolve(registryRoot).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unsafe test cleanup.");
  rmSync(registryRoot, { recursive: true, force: true });
});
import { transformSync } from "esbuild";
import { DESKTOP_ENTRY, trustedDesktopUrl } from "../../editor/shared/desktop-origin.ts";
import { bundledUiResponse } from "../src/bundled-ui.ts";
import { daemonPort } from "../../editor/server/daemon-state.ts";
import { ExplorerFolders } from "../src/explorer.ts";
import { INSTALLATION_CLOSE_MESSAGE } from "../src/installation-lifecycle.ts";
import { brand } from "../../../brand.ts";

import type { UpdateState } from "../../editor/shared/desktop-bridge.ts";

const main = new URL("../src/main.ts", import.meta.url);
const source = transformSync(readFileSync(main, "utf8"), {
  loader: "ts", format: "cjs", define: { "import.meta.url": JSON.stringify(main.href), __LITZIO_REQUIRE_SIGNED_UPDATES__: "false" },
}).code;

async function start(options: { backgroundNoticeShown?: boolean; workDamage?: "corrupt" | "interrupted" | "unwritable"; registryDamage?: boolean; restartAllowed?: boolean; startupError?: boolean; logError?: boolean; openError?: string; loadError?: boolean; lock?: boolean; update?: UpdateState; daemonVersion?: string; daemonError?: string; daemonPending?: boolean; stopChoice?: number; closeError?: string; installationError?: string; packaged?: boolean; resetCloseRefused?: boolean } = {}) {
  const registry = new RemoteHostRegistry(path.join(registryRoot, randomUUID() + ".json"));
  const workFile = registry.desktopWorkFile("/fake-user-data");
  if (options.workDamage) {
    mkdirSync(path.dirname(workFile), { recursive: true });
    if (options.workDamage === "corrupt") writeFileSync(path.join(path.dirname(workFile), `${path.basename(workFile).split(".")[0]}.2147483647.previous.json`), "{");
    if (options.workDamage === "unwritable") mkdirSync(workFile);
    if (options.workDamage === "interrupted") {
      const module = new URL("../../editor/server/remote-host-registry.ts", import.meta.url).href;
      const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
        import fs from 'node:fs'; import {RemoteHostRegistry} from ${JSON.stringify(module)};
        const registry = new RemoteHostRegistry(${JSON.stringify(registry.file)});
        const rename = fs.renameSync;
        fs.renameSync = (from, to) => { if (to === registry.desktopWorkFile('/fake-user-data')) process.exit(23); return rename(from, to); };
        registry.desktopWork('/fake-user-data', []);
      `], { encoding: "utf8", windowsHide: true });
      assert.equal(result.status, 23, result.stderr);
      assert.equal(existsSync(registry.file + ".lock"), false, "summary writes must not acquire the registry lock");
    }
  }
  if (options.registryDamage) writeFileSync(registry.file, "{");
  const preferences: unknown[] = [];
  const logs: string[] = [], errors: unknown[][] = [], alerts: string[] = [];
  const directories: string[] = [], opened: string[] = [];
  const daemonCalls: string[] = [], confirmations: any[] = [];
  const resetCalls: any[] = [];
  const mainProcess = Object.assign(new EventEmitter(), { argv: [], platform: "win32", env: {}, resourcesPath: "/fake-resources", pid: 123, execPath: "/fake-app.exe" });
  const timers = new Map<number, { run: () => void; ms: number }>();
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const listeners = new Map<string, (event: any, ...args: unknown[]) => void>();
  let timerId = 0, exits = 0, quits = 0;
  const trays: Tray[] = [];
  let menu: any[] = [];
  class Tray extends EventEmitter {
    tooltip = ""; balloons: any[] = []; destroyed = false;
    constructor(readonly icon: string) { super(); trays.push(this); }
    setToolTip(value: string) { this.tooltip = value; }
    setContextMenu(value: any[]) { menu = value; }
    displayBalloon(value: any) { this.balloons.push(value); }
    destroy() { this.destroyed = true; }
  }
  let restartAnswer: ((...args: any[]) => void) | undefined;
  class Window extends EventEmitter {
    visible = false; minimized = false; shows = 0; focused = false; destroyed = false;
    hooks = new Map<number, () => void>();
    loaded = "";
    background = ""; overlay: unknown;
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: { url: DESKTOP_ENTRY }, setWindowOpenHandler() {}, send(channel: string, id: number) {
        if (channel === "desktop:restart-check") restartAnswer?.({ sender: this, senderFrame: this.mainFrame }, id, options.restartAllowed === false ? { ok: false, reason: "Unsaved draft" } : { ok: true });
      },
    });
    constructor(_options: unknown) { super(); windows.push(this); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    focus() { this.focused = true; }
    show() { this.visible = true; this.shows++; }
    hide() { this.visible = false; }
    hookWindowMessage(message: number, callback: () => void) { this.hooks.set(message, callback); }
    setEnabled(_enabled: boolean) {}
    close() {
      if (this.destroyed) return;
      let prevented = false;
      this.emit("close", { preventDefault() { prevented = true; } });
      if (prevented) return;
      if (options.resetCloseRefused) {
        let leave = false;
        this.webContents.emit("will-prevent-unload", { preventDefault() { leave = true; } });
        if (!leave) return;
      }
      this.destroyed = true; this.emit("closed"); app.emit("window-all-closed");
    }
    setBackgroundColor(color: string) { this.background = color; }
    setTitleBarOverlay(overlay: unknown) { this.overlay = overlay; }
    loadURL(url: string) { this.loaded = url; return options.loadError ? Promise.reject(new Error("load rejected")) : Promise.resolve(); }
  }
  const windows: Window[] = [];
  const app = Object.assign(new EventEmitter(), {
    isPackaged: options.packaged ?? false, requestSingleInstanceLock: () => options.lock !== false,
    relaunch: () => daemonCalls.push("relaunch"),
    quit: () => { quits++; app.emit("before-quit"); if (windows[0] && !windows[0].destroyed) windows[0].close(); }, exit: (code: number) => { assert.equal(code, 1); exits++; },
    setAppUserModelId() {}, setPath() {}, whenReady: () => Promise.resolve(), getPath: () => "/fake-user-data", getVersion: () => "0.0.2-beta.9",
  });
  const require = createRequire(import.meta.url);
  const dependencies: Record<string, unknown> = {
    "./provider-session-log.ts": { openProviderSessionLog: async () => assert.fail("Provider logs must not open during startup.") },
    "../../../brand.ts": { brand },
    "electron": {
      app, BrowserWindow: Window, Tray, dialog: { showMessageBoxSync: (_target: unknown, details: any) => { confirmations.push(details); return options.stopChoice ?? 0; }, showErrorBox: (_title: string, message: string) => alerts.push(message) },
      ipcMain: { handle: (name: string, handler: (event: unknown, ...args: unknown[]) => unknown) => handlers.set(name, handler), on: (name: string, handler: (...args: any[]) => void) => { listeners.set(name, handler); if (name === "desktop:restart-check-result") restartAnswer = handler; } },
      Menu: { setApplicationMenu() {}, buildFromTemplate: (items: any[]) => items }, nativeTheme: {}, protocol: { registerSchemesAsPrivileged() {}, handle() {} },
      session: { defaultSession: { setPermissionRequestHandler() { if (options.startupError) throw new Error("permission setup failed"); }, setPermissionCheckHandler() {} } },
      shell: { openPath: async (directory: string) => { opened.push(directory); return options.openError ?? ""; } },
    },
    "node:fs": {
      mkdirSync(directory: string) { if (options.logError && directory.endsWith("logs")) throw new Error("log directory denied"); directories.push(directory); },
      appendFileSync: (_file: string, message: string) => logs.push(message), existsSync: (file: string) => file.endsWith("reset-helper.cjs"),
      mkdtempSync: () => "/fake-temp/litzio-reset-result-fixture", rmSync() {}, writeFileSync: (file: string) => resetCalls.push({ cancelledFile: file }),
    },
    "node:os": { tmpdir: () => "/fake-temp" },
    "node:child_process": { spawn: (_exe: string, args: string[], settings: unknown) => {
      resetCalls.push({ spawn: args, settings });
      const child = Object.assign(new EventEmitter(), { connected: true, stdout: { resume() {} }, stderr: { resume() {} }, unref() {}, send(request: any) {
        resetCalls.push(request);
        if (!request.cancel) void setImmediate().then(() => child.emit("message", { waiting: true }));
      } });
      return child;
    } },
    "../../editor/server/codex-app-server.ts": { stopAgentProcess: async () => resetCalls.push({ stopped: true }) },
    "electron-updater/out/AppAdapter.js": { getAppCacheDir: () => "/fake-cache" },
    "../../editor/server/reset-guard.ts": { ResetGuard: class { actor() { return () => {}; } blockAfterFailedShutdown() { resetCalls.push({ uncertainWriter: true }); } } },
    "../../editor/server/app-reset.ts": { localResetLocations: () => ({ host: "fixture-host" }), resetHostPaths: () => ({ same: true }),
      inspectAppReset: () => ({ revision: "reviewed-fixture", targets: [], retained: [] }) },
    "../../editor/server/remote-host-registry.ts": { checkRemoteHost: async () => ({ outcome: "success", state: "connected" }), RemoteHostRegistry: class { constructor() { return registry; } } },
    "electron-updater": { autoUpdater: {} }, "js-yaml": {},
    "../../editor/shared/desktop-origin.ts": { DESKTOP_ENTRY, trustedDesktopUrl },
    "./bundled-ui.ts": { bundledUiResponse },
    "./daemon-client.ts": { DesktopDaemon: class {
      channel = "beta";
      record = { url: "http://127.0.0.1:23456" }; health = { productVersion: options.daemonVersion ?? "0.0.2-beta.9", launcher: "cli-start" };
      async connect() { daemonCalls.push("connect"); if (options.daemonPending) await new Promise(() => {}); if (options.daemonError) throw new Error(options.daemonError); } async close() { daemonCalls.push("close"); if (options.closeError) throw new Error(options.closeError); }
      async check() { daemonCalls.push("check"); } async stopExplicitly() { daemonCalls.push("stop"); }
    } },
    "../../editor/server/daemon-state.ts": { daemonPort, async daemonRpc() { return { same: true }; }, processStart: () => "fixture-parent" },
    "./explorer.ts": { ExplorerFolders },
    "./first-document.ts": { firstDocument() {} },
    "./preferences.ts": { readPreferences: () => ({ channel: "beta", seenUpdate: null, backgroundNoticeShown: options.backgroundNoticeShown ?? false }), writePreferences: (_file: string, value: unknown) => preferences.push(JSON.parse(JSON.stringify(value))) },
    "./installation-lifecycle.ts": { INSTALLATION_CLOSE_MESSAGE, installationPort() {}, checkInstallation() { if (options.installationError) throw new Error(options.installationError); } },
    "./updates.ts": { UpdateController: class { channel = "beta"; state = options.update ?? { phase: "idle" }; start() {} stop() {}
      beginInstall() { return { version: "0.3.0-beta.1" }; }
      cancelInstall() { daemonCalls.push("cancel-install"); }
      finishInstall() { daemonCalls.push("install"); }
    } },
    "./update-policy.ts": {}, "./signatures.ts": {}, "./github-provider.ts": {}, "./cli-integration.ts": {}, "./windows-environment.ts": {},
  };
  runInNewContext(source, {
    require: (name: string) => {
      if (name in dependencies) return dependencies[name];
      if (name === "node:path" || name === "node:url") return require(name);
      throw new Error(`Unmocked main dependency: ${name}. Inject an isolated test port.`);
    },
    process: mainProcess, URL, URLSearchParams,
    console: { error: (...args: unknown[]) => errors.push(args) },
    setTimeout: (run: () => void, ms: number) => { timers.set(++timerId, { run, ms }); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  await setImmediate();
  const window = windows[0]!;
  const reportPendingWork = (pending: unknown, trusted = true) => {
    const event = { sender: window.webContents, senderFrame: trusted ? window.webContents.mainFrame : {}, returnValue: undefined as unknown };
    listeners.get("desktop:pending-work")!(event, pending);
    return event.returnValue;
  };
  if (window) reportPendingWork(false); // The mounted stand-in Editor has no pending work.
  const appearance = (color: unknown = "#ffffff", overlay: unknown = { color: "#f6f7f9", symbolColor: "#20242c" }, trusted = true) =>
    handlers.get("desktop:set-window-background")!({ sender: window.webContents, senderFrame: trusted ? window.webContents.mainFrame : {} }, color, overlay);
  const timeout = (ms = 5_000) => {
    const pending = [...timers.entries()].find(([, timer]) => timer.ms === ms);
    assert.ok(pending, `a ${ms}ms recovery timer must exist`);
    const [id, { run }] = pending;
    timers.delete(id);
    run();
  };
  const invoke = (channel: string, args: unknown[], trusted = true) => handlers.get(channel)!({
    sender: window.webContents, senderFrame: trusted ? window.webContents.mainFrame : {},
  }, ...args);
  return { reportPendingWork, trays, menu, registry, daemonCalls, resetCalls, confirmations, app, mainProcess, directories, opened, window, logs, errors, alerts, timers, appearance, timeout, preferences, invoke,
    seen: (version: unknown, trusted = true) => handlers.get("desktop:seen-update")!({ sender: window.webContents, senderFrame: trusted ? window.webContents.mainFrame : {} }, version), exits: () => exits, quits: () => quits };
}

test("reset handoff requires a reviewed plan, trusted sender and clean work; late unload refusal cancels its helper", async () => {
  const dirty = await start({ restartAllowed: false });
  assert.equal((await dirty.invoke("desktop:reset-app", [true, "reviewed-fixture"]) as any).ok, false);
  assert.deepEqual(dirty.resetCalls, []);
  assert.equal(dirty.window.destroyed, false);
  const stale = await start();
  assert.equal((await stale.invoke("desktop:reset-app", [false, "stale"]) as any).ok, false);
  assert.deepEqual(stale.resetCalls, []);
  assert.throws(() => stale.invoke("desktop:reset-app", [false, "reviewed-fixture"], false), /Untrusted/);
  const allowed = await start();
  assert.equal((await allowed.invoke("desktop:reset-app", [true, "reviewed-fixture"]) as any).ok, true);
  assert.equal(allowed.window.destroyed, true);
  assert.equal(allowed.resetCalls[1].parentStarted, "fixture-parent");
  assert.equal(allowed.resetCalls[1].removeFolders, true);
  assert.equal(allowed.resetCalls[0].settings.windowsHide, true);
  const late = await start({ resetCloseRefused: true });
  assert.equal((await late.invoke("desktop:reset-app", [false, "reviewed-fixture"]) as any).ok, false);
  assert.equal(late.window.destroyed, false);
  assert.ok(late.resetCalls.some(call => call.cancel));
  assert.ok(late.resetCalls.findIndex(call => call.cancelledFile) < late.resetCalls.findIndex(call => call.stopped), "revoke on disk before confirming helper stop");
  const unconfirmed = await start({ closeError: "Daemon exit was not confirmed" });
  await unconfirmed.invoke("desktop:reset-app", [false, "reviewed-fixture"]);
  await setImmediate();
  assert.ok(unconfirmed.resetCalls.some(call => call.uncertainWriter), "unconfirmed daemon exit blocks the post-exit helper from deleting data");
});

test("startup waits for paint and appearance in either order; later updates never reveal a hidden window", async () => {
  for (const paintFirst of [true, false]) {
    const h = await start();
    if (paintFirst) h.window.emit("ready-to-show"); else h.appearance();
    assert.equal(h.window.visible, false);
    if (paintFirst) h.appearance(); else h.window.emit("ready-to-show");
    assert.equal(h.window.visible, true);
    assert.equal(h.window.background, "#ffffff");
    assert.equal(h.timers.size, 0);
    h.window.visible = false;
    h.appearance("#123456");
    assert.equal(h.window.visible, false);
  }
});

test("startup deadline reveals once without first paint; late signals cannot reveal again", async t => {
  for (const appearanceFirst of [false, true]) {
    await t.test(`appearance ${appearanceFirst ? "received" : "missing"}`, async () => {
      const h = await start();
      if (appearanceFirst) h.appearance();
      assert.equal(h.window.shows, 0);
      h.timeout(15_000);
      assert.equal(h.window.shows, 1);
      assert.equal(h.timers.size, 0);
      assert.match(h.logs.join(""), /startup timed out after 15000ms/);
      h.window.visible = false;
      h.window.emit("ready-to-show");
      h.appearance();
      assert.equal(h.window.shows, 1);
      assert.equal(h.window.visible, false);
      assert.equal(h.timers.size, 0);
    });
  }
});

test("first paint does not extend the absolute startup deadline", async () => {
  const h = await start();
  const deadline = [...h.timers.entries()].find(([, timer]) => timer.ms === 15_000);
  assert.ok(deadline, "the deadline starts before first paint");
  h.window.emit("ready-to-show");
  assert.equal(h.timers.get(deadline[0]), deadline[1], "first paint must not replace or restart the deadline");
  h.timeout(15_000);
  assert.equal(h.window.shows, 1);
  assert.equal(h.timers.size, 0, "the fallback also cancels the cosmetic appearance wait");
});

test("missing or rejected appearance shows the window once and records why, without weakening IPC validation", async () => {
  const missing = await start();
  missing.window.emit("ready-to-show");
  missing.timeout();
  assert.equal(missing.window.shows, 1);
  assert.equal(missing.timers.size, 0, "the appearance fallback also cancels the absolute deadline");
  assert.match(missing.logs.join(""), /appearance timed out/);
  missing.window.visible = false;
  missing.appearance();
  assert.equal(missing.window.shows, 1);
  for (const [color, overlay] of [["#fff", { color: "#f6f7f9", symbolColor: "#20242c" }],
    ["#ffffff", { color: "red", symbolColor: "#20242c" }], ["#ffffff", { color: "#f6f7f9", symbolColor: null }], ["#ffffff", null]]) {
    const h = await start();
    assert.throws(() => h.appearance(color, overlay), /Invalid window appearance/);
    assert.equal(h.window.shows, 1);
    assert.equal(h.window.background, "");
    h.window.emit("ready-to-show");
    assert.equal(h.timers.size, 0);
    assert.match(h.logs.join(""), /window appearance failed/);
  }
  const foreign = await start();
  assert.throws(() => foreign.appearance("#ffffff", undefined, false), /Untrusted sender/);
  assert.equal(foreign.window.shows, 0);
});

test("renderer startup failures notify and reveal before paint; subframe failures are ignored", async () => {
  for (const kind of ["did-fail-load", "render-process-gone", "load-rejection"]) {
    const h = await start({ loadError: kind === "load-rejection" });
    if (kind === "did-fail-load") {
      h.window.webContents.emit(kind, {}, -105, "missing resource", "http://127.0.0.1:23456/frame", false);
      assert.equal(h.window.shows, 0);
      h.window.webContents.emit(kind, {}, -105, "missing page", "http://127.0.0.1:23456/index.html", true);
    } else if (kind === "render-process-gone") h.window.webContents.emit(kind, {}, { reason: "crashed", exitCode: 1 });
    assert.equal(h.window.shows, 1, kind);
    assert.equal(h.alerts.length, 1, kind);
    assert.match(h.logs.join(""), /renderer (load failed|exited)/);
    h.window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
    assert.equal(h.alerts.length, 1, "the startup failure is consumed once");
  }
});

test("close cancels both timers; second launch reveals, restores and focuses the existing window", async () => {
  const h = await start();
  h.window.minimized = true;
  h.app.emit("second-instance");
  assert.equal(h.window.visible, true);
  assert.equal(h.window.minimized, false);
  assert.equal(h.window.focused, true);
  assert.equal(h.timers.size, 0);
  h.window.visible = false;
  h.window.emit("ready-to-show");
  h.appearance();
  assert.equal(h.window.shows, 1, "late signals after second launch must not reveal again");
  assert.equal(h.timers.size, 0);
  h.app.emit("second-instance");
  assert.equal(h.window.shows, 2, "also reveal after the startup gate was consumed");
  for (const paintFirst of [false, true]) {
    const closed = await start();
    if (paintFirst) closed.window.emit("ready-to-show");
    closed.window.destroyed = true;
    closed.window.emit("closed");
    assert.equal(closed.timers.size, 0);
  }
});

test("close hides without unloading or daemon shutdown; tray restores the same window and persists one notice", async () => {
  const h = await start();
  h.window.close();
  assert.equal(h.window.destroyed, false);
  assert.equal(h.window.visible, false);
  assert.deepEqual(h.daemonCalls, ["connect"]);
  assert.equal(h.timers.size, 0);
  assert.equal(h.trays[0].balloons.length, 1);
  assert.equal((h.preferences[0] as any).backgroundNoticeShown, true);
  assert.match(h.trays[0].tooltip, /백그라운드 실행 중/);
  h.menu.find(item => item.label === "열기").click();
  assert.equal(h.window.visible, true);
  assert.equal(h.window.focused, true);
  h.window.close();
  assert.equal(h.trays[0].balloons.length, 1);
  h.trays[0].emit("double-click");
  assert.equal(h.window.visible, true);
  const seen = await start({ backgroundNoticeShown: true });
  seen.window.close();
  assert.equal(seen.trays[0].balloons.length, 0);
  await h.invoke("desktop:daemon-stop", []); // Cancel leaves connection untouched.
  assert.match(h.trays[0].tooltip, /백그라운드 실행 중/);
});

test("tray quit confirms interruption, cancellation keeps running, and accepted quit cleans up", async () => {
  const cancel = await start();
  cancel.window.close();
  cancel.menu.find(item => item.label === "종료").click();
  assert.equal(cancel.window.destroyed, false);
  assert.deepEqual(cancel.daemonCalls, ["connect"]);
  assert.match(cancel.confirmations[0].detail, /CLI.*원격 Host/);
  assert.equal(cancel.confirmations[0].cancelId, 0);
  const quit = await start({ stopChoice: 1 });
  quit.window.close();
  quit.menu.find(item => item.label === "종료").click();
  await setImmediate();
  assert.equal(quit.window.destroyed, true);
  assert.deepEqual(quit.daemonCalls, ["connect", "close"]);
  assert.ok(quit.quits());
  quit.app.emit("will-quit");
  assert.equal(quit.trays[0].destroyed, true);
});

test("installation WM_CLOSE and OS session end do not hide; a refused native close clears exit intent", async () => {
  for (const reason of ["installation", "query-session-end", "session-end", "before-quit"]) {
    const h = await start();
    h.window.close();
    if (reason === "installation") h.window.hooks.get(INSTALLATION_CLOSE_MESSAGE)!();
    else if (reason === "before-quit") h.app.emit(reason);
    else h.window.emit(reason, { preventDefault() { assert.fail("clean work must not block Windows session end"); } });
    h.window.close();
    await setImmediate();
    assert.equal(h.window.destroyed, true, reason);
    assert.deepEqual(h.daemonCalls, ["connect", "close"], reason);
    assert.ok(h.quits(), reason);
  }
  const refused = await start({ resetCloseRefused: true, stopChoice: 1 });
  refused.window.hooks.get(INSTALLATION_CLOSE_MESSAGE)!();
  refused.window.close();
  assert.equal(refused.window.destroyed, false);
  assert.equal(refused.window.visible, true, "removal's unsaved-work question is visible");
  refused.window.close();
  assert.equal(refused.window.visible, false, "a later ordinary close returns to tray");
  assert.deepEqual(refused.daemonCalls, ["connect"]);
  const cancelledSession = await start({ resetCloseRefused: true, stopChoice: 1 });
  cancelledSession.reportPendingWork(true);
  cancelledSession.window.close();
  let sessionPrevented = false;
  cancelledSession.window.emit("query-session-end", { preventDefault() { sessionPrevented = true; } });
  assert.equal(sessionPrevented, true, "Keep editing must block the OS session, not only window close");
  assert.equal(cancelledSession.window.destroyed, false);
  assert.equal(cancelledSession.window.visible, true);
  assert.equal(cancelledSession.window.focused, true);
  assert.deepEqual(cancelledSession.daemonCalls, ["connect"], "a cancellable query does not stop work before the native guard");
  cancelledSession.window.close();
  assert.equal(cancelledSession.window.visible, false, "Keep editing clears actual-exit intent");
  cancelledSession.window.emit("session-end", { preventDefault() { assert.fail("confirmed OS session end must never be blocked"); } });
  await setImmediate();
  assert.deepEqual(cancelledSession.daemonCalls, ["connect", "close"], "forced session end still cleans up owned work");
});

test("native session protection accepts only trusted booleans, refreshes after Save and protects an unready renderer", async () => {
  const work = { resetCloseRefused: true, stopChoice: 1 };
  const h = await start(work);
  assert.equal(h.reportPendingWork(true), true);
  assert.equal(h.reportPendingWork(false, false), false);
  assert.equal(h.reportPendingWork("false"), false);
  let blocked = false;
  h.window.emit("query-session-end", { preventDefault() { blocked = true; } });
  assert.equal(blocked, true, "invalid/untrusted reports cannot erase pending work");
  assert.equal(h.window.destroyed, false);
  work.resetCloseRefused = false; // The Editor saved/discarded its work.
  assert.equal(h.reportPendingWork(false), true);
  h.window.emit("query-session-end", { preventDefault() { assert.fail("clean work must not defer logout"); } });
  await setImmediate();
  assert.equal(h.window.destroyed, true);
  assert.deepEqual(h.daemonCalls, ["connect", "close"]);
  const unready = await start({ resetCloseRefused: true, stopChoice: 1 });
  unready.window.webContents.emit("did-start-navigation", {}, DESKTOP_ENTRY, false, true);
  let unknownBlocked = false;
  unready.window.emit("query-session-end", { preventDefault() { unknownBlocked = true; } });
  assert.equal(unknownBlocked, true, "loading state cannot reuse a previous clean report");
});

test("startup exceptions are logged, reported and exit; logging failure remains observable on stderr", async () => {
  const h = await start({ startupError: true });
  assert.match(h.logs.join(""), /starting 0.0.2-beta.9[\s\S]*startup failed: Error: permission setup failed/);
  assert.match(h.alerts[0]!, /permission setup failed/);
  assert.equal(h.exits(), 1);
  const denied = await start({ logError: true, startupError: true });
  assert.ok(denied.errors.some(args => args.join(" ").includes("log directory denied")));
  assert.equal(denied.exits(), 1);
  const second = await start({ lock: false });
  assert.equal(second.quits(), 1);
  assert.equal(second.logs.length, 0, "a secondary process exits before startup/log creation");
});


test("viewed updates persist only the current offered version from a trusted renderer", async () => {
  for (const update of [
    { phase: "available", version: "0.3.0-beta.1", prerelease: true },
    { phase: "downloaded", version: "0.3.0-beta.1", prerelease: true },
    { phase: "error", during: "download", message: "offline", update: { version: "0.3.0-beta.1", prerelease: true } },
  ] satisfies UpdateState[]) {
    const h = await start({ update });
    assert.throws(() => h.seen("0.3.0-beta.1", false), /Untrusted sender/);
    h.seen("0.4.0"); h.seen(null);
    assert.equal(h.preferences.length, 0);
    h.seen("0.3.0-beta.1");
    assert.equal(JSON.stringify(h.preferences), JSON.stringify([{ channel: "beta", seenUpdate: "0.3.0-beta.1", backgroundNoticeShown: false }]));
  }
  const idle = await start();
  idle.seen("0.3.0-beta.1");
  assert.equal(idle.preferences.length, 0);
});

test("Explorer IPC rejects untrusted senders and invalid roots/paths through main's real wiring", async () => {
  const h = await start();
  for (const channel of ["desktop:opened-folders", "desktop:open-folder"]) {
    assert.throws(() => h.invoke(channel, [null], false), /Untrusted sender/);
  }
  await assert.rejects(async () => h.invoke("desktop:opened-folders", [[null]]), /Invalid folders/);
  await assert.rejects(async () => h.invoke("desktop:open-folder", [null]), /Invalid local folder path/);
});

test("log folder IPC creates and opens only main's fixed directory and reports failure", async () => {
  const h = await start();
  assert.throws(() => h.invoke("desktop:open-log-folder", [], false), /Untrusted sender/);
  assert.equal(h.opened.length, 0);
  h.directories.length = 0;
  await h.invoke("desktop:open-log-folder", ["C:\\private-document"]);
  assert.deepEqual(h.opened, h.directories);
  assert.equal(h.opened.length, 1);
  assert.match(h.opened[0]!, /fake-user-data[/\\]logs$/);
  const failed = await start({ openError: "OS failed" });
  await assert.rejects(async () => failed.invoke("desktop:open-log-folder", []), /Could not open the log folder/);
  const denied = await start({ logError: true });
  await assert.rejects(async () => denied.invoke("desktop:open-log-folder", []), /log directory denied/);
  assert.equal(denied.opened.length, 0);
});

test("process diagnostics omit error content and preserve existing exception/rejection handlers", async () => {
  const h = await start();
  assert.equal(h.mainProcess.listenerCount("uncaughtException"), 0);
  assert.equal(h.mainProcess.listenerCount("unhandledRejection"), 0);
  for (const origin of ["uncaughtException", "unhandledRejection"]) {
    h.mainProcess.emit("uncaughtExceptionMonitor", new Error("private document C:\\private.md"), origin);
    assert.ok(h.logs.at(-1)?.includes(`main ${origin}`));
  }
  h.app.emit("child-process-gone", {}, { type: "GPU", reason: "crashed", exitCode: 7, name: "private", serviceName: "private" });
  assert.match(h.logs.at(-1)!, /type=GPU reason=crashed exitCode=7/);
  h.window.emit("ready-to-show"); h.appearance();
  h.window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 9 });
  assert.match(h.logs.at(-1)!, /renderer exited: crashed \(9\)/);
  assert.equal(h.alerts.length, 0, "post-start crash keeps existing UI behavior");
  assert.ok(!h.logs.join("").includes("private"));
});

test("main's monitor observes real uncaught exceptions and default rejections without suppressing exit", async () => {
  const h = await start();
  const monitor = h.mainProcess.listeners("uncaughtExceptionMonitor")[0]!;
  for (const [origin, trigger] of [
    ["uncaughtException", 'throw new Error("private document")'],
    ["unhandledRejection", 'Promise.reject(new Error("private document"))'],
  ]) {
    const result = spawnSync(process.execPath, ["-e", `
      const log = message => process.stdout.write(message);
      process.on("uncaughtExceptionMonitor", ${monitor.toString()});
      ${trigger};
    `], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, `main ${origin}`);
    assert.match(result.stderr, /private document/);
  }
});

test("daemon controls require trusted bundled main frame, always confirm stop and keep product mismatches connected", async () => {
  for (const stopChoice of [0, 1]) {
    const h = await start({ stopChoice, daemonVersion: "0.0.1" });
    assert.deepEqual(h.daemonCalls, ["connect"]);
    assert.equal(h.window.loaded, DESKTOP_ENTRY);
    assert.equal((await h.invoke("desktop:host-connection", []) as any).productVersion, "0.0.1");
    assert.equal(await h.invoke("desktop:daemon-stop", []), stopChoice === 1);
    assert.equal(h.confirmations[0].cancelId, 0);
    assert.match(h.confirmations[0].detail, /Connected tabs.*ongoing work/);
    assert.equal(h.daemonCalls.includes("stop"), stopChoice === 1);
    assert.match(h.trays[0].tooltip, stopChoice === 1 ? /연결 끊김/ : /백그라운드 실행 중/);
    for (const event of ["will-navigate", "will-redirect"]) {
      let refused = false;
      h.window.webContents.emit(event, { preventDefault() { refused = true; } }, "https://foreign.invalid/");
      assert.equal(refused, true);
    }
    h.window.webContents.mainFrame.url = "http://127.0.0.1:23457/index.html";
    assert.throws(() => h.invoke("desktop:daemon-reconnect", []), /Untrusted/);
    h.window.webContents.mainFrame.url = DESKTOP_ENTRY;
    await h.invoke("desktop:daemon-reconnect", []);
    assert.match(h.trays[0].tooltip, /백그라운드 실행 중/);
    assert.equal(h.daemonCalls.filter(call => call === "connect").length, 2);
    h.app.emit("window-all-closed");
    await setImmediate();
    assert.equal(h.daemonCalls.at(-1), "close");
  }
});


test("bundled window and IPC remain available while daemon is pending or rejected", async () => {
  for (const options of [{ daemonPending: true }, { daemonError: "Protocol mismatch. Restart with CLI." }]) {
    const h = await start(options);
    assert.equal(h.window.loaded, DESKTOP_ENTRY);
    h.window.emit("ready-to-show"); h.appearance();
    assert.equal(h.window.visible, true);
    assert.equal(h.exits(), 0);
    if (options.daemonError) await assert.rejects(async () => h.invoke("desktop:host-connection", []), /Protocol mismatch.*CLI/);
    for (const url of ["http://127.0.0.1:23456/index.html", "litzio://foreign/index.html", "litzio://app.evil/index.html", "litzio://user@app/index.html"]) {
      h.window.webContents.mainFrame.url = url;
      assert.throws(() => h.invoke("desktop:info", []), /Untrusted sender/);
    }
    h.window.webContents.mainFrame.url = DESKTOP_ENTRY;
    assert.throws(() => h.invoke("desktop:info", [], false), /Untrusted sender/);
  }
});


test("update installation requires confirmed daemon exit; CLI refusal keeps the window open", async () => {
  for (const closeError of [undefined, "daemon still running"]) {
    const h = await start({ closeError, update: { phase: "downloaded", version: "0.3.0-beta.1", prerelease: true } });
    h.window.close(); // A downloaded update never installs just because the app enters the tray.
    assert.equal(h.daemonCalls.includes("close"), false);
    assert.equal(h.daemonCalls.includes("install"), false);
    await h.invoke("desktop:install", []);
    assert.equal(h.window.destroyed, true);
    await setImmediate();
    assert.equal(h.daemonCalls.includes("install"), !closeError);
    assert.equal(h.daemonCalls.includes("cancel-install"), Boolean(closeError));
    assert.ok(h.daemonCalls.indexOf("close") < (h.daemonCalls.indexOf("install") === -1 ? Infinity : h.daemonCalls.indexOf("install")));
  }
  const h = await start({ packaged: true, installationError: "Stop CLI daemon first", update: { phase: "downloaded", version: "0.3.0-beta.1", prerelease: true } });
  assert.equal((await h.invoke("desktop:install", []) as any).reason, "Stop CLI daemon first");
  assert.equal(h.window.destroyed, false);
  assert.equal(h.daemonCalls.includes("close"), false);
  const late = await start({ resetCloseRefused: true, update: { phase: "downloaded", version: "0.3.0-beta.1", prerelease: true } });
  await late.invoke("desktop:install", []);
  assert.equal(late.window.destroyed, false);
  assert.deepEqual(late.daemonCalls, ["connect", "cancel-install"]);
  late.window.close();
  assert.equal(late.window.visible, false, "late work veto returns update close to ordinary tray behavior");
});

test("settings removal requires cleared work, recovery and confirmation without daemon control", async () => {
  const h = await start({ stopChoice: 1 });
  const host = h.registry.register("https://remote.example", "Remote").host;
  assert.throws(() => h.invoke("desktop:host-remove", [host.hostId]), /not ready/);
  for (const [openWork, recovery] of [[1, 0], [0, 1]]) {
    h.invoke("desktop:host-work", [[{ hostId: host.hostId, openWork, recovery }]]);
    assert.throws(() => h.invoke("desktop:host-remove", [host.hostId]), /Close Host tabs/);
  }
  h.invoke("desktop:host-work", [[]]);
  assert.throws(() => h.invoke("desktop:host-remove", [host.hostId], false), /Untrusted/);
  h.invoke("desktop:host-remove", [host.hostId]);
  assert.deepEqual(h.registry.list(), []);
  assert.equal(h.confirmations.at(-1).buttons[1], "Remove");
  assert.ok(!h.daemonCalls.includes("stop"));
  const cancel = await start();
  const other = cancel.registry.register("https://other.example", "Other").host;
  cancel.invoke("desktop:host-work", [[]]);
  assert.throws(() => cancel.invoke("desktop:host-remove", [other.hostId]), /cancelled/);
  assert.equal(cancel.registry.list().length, 1);
});

test("registration restart requires Editor protection and relaunches only after window close", async () => {
  const denied = await start({ restartAllowed: false });
  assert.throws(() => denied.invoke("desktop:host-check", ["https://remote.example"], false), /Untrusted/);
  assert.throws(() => denied.invoke("desktop:host-check", [null]), /Expected text/);
  assert.deepEqual(await denied.invoke("desktop:host-check", ["https://remote.example"]), { outcome: "success", state: "connected" });
  assert.deepEqual(denied.registry.list(), [], "address checks do not save registrations");
  const refusal = await denied.invoke("desktop:host-restart", []) as { ok: boolean };
  assert.equal(refusal.ok, false);
  assert.equal(denied.window.destroyed, false);
  assert.ok(!denied.daemonCalls.includes("relaunch"));
  const allowed = await start();
  const result = await allowed.invoke("desktop:host-restart", []) as { ok: boolean };
  await setImmediate();
  assert.equal(result.ok, true);
  assert.equal(allowed.window.destroyed, true);
  assert.ok(allowed.daemonCalls.includes("relaunch"));
  assert.ok(!allowed.daemonCalls.includes("stop"));
  const late = await start({ resetCloseRefused: true });
  await late.invoke("desktop:host-restart", []);
  assert.equal(late.window.destroyed, false);
  assert.deepEqual(late.daemonCalls, ["connect"]);
  late.window.close();
  assert.equal(late.window.visible, false, "late work veto clears the protected restart intent");
});

test("damaged own summaries recover without blocking window creation; interrupted writes cannot lock the next start", async () => {
  for (const workDamage of ["corrupt", "interrupted"] as const) {
    const h = await start({ workDamage });
    assert.ok(h.window, "Desktop must create its window");
    assert.equal(h.exits(), 0);
    const owner = JSON.parse(readFileSync(h.registry.desktopWorkFile("/fake-user-data"), "utf8"));
    assert.equal(owner.pid, process.pid);
    assert.equal(owner.summary, null, "startup must reset only its own committed summary");
    assert.equal(existsSync(h.registry.file + ".lock"), false);
    assert.equal((h.invoke("desktop:hosts", []) as { cliRemovalProtectionWarning: boolean }).cliRemovalProtectionWarning, false);
  }
});
test("unwritable summary or unreadable registry logs a problem but still creates the Desktop window", async () => {
  for (const options of [{ workDamage: "unwritable" as const }, { registryDamage: true }]) {
    const h = await start(options);
    assert.ok(h.window);
    assert.equal(h.exits(), 0);
    assert.ok(h.logs.some(message => message.includes("continuing")));
    if (options.workDamage) {
      assert.ok(h.logs.some(message => message.includes("Could not record CLI removal protection")));
      assert.equal((h.invoke("desktop:hosts", []) as { cliRemovalProtectionWarning: boolean }).cliRemovalProtectionWarning, true);
    }
  }
});
