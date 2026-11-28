import {writeCodePluginManifest} from "../../../../test/helpers/code-plugin.ts";




import { executeFolderTrash } from "../../server/file-operations.ts";


import { execFileSync } from "node:child_process";
import { brand } from "../../../../brand.ts";

import { citationReport, parse } from "@litzio/core";
import * as pluginSdk from "@litzio/plugin-sdk";
import { readDocument, writeDocument } from "@litzio/plugin-sdk/node";
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
import { assertTableToolGeometry } from "./table-tool-geometry.ts";
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
      reducedMotion: workerInfo.project.use.reducedMotion,
      // Visual review and the linked ribbon's native scrollbar drag need visible scrollbars.
      // Playwright otherwise adds --hide-scrollbars in headless Chromium.
      ...(screenshots || scenarios.includes("linked-document-view") ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}),
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
        localStorage.removeItem("litzio.activityLabels");

        localStorage.removeItem("litzio.tableWrapDefault");
        localStorage.removeItem("litzio.tableWrapDocuments.v2");
        localStorage.removeItem("litzio.highlightSets.v1");
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
    const scenario = runInNewContext(`(${source})`) as (page: Page, options: { fullLayout: boolean; brand: typeof brand; assistantFixture: { document: string }; assertSavedSource: ReturnType<typeof savedSourceAssertion>; screenshots: boolean; enableFolderTrash(): Promise<void>; changeFolderContents(): void; folderAliasRoot: string; pluginFixture: { fileActions: { folder: string; plugins: { id: string; name: string; directory: string }[] }; document: string; directory: string; folder: string; otherFolder: string; otherJobInput: string; editSource(): void; cli(args: string[]): any; corruptSecret(): void; changeInstalledCopy(): void; }; showNotifications: typeof showNotifications; fileActionsRoot: string; expect: typeof expect; recoveryRecords: typeof recoveryRecords; waitForExplorerLayout: typeof waitForExplorerLayout; openFolderPicker: typeof openFolderPicker; openDocument: typeof openDocument; openPath: typeof openPath; waitForActivePath: typeof waitForActivePath; reloadDocument: typeof reloadDocument; waitForEditorFocus: typeof waitForEditorFocus; activeDocument: typeof activeDocument; assertTableToolGeometry: typeof assertTableToolGeometry; withBlockHover: typeof withBlockHover; removeTabFixture: (source?: string) => void; folderFixture: { change(mode: string): void }; viewChange(file: string, edit: (sdk: any, document: any) => any): { revision: string; change: unknown; write(): string }; textFixture: { replaceNative(source: string): void }; bibliographyFixture: unknown }) => Promise<unknown>;
    const bibliographyPath = path.join(REPOSITORY_ROOT, "tmp", name === "http-host" ? "http-host-a" : "bibliography", "refs.bib");
    const initialBibliography = ["bibliography", "http-host"].includes(name) ? readFileSync(bibliographyPath, "utf8") : "";
    const bibliographyFixture = {
      read: () => readFileSync(bibliographyPath, "utf8"),
      hash: () => createHash("sha256").update(readFileSync(bibliographyPath)).digest("hex"),
      change: (mode: "updated" | "invalid" | "restore") => writeFileSync(bibliographyPath,
        mode === "updated" ? initialBibliography.replace("Control Study", "Updated Study") : mode === "invalid" ? "@article{broken" : initialBibliography),
      report: (markdown: string, text: string) => citationReport(parse(markdown), [{ source: "../refs.bib", status: "ok", text }]),
    };
    const pluginDirectory = path.join(REPOSITORY_ROOT, "tmp", "http-host-a", "plugin-artifact");
    const pluginFolder = path.join(REPOSITORY_ROOT, "tmp", "http-host-a", "fixture");
    const otherPluginFolder = path.join(REPOSITORY_ROOT, "tmp", "http-host-b", "fixture");
    const otherJobInput = path.join(REPOSITORY_ROOT, "tmp", "other-root-request.json");
    const fileActionFolder = path.join(REPOSITORY_ROOT, "tmp", "http-host-a", "file-actions");
    const fileActionPlugins = [
      { id: "fixture.convert", name: "Document tools", label: "Convert document", extensions: [".docx", ".eml", ".pdf", ".md"] },
      { id: "fixture.mail", name: "Mail tools", label: "Inspect message", extensions: [".eml"] },
    ].map(plugin => ({ ...plugin, directory: path.join(REPOSITORY_ROOT, "tmp", "http-host-a", plugin.id) }));
    if (name === "plugin-file-actions") {
      for (const { id, name, label, extensions, directory } of fileActionPlugins) {
        mkdirSync(directory, { recursive: true });
        writeFileSync(path.join(directory, "host.mjs"), 'export function activate(){return {operations:{},status:()=>({available:true,message:"Ready"}),dispose(){}}}');
        writeFileSync(path.join(directory, "screen.jsx"), `export default function Screen({ React, ui, fileOpen }) {
          const [count, setCount] = React.useState(0);
          return <><ui.Button onClick={() => setCount(value => value + 1)}>Count: {count}</ui.Button>
            <output title={fileOpen?.path} data-request={fileOpen?.request}>{fileOpen?.path?.split(/[/\\\\]/).at(-1) ?? "No file"}</output></>;
        }`);
        writeCodePluginManifest(directory, { id, name, entry: "host.mjs", screen: "screen.jsx",
          fileActions: [{ id: "open", label, extensions, openByDefault: true }] });
      }
    }
    if (name === "vite-plugins") {
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(path.join(pluginDirectory, "screen.jsx"), `export default function Screen({React, ui}) {
        const [count, setCount] = React.useState(0);
        return <ui.Button onClick={() => setCount(previous => previous + 1)}>Count: {count}</ui.Button>;
      }`);
      writeCodePluginManifest(pluginDirectory,{id: "fixture.vite",name: "Vite fixture",version: "0.1.0",entry: "host.mjs",description: "Connection settings fixture",settingsSchema: { type: "object", properties: { serverUrl: { type: "string", title: "Service URL", minLength: 1, description: "HTTP(S) service URL" }, failure: { type: "boolean", title: "Simulate failure", description: "Simulates service availability" } }, additionalProperties: false },secrets: [{ id: "api-key", title: "Access token", scope: "connection", required: false }],operations: [{ id: "connection", version: 1, effect: "read", scope: "host", inputSchema: { type: "object", additionalProperties: false }, outputSchema: { type: "object" } }],healthCheck: "connection",screen:"screen.jsx"});
      writeFileSync(path.join(pluginDirectory, "host.mjs"), `import { SDK_VERSION } from '@litzio/plugin-sdk';
export function activate(context){return {operations:{connection:()=>({ok:context.settings.failure !== true,message:context.settings.failure !== true ? "Fixture connected" : "연결하지 못했습니다. 저장된 서버 주소와 자격 증명을 확인한 뒤 다시 시도하세요."})},status:()=>({available:true,message:SDK_VERSION}),dispose(){}}}`);
    }
    if (name === "http-plugins") {
      mkdirSync(pluginDirectory, { recursive: true });
      writeFileSync(otherJobInput, JSON.stringify({ label: "CLI connection" }));
      writeCodePluginManifest(pluginDirectory,{id: "fixture.drive",name: "Drive fixture",version: "1.2.3",entry: "host.mjs",description: "Isolated folder fixture",operations: [{ id: "snapshot", outputSchema: { type: "string" } }],settingsSchema: { type: "object", properties: { label: { type: "string", title: "Connection label" } }, additionalProperties: false },secrets: [{ id: "pat", title: "Access token", scope: "connection", required: false }],screen:"screen.jsx"});
      writeFileSync(path.join(pluginDirectory, "host.mjs"), `export function activate(c){return {operations:{
        snapshot:()=>"Original value",
        prepareStorage:async()=>{await c.storage.set("draft","Handler draft");return null;},
        readStorage:async()=>(await c.storage.get("view")) ?? null,
      },dispose(){},status:()=>({available:true,message:c.secrets.pat ? "Secret applied" : c.settings.label ?? "Fixture ready"})}}`);
    }
    const writeDriveScreen = (label: string) => writeFileSync(path.join(pluginDirectory, "screen.jsx"), `export default function Screen({React,ui,invoke,storage}) {
      const [result,setResult] = React.useState("Ready");
      const [notifications,setNotifications] = React.useState([]);
      const refusal = React.useRef(0), run = React.useRef(0);
      const rejectEdit = () => {
        const sequence = ++refusal.current;
        setNotifications(items => [...items.filter(item => !item.id.startsWith("reject:wire:")),
          {id:"reject:wire:" + sequence, message:"Wire edit rejected (" + sequence + ")", severity:"error"}]);
      };
      const startRun = () => {
        const id = ++run.current;
        setNotifications(items => [...items, {id:"start:" + id, message:"Run " + id + " uses default settings", severity:"warning"}]);
        setResult("Run " + id + " started");
      };
      const failRun = () => {
        const id = run.current;
        setNotifications(items => items.some(item => item.id === "fail:" + id) ? items :
          [...items, {id:"fail:" + id, message:"Run " + id + " failed", severity:"error"}]);
      };
      const sendMalformed = () => setNotifications(items => [...items,
        {id:"bad:object", message:{text:"Object message"}, severity:"error"}, {id:"", message:"Empty id", severity:"error"},
        {id:"bad:severity", message:"Unknown severity", severity:"info"}, {id:"ok:mixed", message:"Valid among malformed", severity:"warning"}]);
      const saveOnClose = React.useRef(false);
      React.useEffect(() => () => {
        if (saveOnClose.current) {
          void storage.set("view","Saved on close").catch(()=>{});
          void storage.delete("draft").catch(()=>{});
        }
      }, [storage]);
      const prepare = async () => {
        await invoke("prepareStorage");
        setResult(await storage.get("draft"));
        saveOnClose.current = true;
      };
      return <><p>{${JSON.stringify(label)}}</p>
        <ui.Notifications items={notifications} />
        <ui.Button onClick={rejectEdit}>Reject edit</ui.Button>
        <ui.Button onClick={startRun}>Start run</ui.Button>
        <ui.Button onClick={failRun}>Fail run</ui.Button>
        <ui.Button onClick={sendMalformed}>Send malformed</ui.Button>
        <ui.Button onClick={()=>invoke("snapshot",{}).then(setResult).catch(error=>setResult(error.message))}>Read installed value</ui.Button>
        <ui.Button onClick={()=>prepare().catch(error=>setResult(error.message))}>Prepare storage</ui.Button>
        <ui.Button onClick={()=>invoke("readStorage").then(setResult).catch(error=>setResult(error.message))}>Read saved view</ui.Button>
        <output>{result}</output></>;
    }`);
    if (name === "http-plugins") writeDriveScreen("Runtime fixture");
    const pluginFixture = { document: path.join(pluginFolder, "a.md"), directory: pluginDirectory, folder: pluginFolder, otherFolder: otherPluginFolder, otherJobInput,
      // An outside edit of a content-editing fixture (#1976), as another program would write it.
      fileActions: { folder: fileActionFolder, plugins: fileActionPlugins },
      writeContentEditDocument(name: string, source: string) {
        if (name.includes("/") || name.includes("\\")) throw new Error("Content edit fixture names are file names");
        writeFileSync(path.join(REPOSITORY_ROOT, "tmp", "http-host-a", "content-edit", name), source);
      }, editScreenForReload: () => writeDriveScreen("Reloaded runtime fixture"), editSource() {
      const file = path.join(pluginDirectory, "host.mjs");
      writeFileSync(file, readFileSync(file, "utf8").replace("Original value", "Updated value"));
      writeDriveScreen("Updated runtime fixture");
    }, changeInstalledCopy() {
      if (!process.env.LITZIO_BROWSER_DAEMON_DIR) throw new Error("Installed copy changes require a runner-owned isolated Host");
      const settings = process.env.LITZIO_PLUGINS_SETTINGS_FILE!;
      const record = JSON.parse(readFileSync(settings, "utf8"))["fixture.drive"];
      writeFileSync(path.join(settings + ".artifacts", record.installationId, "changed.txt"), "Fixture changed");
    }, corruptSecret() {
      const owned = process.env.LITZIO_BROWSER_DAEMON_DIR;
      if (!owned) throw new Error("Secret corruption requires a runner-owned isolated Host");
      const hash = (value: string) => createHash("sha256").update(value).digest("hex");
      writeFileSync(path.join(process.env.LITZIO_PLUGINS_SETTINGS_FILE! + ".secrets", hash("fixture.drive"), hash("pat")), "invalid DPAPI ciphertext");
    }, cli: (args: string[]) => JSON.parse(execFileSync(process.execPath, [path.join(REPOSITORY_ROOT, "packages/cli/dist/cli.mjs"), ...args, ...(args[0] === "inspect" ? ["--format", "json"] : ["--host", url, "--json"])], { encoding: "utf8", windowsHide: true })) };
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
    try { result = await scenario(page, { folderAliasRoot, changeFolderContents: () => appendFileSync(path.join(FILE_ACTIONS_ROOT, "trash-target", "inside.md"), "\nExternal folder change.\n"), enableFolderTrash, pluginFixture: { ...pluginFixture }, fullLayout: process.env.LITZIO_TEST_LAYOUT_SCOPE !== "representative", brand, assistantFixture: { document: path.join(REPOSITORY_ROOT, "tmp/assistant/document.md") }, assertSavedSource: savedSourceAssertion(test.info()), screenshots, showNotifications, fileActionsRoot: FILE_ACTIONS_ROOT, expect, recoveryRecords, openFolderPicker, openDocument, openPath, waitForActivePath, reloadDocument, waitForEditorFocus, activeDocument, waitForExplorerLayout, withBlockHover, assertTableToolGeometry, bibliographyFixture,
      // Screen code correcting a document (#1995): Core operations in memory, the change shown first, then the official write.
      viewChange: (file: string, edit: (sdk: typeof pluginSdk, document: pluginSdk.Document) => pluginSdk.Document) => {
        const { revision, document } = readDocument(file);
        const after = edit(pluginSdk, document);
        return { revision, change: pluginSdk.documentViewChange(document, after), write: () => writeDocument(file, after, revision).revision };
      },
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
