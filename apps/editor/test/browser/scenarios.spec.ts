import { cpSync } from "node:fs";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { execFile, execFileSync } from "node:child_process";
import { brand } from "../../../../brand.ts";
import { randomUUID } from "node:crypto";
import { citationReport, parse, getEditableDocument, type EditableDocument } from "@litzio/core";
import { test as base, expect, chromium, type BrowserContext, type ConsoleMessage, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, renameSync, unlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { classifyConsoleErrors } from "./console-errors.ts";
import { finishScenarioDiagnostics, savedSourceAssertion } from "./diagnostics.ts";
import { hideFloatingNotifications, FILE_ACTIONS_ROOT, prepareBrowserFixtures, REPOSITORY_ROOT, SOURCE_DIRS } from "./fixtures.ts";
import { NOTIFICATION_SCENARIOS, STABLE_SCENARIOS } from "./scenarios.ts";
import { showNotifications, activeDocument, openFolderPicker, openDocument, openPath, reloadDocument, waitForActivePath, waitForEditorFocus } from "./navigation.ts";
import { withBlockHover } from "./hover.ts";
import { recoveryRecords } from "./recovery-records.ts";
import { inputEventScript } from "./input-event-script.ts";
import { verifyBuiltAppearance } from "./desktop-appearance.ts";

const url = process.env.LITZIO_BROWSER_URL ?? (process.env.LITZIO_BROWSER_HOST === "http" ? "http://127.0.0.1:5181" : "http://127.0.0.1:5173");
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
      // Node-side page.request/route.fetch must not reuse an expiring idle socket (#658).
      extraHTTPHeaders: { Connection: "close" },
    });
    try {
      // This worker-owned persistent context also creates startup and secondary-tab pages.
      context.setDefaultTimeout(workerInfo.project.use.actionTimeout!);
      context.setDefaultNavigationTimeout(workerInfo.project.use.navigationTimeout!);
      await context.clearCookies();
      const scratchRoots = [path.join(REPOSITORY_ROOT, "tmp"), FILE_ACTIONS_ROOT].map(root => root.replaceAll("\\", "/"));
      const withinScratch = (file: string, root: string) => !file.split("/").includes("..") && (file === root || file.startsWith(root + "/"));
      const writableScratch = (file: string) => scratchRoots.some(root => withinScratch(file, root));
      await context.route("**/api/file", route => {
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
        localStorage.removeItem(JSON.stringify(["local", "litzio.openFolders"]));
        localStorage.removeItem(JSON.stringify(["local", "litzio.collapsedFolderSections"]));
        localStorage.removeItem(JSON.stringify(["local", "litzio.openTabs"]));
        localStorage.removeItem("litzio.uiLanguage");
        localStorage.removeItem("litzio.accentColor");
        localStorage.removeItem("litzio.theme");
        localStorage.removeItem("litzio.pageBackground");
        localStorage.removeItem("litzio.tableWrapDefault");
        localStorage.removeItem(JSON.stringify(["local", "litzio.tableWrapDocuments"]));
      });
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("litzio-recovery");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }));
      await page.reload();
      await page.locator('[data-testid="document-start"], [data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
      await page.mouse.move(0, 0);
      await page.evaluate(() => { document.querySelector<HTMLElement>('.document-scroll[data-active="true"]')?.scrollTo(0, 0); document.activeElement instanceof HTMLElement && document.activeElement.blur(); });
      await use(page);
    } finally {
      const classification = classifyConsoleErrors(testInfo.title, errors);
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
    if (name === "desktop-updates") await verifyBuiltAppearance(page);
    const source = readFileSync(path.join(REPOSITORY_ROOT, "apps/editor/test", `${name}.browser.js`), "utf8");
    const scenario = runInNewContext(`(${source})`) as (page: Page, options: { fullLayout: boolean; brand: typeof brand; assistantFixture: { document: string }; assertSavedSource: ReturnType<typeof savedSourceAssertion>; screenshots: boolean; pluginFixture: { directory: string; folder: string; otherFolder: string; otherJobInput: string; cli(args: string[]): any; jira?: typeof jira; docling?: { directory: string; input: string; settings: string; setFailure(value: boolean): void; cli(args: string[]): Promise<any> }; corruptSecret(): void; realSnapshot?: () => any; reviewDocument?: EditableDocument }; showNotifications: typeof showNotifications; fileActionsRoot: string; expect: typeof expect; recoveryRecords: typeof recoveryRecords; openFolderPicker: typeof openFolderPicker; openDocument: typeof openDocument; openPath: typeof openPath; waitForActivePath: typeof waitForActivePath; reloadDocument: typeof reloadDocument; waitForEditorFocus: typeof waitForEditorFocus; activeDocument: typeof activeDocument; withBlockHover: typeof withBlockHover; removeTabFixture: (source?: string) => void; folderFixture: { change(mode: string): void }; textFixture: { replaceNative(source: string): void }; bibliographyFixture: unknown }) => Promise<unknown>;
    const bibliographyPath = path.join(REPOSITORY_ROOT, "tmp", name === "http-host" ? "http-host-a" : "bibliography", "refs.bib");
    const initialBibliography = ["bibliography", "http-host"].includes(name) ? readFileSync(bibliographyPath, "utf8") : "";
    const bibliographyFixture = {
      read: () => readFileSync(bibliographyPath, "utf8"),
      hash: () => createHash("sha256").update(readFileSync(bibliographyPath)).digest("hex"),
      change: (mode: "updated" | "invalid" | "restore") => writeFileSync(bibliographyPath,
        mode === "updated" ? initialBibliography.replace("Control Study", "Updated Study") : mode === "invalid" ? "@article{broken" : initialBibliography),
      report: (markdown: string, text: string) => citationReport(parse(markdown), [{ source: "../refs.bib", status: "ok", text }]),
    };
    const pluginDirectory = path.join(REPOSITORY_ROOT, "tmp", "http-host-a", name === "plugin-jobs" ? "job-artifact" : name === "generated-views" ? "issues-artifact" : "plugin-artifact");
    const pluginFolder = path.join(REPOSITORY_ROOT, "tmp", "http-host-a", "fixture");
    const otherPluginFolder = path.join(REPOSITORY_ROOT, "tmp", "http-host-b", "fixture");
    const fileJobInput = path.join(REPOSITORY_ROOT, "tmp", "k1-file-request.json");
    const otherJobInput = path.join(REPOSITORY_ROOT, "tmp", "k1-other-root-request.json");
    if (name === "vite-plugins") {
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(path.join(pluginDirectory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeFileSync(path.join(pluginDirectory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id: "fixture.vite", tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: "Vite fixture", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [] } }));
      writeFileSync(path.join(pluginDirectory, "host.js"), `import { SDK_VERSION } from '@litzio/plugin-sdk';
export function activate(){return {operations:{},status:()=>({available:true,message:SDK_VERSION,folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
    }
    if (name === "http-plugins") {
      writeFileSync(otherJobInput, JSON.stringify({ label: "CLI connection" }));
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(path.join(pluginDirectory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeFileSync(path.join(pluginDirectory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id: "fixture.drive", secrets: [{ id: "pat", scope: "connection", required: false }], tier: "community", publisher: { id: "fixture", name: "Fixture" }, settingsSchema: { type: "object", properties: { label: { type: "string", title: "Connection label" } }, additionalProperties: false }, name: "Drive fixture", description: "Isolated folder fixture", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { folderSources: ["folders"], folderDecorations: ["folders"], accounts: ["folders"] } }));
      writeFileSync(path.join(pluginDirectory, "host.js"), `export function activate(c){return {operations:{},dispose(){},status(){return {...${JSON.stringify({ available: true, message: "Folder detected (fixture)", folders: [{ id: "folder", path: pluginFolder, label: "Drive fixture", defaultCandidate: true }], decorations: [{ id: "folder", path: pluginFolder, icon: "onedrive" }], accounts: [{ id: "folder", label: "Fixture account", source: "Isolated fixture" }] })},message:c.settings.label ?? "Folder detected (fixture)",accounts:[{id:"folder",label:c.secrets.pat ? "Secret applied" : "Fixture account",source:"Isolated fixture"}]}}}}`);
    }
    if (name === "generated-views") {
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(path.join(pluginDirectory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeFileSync(path.join(pluginDirectory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id: "fixture.issues", tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: "Issues fixture", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: { operations: [{ id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", properties: { invalid: { type: "boolean" } }, additionalProperties: false }, outputSchema: { type: "array", items: { type: "object" } }, rowSchema: { status: { type: "string", label: "Status" }, points: { type: "number", label: "Points" }, token: { type: "string", label: "Token", secret: true } } }] } }));
      writeFileSync(path.join(pluginDirectory, "host.js"), `export function activate(){return {operations:{read:(input)=>[{status:"open",points:input.invalid?"bad":3,token:"private"},{status:"open",points:2,token:"private"},{status:"closed",points:-2,token:"private"},{status:"idle",points:0,token:"private"}]},dispose(){},status:()=>({available:true,message:"Fixture",folders:[],decorations:[],accounts:[]})}}`);
      writeFileSync(path.join(pluginDirectory, "input.json"), "{}");
      writeFileSync(path.join(pluginDirectory, "invalid-input.json"), JSON.stringify({ invalid: true }));
    }
    if (name === "plugin-jobs") {
      rmSync(pluginDirectory, { recursive: true, force: true });
      cpSync(path.join(REPOSITORY_ROOT, "apps/editor/test/fixtures/job-plugin"), pluginDirectory, { recursive: true });
      for (const folder of [pluginFolder, otherPluginFolder]) {
        mkdirSync(path.join(folder, "nested"), { recursive: true });
        writeFileSync(path.join(folder, "nested", "input.txt"), folder === pluginFolder ? "# Root A" : "# Root B");
      }
      writeFileSync(path.join(otherPluginFolder, "input.txt"), "# Root B");
      rmSync(path.join(otherPluginFolder, "recent-result.md"), { force: true });
      writeFileSync(otherJobInput, JSON.stringify({ job: "text", requestId: randomUUID(), root: otherPluginFolder, file: "input.txt", output: "recent-result.md" }));
      writeFileSync(path.join(pluginFolder, "input.txt"), "# Imported\n\nJob result.\n");
      for (const name of ["browser-result.md", "stopped-result.md", "closed-result.md", "reopened-running.md", "input.bin", "nested/input.bin"]) rmSync(path.join(pluginFolder, name), { force: true });
      writeFileSync(fileJobInput, JSON.stringify({ job: "file", requestId: randomUUID(), root: pluginFolder, file: "nested/input.txt" }));
      writeFileSync(path.join(pluginFolder, "slow.txt"), "SLOW\n# Resume observation\n");
      writeFileSync(path.join(pluginFolder, "fail.txt"), "FAIL");
      writeFileSync(path.join(pluginFolder, "uncertain.txt"), "UNCERTAIN");
    }
    // Reuse this production Host/browser and one fake external Docling/Jira service.
    const doclingServer = name === "http-plugins" ? createServer((request, response) => {
      if (request.url === "/redirect-target") {
        jiraRedirects++;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ fields: { summary: "Unexpected redirect" } })); return;
      }
      if (request.url?.startsWith("/jira/rest/api/2/issue/")) {
        const key = request.url.split("/").at(-1);
        const status = request.headers.authorization !== "Bearer mock-jira-token" ? 401 : jiraFault || (key === "MOCK-404" ? 404 : 200);
        if (jiraFault === 408) {
          const timer = setTimeout(() => response.end("{}"), 8500);
          response.once("close", () => clearTimeout(timer)); return;
        }
        response.writeHead(status, { "Content-Type": "application/json", ...(jiraFault === 302 ? { Location: "/redirect-target" } : {}) });
        if (jiraFault === 302) { response.end(); return; }
        response.end(JSON.stringify(status === 200 ? { fields: { summary: "검토할 이슈 " + key, status: { name: "Open" }, assignee: null, priority: { name: "High" }, updated: "2026-11-09" } } : { errorMessages: ["RAW-JIRA-SENTINEL mock-jira-token"] }));
        return;
      }
      response.writeHead(request.url === "/health" ? (doclingFailure ? 503 : 200) : 404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
    }) : undefined;
    let doclingFailure = false;
    let jiraFault = 0, jiraRedirects = 0;
    if (doclingServer) await new Promise<void>(resolve => doclingServer.listen(0, "127.0.0.1", resolve));
    const doclingAddress = doclingServer?.address();
    const docling = doclingServer && doclingAddress && typeof doclingAddress !== "string" ? {
      directory: path.join(REPOSITORY_ROOT, "tmp/http-host-a/docling-artifact"),
      input: path.join(REPOSITORY_ROOT, "tmp/docling-input.json"),
      settings: path.join(REPOSITORY_ROOT, "tmp/docling-settings.json"),
      setFailure(value: boolean) { doclingFailure = value; },
      async cli(args: string[]) { return JSON.parse((await promisify(execFile)(process.execPath, [path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"), ...args, "--host", url, "--json"], { encoding: "utf8", windowsHide: true })).stdout); },
    } : undefined;
    if (docling) {
      cpSync(path.join(REPOSITORY_ROOT, "community-plugins/docling"), docling.directory, { recursive: true });
      writeFileSync(docling.input, "{}");
      writeFileSync(docling.settings, JSON.stringify({ serverUrl: `http://127.0.0.1:${(doclingAddress as import("node:net").AddressInfo).port}` }));
    }
    const jira = docling ? {
      directory: path.join(REPOSITORY_ROOT, "tmp/http-host-a/jira-artifact"),
      input: path.join(REPOSITORY_ROOT, "tmp/jira-input.json"),
      settings: path.join(REPOSITORY_ROOT, "tmp/jira-settings.json"),
      setFault(value: number) { jiraFault = value; },
      redirects() { return jiraRedirects; },
      async cli(args: string[]) {
        try { return await docling.cli(args); }
        catch (error: any) { if (error.stdout) return JSON.parse(error.stdout); throw error; }
      },
      setInput(keys: string) { writeFileSync(this.input, JSON.stringify({ keys })); },
      setSettings(value: Record<string, string>) { writeFileSync(this.settings, JSON.stringify(value)); },
      baseUrl: `http://127.0.0.1:${(doclingAddress as import("node:net").AddressInfo).port}/jira`,
      mock: process.env.LITZIO_JIRA_MOCK === "1",
    } : undefined;
    if (jira) {
      cpSync(path.join(REPOSITORY_ROOT, "community-plugins/jira"), jira.directory, { recursive: true });
      jira.setInput("MOCK-1, MOCK-2, MOCK-404");
      jira.setSettings({ baseUrl: jira.baseUrl });
    }
    const pluginFixture = { directory: pluginDirectory, folder: pluginFolder, otherFolder: otherPluginFolder, otherJobInput, fileJobInput, corruptSecret() {
      const owned = process.env.LITZIO_BROWSER_DAEMON_DIR;
      if (!owned) throw new Error("Secret corruption requires a runner-owned isolated Host");
      const hash = (value: string) => createHash("sha256").update(value).digest("hex");
      writeFileSync(path.join(owned, "browser-plugins.json.secrets", hash("fixture.drive"), hash("pat")), "invalid DPAPI ciphertext");
    }, cli: (args: string[]) => JSON.parse(execFileSync(process.execPath, [path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"), ...args, "--host", url, "--json"], { encoding: "utf8", windowsHide: true })) };
    const realCapture = screenshots && process.env.LITZIO_CAPTURE_ONEDRIVE === "1" && process.platform === "win32";
    const realSnapshot = realCapture && name === "http-plugins" ? () => {
      pluginFixture.cli(["plugins", "enable", "litzio.onedrive"]);
      const state = pluginFixture.cli(["plugins", "list"]);
      const plugin = state.plugins.find((p: any) => p.id === "litzio.onedrive");
      if (!plugin?.official || !plugin.running) throw new Error("Real OneDrive artifact is not running as official");
      pluginFixture.cli(["plugins", "disable", "litzio.onedrive"]);
      const masked = "C:\\Users\\Example\\OneDrive";
      if (plugin.status) {
        plugin.status.accounts = plugin.status.accounts.map((a: any) => ({ ...a, label: "Masked account", source: "HKCU Accounts (masked)" }));
        plugin.status.folders = plugin.status.folders.map((f: any) => ({ ...f, path: masked, label: "OneDrive" }));
        plugin.status.decorations = plugin.status.decorations.map((d: any) => ({ ...d, path: masked }));
      }
      writeFileSync(path.join(REPOSITORY_ROOT, "tmp/plugin-stage1/real-capture-metadata.json"), JSON.stringify({ plugin: plugin.id, official: true, detection: "actual Windows Host", folderCount: plugin.status?.folders.length, masking: "account labels, sources, paths and Host identity replaced before browser capture", runtimeDisabledAfterRead: true }, null, 2));
      return { plugins: [plugin] };
    } : undefined;
    let result;
    try { result = await scenario(page, { pluginFixture: { ...pluginFixture, docling, jira, realSnapshot, reviewDocument: name === "generated-views" ? getEditableDocument(parse(readFileSync(path.join(pluginFolder, "a.md"), "utf8"))) : undefined }, fullLayout: process.env.LITZIO_TEST_LAYOUT_SCOPE !== "representative", brand, assistantFixture: { document: path.join(REPOSITORY_ROOT, "tmp/assistant/document.md") }, assertSavedSource: savedSourceAssertion(test.info()), screenshots, showNotifications, fileActionsRoot: FILE_ACTIONS_ROOT, expect, recoveryRecords, openFolderPicker, openDocument, openPath, waitForActivePath, reloadDocument, waitForEditorFocus, activeDocument, withBlockHover, bibliographyFixture,
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
    } finally { if (doclingServer) await new Promise<void>((resolve, reject) => doclingServer.close(error => error ? reject(error) : resolve())); }
    if (result !== undefined) {
      const resultPath = test.info().outputPath("scenario-result.json");
      writeFileSync(resultPath, JSON.stringify(result, null, 2));
      await test.info().attach("scenario-result", { path: resultPath, contentType: "application/json" });
    }
  });
}
