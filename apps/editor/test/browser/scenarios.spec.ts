import {writeCodePluginManifest} from "../../../../test/helpers/code-plugin.ts";
import { executeDocumentTool } from "../../server/assistant-document-tools.ts";
import { RootAccess } from "../../server/file-access.ts";
import { startOwnedDaemon } from "./owned-daemon.ts";
import { cpSync } from "node:fs";
import { executeFolderTrash } from "../../server/file-operations.ts";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { execFile, execFileSync } from "node:child_process";
import { brand } from "../../../../brand.ts";
import { randomUUID } from "node:crypto";
import { citationReport, parse, getEditableDocument, type EditableDocument } from "@litzio/core";
import { test as base, expect, chromium, type BrowserContext, type ConsoleMessage, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, renameSync, unlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { classifyConsoleErrors } from "./console-errors.ts";
import { finishScenarioDiagnostics, savedSourceAssertion } from "./diagnostics.ts";
import { hideFloatingNotifications, FILE_ACTIONS_ROOT, prepareBrowserFixtures, REPOSITORY_ROOT, SOURCE_DIRS } from "./fixtures.ts";
import { NOTIFICATION_SCENARIOS, STABLE_SCENARIOS } from "./scenarios.ts";
import { showNotifications, activeDocument, waitForExplorerLayout, openFolderPicker, openDocument, openPath, reloadDocument, waitForActivePath, waitForEditorFocus } from "./navigation.ts";
import { withBlockHover } from "./hover.ts";
import { recoveryRecords } from "./recovery-records.ts";
import { inputEventScript } from "./input-event-script.ts";
import { verifyBuiltAppearance } from "./desktop-appearance.ts";

const url = process.env.LITZIO_BROWSER_URL ?? process.env.LITZIO_BROWSER_SERVER_URL;
if (!url) throw new Error("Run scenarios through pnpm browser:test to start an owned server.");
const scenarios: string[] = process.env.LITZIO_BROWSER_SCENARIOS ? JSON.parse(process.env.LITZIO_BROWSER_SCENARIOS) : [...STABLE_SCENARIOS];
const screenshots = process.env.LITZIO_BROWSER_SCREENSHOTS === "true";
const channel = process.env.LITZIO_BROWSER_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);
if (channel && channel !== "chrome" && channel !== "msedge") throw new Error("Unsupported browser channel");
const profile = path.join(tmpdir(), `${brand.appName}-browser-profile`, createHash("sha256").update(REPOSITORY_ROOT).digest("hex").slice(0, 16) + (channel === "msedge" ? "-edge" : ""));

function sourceDigest(): string {
  const hash = createHash("sha256");
  for (const directory of SOURCE_DIRS) {
    for (const name of readdirSync(directory, { recursive: true, encoding: "utf8" }).sort()) {
      const file = path.join(directory, name);
      if (statSync(file).isFile()) hash.update(name).update(readFileSync(file));
    }
  }
  return hash.digest("hex");
}

const test = base.extend<{}, { session: BrowserContext; inputEvents: string }>({
  inputEvents: [async ({}, use) => { await use(await inputEventScript()); }, { scope: "worker" }],
  session: [async ({}, use, workerInfo) => {
    const before = sourceDigest();
    const context = await chromium.launchPersistentContext(profile, {
      ...(channel ? { channel } : {}),
      headless: true,
      // Manual visual review must include the product's real scrollbar affordance.
      // Playwright otherwise adds --hide-scrollbars in headless Chromium.
      ...(screenshots ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}),
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
      // Chromium reuses connections; only Node request calls close them (#658, #1361).
    });
    try {
      // This worker-owned persistent context also creates startup and secondary-tab pages.
      context.setDefaultTimeout(workerInfo.project.use.actionTimeout!);
      context.setDefaultNavigationTimeout(workerInfo.project.use.navigationTimeout!);
      await context.clearCookies();
      const scratchRoots = [path.join(REPOSITORY_ROOT, "tmp"), FILE_ACTIONS_ROOT].map(root => root.replaceAll("\\", "/"));
      const withinScratch = (file: string, root: string) => {
        if (file.split("/").includes("..")) return false;
        const relative = path.relative(root, file);
        return !relative || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
      };
      const writableScratch = (file: string) => scratchRoots.some(root => withinScratch(file, root));
      await context.route(/\/api\/(?:file|folder-trash)$/, route => {
        const body = route.request().postDataJSON();
        const paths = [body?.root, body?.path, ...(body?.figureDocument ? [body.figureDocument.path] : [])].map(value => String(value ?? "").replaceAll("\\", "/"));
        const fileRoots = [scratchRoots[1]!, ...["image-assets/fresh", "http-host-a/fixture", "http-host-b/fixture"].map(folder => path.join(REPOSITORY_ROOT, "tmp", folder).replaceAll("\\", "/"))];
        if (!fileRoots.some(root => paths.every(file => withinScratch(file, root)))) {
          return route.fulfill({ status: 403, json: { error: "Browser tests may mutate scratch files only." } });
        }
        return route.continue();
      });
      await context.route("**/api/document**", route => {
        if (route.request().method() === "GET" || new URL(route.request().url()).pathname === "/api/document-compare") return route.continue();
        const file = String(route.request().postDataJSON()?.path ?? "").replaceAll("\\", "/");
        if (!writableScratch(file)) {
          return route.fulfill({ status: 403, json: { error: "Browser tests may write scratch files only." } });
        }
        return route.continue();
      });
      const initial = await context.newPage();
      await initial.goto(url);
      await initial.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
      await initial.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      const rejected = await initial.evaluate(async file => {
        const response = await fetch("/api/document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: file, revision: "invalid-guard-probe" }) });
        return response.status;
      }, path.join(REPOSITORY_ROOT, "apps/editor/document/technical-document.md"));
      expect(rejected).toBe(403);
      const fileRejected = await initial.evaluate(async root => {
        const response = await fetch("/api/file", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root, path: root + "/forbidden.md" }) });
        return response.status;
      }, path.join(REPOSITORY_ROOT, "tmp"));
      expect(fileRejected, "File mutations inside the repository must never reach the Host").toBe(403);
      await initial.close();
      await use(context);
    } finally {
      try {
        await context.close();
      } finally {
        try {
          expect(sourceDigest(), "Committed source fixtures changed").toBe(before);
        } finally {
          prepareBrowserFixtures();
        }
      }
    }
  }, { scope: "worker" }],
  page: async ({ session, inputEvents }, use, testInfo) => {
    prepareBrowserFixtures();
    // Keep action history cheap; capture UI state/ARIA/PNG separately on failure.
    await session.tracing.start({ screenshots: false, snapshots: false, sources: true });
    const page = await session.newPage();
    await page.addInitScript({ content: inputEvents });
    if (!NOTIFICATION_SCENARIOS.includes(testInfo.title)) await page.addInitScript(hideFloatingNotifications);
    const errors: string[] = [];
    const consoleListener = (message: ConsoleMessage) => {
      if (message.type() === "error") {
        const location = message.location();
        errors.push(message.text() + (location.url ? " @ " + location.url : ""));
      }
    };
    const pageErrorListener = (error: Error) => errors.push("Uncaught page error: " + error.message);
    page.on("console", consoleListener);
    page.on("pageerror", pageErrorListener);
    try {
      // Establish this origin without mounting App against the previous scenario's paths.
      // Scratch preparation may already have removed those files. The route is consumed once;
      // the real startup below, and all reloads inside the scenario, use the actual Editor.
      await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }), { times: 1 });
      await page.goto(url);
      // Keep the persistent browser profile, but isolate recovery records and opened folders between
      // scenarios. Reloads inside a scenario deliberately retain both for persistence checks.
      await page.evaluate(() => {
        localStorage.removeItem("litzio.openFolders.v2");
        localStorage.removeItem("litzio.collapsedFolderSections.v2");
        localStorage.removeItem("litzio.openTabs.v2");
        localStorage.removeItem("litzio.uiLanguage");
        localStorage.removeItem("litzio.accentColor");
        localStorage.removeItem("litzio.theme");
        localStorage.removeItem("litzio.pageBackground");
        for (const key of Object.keys(localStorage)) if (key.startsWith("litzio.pluginTableColumns:")) localStorage.removeItem(key);
        localStorage.removeItem("litzio.tableWrapDefault");
        localStorage.removeItem("litzio.tableWrapDocuments.v2");
      });
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("litzio-recovery-v3");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }));
      await page.reload();
      await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
      await page.mouse.move(0, 0);
      await page.evaluate(() => { document.querySelector<HTMLElement>('.document-scroll[data-active="true"]')?.scrollTo(0, 0); document.activeElement instanceof HTMLElement && document.activeElement.blur(); });
      await use(page);
    } finally {
      const classification=classifyConsoleErrors(testInfo.title,errors);
      try {
        await finishScenarioDiagnostics(session, page, testInfo, { errors, ...classification });
      } finally {
        page.off("console", consoleListener);
        page.off("pageerror", pageErrorListener);
        // Closing the scenario's page removes its routes without waiting on a failed delayed mock.
        await page.close();
      }
      await testInfo.attach("console-errors", { body: JSON.stringify({ errors, ...classification }), contentType: "application/json" });
      expect(classification.unexpected, "Unexpected console/page errors").toEqual([]);
      expect(classification.missing, "Missing expected HTTP failures").toEqual([]);
    }
  },
});

for (const name of scenarios) {
  test(name, async ({ page }) => {
    // 8s deadline probes and settings health checks. Keep per-action/product limits.
    if (name === "http-plugins") test.setTimeout(180_000);
    if (name === "desktop-updates") await verifyBuiltAppearance(page);
    const source = readFileSync(path.join(REPOSITORY_ROOT, "apps/editor/test", `${name}.browser.js`), "utf8");
    const scenario = runInNewContext(`(${source})`) as (page: Page, options: { fullLayout: boolean; brand: typeof brand; assistantFixture: { document: string }; assertSavedSource: ReturnType<typeof savedSourceAssertion>; screenshots: boolean; enableFolderTrash(): Promise<void>; changeFolderContents(): void; folderAliasRoot: string; pluginFixture: { document: string; reviewArchive?: boolean; directory: string; folder: string; otherFolder: string; otherJobInput: string; cli(args: string[]): any; corruptSecret(): void; reviewDocument?: EditableDocument }; showNotifications: typeof showNotifications; fileActionsRoot: string; expect: typeof expect; recoveryRecords: typeof recoveryRecords; waitForExplorerLayout: typeof waitForExplorerLayout; openFolderPicker: typeof openFolderPicker; openDocument: typeof openDocument; openPath: typeof openPath; waitForActivePath: typeof waitForActivePath; reloadDocument: typeof reloadDocument; waitForEditorFocus: typeof waitForEditorFocus; activeDocument: typeof activeDocument; withBlockHover: typeof withBlockHover; removeTabFixture: (source?: string) => void; folderFixture: { change(mode: string): void }; textFixture: { replaceNative(source: string): void }; bibliographyFixture: unknown }) => Promise<unknown>;
    const bibliographyPath = path.join(REPOSITORY_ROOT, "tmp", name === "http-host" ? "http-host-a" : "bibliography", "refs.bib");
    const initialBibliography = ["bibliography", "http-host"].includes(name) ? readFileSync(bibliographyPath, "utf8") : "";
    const bibliographyFixture = {
      read: () => readFileSync(bibliographyPath, "utf8"),
      hash: () => createHash("sha256").update(readFileSync(bibliographyPath)).digest("hex"),
      change: (mode: "updated" | "invalid" | "restore") => writeFileSync(bibliographyPath,
        mode === "updated" ? initialBibliography.replace("Control Study", "Updated Study") : mode === "invalid" ? "@article{broken" : initialBibliography),
      report: (markdown: string, text: string) => citationReport(parse(markdown), [{ source: "../refs.bib", status: "ok", text }]),
    };
    const pluginDirectory = path.join(REPOSITORY_ROOT, "tmp", "http-host-a", name === "plugin-jobs" ? "job-artifact" : name === "plugin-views" ? "issues-artifact" : "plugin-artifact");
    const pluginFolder = path.join(REPOSITORY_ROOT, "tmp", "http-host-a", "fixture");
    const otherPluginFolder = path.join(REPOSITORY_ROOT, "tmp", "http-host-b", "fixture");
    const fileJobInput = path.join(REPOSITORY_ROOT, "tmp", "k1-file-request.json");
    const otherJobInput = path.join(REPOSITORY_ROOT, "tmp", "k1-other-root-request.json");
    if (name === "vite-plugins") {
      mkdirSync(pluginDirectory, { recursive: true });
      writeCodePluginManifest(pluginDirectory,{id: "fixture.vite",name: "Vite fixture",entry: "host.mjs",description: "Connection settings fixture",settingsSchema: { type: "object", properties: { serverUrl: { type: "string", title: "Service URL", minLength: 1, description: "HTTP(S) service URL" }, failure: { type: "boolean", title: "Simulate failure", description: "Simulates service availability" } }, additionalProperties: false },secrets: [{ id: "api-key", title: "Access token", scope: "connection", required: false }],operations: [{ id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", additionalProperties: false }, outputSchema: { type: "object" } }],healthCheck: "connection",screen:"screen.jsx"});
      writeFileSync(path.join(pluginDirectory, "host.mjs"), `import { SDK_VERSION } from '@litzio/plugin-sdk';
export function activate(context){return {operations:{connection:()=>({ok:context.settings.failure !== true,message:context.settings.failure !== true ? "Fixture connected" : "연결하지 못했습니다. 저장된 서버 주소와 자격 증명을 확인한 뒤 다시 시도하세요."})},status:()=>({available:true,message:SDK_VERSION}),dispose(){}}}`);
    }
    if (name === "http-plugins") {
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(otherJobInput, JSON.stringify({ label: "CLI connection" }));
      writeCodePluginManifest(pluginDirectory,{id: "fixture.drive",name: "Drive fixture",entry: "host.mjs",description: "Isolated folder fixture",settingsSchema: { type: "object", properties: { label: { type: "string", title: "Connection label" } }, additionalProperties: false },secrets: [{ id: "pat", title: "Access token", scope: "connection", required: false }],screen:"screen.jsx"});
      writeFileSync(path.join(pluginDirectory, "host.mjs"), `export function activate(c){return {operations:{},dispose(){},status:()=>({available:true,message:c.secrets.pat ? "Secret applied" : c.settings.label ?? "Fixture ready"})}}`);
    }
    if (["http-plugins", "vite-plugins"].includes(name)) writeFileSync(path.join(pluginDirectory, "screen.jsx"), "export default function Screen(){return <p>Runtime fixture</p>}");
    const pluginFixture = { document: path.join(pluginFolder, "a.md"), directory: pluginDirectory, folder: pluginFolder, otherFolder: otherPluginFolder, otherJobInput, fileJobInput, corruptSecret() {
      const owned = process.env.LITZIO_BROWSER_DAEMON_DIR;
      if (!owned) throw new Error("Secret corruption requires a runner-owned isolated Host");
      const hash = (value: string) => createHash("sha256").update(value).digest("hex");
      writeFileSync(path.join(owned, "browser-plugins.json.secrets", hash("fixture.drive"), hash("pat")), "invalid DPAPI ciphertext");
    }, cli: (args: string[]) => JSON.parse(execFileSync(process.execPath, [path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"), ...args, "--host", url, "--json"], { encoding: "utf8", windowsHide: true })) };
    let result;
    const folderAliasRoot = path.join(FILE_ACTIONS_ROOT, "trash-alias");
    const enableFolderTrash = async () => {
      symlinkSync(path.join(FILE_ACTIONS_ROOT, "trash-target"), folderAliasRoot, process.platform === "win32" ? "junction" : "dir");
      await page.route("**/api/host-capabilities", async route => {
        const response = await route.fetch({ headers: { Connection: "close" } });
        await route.fulfill({ response, json: { ...await response.json(), fileDeletion: "trash" } });
      });
      await page.route("**/api/folder-trash", async route => {
        const input = route.request().postDataJSON();
        // This test adapter owns only the designated fixture; never invokes OS trash.
        if (input.root !== FILE_ACTIONS_ROOT || input.path !== path.join(FILE_ACTIONS_ROOT, "trash-target")) throw new Error("Folder trash fixture scope violation");
        const result = await executeFolderTrash(input, { remove: target => renameSync(target, path.join(FILE_ACTIONS_ROOT, ".trashed-folder")) });
        await route.fulfill({ status: result.receipt.outcome === "success" ? 200 : 400, json: result });
      });
      await page.reload();
      await page.getByTestId("folder").filter({ has: page.getByRole("treeitem", { name: "trash-target", exact: true }) }).waitFor();
    };
    try { result = await scenario(page, { folderAliasRoot, changeFolderContents: () => appendFileSync(path.join(FILE_ACTIONS_ROOT, "trash-target", "inside.md"), "\nExternal folder change.\n"), enableFolderTrash, pluginFixture: { ...pluginFixture }, fullLayout: process.env.LITZIO_TEST_LAYOUT_SCOPE !== "representative", brand, assistantFixture: { document: path.join(REPOSITORY_ROOT, "tmp/assistant/document.md") }, assertSavedSource: savedSourceAssertion(test.info()), screenshots, showNotifications, fileActionsRoot: FILE_ACTIONS_ROOT, expect, recoveryRecords, openFolderPicker, openDocument, openPath, waitForActivePath, reloadDocument, waitForEditorFocus, activeDocument, waitForExplorerLayout, withBlockHover, bibliographyFixture,
      folderFixture: {
        change: (mode: string) => {
          const dir = path.join(REPOSITORY_ROOT, "tmp/folder-navigation/guides");
          const file = path.join(dir, "external.txt");
          if (mode === "add") {
            writeFileSync(file, "external"); mkdirSync(path.join(dir, "external-folder"), { recursive: true });
          } else if (mode === "rename") {
            renameSync(file, path.join(dir, "renamed.txt"));
            renameSync(path.join(dir, "external-folder"), path.join(dir, "renamed-folder"));
          } else for (const name of ["external.txt", "renamed.txt", "external-folder", "renamed-folder"]) {
            rmSync(path.join(dir, name), { force: true, recursive: true });
          }
        },
      },
      textFixture: { replaceNative: source => writeFileSync(path.join(REPOSITORY_ROOT, "tmp/text-mode/native.md"), source) },
      // Simulate an external deletion of this one disposable file. The fixture resets it afterward.
      removeTabFixture: source => { const file = path.join(REPOSITORY_ROOT, "tmp/document-tabs/technical-1.md"); if (source === undefined) unlinkSync(file); else writeFileSync(file, source); },
    });
    } finally { /* Worker fixture owns the browser and Host lifetime. */ }
    if (result !== undefined) {
      const resultPath = test.info().outputPath("scenario-result.json");
      writeFileSync(resultPath, JSON.stringify(result, null, 2));
      await test.info().attach("scenario-result", { path: resultPath, contentType: "application/json" });
    }
  });
}
