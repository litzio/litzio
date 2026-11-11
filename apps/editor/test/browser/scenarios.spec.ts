import { doclingConverter } from "../docling-fixture.ts";
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
        localStorage.removeItem(JSON.stringify(["local", "litzio.openFolders"]));
        localStorage.removeItem(JSON.stringify(["local", "litzio.collapsedFolderSections"]));
        localStorage.removeItem(JSON.stringify(["local", "litzio.openTabs"]));
        localStorage.removeItem("litzio.uiLanguage");
        localStorage.removeItem("litzio.accentColor");
        localStorage.removeItem("litzio.theme");
        localStorage.removeItem("litzio.pageBackground");
        for (const key of Object.keys(localStorage)) if (key.startsWith("litzio.pluginTableColumns:")) localStorage.removeItem(key);
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
      const classification = classifyConsoleErrors(screenshots && process.env.LITZIO_DOCLING_REAL_ARCHIVE && ["http-plugins","vite-plugins"].includes(testInfo.title) ? "docling-capture" : testInfo.title, errors);
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
    // One existing scenario now includes Docling conversion plus Jira's two real
    // 8s deadline probes and settings health checks. Keep per-action/product limits.
    if (name === "http-plugins") test.setTimeout(180_000);
    if (name === "desktop-updates") await verifyBuiltAppearance(page);
    const source = readFileSync(path.join(REPOSITORY_ROOT, "apps/editor/test", `${name}.browser.js`), "utf8");
    const scenario = runInNewContext(`(${source})`) as (page: Page, options: { fullLayout: boolean; brand: typeof brand; assistantFixture: { document: string }; assertSavedSource: ReturnType<typeof savedSourceAssertion>; screenshots: boolean; enableFolderTrash(): Promise<void>; changeFolderContents(): void; folderAliasRoot: string; pluginFixture: { reviewArchive?: boolean; directory: string; folder: string; otherFolder: string; otherJobInput: string; cli(args: string[]): any; jira?: typeof jira; docling?: { directory: string; input: string; settings: string; realFile?: string; beforeFile?: string; benchmark?: boolean; benchmarkVariant?: string; benchmarkDocument?: string; comparisonCapture?: boolean; entryCaptureOnly?: boolean; restartWorkspaceHost():Promise<string>; comparisonBefore?: boolean; setRealInput(): void; repeatReal(): Promise<void>; setFailure(value: boolean): void; setDocumentInput(invalid: boolean, output?: string): void; setPdfOutcome(mode: string): void; conversionRequests(): number; submissions(): number; jobInput: string; fileJobInput: string; queuedJobInput: string; verifyFile(path: string, sourceName?: string): Promise<void>; report(requestId: string): Promise<any>; review(action: string, data: unknown): Promise<any>; cli(args: string[]): Promise<any> }; corruptSecret(): void; realSnapshot?: () => any; reviewDocument?: EditableDocument }; showNotifications: typeof showNotifications; fileActionsRoot: string; expect: typeof expect; recoveryRecords: typeof recoveryRecords; waitForExplorerLayout: typeof waitForExplorerLayout; openFolderPicker: typeof openFolderPicker; openDocument: typeof openDocument; openPath: typeof openPath; waitForActivePath: typeof waitForActivePath; reloadDocument: typeof reloadDocument; waitForEditorFocus: typeof waitForEditorFocus; activeDocument: typeof activeDocument; withBlockHover: typeof withBlockHover; removeTabFixture: (source?: string) => void; folderFixture: { change(mode: string): void }; textFixture: { replaceNative(source: string): void }; bibliographyFixture: unknown }) => Promise<unknown>;
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
      if (screenshots && process.env.LITZIO_DOCLING_REAL_ARCHIVE) cpSync(process.env.LITZIO_DOCLING_REAL_ARCHIVE, path.join(pluginFolder,"real.docling"));
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(path.join(pluginDirectory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeFileSync(path.join(pluginDirectory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id: "fixture.vite", tier: "community", publisher: { id: "fixture", name: "Fixture" }, name: "Vite fixture", description: "Connection settings fixture", version: "0.1.0", requiresSdk: ">=0.3.0 <1.0.0", entry: "host.js", secrets: [{ id: "api-key", title: "Access token", scope: "connection", required: false }], settingsSchema: { type: "object", properties: { serverUrl: { type: "string", title: "docling-serve URL", minLength: 1, description: "HTTP(S) service URL" }, failure: { type: "boolean", title: "Simulate failure", description: "Simulates service availability" } }, additionalProperties: false }, contributes: { healthCheck: "connection", operations: [{ id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", additionalProperties: false }, outputSchema: { type: "object" } }] } }));
      writeFileSync(path.join(pluginDirectory, "host.js"), `import { SDK_VERSION } from '@litzio/plugin-sdk';
export function activate(context){return {operations:{connection:()=>({ok:context.settings.failure !== true,message:context.settings.failure !== true ? "Fixture connected" : "연결하지 못했습니다. 저장된 서버 주소와 자격 증명을 확인한 뒤 다시 시도하세요."})},status:()=>({available:true,message:SDK_VERSION,folders:[],decorations:[],accounts:[]}),dispose(){}}}`);
    }
    if (name === "http-plugins") {
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(path.join(pluginDirectory, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#a855f7"/></svg>');
      writeFileSync(otherJobInput, JSON.stringify({ label: "CLI connection" }));
      writeFileSync(path.join(pluginDirectory, "package.json"), JSON.stringify({ type: "module", version: "0.1.0" }));
      writeFileSync(path.join(pluginDirectory, "litzio-plugin.json"), JSON.stringify({ schemaVersion: 1, id: "fixture.drive", secrets: [{ id: "pat", title: "Access token", scope: "connection", required: false }], tier: "community", publisher: { id: "fixture", name: "Fixture" }, settingsSchema: { type: "object", properties: { label: { type: "string", title: "Connection label" } }, additionalProperties: false }, name: "Drive fixture", description: "Isolated folder fixture", version: "0.1.0", requiresSdk: ">=0.4.0 <1.0.0", icon: "icon.svg", entry: "host.js", contributes: { folderSources: ["folders"], folderDecorations: ["folders"], accounts: ["folders"] } }));
      writeFileSync(path.join(pluginDirectory, "host.js"), `export function activate(c){return {operations:{},dispose(){},status(){return {...${JSON.stringify({ available: true, message: "Folder detected (fixture)", folders: [{ id: "folder", path: otherPluginFolder, label: "Drive fixture", defaultCandidate: true }], decorations: [{ id: "folder", path: otherPluginFolder, icon: "plugin" }], accounts: [{ id: "folder", label: "Fixture account", source: "Isolated fixture" }] })},message:c.settings.label ?? "Folder detected (fixture)",accounts:[{id:"folder",label:c.secrets.pat ? "Secret applied" : "Fixture account",source:"Isolated fixture"}]}}}}`);
    }
    if (name === "plugin-views") {
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
      writeFileSync(path.join(pluginFolder, "input.txt"), "AUTHORING:" + JSON.stringify({ authoring: { inputs: [{ key: "source", blocks: [
        { kind: "heading", level: 1, text: "Imported" }, { kind: "paragraph", text: "Job result." },
        { kind: "figure", imageAsset: "picture", imageAlt: "Imported image", caption: "Stored image", enumerator: "A.3" },
        { kind: "figure", imageAsset: "picture", imageAlt: "Logo", caption: "Unnumbered logo", enumerated: false },
        { kind: "table", rows: [["Name"], ["Logo"]], enumerated: false },
      ] }] }, images: [{ key: "picture", mime: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=" }] }));
      for (const name of ["browser-result.md", "stopped-result.md", "closed-result.md", "reopened-running.md", "input.bin", "nested/input.bin"]) rmSync(path.join(pluginFolder, name), { force: true });
      for (const name of ["batch-a", "batch-b", "cli-a", "cli-b"]) {
        writeFileSync(path.join(pluginFolder, `${name}.txt`), "# Batch result");
        rmSync(path.join(pluginFolder, `${name}.bin`), { force: true });
      }
      rmSync(path.join(pluginFolder, "result.md"), { force: true });
      writeFileSync(fileJobInput, JSON.stringify({ job: "file", requestId: randomUUID(), root: pluginFolder, file: "nested/input.txt" }));
      writeFileSync(path.join(pluginFolder, "slow.txt"), "SLOW\n# Resume observation\n");
      writeFileSync(path.join(pluginFolder, "fail.txt"), "FAIL");
      writeFileSync(path.join(pluginFolder, "start-fail.txt"), "THROW");
      writeFileSync(path.join(pluginFolder, "uncertain.txt"), "UNCERTAIN");
    }
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
    const syntheticDocument = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, "community-plugins/docling/fixtures/document.json"), "utf8"));
    syntheticDocument.texts.push({ self_ref: "#/texts/10", label: "caption", text: "Figure IV: Unreadable number" });
    syntheticDocument.pictures.push({ self_ref: "#/pictures/1", label: "picture", captions: [{ $ref: "#/texts/10" }], children: [{ $ref: "#/texts/10" }] });
    syntheticDocument.body.children.push({ $ref: "#/pictures/1" });
    syntheticDocument.origin = { binary_hash: "UNSAFE_INTEGER", mimetype: "application/pdf", filename: "source.pdf", uri: null };
    syntheticDocument.pictures[0].image = { uri: "data:image/png;base64," + png.toString("base64"), mimetype: "image/png", dpi: 72, size: { width: 1, height: 1 } };
    syntheticDocument.pages = {"1":{size:{width:612,height:792}},"2":{size:{width:612,height:792}}};
    for (const page of Object.values(syntheticDocument.pages) as any[]) page.image = syntheticDocument.pictures[0].image;
    syntheticDocument.texts[4].prov = [{page_no:2,bbox:{l:50,t:710,r:400,b:680,coord_origin:"BOTTOMLEFT"}}];
    syntheticDocument.texts[1].prov = [{page_no:1,bbox:{l:50,t:40,r:400,b:80,coord_origin:"TOPLEFT"}}];
    const rawResult = JSON.stringify({ status: "success", errors: [], document: { json_content: syntheticDocument } }).replace('"UNSAFE_INTEGER"', "18446744073709551615");
    let doclingFailure = false, conversionRequests = 0, submissions = 0, conversionState = "success", taskId = "", receivedFields: Record<string, FormDataEntryValue[]> = {};
    let jiraFault = 0, jiraRedirects = 0, jiraLarge = false;
    const jiraSearches: { jql: string; startAt: number }[] = [];
    const doclingServer = ["http-plugins","workspace-review"].includes(name) ? createServer(async (request, response) => {
      if (request.url === "/jira/rest/api/2/myself") {
        const status = request.headers.authorization !== "Bearer mock-jira-token" ? 401 : jiraFault || 200;
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(status === 200 ? { name: "mock-user", displayName: "Fixture PAT user" } : { errorMessages: ["RAW-JIRA-SENTINEL mock-jira-token"] })); return;
      }
      if (request.url?.startsWith("/jira/rest/api/2/user/picker?") || request.url === "/jira/rest/api/2/project") {
        const status = request.headers.authorization !== "Bearer mock-jira-token" ? 401 : jiraFault || 200;
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(status !== 200 ? {} : request.url.includes("/user/picker?") ? { users: [{ name: "mock-user", displayName: "Fixture PAT user" }] } : [{ key: "MOCK", name: "Fixture project" }])); return;
      }
      if (request.url === "/redirect-target") {
        jiraRedirects++;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ fields: { summary: "Unexpected redirect" } })); return;
      }
      if (request.url?.startsWith("/jira/rest/api/2/search?")) {
        const url = new URL(request.url, "http://fixture");
        const jql = url.searchParams.get("jql")!;
        const startAt = Number(url.searchParams.get("startAt"));
        jiraSearches.push({ jql, startAt });
        const status = request.headers.authorization !== "Bearer mock-jira-token" ? 401 : jiraFault || 200;
        if (jiraFault === 408) { const timer = setTimeout(() => response.end("{}"), 8500); response.once("close", () => clearTimeout(timer)); return; }
        response.writeHead(status, { "Content-Type": "application/json", ...(jiraFault === 302 ? { Location: "/redirect-target" } : {}) });
        if (status !== 200) { response.end(JSON.stringify({ errorMessages: ["RAW-JIRA-SENTINEL mock-jira-token"] })); return; }
        const keys = jql.startsWith("key in (") ? ["MOCK-1", "MOCK-2"] : jiraLarge ? Array.from({ length: 501 }, (_, i) => `MOCK-${i + 1}`) : jql.includes("IS NOT EMPTY") ? ["MOCK-2"] : jql.includes("Unresolved") ? ["MOCK-1", "MOCK-8"] : ["MOCK-1", "MOCK-2", "MOCK-6", "MOCK-8"];
        // Server may return fewer rows than requested; advance using the actual count.
        const issues = keys.slice(startAt, startAt + (jiraLarge ? 100 : 2)).map(key => ({ key, fields: { summary: "검토할 이슈 " + key, status: { name: "Open" }, assignee: null, reporter: { displayName: "Fixture reporter" }, created: "2026-11-01", priority: { name: "High" }, updated: "2026-11-09" } }));
        response.end(JSON.stringify({ startAt, total: keys.length, issues })); return;
      }
      if (request.url?.includes("/comment?")) {
        const url = new URL(request.url, "http://fixture");
        expect(url.searchParams.get("orderBy")).toBe("-created");
        expect(url.searchParams.get("maxResults")).toBe("10");
        response.writeHead(jiraFault || 200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(jiraFault ? { errorMessages: ["RAW-JIRA-SENTINEL mock-jira-token"] } : { startAt: 0, total: 12, comments: Array.from({ length: 10 }, (_, i) => ({ id: String(12 - i), author: { displayName: "Fixture reporter" }, created: "2026-11-09", updated: "2026-11-09", body: i === 0 ? "Release approved. " + "x".repeat(4100) : "Review completed." })) })); return;
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
        response.end(JSON.stringify(status === 200 ? { key, fields: { description: "Weekly report: search completed. <script>text only</script>" + "d".repeat(16000), reporter: { displayName: "Fixture reporter" }, created: "2026-11-01", summary: "검토할 이슈 " + key, status: { name: "Open" }, assignee: null, priority: { name: "High" }, updated: "2026-11-09" } } : { errorMessages: ["RAW-JIRA-SENTINEL mock-jira-token"] }));
        return;
      }
      if (request.url !== "/health") conversionRequests++;
      const reply = (body: unknown, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(body)); };
      try {
        if (request.url === "/health") return reply({ status: "ok" }, doclingFailure ? 503 : 200);
        if (request.url === "/version") return reply({ "docling-serve": "1.32.0" });
        if (request.url === "/ready") return reply({ status: "ok" });
        if (request.url === "/openapi.json") return reply({ info: { version: "1.32.0" } });
        if (request.url === "/v1/convert/file/async" && request.method === "POST") {
          const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": String(request.headers["content-type"]) } }).formData();
          receivedFields = Object.fromEntries([...new Set(form.keys())].map(key => [key, form.getAll(key)]));
          taskId = `fixture-${++submissions}`;
          return reply({ task_id: taskId, task_type: "convert", task_status: "pending" });
        }
        if (request.url === "/v1/status/poll/" + taskId) {
          if (conversionState === "source-change") writeFileSync(path.join(pluginFolder, "source.pdf"), "changed source");
          return reply({ task_id: taskId, task_type: "convert", task_status: conversionState === "failure" ? "failure" : conversionState === "pending" ? "started" : "success" });
        }
        if (request.url === "/v1/result/" + taskId) { response.writeHead(200, { "Content-Type": "application/json" }); response.end(rawResult); return; }
        return reply({}, 503);
      } catch { return reply({}, 500); }
    }) : undefined;
    if (doclingServer) await new Promise<void>(resolve => doclingServer.listen(0, "127.0.0.1", resolve));
    const doclingAddress = doclingServer?.address();
    let workspaceHost: Awaited<ReturnType<typeof startOwnedDaemon>> | undefined;
    const workspaceData=path.join(REPOSITORY_ROOT,"tmp",`workspace-host-${randomUUID()}`);
    const docling = doclingServer && doclingAddress && typeof doclingAddress !== "string" ? {
      directory: path.join(REPOSITORY_ROOT, "tmp/http-host-a/docling-artifact"),
      input: path.join(REPOSITORY_ROOT, "tmp/docling-input.json"),
      settings: path.join(REPOSITORY_ROOT, "tmp/docling-settings.json"),
      comparisonPage: Number(process.env.LITZIO_DOCLING_COMPARE_PAGE ?? 1),
      comparisonWidth: Number(process.env.LITZIO_DOCLING_COMPARE_WIDTH ?? 0),
      comparisonCapture: process.env.LITZIO_DOCLING_COMPARE_CAPTURE === "1",
      entryCaptureOnly: process.env.LITZIO_COMPARE_ENTRY_CAPTURE === "1",
      comparisonBefore: process.env.LITZIO_DOCLING_COMPARE_BEFORE === "1",
      realFile: screenshots && process.env.LITZIO_DOCLING_REAL_ARCHIVE ? "real.docling" : undefined,
      beforeFile: screenshots && process.env.LITZIO_DOCLING_BEFORE ? "docling-before.md" : undefined,
      setRealInput() {
        writeFileSync(this.jobInput, JSON.stringify({ job: "create-document", root: pluginFolder, file: "real.docling", output: "docling-real.md" }));
      },
      async restartWorkspaceHost() {
        await workspaceHost?.close();
        workspaceHost=await startOwnedDaemon(workspaceData,[pluginFolder,this.directory]);
        const post=async(body:unknown)=>{const r=await fetch(workspaceHost!.url+"/api/plugins",{method:"POST",headers:{Origin:workspaceHost!.url,"Content-Type":"application/json"},body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw new Error(value.error);return value;};
        const {plugins}=await post({action:"list"});
        if(plugins.some((p:any)=>p.id==="community.docling"&&p.running))await post({action:"disable",id:"community.docling"});
        await post({action:"register",directory:this.directory});const registered=await post({action:"list"});
        await post({action:"trust",id:"community.docling",registrationId:registered.plugins.find((p:any)=>p.id==="community.docling").registrationId});
        await post({action:"enable",id:"community.docling"});
        return workspaceHost!.url;
      },
      async repeatReal() {
        const assets = path.join(pluginFolder, "assets");
        const files = readdirSync(assets).sort();
        const archive = readFileSync(path.join(pluginFolder, "real.docling"));
        rmSync(path.join(pluginFolder, "docling-real.md"));

        const started = await this.cli(["plugins", "start", "community.docling", "--input", this.jobInput]);
        await expect.poll(async () => (await this.cli(["plugins", "status", started.job.requestId])).job.state).toBe("completed");
        expect(readdirSync(assets).sort()).toEqual(files);
        expect(readFileSync(path.join(pluginFolder, "real.docling")).equals(archive)).toBe(true);
      },
      setFailure(value: boolean) { doclingFailure = value; },
      setPdfOutcome(mode: string) {
        conversionState = mode;
        writeFileSync(this.fileJobInput, JSON.stringify({ job: "convert-pdf", root: pluginFolder, file: "source.pdf", output: `pdf-${mode}.docling` }));
      },
      setDocumentInput(invalid: boolean, output = "docling-repeated.md") {
        writeFileSync(this.jobInput, JSON.stringify({ job: "create-document", root: pluginFolder, file: invalid ? "invalid.docling" : "sample.docling", output }));
      },
      conversionRequests() { return conversionRequests; },
      submissions() { return submissions; },
      jobInput: path.join(REPOSITORY_ROOT, "tmp/docling-job.json"),
      fileJobInput: path.join(REPOSITORY_ROOT, "tmp/docling-file-job.json"),
      queuedJobInput: path.join(REPOSITORY_ROOT, "tmp/docling-queued-job.json"),
      async verifyFile(file: string, sourceName = "source.pdf") {
        const { readDoclingArchive } = await import(new URL("../../../../community-plugins/docling/archive.js", import.meta.url).href);
        const decoded = readDoclingArchive(readFileSync(file));
        expect(decoded.manifest.source.name).toBe(path.basename(sourceName));
        expect(decoded.manifest.source.sha256).toBe(createHash("sha256").update(readFileSync(path.join(pluginFolder, sourceName))).digest("hex"));
        expect(decoded.sourcePdf.equals(readFileSync(path.join(pluginFolder, sourceName)))).toBe(true);
      },
      async report(requestId: string) {
        const result = (await this.cli(["plugins", "result", requestId])).job.result;
        writeFileSync(this.input, JSON.stringify({ requestId, result }));
        return (await this.cli(["operation", "invoke", "community.docling.conversion-report", "--input", this.input])).result;
      },
      async review(action: string, data: unknown) {
        writeFileSync(this.input, JSON.stringify(data));
        return this.cli(["review", ...(action === "workspace-review-change" ? ["groups", (data as any).change.kind.slice(7)] : [action]), "--input", this.input]);
      },
      async cli(args: string[]) {
        if (args[0] === "plugins" && args[1] === "start") {
          const input = args[args.indexOf("--input") + 1]!;
          writeFileSync(input, JSON.stringify({ ...JSON.parse(readFileSync(input, "utf8")), requestId: randomUUID() }));
        }
        return JSON.parse((await promisify(execFile)(process.execPath, [path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"), ...args, "--host", url, "--json"], { encoding: "utf8", windowsHide: true })).stdout); },
    } : undefined;
    if (docling) {
      cpSync(path.join(REPOSITORY_ROOT, "community-plugins/docling"), docling.directory, { recursive: true });
      if (docling.realFile) cpSync(process.env.LITZIO_DOCLING_REAL_ARCHIVE!, path.join(pluginFolder, docling.realFile));
      if (docling.beforeFile) cpSync(process.env.LITZIO_DOCLING_BEFORE!, path.join(pluginFolder, docling.beforeFile));
      const { readDoclingArchive } = await import(new URL("../../../../community-plugins/docling/archive.js", import.meta.url).href);
      const { convertPdfToArchive, PDF_PROFILE } = await import(new URL("../../../../community-plugins/docling/conversion.js", import.meta.url).href);
      const serverUrl = `http://127.0.0.1:${(doclingAddress as import("node:net").AddressInfo).port}`;
      const source = path.join(pluginFolder, "source.pdf"), sourceBytes = readFileSync(path.join(REPOSITORY_ROOT, "tmp/http-host-a/fixture/reading.pdf"));
      writeFileSync(source, sourceBytes);
      for (const name of ["dashboard-a", "dashboard-b"]) writeFileSync(path.join(pluginFolder, name + ".pdf"), sourceBytes);
      const { initializeWorkspace } = await doclingConverter();
      const archive = await initializeWorkspace(await convertPdfToArchive({ file: source, serverUrl }));
      const decoded = readDoclingArchive(archive);
      for (const [key, value] of Object.entries(PDF_PROFILE.request)) {
        expect(receivedFields[key]).toEqual(Array.isArray(value) ? value.map(String) : [typeof value === "object" ? JSON.stringify(value) : String(value)]);
      }
      expect(submissions).toBe(1);
      expect(receivedFields.files).toHaveLength(1);
      const uploaded = receivedFields.files![0] as File;
      expect(uploaded.type).toBe("application/pdf");
      expect(uploaded.name).toBe("source.pdf");
      expect(Buffer.from(await uploaded.arrayBuffer()).equals(sourceBytes)).toBe(true);
      expect(decoded.documentJson).toContain('"binary_hash":18446744073709551615');
      expect(decoded.sourcePdf.equals(sourceBytes)).toBe(true);
      expect(decoded.document.pages[1].image).toEqual(syntheticDocument.pages[1].image);
      expect(decoded.manifest.images.find((image: any) => image.pointer === "/pages/1/image").sha256).toBe(createHash("sha256").update(png).digest("hex"));
      expect(decoded.manifest.source.sha256).toBe(createHash("sha256").update(sourceBytes).digest("hex"));
      expect(decoded.manifest.result.sha256).toBe(createHash("sha256").update(rawResult).digest("hex"));
      expect(decoded.manifest.profile).toEqual(PDF_PROFILE);
      expect(decoded.manifest.version).toBe(4);
      expect(decoded.manifest.converter.pluginVersion).toBe("0.0.11");
      expect(decoded.manifest.images[0].sha256).toBe(createHash("sha256").update(png).digest("hex"));
      conversionState = "failure";
      await expect(convertPdfToArchive({ file: source, serverUrl })).rejects.toThrow(/task fixture-2/);
      expect(submissions).toBe(2); // no automatic retry of a failed submission
      conversionState = "source-change";
      await expect(convertPdfToArchive({ file: source, serverUrl })).rejects.toThrow(/task fixture-3/);
      writeFileSync(source, sourceBytes);
      conversionState = "pending";
      await expect(convertPdfToArchive({ file: source, serverUrl, timeoutSeconds: 1 })).rejects.toThrow(/timeout.*task fixture-4/);
      expect(submissions).toBe(4);
      conversionState = "success";
      conversionRequests = 0; // later native-document work must remain offline
      writeFileSync(path.join(pluginFolder, "sample.docling"), archive);
      const corrupt = Buffer.from(archive); corrupt[43] = corrupt[43]! ^ 1;
      writeFileSync(path.join(pluginFolder, "invalid.docling"), corrupt);
      writeFileSync(docling.fileJobInput, JSON.stringify({ job: "convert-pdf", root: pluginFolder, file: "source.pdf" }));
      writeFileSync(docling.queuedJobInput, JSON.stringify({ job: "convert-pdf", root: pluginFolder, file: "source.pdf", output: "pdf-waiter.docling" }));
      writeFileSync(docling.jobInput, JSON.stringify({ job: "create-document", root: pluginFolder, file: "source.docling", output: "docling-cli.md" }));
      writeFileSync(docling.input, "{}");
      writeFileSync(docling.settings, JSON.stringify({ serverUrl: `http://127.0.0.1:${(doclingAddress as import("node:net").AddressInfo).port}` }));
    }
    const jira = docling ? {
      directory: path.join(REPOSITORY_ROOT, "tmp/http-host-a/jira-artifact"),
      input: path.join(REPOSITORY_ROOT, "tmp/jira-input.json"),
      settings: path.join(REPOSITORY_ROOT, "tmp/jira-settings.json"),
      healthInput: path.join(REPOSITORY_ROOT, "tmp/jira-health-input.json"),
      setFault(value: number) { jiraFault = value; },
      redirects() { return jiraRedirects; },
      async cli(args: string[]) {
        try { return await docling.cli(args); }
        catch (error: any) { if (error.stdout) return JSON.parse(error.stdout); throw error; }
      },
      setInput(keys: string) { writeFileSync(this.input, JSON.stringify({ keys })); },
      setQuery(value: Record<string, string>) { jiraSearches.length = 0; writeFileSync(this.input, JSON.stringify(value)); },
      searches() { return jiraSearches; },
      setLarge(value: boolean) { jiraLarge = value; },
      setSettings(value: Record<string, string>) { writeFileSync(this.settings, JSON.stringify(value)); },
      baseUrl: `http://127.0.0.1:${(doclingAddress as import("node:net").AddressInfo).port}/jira`,
      mock: process.env.LITZIO_JIRA_MOCK === "1",
    } : undefined;
    if (jira) {
      cpSync(path.join(REPOSITORY_ROOT, "community-plugins/jira"), jira.directory, { recursive: true });
      writeFileSync(jira.healthInput, "{}");
      jira.setInput("MOCK-1, MOCK-2, MOCK-404");
      jira.setSettings({ baseUrl: jira.baseUrl });
    }
    const pluginFixture = { reviewArchive: screenshots && !!process.env.LITZIO_DOCLING_REAL_ARCHIVE, directory: pluginDirectory, folder: pluginFolder, otherFolder: otherPluginFolder, otherJobInput, fileJobInput, corruptSecret() {
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
    try { result = await scenario(page, { folderAliasRoot, changeFolderContents: () => appendFileSync(path.join(FILE_ACTIONS_ROOT, "trash-target", "inside.md"), "\nExternal folder change.\n"), enableFolderTrash, pluginFixture: { ...pluginFixture, docling, jira, realSnapshot, reviewDocument: name === "plugin-views" ? getEditableDocument(parse(readFileSync(path.join(pluginFolder, "a.md"), "utf8"))) : undefined }, fullLayout: process.env.LITZIO_TEST_LAYOUT_SCOPE !== "representative", brand, assistantFixture: { document: path.join(REPOSITORY_ROOT, "tmp/assistant/document.md") }, assertSavedSource: savedSourceAssertion(test.info()), screenshots, showNotifications, fileActionsRoot: FILE_ACTIONS_ROOT, expect, recoveryRecords, openFolderPicker, openDocument, openPath, waitForActivePath, reloadDocument, waitForEditorFocus, activeDocument, waitForExplorerLayout, withBlockHover, bibliographyFixture,
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
    } finally { await workspaceHost?.close(); if (doclingServer) await new Promise<void>((resolve, reject) => doclingServer.close(error => error ? reject(error) : resolve())); }
    if (result !== undefined) {
      const resultPath = test.info().outputPath("scenario-result.json");
      writeFileSync(resultPath, JSON.stringify(result, null, 2));
      await test.info().attach("scenario-result", { path: resultPath, contentType: "application/json" });
    }
  });
}
