import { startOwnedDaemon } from "./owned-daemon.ts";
import { brand } from "../../../../brand.ts";
import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { DAEMON_PROTOCOL, type DaemonIdentity } from "../../server/daemon-protocol.ts";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareBrowserFixtures, REPOSITORY_ROOT } from "./fixtures.ts";
import { openPath, reloadDocument } from "./navigation.ts";
import { recoveryRecords, resetRecovery } from "./recovery-records.ts";
import type { Editor } from "@tiptap/core";

// Same checkout-owned persistent Chrome profile as the serial HTTP harness.
const profile = path.join(tmpdir(), `${brand.appName}-browser-profile`, createHash("sha256").update(REPOSITORY_ROOT).digest("hex").slice(0, 16));
const ready = (page: Page) => page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });

test("HTTP recovery survives browser crash and daemon reconnect, then Save/Reload and conflict", async ({}, info) => {
  prepareBrowserFixtures();
  // Own a production CLI daemon so stop/restart preserves the existing packaged
  // Host recovery coverage. Only the native bridge is a stand-in.
  const data = mkdtempSync(path.join(tmpdir(), "litzio-reconnect-"));
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const start = () => startOwnedDaemon(data,["a","b"].map(name=>path.join(REPOSITORY_ROOT,`tmp/http-host-${name}`)),port);
  let host = await start(), stopped = false;
  let closing: Promise<void> | undefined;
  const stop = () => closing ??= (async () => {
    if (stopped) return;
    const response = await fetch(origin + "/daemon/stop", { method: "POST", signal: AbortSignal.timeout(15_000), headers: { Origin: origin, "Content-Type": "application/json", "X-Litzio-Protocol": DAEMON_PROTOCOL }, body: JSON.stringify({ ...host.identity, confirm: true }) });
    expect(response.status).toBe(200);
    await response.json();
    await expect.poll(() => host.child.exitCode, { timeout: 15_000, message: "Owned daemon must finish shutdown" }).not.toBeNull();
    await host.exited; stopped = true;
  })();
  const nativeStopFinished = Promise.withResolvers<{ error?: unknown }>();
  const file = path.join(REPOSITORY_ROOT, "tmp/http-host-a/fixture/a.md");
  writeFileSync(file, "---\nlitzio: 1\n---\n");
  const original = readFileSync(file, "utf8");
  let context: BrowserContext | undefined;
  const processes: number[] = [];
  const launch = async (startupPath?: string) => {
    context = await chromium.launchPersistentContext(profile, {
      ...(process.platform === "win32" ? { channel: "chrome" } : {}), headless: true,
    });
    // Apply to every persistent context, including the ones recreated after a crash.
    context.setDefaultTimeout(info.project.use.actionTimeout!);
    context.setDefaultNavigationTimeout(info.project.use.navigationTimeout!);
    await context.exposeFunction("testStopDaemon", async () => {
      try { await stop(); nativeStopFinished.resolve({}); return true; }
      catch (error) { nativeStopFinished.resolve({ error }); throw error; }
    });
    await context.exposeFunction("testReconnectDaemon", async () => { host = await start(); stopped = false; closing = undefined; });
    await context.exposeFunction("testCheckDaemon", async () => {
      const response = await fetch(origin + "/daemon/health", { headers: { "X-Litzio-Protocol": DAEMON_PROTOCOL }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Disconnected");
      await response.json();
    });
    await context.addInitScript(() => {
      const bridge = window as unknown as { testStopDaemon(): Promise<boolean>; testReconnectDaemon(): Promise<void>; testCheckDaemon(): Promise<void> };
      window.litzioDesktop = {
        registeredHosts: async () => ({ hosts: [], allowedHostIds: [], productVersion: "test" }),
        reportPendingWork: () => {}, reportHostWork: async () => {},
        startup: async () => ({}), setTheme: async () => false, setWindowBackground: async () => {}, setOpenedFolders: async () => {},
        info: async () => ({ version: "test", channel: "stable", updatesSupported: false, update: { phase: "idle" }, seenUpdate: null }),
        onUpdateState: () => () => {}, onRestartCheck: () => () => {},
        stopDaemon: () => bridge.testStopDaemon(), hostConnection: async () => ({url:location.origin, productVersion:"test", desktopVersion:"test"}), reconnectDaemon: async () => { await bridge.testReconnectDaemon(); return {url:location.origin, productVersion:"test", desktopVersion:"test"}; }, checkDaemon: () => bridge.testCheckDaemon(),
      } as unknown as NonNullable<Window["litzioDesktop"]>;
    });
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    const pid = processInfo.find(p => p.type === "browser")!.id;
    expect(pid).toBeGreaterThan(0);
    expect(processes).not.toContain(pid);
    processes.push(pid);
    await cdp.detach();
    const page = await context.newPage();
    const url = new URL(origin);
    if (startupPath) url.searchParams.set("path", startupPath);
    await page.goto(url.href); await ready(page);
    expect(new URL(page.url()).origin).toBe(new URL(origin).origin);
    return page;
  };
  const crash = async () => {
    const owned = context!;
    const stopped = owned.waitForEvent("close");
    // PID came from this launched browser's CDP session, never a process-name/port search.
    let termination = "SIGKILL";
    if (process.platform === "win32") {
      const result = spawnSync("taskkill", ["/PID", String(processes.at(-1)), "/T", "/F"], { encoding: "utf8" });
      termination = `taskkill status=${result.status}, signal=${result.signal}, stderr=${result.stderr}, error=${result.error?.message ?? "none"}`;
      console.log(termination);
    }
    else process.kill(processes.at(-1)!, "SIGKILL");
    await expect.poll(() => {
      try { process.kill(processes.at(-1)!, 0); return false; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; throw error; }
    }, { message: `Owned browser PID ${processes.at(-1)} must exit after ${termination}` }).toBe(true);
    await stopped;
    context = undefined;
  };
  try {
    let page = await launch();
    await resetRecovery(page);
    await openPath(page, file);
    await page.getByRole("textbox", { name: "Title", exact: true }).click();
    await page.keyboard.type("HTTP recovery paper");
    await page.keyboard.press("Enter");
    await page.keyboard.type("HTTP body.");
    await page.locator(".document-editor").evaluate(element => {
      const editor = (element as HTMLElement & {editor: Editor}).editor;
      editor.commands.insertContentAt(editor.state.doc.content.size, [
        {type:"equation",attrs:{latex:"x^2 + y^2 = z^2"}},
        {type:"table",content:[
          {type:"tableRow",content:[{type:"tableCell",attrs:{header:true},content:[{type:"text",text:"Header"}]}]},
          {type:"tableRow",content:[{type:"tableCell",attrs:{header:false},content:[{type:"text",text:"Measured cell"}]}]},
          {type:"tableCaption",content:[{type:"text",text:"HTTP table caption"}]},
        ]},
        {type:"figure",content:[{type:"text",text:"HTTP pending figure caption"}]},
      ]);
    });
    const structured = await page.locator(".document-editor").evaluate(element => (element as HTMLElement & {editor:Editor}).editor.getJSON());
    const edit = async (text: string) => {
      await page.locator(".document-editor p").first().click();
      await page.keyboard.press("End"); await page.keyboard.insertText(text);
      await expect.poll(async () => (await recoveryRecords(page)).some(r => r.path === file && r.recoveryText.includes(text)), { timeout: 15_000 }).toBe(true);
    };
    await edit(" HTTP crash recorded.");
    const recorded = await recoveryRecords(page);
    expect(readFileSync(file, "utf8")).toBe(original);
    await crash();
    // Navigation preferences may revert to older clean tabs after a process kill. An explicit
    // startup path offers this record in the review dialog regardless of that separate memory.
    page = await launch(file);
    expect(await recoveryRecords(page)).toEqual(recorded);
    await expect(page.getByTestId("recovery-prompt")).toBeVisible();
    await expect(page.getByTestId("recovery-prompt")).toContainText(file);
    // Both the shared Visual editors and built Source worker must load under production CSP.
    await page.getByRole("button", { name: "Compare", exact: true }).click();
    const comparison = page.getByTestId("recovery-prompt").getByTestId("visual-comparison");
    await expect(comparison.locator(".document-editor")).toHaveCount(2);
    await expect(comparison.getByRole("region", { name: "Recovery preview", exact: true })).toContainText("HTTP crash recorded.");
    await page.getByTestId("recovery-prompt").getByRole("button", { name: "Source", exact: true }).click();
    await expect(page.getByRole("region", { name: "Source differences", exact: true })).toContainText("HTTP crash recorded.");
    expect(await recoveryRecords(page)).toEqual(recorded);
    await page.getByRole("button", { name: "Restore work", exact: true }).click();
    await expect(page.getByRole("tab", { name: "a.md, Unsaved changes", exact: true })).toBeVisible();
    await expect(page.locator(".document-editor")).toContainText("HTTP crash recorded.");
    const restored = await page.locator(".document-editor").evaluate(element => (element as HTMLElement & {editor:Editor}).editor.getJSON());
    expect(restored.attrs?.title).toBe("HTTP recovery paper");
    // The prose changed after the structural capture; all inserted atoms and table content must match.
    expect(restored.content?.filter(node => ["equation","table","figure"].includes(node.type!)))
      .toEqual(structured.content?.filter(node => ["equation","table","figure"].includes(node.type!)));
    expect(readFileSync(file, "utf8")).toBe(original);
    await page.getByTestId("save").click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
    await expect.poll(() => recoveryRecords(page)).toEqual([]);
    const saved = readFileSync(file, "utf8");
    expect(saved).toContain("HTTP crash recorded.");
    expect(saved).toContain("title: HTTP recovery paper");
    for (const text of ["HTTP recovery paper","x^2 + y^2 = z^2","Header","Measured cell","HTTP table caption","HTTP pending figure caption"]) expect(saved).toContain(text);
    await reloadDocument(page); await ready(page);
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("HTTP recovery paper");
    await expect(page.locator(".document-editor")).toContainText("HTTP crash recorded.");
    await expect(page.locator(".document-editor")).toContainText("Measured cell");
    await expect(page.locator(".document-editor")).toContainText("HTTP pending figure caption");

    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const beforeReconnect = await page.locator(".document-editor").innerText();
    await page.locator(".document-editor p").first().click();
    await page.keyboard.press("End"); await page.keyboard.insertText(" Unsaved across daemon reconnect.");
    await page.getByRole("button", { name: "Desktop menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Stop background service", exact: true }).click();
    // A health tick can display disconnection before the native stop promise
    // finishes. Await that operation's completion, not the earlier notice.
    expect((await nativeStopFinished.promise).error).toBeUndefined();
    await expect(page.getByTestId("daemon-disconnected")).toBeVisible();
    expect(stopped).toBe(true); expect(host.child.exitCode).toBe(0);
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect(page.getByTestId("daemon-disconnected")).toHaveCount(0);
    expect(host.child.exitCode).toBe(null);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
    await expect(page.locator(".document-editor")).toContainText("Unsaved across daemon reconnect.");
    expect(readFileSync(file, "utf8")).toBe(saved);
    await page.locator(".document-editor p").first().click();
    await page.keyboard.press("ControlOrMeta+z");
    expect(await page.locator(".document-editor").innerText()).toBe(beforeReconnect);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(page.locator(".document-editor")).toContainText("Unsaved across daemon reconnect.");
    await page.getByTestId("save").click();
    await page.locator('[data-testid="status"][data-operation="saved"]').waitFor();
    expect(readFileSync(file, "utf8")).toContain("Unsaved across daemon reconnect.");

    await edit(" HTTP conflict recorded.");
    const conflictRecord = await recoveryRecords(page);
    await crash();
    const outside = readFileSync(file, "utf8") + "\nChanged outside before restore.\n";
    writeFileSync(file, outside);
    page = await launch(file);
    expect(await recoveryRecords(page)).toEqual(conflictRecord);
    await expect(page.getByTestId("recovery-prompt")).toBeVisible();
    await expect(page.getByTestId("recovery-prompt")).toContainText(file);
    await page.getByRole("button", { name: "Restore work", exact: true }).click();
    await expect(page.getByRole("tab", { name: "a.md, Unsaved changes", exact: true })).toBeVisible();
    expect(readFileSync(file, "utf8")).toBe(outside);
    const response = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/document");
    await page.getByTestId("save").click();
    expect((await response).status()).toBe(409);
    await page.locator('[data-testid="status"][data-operation="save-conflict"]').waitFor();
    await expect(page.locator(".document-editor")).toContainText("HTTP conflict recorded.");
    expect(readFileSync(file, "utf8")).toBe(outside);
    expect((await recoveryRecords(page)).some(r => r.recoveryText.includes("HTTP conflict recorded."))).toBe(true);
    const proof = info.outputPath("host-recovery-proof.json");
    writeFileSync(proof, JSON.stringify({ platform: process.platform, origin, profile, processes, forcedBrowserRestarts: 2, serverRestarted: true, reconnectPreservesUnsavedUndoSave: true, committedRecordSurvived: true, restoreDirty: true, originalUnchangedUntilSave: true, saveReload: true, externalConflict409: true }, null, 2));
    await info.attach("host-recovery-proof", { path: proof, contentType: "application/json" });
  } finally {
    await context?.close();
    try { await stop(); } finally { if (host.child.exitCode === null) { host.child.kill(); await host.exited; } }
    rmSync(data, { recursive: true, force: true });
    prepareBrowserFixtures();
  }
});
