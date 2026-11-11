import { openProviderSessionLog } from "./provider-session-log.ts";
import { RemoteHostRegistry, checkRemoteHost } from "../../editor/server/remote-host-registry.ts";
import { brand } from "../../../brand.ts";
// Litzio Desktop: one window with the bundled Editor, the shared daemon HTTP Host, preferences
// and updates. Documents are read and written only through the existing Host handlers.
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { stopAgentProcess } from "../../editor/server/codex-app-server.ts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, session, shell, Tray, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { getAppCacheDir } from "electron-updater/out/AppAdapter.js";
import { load as loadYaml } from "js-yaml";
import type { DesktopInfo, HostWorkSummary, RestartCheck } from "../../editor/shared/desktop-bridge.ts";
import { DesktopDaemon } from "./daemon-client.ts";
import { DESKTOP_ENTRY, trustedDesktopUrl } from "../../editor/shared/desktop-origin.ts";
import { bundledUiResponse } from "./bundled-ui.ts";
import { daemonPort, daemonRpc, processStart } from "../../editor/server/daemon-state.ts";
import { ResetGuard } from "../../editor/server/reset-guard.ts";
import { inspectAppReset, localResetLocations, resetHostPaths } from "../../editor/server/app-reset.ts";
import { ExplorerFolders } from "./explorer.ts";
import { firstDocument } from "./first-document.ts";
import { readPreferences, writePreferences, type Preferences } from "./preferences.ts";
import { parseChannel, releaseNotesUrl, RELEASE_REPOSITORY, RESTART_CHECK_TIMEOUT_MS } from "./update-policy.ts";
import { UpdateController, type UpdaterPort } from "./updates.ts";
import { verifyUpdateSignature } from "./signatures.ts";
import { IeumGitHubProvider } from "./github-provider.ts";
import { CliIntegration } from "./cli-integration.ts";
import { windowsEnvironment } from "./windows-environment.ts";
import { checkInstallation, installationPort, INSTALLATION_CLOSE_MESSAGE } from "./installation-lifecycle.ts";

/** Set by the release build: an update must carry the publisher signature the installed app names. */
declare const __LITZIO_REQUIRE_SIGNED_UPDATES__: boolean;


protocol.registerSchemesAsPrivileged([{ scheme: "litzio", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setAppUserModelId(brand.appId);
const releaseResetGuard = new ResetGuard().actor("desktop");
process.once("exit", releaseResetGuard);
// Explicit automation/operator profile overrides remain authoritative.
if (!process.argv.some(arg => arg === "--user-data-dir" || arg.startsWith("--user-data-dir="))) {
  const directory = path.join(app.getPath("appData"), brand.folders.desktopData);
  mkdirSync(directory, { recursive: true });
  app.setPath("userData", directory);
}

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const preferencesFile = () => path.join(app.getPath("userData"), "preferences.json");
let window: BrowserWindow | null = null;
let readyToShow = false;
let appearanceReady = false;
let startupPending = false;
let appearanceTimer: ReturnType<typeof setTimeout> | undefined;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
// Local CSS/IPC normally finishes before mounting. Bound the cosmetic wait after first paint.
const APPEARANCE_TIMEOUT_MS = 5_000;
// Allow ten seconds for first paint plus the cosmetic wait, even if paint never arrives.
const STARTUP_TIMEOUT_MS = 15_000;

function showStartupWindow(reason?: string): void {
  if (!startupPending || !window || window.isDestroyed()) return;
  startupPending = false;
  clearTimeout(appearanceTimer);
  clearTimeout(startupTimer);
  if (reason) log(`window startup fallback: ${reason}`);
  window.show();
  log("window shown");
}

function showWhenReady(): void {
  // Consume the startup gate: a later OS/theme update must not reveal a hidden window.
  if (readyToShow && appearanceReady) showStartupWindow();
}
let preferences: Preferences;
let updates: UpdateController;
let cliIntegration: CliIntegration | undefined;
let daemon: DesktopDaemon;
let initialConnection: Promise<void>;
let first: ReturnType<typeof firstDocument>;
const explorerFolders = new ExplorerFolders();
/** Set after the Editor agreed to restart for an update; the installer starts once the window closed. */
let installing = false;
let restartingHosts = false;
let resetting = false;
// App-owned exit intent: ordinary window close must never destroy the editing session.
let exiting = false;
let tray: Tray | undefined;
let daemonConnected = false;
let daemonShutdown: Promise<void> | undefined;
// The native Windows query cannot await renderer IPC. Unknown/loading work is protected.
let pendingWindowWork = true;
const remoteHosts = new RemoteHostRegistry();
let allowedHostIds: string[] = [];
let hostWork: HostWorkSummary[] | null = null;
let cliRemovalProtectionWarning = false;

function openWindow(): void {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (startupPending) showStartupWindow("open requested the hidden window");
  else window.show();
  window.focus();
}

function trayStatus(connected: boolean): void {
  daemonConnected = connected;
  tray?.setToolTip(`${brand.name.ko}: ${connected ? "백그라운드 실행 중" : "연결 끊김"}`);
}

async function checkDaemon(): Promise<void> {
  try { await daemon.check(); trayStatus(true); }
  catch (error) { trayStatus(false); throw error; }
}

function closeDaemon(): Promise<void> {
  updates?.stop();
  return daemonShutdown ??= daemon?.close() ?? Promise.resolve();
}

function createTray(): void {
  tray = new Tray(path.join(appRoot, "icon.ico"));
  trayStatus(daemonConnected);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "열기", click: openWindow },
    { label: "종료", click: () => {
      if (!window || installing || restartingHosts || resetting || restartAnswers.size) return;
      openWindow();
      if (dialog.showMessageBoxSync(window, { type: "warning", title: brand.name.ko,
        message: `${brand.name.ko}를 종료할까요?`,
        detail: "Desktop이 시작한 로컬 daemon과 진행 중인 비서·플러그인 작업이 종료됩니다. CLI로 시작한 daemon과 원격 Host는 계속 실행됩니다.",
        buttons: ["취소", "종료"], defaultId: 0, cancelId: 0, noLink: true }) !== 1) return;
      exiting = true;
      window.close();
    } },
  ]));
  tray.on("double-click", openWindow);
}

function log(message: string): void {
  try {
    const directory = path.join(app.getPath("userData"), "logs");
    const file = path.join(directory, "desktop.log");
    mkdirSync(directory, { recursive: true });
    if (existsSync(file) && statSync(file).size > 1_000_000) renameSync(file, `${file}.old`);
    appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
  } catch (error) {
    // Logging never stops the app, but a missing file must not erase its diagnostic too.
    console.error("Could not write Desktop log:", error, message);
  }
}

// Observe without handling: keep Electron/Node's existing exception and rejection behavior.
// With Node's default rejection mode, unhandled rejections arrive with that origin too.
// Error messages, stacks and rejection values can contain document text or full paths.
process.on("uncaughtExceptionMonitor", (_error, origin) => log(`main ${origin}`));
app.on("child-process-gone", (_event, details) => {
  log(`child process exited: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`);
});

/** Why this build does not update itself, or undefined when it can. */
function updatesUnsupported(updater: typeof electronUpdater.autoUpdater): string | undefined {
  if (!app.isPackaged) return "Updates run in the installed app.";
  const config = path.join(process.resourcesPath, "app-update.yml");
  if (!existsSync(config)) return "This build has no update configuration.";
  try {
    const parsed = loadYaml(readFileSync(config, "utf8")) as Record<string, unknown> | null;
    if (!parsed || Array.isArray(parsed) || parsed.provider !== "github" || parsed.owner !== RELEASE_REPOSITORY.owner || parsed.repo !== RELEASE_REPOSITORY.repo) {
      return "This build has an invalid update configuration.";
    }
    if (__LITZIO_REQUIRE_SIGNED_UPDATES__) {
      const names = typeof parsed?.publisherName === "string" ? [parsed.publisherName] : parsed?.publisherName;
      if (!Array.isArray(names) || !names.length || !names.every((name) => typeof name === "string" && name.trim())) {
        return "This build cannot verify who published an update, so it does not update itself.";
      }
    }
    updater.setFeedURL({ ...parsed, provider: "custom", updateProvider: IeumGitHubProvider });
  } catch {
    return "This build has an invalid update configuration.";
  }
  return undefined;
}

/** Only the app's own page may call the Desktop bridge. */
function trusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return window !== null && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame &&
    trustedDesktopUrl(event.senderFrame?.url ?? "");
}

function info(): DesktopInfo {
  return { version: app.getVersion(), channel: updates.channel, updatesSupported: updates.supported, update: updates.state, seenUpdate: preferences.seenUpdate };
}

/** Links leave through the system browser, and only as http(s). */
function openExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") void shell.openExternal(parsed.href);
  } catch {
    // Not a URL: ignored.
  }
}

let restartRequest = 0;
const restartAnswers = new Map<number, (check: RestartCheck) => void>();

/** Ask the Editor whether it may restart. No answer, a malformed one or a closed window is a no. */
function askEditorToRestart(target: BrowserWindow): Promise<RestartCheck> {
  const id = ++restartRequest;
  return new Promise((resolve) => {
    const refuse = (reason: string) => finish({ ok: false, reason });
    const timer = setTimeout(() => refuse("Could not confirm that your work is saved."), RESTART_CHECK_TIMEOUT_MS);
    const gone = () => refuse("The editor closed before it answered.");
    target.webContents.once("render-process-gone", gone);
    function finish(check: RestartCheck) {
      clearTimeout(timer);
      restartAnswers.delete(id);
      if (!target.isDestroyed()) target.webContents.removeListener("render-process-gone", gone);
      resolve(check);
    }
    restartAnswers.set(id, finish);
    target.webContents.send("desktop:restart-check", id);
  });
}

async function installUpdate(): Promise<RestartCheck> {
  const target = window;
  if (!target || updates.state.phase !== "downloaded") return { ok: false, reason: "No downloaded update is ready to install." };
  if (restartAnswers.size) return { ok: false, reason: "Already checking whether the app may restart." };
  // No input reaches the Editor between its answer and the window closing.
  target.setEnabled(false);
  const check = await askEditorToRestart(target);
  if (check.ok && app.isPackaged && process.platform === "win32") {
    try { checkInstallation(installationPort(process.execPath)); }
    catch (error) {
      if (!target.isDestroyed()) target.setEnabled(true);
      return { ok: false, reason: (error as Error).message };
    }
  }
  const update = check.ok && !target.isDestroyed() ? updates.beginInstall() : null;
  if (!update) {
    if (!target.isDestroyed()) target.setEnabled(true);
    log(`update restart refused: ${check.ok ? "no update" : check.reason}`);
    return check.ok ? { ok: false, reason: "No downloaded update is ready to install." } : check;
  }
  installing = true;
  log(`restarting to install ${update.version}`);
  // The page unloads first; the installer starts only after the window has closed (window-all-closed).
  target.close();
  return { ok: true };
}

async function hostConnection() {
  await initialConnection;
  return { url: daemon.record.url, productVersion: daemon.health.productVersion, desktopVersion: app.getVersion() };
}

async function resetPlan() {
  await initialConnection;
  // An attached daemon may have been started by a different shell with different overrides.
  const actual = await daemonRpc(daemon.record, "/api/app-reset/paths");
  const locations = localResetLocations(app.getPath("userData"), path.join(getAppCacheDir(), `${brand.appName}-updater`), { packaged: true });
  if (JSON.stringify(actual) !== JSON.stringify(resetHostPaths(locations.host))) throw new Error("The local daemon uses different data locations. Stop it and use its matching environment to inspect/reset data with the CLI.");
  return inspectAppReset(locations);
}

async function resetApp(removeFolders: unknown, revision: unknown): Promise<RestartCheck> {
  const target = window;
  if (!target || typeof removeFolders !== "boolean" || typeof revision !== "string") return { ok: false, reason: "Invalid reset request." };
  if (resetting || restartAnswers.size || installing || updates.state.phase === "downloading") return { ok: false, reason: "Finish the current restart or update before resetting." };
  resetting = true;
  target.setEnabled(false);
  let temporary: string | undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  const cancelHelper = async () => {
    if (!child) return;
    // Persist revocation before returning control: a synchronous OS identity query in
    // the helper must not overtake an IPC cancellation when the parent later exits.
    if (temporary) writeFileSync(path.join(temporary, "result.json.cancel"), "");
    if (child.connected) child.send({ cancel: true });
    await stopAgentProcess(child);
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  };
  try {
    const plan = await resetPlan();
    if (plan.revision !== revision) throw new Error("The reset plan changed. Review it again.");
    const check = await askEditorToRestart(target);
    if (!check.ok || target.isDestroyed()) return check.ok ? { ok: false, reason: "The editor closed." } : check;
    const parentStarted = processStart(process.pid);
    if (!parentStarted) throw new Error("Could not identify the Desktop process.");
    const helper = path.join(app.isPackaged ? process.resourcesPath : path.dirname(appRoot), "reset-helper.cjs");
    if (!existsSync(helper)) throw new Error("The reset helper is missing. Rebuild or reinstall this version.");
    temporary = mkdtempSync(path.join(os.tmpdir(), "litzio-reset-result-"));
    child = spawn(process.execPath, [helper], { detached: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe", "ipc"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }) as ChildProcessWithoutNullStreams;
    child.stdout.resume(); child.stderr.resume();
    const helperChild = child;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Reset helper startup was not confirmed.")), 10_000);
      const failed = (error: Error) => { clearTimeout(timer); reject(error); };
      helperChild.once("error", failed);
      helperChild.once("exit", () => failed(new Error("Reset helper exited before it was ready.")));
      helperChild.once("message", message => { if ((message as { waiting?: boolean })?.waiting) { clearTimeout(timer); resolve(); } });
      helperChild.send({ parentPid: process.pid, parentStarted, profile: app.getPath("userData"),
        updaterCache: path.join(getAppCacheDir(), `${brand.appName}-updater`), revision, removeFolders,
        receipt: path.join(temporary!, "result.json"), executable: process.execPath,
        args: [...(app.isPackaged ? [] : [appRoot]), `--user-data-dir=${app.getPath("userData")}`] });
    });
    child.unref();
    return await new Promise<RestartCheck>(resolve => {
      const contents = target.webContents;
      const finish = async (result: RestartCheck) => {
        clearTimeout(timer); target.removeListener("closed", closed); contents.removeListener("will-prevent-unload", prevented);
        if (!result.ok) {
          try { await cancelHelper(); }
          catch { return resolve({ ok: false, reason: "Reset cancellation could not be confirmed. Inspect its helper before closing." }); }
        }
        resolve(result);
      };
      const closed = () => { void finish({ ok: true }); };
      const prevented = () => { void finish({ ok: false, reason: "Work appeared before closing. Save it and review reset again." }); };
      const timer = setTimeout(() => { void finish({ ok: false, reason: "Desktop close was not confirmed; no data was deleted." }); }, 10_000);
      target.once("closed", closed);
      contents.once("will-prevent-unload", prevented);
      target.close();
    });
  } catch (error) {
    try { await cancelHelper(); }
    catch { return { ok: false, reason: "Reset cancellation could not be confirmed. Inspect its helper before closing." }; }
    if (temporary && !child) rmSync(temporary, { recursive: true, force: true });
    return { ok: false, reason: (error as Error).message };
  } finally { if (!target.isDestroyed()) { resetting = false; target.setEnabled(true); } }
}

function registerIpc(): void {
  let folderRequest = 0;
  const handle = (channel: string, run: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) throw new Error("Untrusted sender.");
      return run(...args);
    });
  };
  handle("desktop:opened-folders", async roots => {
    if (!Array.isArray(roots) || !roots.every(root => typeof root === "string")) throw new Error("Invalid folders.");
    const request = ++folderRequest;
    for (const root of roots) { await daemonRpc(daemon.record, `/api/folder?${new URLSearchParams({ root })}`); explorerFolders.listedRoot(root); }
    if (request === folderRequest) explorerFolders.setOpened(roots);
  });
  handle("desktop:hosts", () => ({ hosts: remoteHosts.list(), allowedHostIds, productVersion: app.getVersion(), cliRemovalProtectionWarning }));
  const text = (value: unknown): string => { if (typeof value !== "string") throw new Error("Expected text."); return value; };
  handle("desktop:host-check", origin => checkRemoteHost(text(origin), app.getVersion()));
  handle("desktop:host-register", (origin, label) => { remoteHosts.register(text(origin), text(label)); });
  handle("desktop:host-rename", (id, label) => { remoteHosts.rename(text(id), text(label)); });
  handle("desktop:host-work", summary => {
    if (summary !== null && (!Array.isArray(summary) || !summary.every(row => row && typeof row.hostId === "string" && Number.isSafeInteger(row.openWork) && row.openWork >= 0 && Number.isSafeInteger(row.recovery) && row.recovery >= 0))) throw new Error("Invalid Host work summary.");
    hostWork = null;
    try { remoteHosts.desktopWork(app.getPath("userData"), summary as HostWorkSummary[] | null, log); }
    catch (error) { log(`Desktop work summary update failed: ${String(error)}`); throw error; }
    hostWork = summary as HostWorkSummary[] | null;
  });
  handle("desktop:host-remove", id => {
    if (!window || !hostWork) throw new Error("Host work/recovery is not ready. Close Host tabs and resolve recovery first.");
    const host = remoteHosts.get(text(id));
    if (hostWork.some(row => row.hostId === host.hostId && (row.openWork || row.recovery))) throw new Error("Close Host tabs and resolve recovery before removing this Host.");
    if (dialog.showMessageBoxSync(window, { type: "warning", message: `Remove ${host.label}?`, detail: "Remote files and daemon will remain unchanged.", buttons: ["Cancel", "Remove"], defaultId: 0, cancelId: 0, noLink: true }) !== 1) throw new Error("Removal cancelled.");
    remoteHosts.remove(host.hostId, () => ({ ...remoteHosts.desktopRemovalProof(host.hostId, app.getPath("userData")), confirmed: true }));
  });
  handle("desktop:host-restart", async () => {
    if (!window) return { ok: false, reason: "Editor unavailable." };
    if (restartAnswers.size) return { ok: false, reason: "Already checking restart." };
    const target = window;
    target.setEnabled(false);
    const check = await askEditorToRestart(target);
    if (check.ok && !target.isDestroyed()) { restartingHosts = true; target.close(); }
    else if (!target.isDestroyed()) target.setEnabled(true);
    return check;
  });
  handle("desktop:startup", () => first);
  handle("desktop:reset-plan", () => resetPlan());
  handle("desktop:reset-app", (removeFolders, revision) => resetApp(removeFolders, revision));
  handle("desktop:host-connection", () => hostConnection());
  handle("desktop:browser", () => shell.openExternal(daemon.record.url));
  handle("desktop:daemon-info", async () => {
    await initialConnection;
    let state: "running" | "unreachable" = "running"; try { await checkDaemon(); } catch { state = "unreachable"; }
    return { ...daemon.health, url: daemon.record.url, state };
  });
  handle("desktop:daemon-stop", async () => {
    if (!window || dialog.showMessageBoxSync(window, { type: "warning", message: "Stop daemon?", detail: "Connected tabs will disconnect and ongoing work will stop.", buttons: ["Cancel", "Stop"], defaultId: 0, cancelId: 0, noLink: true }) !== 1) return false;
    await daemon.stopExplicitly(); trayStatus(false); return true;
  });
  handle("desktop:daemon-check", () => checkDaemon());
  handle("desktop:daemon-reconnect", async () => {
    initialConnection = daemon.connect();
    try { const connection = await hostConnection(); trayStatus(true); return connection; }
    catch (error) { trayStatus(false); throw error; }
  });
  handle("desktop:provider-session-log", async (hostId, id, provider, action) => {
    await daemon.check();
    return openProviderSessionLog({ hostId, id, provider, action },
      (id, provider) => daemonRpc(daemon.record, "/api/assistant/conversations", { action: "provider-log", id, provider }),
      shell.showItemInFolder);
  });
  handle("desktop:open-folder", folder => explorerFolders.open(folder, target => shell.openPath(target)));
  handle("desktop:open-log-folder", async () => {
    const directory = path.join(app.getPath("userData"), "logs");
    mkdirSync(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error("Could not open the log folder.");
  });
  handle("desktop:info", () => info());
  handle("desktop:cli-state", () => cliIntegration?.state() ?? { status: "off", unsupported: true });
  handle("desktop:cli-set", (enabled) => {
    if (typeof enabled !== "boolean") throw new Error("Invalid CLI integration choice.");
    if (!cliIntegration) throw new Error("CLI integration is available in the installed Windows app.");
    return cliIntegration.setEnabled(enabled);
  });
  handle("desktop:set-theme", (value) => {
    if (value !== "system" && value !== "light" && value !== "dark") throw new Error("Unknown theme.");
    nativeTheme.themeSource = value;
    return nativeTheme.shouldUseDarkColors;
  });
  handle("desktop:set-window-background", (color, overlay) => {
    try {
      const colors = overlay as { color?: unknown; symbolColor?: unknown } | null;
      const valid = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
      if (!valid(color) || !valid(colors?.color) || !valid(colors?.symbolColor)) throw new Error("Invalid window appearance.");
      window?.setBackgroundColor(color);
      window?.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor });
      appearanceReady = true;
      showWhenReady();
    } catch (error) {
      log(`window appearance failed: ${String(error)}`);
      showStartupWindow("window appearance failed");
      throw error;
    }
  });
  handle("desktop:set-channel", async (value) => {
    if (value !== "stable" && value !== "beta") throw new Error("Unknown release channel.");
    await updates.setChannel(parseChannel(value));
    return info();
  });
  handle("desktop:check", () => updates.check());
  handle("desktop:download", () => updates.download());
  handle("desktop:install", () => installUpdate());
  handle("desktop:seen-update", (version) => {
    const state = updates.state;
    const offered = "version" in state ? state : state.phase === "error" ? state.update : undefined;
    if (typeof version !== "string" || offered?.version !== version) return;
    preferences = { ...preferences, seenUpdate: version };
    writePreferences(preferencesFile(), preferences);
  });
  handle("desktop:release-notes", (version) => openExternal(releaseNotesUrl(typeof version === "string" ? version : undefined)));
  ipcMain.on("desktop:pending-work", (event, pending: unknown) => {
    event.returnValue = false;
    if (!trusted(event) || typeof pending !== "boolean") return;
    pendingWindowWork = pending;
    event.returnValue = true;
  });
  ipcMain.on("desktop:restart-check-result", (event, id: unknown, check: unknown) => {
    if (!trusted(event) || typeof id !== "number") return;
    const record = typeof check === "object" && check !== null ? check as Record<string, unknown> : {};
    const answer: RestartCheck = record.ok === true ? { ok: true }
      : { ok: false, reason: typeof record.reason === "string" && record.reason ? record.reason : "The editor did not allow restarting." };
    restartAnswers.get(id)?.(answer);
  });
}

function createWindow(): void {
  readyToShow = false;
  appearanceReady = false;
  startupPending = true;
  const created = new BrowserWindow({
    width: 1400, height: 900, minWidth: 640, minHeight: 480, title: brand.name.en, show: false,
    // --layout-header-row (40px) minus --border-width (1px): native opaque paint must
    // stop before the web separator. Packaged tests check these tokens and OS pixels.
    titleBarStyle: "hidden", titleBarOverlay: { height: 39 },
    icon: path.join(appRoot, "icon.ico"),
    webPreferences: {
      preload: path.join(appRoot, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  window = created;
  created.on("close", event => {
    if (exiting || installing || restartingHosts || resetting) {
      // A native unsaved-work dialog must be visible even when removal starts in the tray.
      openWindow();
      return;
    }
    event.preventDefault();
    startupPending = false;
    clearTimeout(appearanceTimer);
    clearTimeout(startupTimer);
    created.hide();
    if (!preferences.backgroundNoticeShown) {
      tray?.displayBalloon({ iconType: "info", title: `${brand.name.ko}가 백그라운드에서 실행 중입니다.`,
        content: "창을 닫아도 작업은 계속됩니다. 트레이의 '열기'로 돌아오고, '종료'로 앱과 Desktop이 시작한 daemon을 종료할 수 있습니다." });
      const next = { ...preferences, backgroundNoticeShown: true };
      preferences = next;
      try { writePreferences(preferencesFile(), next); }
      catch (error) { log(`Could not save background notice preference: ${String(error)}`); }
    }
  });
  if (process.platform === "win32") {
    // The installation helper sends this intent before WM_CLOSE, including to hidden windows.
    created.hookWindowMessage(INSTALLATION_CLOSE_MESSAGE, () => { exiting = true; });
    created.on("query-session-end", event => {
      // Cancel the OS query synchronously, before the asynchronous renderer unload guard.
      // Keep editing can then preserve both the window and the daemon, even from the tray.
      if (pendingWindowWork) event.preventDefault();
      exiting = true;
      created.close();
    });
    // Confirmed Windows shutdown may omit normal quit events. Use the same cleanup;
    // do not disconnect during the cancellable query before the unsaved-work guard.
    created.on("session-end", () => {
      exiting = true;
      void closeDaemon().catch(error => log(`session daemon shutdown failed: ${String(error)}`));
    });
  }
  startupTimer = setTimeout(() => showStartupWindow("startup timed out after 15000ms"), STARTUP_TIMEOUT_MS);
  created.once("ready-to-show", () => {
    readyToShow = true;
    showWhenReady();
    if (startupPending) appearanceTimer = setTimeout(() => showStartupWindow("appearance timed out after 5000ms"), APPEARANCE_TIMEOUT_MS);
  });
  const failed = (reason: string) => {
    if (!startupPending) return;
    showStartupWindow(reason);
    dialog.showErrorBox(brand.name.en, `The editor could not start.\n${reason}`);
  };
  created.webContents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame) failed(`renderer load failed (${code}): ${description}`);
  });
  created.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) pendingWindowWork = true;
  });
  created.webContents.on("render-process-gone", (_event, details) => {
    pendingWindowWork = true;
    const reason = `renderer exited: ${details.reason} (${details.exitCode})`;
    log(reason);
    failed(reason);
  });
  // The Editor's beforeunload asks before losing work; Electron needs the question shown here.
  created.webContents.on("will-prevent-unload", (event) => {
    if (resetting) {
      // The reset caller persists cancellation and confirms its helper has stopped
      // before enabling the window again.
      return;
    }
    if (restartingHosts) {
      restartingHosts = false;
      created.setEnabled(true);
      return;
    }
    if (installing) {
      // Work appeared after the Editor allowed the restart: keep the window and the update.
      installing = false;
      updates.cancelInstall();
      created.setEnabled(true);
      return;
    }
    const leave = dialog.showMessageBoxSync(created, {
      type: "warning", buttons: ["Close without saving", "Keep editing"], defaultId: 1, cancelId: 1, noLink: true,
      title: brand.name.en, message: "Open documents have unsaved changes or work in progress.", detail: "Close without saving the original files. Local recovery keeps only the last successfully recorded applied edits; unapplied drafts and later changes may be lost. Keep editing to finish and save each document first.",
    }) === 0;
    if (leave) event.preventDefault();
    else exiting = false;
  });
  created.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  const preventForeignNavigation = (event: { preventDefault(): void }, url: string) => {
    if (!trustedDesktopUrl(url)) event.preventDefault();
  };
  created.webContents.on("will-navigate", preventForeignNavigation);
  created.webContents.on("will-redirect", preventForeignNavigation);
  created.on("closed", () => {
    clearTimeout(appearanceTimer);
    clearTimeout(startupTimer);
    startupPending = false;
    if (window === created) window = null;
  });
  void created.loadURL(DESKTOP_ENTRY).catch(error => failed(`renderer load failed: ${String(error)}`));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // No application menu: its Reload and DevTools shortcuts are not part of the Editor.
  Menu.setApplicationMenu(null);
  app.on("second-instance", openWindow);
  app.on("before-quit", () => { exiting = true; });
  app.on("will-quit", () => { tray?.destroy(); tray = undefined; });
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
  app.whenReady().then(async () => {
    const resetResult = process.argv.find(arg => arg.startsWith("--app-reset-result="))?.slice("--app-reset-result=".length);
    if (resetResult) {
      try {
        if (path.basename(resetResult) !== "result.json" || path.dirname(path.dirname(path.resolve(resetResult))) !== path.resolve(os.tmpdir()) || !path.basename(path.dirname(resetResult)).startsWith("litzio-reset-result-")) throw new Error("Invalid reset receipt location.");
        if (lstatSync(resetResult).isSymbolicLink() || lstatSync(path.dirname(resetResult)).isSymbolicLink()) throw new Error("Reset receipts must be local regular files.");
        const result = JSON.parse(readFileSync(resetResult, "utf8"));
        if (result.outcome !== "success") dialog.showMessageBoxSync({ type: "warning", message: "App reset was not completed.",
          detail: `${result.reason ?? "Some data could not be deleted."}\n${JSON.stringify(result.receipt?.results ?? [])}`, buttons: ["OK"] });
        rmSync(resetResult);
        try { const { rmdirSync } = await import("node:fs"); rmdirSync(path.dirname(resetResult)); } catch { /* Preserve any unexpected extra files. */ }
      } catch { dialog.showErrorBox(brand.name.en, "The app reset result could not be read. Inspect the reset result before trying again."); }
    }
    log(`starting ${app.getVersion()}`);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    preferences = readPreferences(preferencesFile(), app.getVersion());
    const cliRoot = path.join(app.isPackaged ? process.resourcesPath : path.dirname(appRoot), "cli");
    first = firstDocument(process.argv.slice(app.isPackaged ? 1 : 2), app.getPath("userData"), appRoot, log, app.getVersion());
    daemon = new DesktopDaemon(app.getVersion(), process.execPath, path.join(cliRoot, "cli.mjs"));
    const target = `http://127.0.0.1:${daemonPort(daemon.channel)}`;
    // Snapshot once per app start. Registry changes never expand a running window CSP.
    try { remoteHosts.desktopWork(app.getPath("userData"), null, log); }
    catch (error) {
      cliRemovalProtectionWarning = true;
      log(`Could not record CLI removal protection; continuing startup: ${String(error)}`);
    }
    let registered: ReturnType<RemoteHostRegistry["list"]> = [];
    try { registered = remoteHosts.list(); }
    catch (error) { log(`Remote Host registry unavailable; continuing with local Host: ${String(error)}`); }
    allowedHostIds = registered.map(host => host.hostId);
    const remoteOrigins = registered.map(host => host.origin);
    protocol.handle("litzio", request => bundledUiResponse(path.join(appRoot, "ui"), request, target, remoteOrigins));
    if (app.isPackaged && process.platform === "win32" && process.env.LOCALAPPDATA) {
      cliIntegration = new CliIntegration(process.execPath, process.env.LOCALAPPDATA, windowsEnvironment());
    }
    const { autoUpdater } = electronUpdater;
    if (__LITZIO_REQUIRE_SIGNED_UPDATES__ && autoUpdater instanceof electronUpdater.NsisUpdater) {
      autoUpdater.verifyUpdateCodeSignature = verifyUpdateSignature;
    }
    autoUpdater.logger = { info: (m: unknown) => log(`updater: ${String(m)}`), warn: (m: unknown) => log(`updater warning: ${String(m)}`),
      error: (m: unknown) => log(`updater error: ${String(m)}`), debug: () => {} };
    const unsupported = updatesUnsupported(autoUpdater);
    updates = new UpdateController(autoUpdater as unknown as UpdaterPort, {
      installed: app.getVersion(),
      channel: preferences.channel,
      ...(unsupported ? { unsupported } : {}),
      emit: (state) => { if (window && !window.isDestroyed()) window.webContents.send("desktop:update-state", state); },
      saveChannel: (channel) => {
        const next = { ...preferences, channel };
        writePreferences(preferencesFile(), next);
        preferences = next;
      },
      ...(__LITZIO_REQUIRE_SIGNED_UPDATES__ ? { verifyDownloaded: async (files: unknown) => {
        if (!Array.isArray(files) || files.length !== 1 || typeof files[0] !== "string") throw new Error("No verified installer was downloaded.");
        const config = loadYaml(readFileSync(path.join(process.resourcesPath, "app-update.yml"), "utf8")) as { publisherName?: unknown };
        const names = typeof config.publisherName === "string" ? [config.publisherName] : config.publisherName;
        if (!Array.isArray(names) || !names.length || !names.every((name) => typeof name === "string" && name.trim())) throw new Error("No update publisher is configured.");
        const problem = await verifyUpdateSignature(names, files[0]);
        if (problem) throw new Error(problem);
      } } : {}),
      log,
    });
    registerIpc();
    log(`started ${app.getVersion()} (${preferences.channel}); ${unsupported ?? "updates on"}`);
    createWindow();
    createTray();
    initialConnection = daemon.connect();
    // The renderer reports connection/protocol errors; the bundled window stays usable.
    void initialConnection.then(() => trayStatus(true), error => { trayStatus(false); log(`daemon connection failed: ${String(error)}`); });
    updates.start();
  }).catch(error => {
    void daemon?.close().catch(error => log(`daemon cleanup failed: ${String(error)}`));
    log(`startup failed: ${String(error)}`);
    try {
      dialog.showErrorBox(brand.name.en, `${brand.name.en} could not start.\n${String(error)}`);
    } finally {
      app.exit(1);
    }
  });
  app.on("window-all-closed", async () => {
    if (restartingHosts) app.relaunch();
    try { await closeDaemon(); } catch (error) {
      if (resetting) new ResetGuard().blockAfterFailedShutdown();
      log(`daemon shutdown failed: ${String(error)}`);
      dialog.showErrorBox(brand.name.en, String(error));
      // A timeout is not proof that the installed executable is no longer in use.
      if (installing) { installing = false; updates.cancelInstall(); }
    }
    // Only the restart the Editor allowed installs an update; quitting the app never does.
    if (installing) {
      updates.finishInstall();
      // quitAndInstall quits after starting the installer; if it could not, the saved work is safe
      // and the app still ends rather than staying without a window.
      setTimeout(() => app.quit(), 5_000);
    } else {
      app.quit();
    }
  });
}
