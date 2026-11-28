import { hostIdentity } from "../server/host-identity.ts";
import { EventEmitter, once } from "node:events";
import { randomUUID } from "node:crypto";
import { folderVersion } from "../server/folder-watch.ts";
import { listenForFetch, startFetchServer } from "../../../test/helpers/fetch-server.ts";
import { nativeSource } from "./helpers/document.ts";
import { getEditableDocument, machineNodes, parse } from "@litzio/core";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir, userInfo, networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, type TestContext } from "node:test";
import { documentRevision, loadDocumentFile } from "../server/document-api.ts";
import { MAX_JSON_BYTES, startHttpHost } from "../server/http-host.ts";
import { DAEMON_PROTOCOL } from "../server/daemon-protocol.ts";
import { DAEMON_INSTANCE_HEADER } from "../shared/daemon-version.ts";
import { daemonRpc, inspectDaemon, stopDaemon, type DaemonRecord } from "../server/daemon-state.ts";
import { RootAccess } from "../server/file-access.ts";
import { trashFile } from "../server/os-trash.ts";
import { ResetGuard } from "../server/reset-guard.ts";
import { DAEMON_LOG_ROTATE_BYTES, LONG_RUNNING_ROUTES, SLOW_REQUEST_MS, daemonLog, describeError, logRoute, repeatLog, requestRecorder, shortenPaths, watchEventLoop } from "../server/daemon-log.ts";
import { rotateDaemonLog } from "../server/daemon-state.ts";
import { performance } from "node:perf_hooks";
import { resetHostPaths } from "../server/app-reset.ts";
import { CodexAppServer } from "../server/codex-app-server.ts";
import { brand } from "../../../brand.ts";
import { FakeGitHub } from "./fake-github.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DESKTOP_ORIGIN } from "../shared/desktop-origin.ts";
import { Worker } from "node:worker_threads";
import { DocumentThread } from "../server/document-thread.ts";

const isolatedData = fs.mkdtempSync(path.join(tmpdir(), "litzio-http-unit-data-"));
process.env.LITZIO_DATA_DIR = isolatedData;
process.env.LITZIO_RESET_DIR = path.join(isolatedData, "reset-guard");
process.env.LITZIO_PLUGINS_SETTINGS_FILE = path.join(isolatedData, "plugins.json");
after(() => fs.rmSync(isolatedData, { recursive: true, force: true }));

test("owning HTTP listener pins assistant CLI operations across Hosts, turns and provider reconnects", async t => {
  const clients = new Map<string, CodexAppServer>();
  const connect = CodexAppServer.prototype.connect;
  t.mock.method(CodexAppServer.prototype, "connect", function (this: CodexAppServer) {
    const original = (this as any).options;
    Object.assign(this, { options: { ...original, bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] } });
    clients.set(this.cwd, this);
    return connect.call(this);
  });
  const keys = ["LITZIO_DATA_DIR", "LITZIO_ASSISTANT_CWD", "LITZIO_PLUGINS_SETTINGS_FILE", "LITZIO_HOST_ORIGIN"] as const;
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }));
  const hosts = [];
  for (const label of ["foreground", "local-daemon"]) {
    const data = path.join(isolatedData, label), cwd = path.join(data, "assistant");
    process.env.LITZIO_DATA_DIR = data;
    process.env.LITZIO_ASSISTANT_CWD = cwd;
    process.env.LITZIO_PLUGINS_SETTINGS_FILE = path.join(data, "plugins.json");
    process.env.LITZIO_HOST_ORIGIN = "http://wrong-parent.invalid";
    const host = await fixture(t, label === "foreground" ? "https://proxy.invalid" : undefined, label === "local-daemon" ? "desktop" : true);
    assert.equal((await host.send("/api/assistant/models")).status, 200);
    const client = clients.get(cwd)!;
    const directory = path.join(host.a, "plugin"), marker = path.join(host.a, "written.txt"), input = path.join(host.a, "input.json");
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "screen.jsx"), "export default function Screen(){return null}");
    fs.writeFileSync(path.join(directory, "litzio-plugin.json"), JSON.stringify({ id: "fixture.target", name: "Target", version: "release candidate", entry: "host.mjs", screen: "screen.jsx", operations: [
      { id: "read", assistant: true, outputSchema: { type: "string" } },
      { id: "write", effect: "write", outputSchema: { type: "string" } },
    ] }));
    fs.writeFileSync(path.join(directory, "host.mjs"), `import {writeFileSync} from 'node:fs'; export function activate(){return {operations:{read:()=>${JSON.stringify(label)},write:()=>{writeFileSync(${JSON.stringify(marker)},'written');return ${JSON.stringify(label)}}},status:()=>({available:true,message:'Ready'}),dispose(){}}}`);
    fs.writeFileSync(input, "{}");
    const cli = async (args: string[]) => {
      const result = await client.request("fixture/cli", { command: brand.cliCommand, args, hostFromEnvironment: true });
      assert.equal(result.hostOrigin, host.url);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      return JSON.parse(result.stdout);
    };
    assert.equal((await cli(["plugins", "install", directory, "--json"])).receipt.outcome, "success");
    assert.equal((await cli(["plugins", "list", "--json"])).plugins.find((plugin: { id: string }) => plugin.id === "fixture.target").version, "release candidate");
    // Real CLI install must keep serving after even a broken source edit.
    fs.writeFileSync(path.join(directory, "host.mjs"), "invalid plugin source ;");
    assert.deepEqual((await cli(["plugins", "check-updates", "fixture.target", "--json"])).updates, [{ id: "fixture.target", currentVersion: "release candidate", sourceVersion: "release candidate", available: true }]);
    const refused = await client.request("fixture/cli", { command: brand.cliCommand, args: ["plugins", "update", "fixture.target", "--json"], hostFromEnvironment: true });
    assert.equal(refused.status, 1, "a refused update exits with failure; the operation loop below proves the installed copy still serves");
    hosts.push({ ...host, client, cli, marker, input, label });
  }
  assert.notEqual(hosts[0].url, hosts[1].url);
  for (const host of hosts) {
    const args = ["operation", "invoke", "fixture.target.read", "--input", host.input, "--json"];
    assert.equal((await host.cli(args)).result, host.label);
    const sent = await host.send("/api/assistant/conversations", "POST", { action: "send", permissionMode: "full-access", message: "Fixture turn", folders: [host.a], model: "gpt-6.1-sol", reasoningEffort: "medium" });
    assert.equal(sent.status, 200, await sent.clone().text());
    const conversation = await sent.json();
    await host.client.request("fixture/finish", { threadId: conversation.id });
    const disconnected = once(host.client, "disconnected");
    await assert.rejects(host.client.request("exit"), /exited/);
    await disconnected;
    assert.equal((await host.cli(args)).result, host.label, "reconnection must retain its listener origin");
    const continued = await host.send("/api/assistant/conversations", "POST", { action: "send", id: conversation.id, message: "Continue fixture", folders: [host.a], model: "gpt-6.1-sol", reasoningEffort: "medium" });
    assert.equal(continued.status, 200, await continued.clone().text());
    assert.equal((await continued.json()).id, conversation.id);
    assert.equal((await host.cli(args)).result, host.label, "existing conversation uses the same owning connection");
    await host.send("/api/assistant/conversations", "POST", { action: "interrupt", id: conversation.id });
  }
  const written = await hosts[0].cli(["operation", "invoke", "fixture.target.write", "--input", hosts[0].input, "--json"]);
  assert.equal(written.result, hosts[0].label); assert.equal(written.receipt.outcome, "success");
  assert.ok(fs.existsSync(hosts[0].marker)); assert.equal(fs.existsSync(hosts[1].marker), false);
});

test("HTTP Host starts with a 0.0.2 bundled plugin registration and reports how to recover it", async t => {
  const settings = process.env.LITZIO_PLUGINS_SETTINGS_FILE!;
  const editorDir = fs.mkdtempSync(path.join(isolatedData, "legacy-editor-"));
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>Editor</title>");
  const id = "community.docling";
  const registrationId = randomUUID();
  const legacy = JSON.stringify({ [id]: {
    registrationId, directory: path.join(isolatedData, "old-install", "docling"),
    digest: "a".repeat(64), bundled: true, enabledChoice: true, enabled: true, trusted: true,
    settings: {}, operationNames: [`${id}.convert-pdf`],
  } });
  fs.writeFileSync(settings, legacy);
  t.after(() => fs.unlinkSync(settings));

  const host = await startHttpHost({ roots: [], editorDir, port: 0 });
  try {
    const response = await fetch(host.url + "/api/plugins");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { plugins: [{
      id, registrationId, installed: true, enabled: false, running: false, status: null,
      error: "Add this plugin again from its source folder.",
    }] });
    assert.equal(fs.readFileSync(settings, "utf8"), legacy);
  } finally { await host.close(); }
});

test("reset inspection pins Host paths and its lifetime gate refuses offline deletion while serving", async t => {
  const { send } = await fixture(t);
  const expected = resetHostPaths(), previous = process.env.LITZIO_ASSISTANT_CWD;
  process.env.LITZIO_ASSISTANT_CWD = path.join(isolatedData, "changed-after-start");
  try { assert.deepEqual(await (await send("/api/app-reset/paths")).json(), expected); }
  finally { if (previous === undefined) delete process.env.LITZIO_ASSISTANT_CWD; else process.env.LITZIO_ASSISTANT_CWD = previous; }
  assert.throws(() => new ResetGuard().exclusive(), /Close host/);
  assert.equal((await send("/api/app-reset/paths", "POST", {})).status, 405);
  assert.equal((await send("/api/app-reset/paths?unexpected=1")).status, 405);
});

test("direct listener requests retain the pre-assistant Host and Origin boundary", async t => {
  const concrete = Object.values(networkInterfaces()).flat().find(entry => entry?.family === "IPv4" && !entry.internal)?.address;
  for (const bind of [concrete, "::ffff:127.0.0.1"].filter((value): value is string => !!value)) {
    await t.test(bind.includes(":") ? "IPv4-mapped IPv6" : "concrete IPv4", async t => {
      const { a, url } = await fixture(t, "https://proxy.invalid", true, bind);
      const normalized = new URL(url).origin, file = path.join(a, "boundary.md");
      if (bind.includes(":")) assert.match(normalized, /\[::ffff:7f00:1\]/);
      const body = JSON.stringify({ path: file, authoring: { inputs: [{ key: "test", blocks: [{ kind: "paragraph", text: "Boundary" }] }] } });
      const put = (headers: Record<string, string>) => new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(url + "/api/document", { method: "PUT", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers } }, res => {
          let body = ""; res.on("data", chunk => { body += chunk; }); res.on("end", () => resolve({ status: res.statusCode!, body }));
        });
        req.on("error", reject); req.end(body);
      });
      for (const origin of [normalized, DESKTOP_ORIGIN]) {
        const rejected = await put({ Origin: origin });
        assert.equal(rejected.status, 403);
        assert.match(rejected.body, /Host is not allowed/);
      }
      const rejectedOrigin = await put({ Host: "proxy.invalid", Origin: normalized });
      assert.equal(rejectedOrigin.status, 403);
      assert.match(rejectedOrigin.body, /Request origin is not allowed/);
      assert.equal(fs.existsSync(file), false);
      // The previously allowed proxy authority/origin still works on the same listener.
      assert.equal((await put({ Host: "proxy.invalid", Origin: "https://proxy.invalid" })).status, 201);
    });
  }
});

test("an IPv4-mapped listener leaves assistant CLI origin absent instead of granting a normalized alias", async t => {
  const connect = CodexAppServer.prototype.connect;
  let client: CodexAppServer | undefined;
  t.mock.method(CodexAppServer.prototype, "connect", function (this: CodexAppServer) {
    Object.assign(this, { options: { ...(this as any).options, bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/codex-app-server.mjs", import.meta.url))] } });
    client = this; return connect.call(this);
  });
  const { url } = await fixture(t, "https://proxy.invalid", true, "::ffff:127.0.0.1");
  // IPv4-mapped binds accept the existing loopback route, without admitting the mapped authority.
  const route = `http://127.0.0.1:${new URL(url).port}`;
  assert.equal((await fetch(route + "/api/assistant/models", { headers: { Origin: route } })).status, 200);
  const result = await client!.request("fixture/cli", { command: brand.cliCommand, args: ["plugins", "list", "--json"], hostFromEnvironment: true });
  assert.equal(result.hostOrigin, null);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /explicit --host/);
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

test("revision checks batch opened documents without parsing or writing and retain Root protection", async t => {
  const { a, outside, send } = await fixture(t);
  const file = path.join(a, "revision.txt"), missing = path.join(a, "missing.txt");
  fs.writeFileSync(file, "한글\r\n");
  const query = new URLSearchParams({ root: a });
  query.set("paths", JSON.stringify([file, missing]));
  const first = await (await send(`/api/folder-version?${query}`)).json();
  assert.equal(typeof first.version, "string");
  assert.deepEqual(first.revisions, [{ path: file, revision: documentRevision("한글\r\n") }, { path: missing, revision: null }]);
  const parent = path.join(a, "removed-parent"), removed = path.join(parent, "open.txt");
  fs.mkdirSync(parent); fs.writeFileSync(removed, "opened"); fs.rmSync(parent, { recursive: true });
  query.set("paths", JSON.stringify([file, removed, a]));
  const partial = await (await send(`/api/folder-version?${query}`)).json();
  assert.equal(typeof partial.version, "string", "a missing parent must not erase the healthy Root version");
  assert.deepEqual(partial.revisions, [{ path: file, revision: documentRevision("한글\r\n") }, { path: removed, revision: null }, { path: a, revision: null }]);
  fs.writeFileSync(file, "changed");
  const focus = new URLSearchParams({ paths: JSON.stringify([file]) });
  assert.deepEqual(await (await send(`/api/folder-version?${focus}`)).json(), { revisions: [{ path: file, revision: documentRevision("changed") }] });
  assert.deepEqual(Object.keys(await (await send(`/api/folder-version?${new URLSearchParams({ root: a })}`)).json()), ["version"]);
  assert.equal((await send(`/api/folder-version?${new URLSearchParams({ paths: JSON.stringify([path.join(outside, "secret.md")]) })}`)).status, 403);
  assert.equal(fs.readFileSync(file, "utf8"), "changed");
});

test("fetch listeners close a forced blocked allocation before listening again", async t => {
  const server = createServer((_req, res) => res.end("ready"));
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address.bind(server);
  let allocations = 0, closes = 0;
  server.on("close", () => { closes++; });
  const mocked = t.mock.method(server, "address", () => {
    allocations++;
    if (allocations === 1) return { address: "127.0.0.1", family: "IPv4", port: 6000 };
    assert.ok(closes > 0, "the rejected listener is closed before the next allocation");
    return address();
  });
  await listenForFetch(server);
  mocked.mock.restore();
  assert.ok(allocations >= 2);
  const allocated = server.address();
  assert.ok(allocated && typeof allocated !== "string");
  assert.equal(await (await fetch(`http://127.0.0.1:${allocated.port}`)).text(), "ready");
});

test("fetch listener retries are bounded and close the final blocked allocation", async t => {
  const server = createServer();
  t.mock.method(server, "address", () => ({ address: "127.0.0.1", family: "IPv4", port: 6667 }));
  let allocations = 0, closes = 0;
  server.on("listening", () => { allocations++; });
  server.on("close", () => { closes++; });
  await assert.rejects(listenForFetch(server), /fetch-blocked port on all 10 attempts/);
  assert.equal(allocations, 10);
  assert.equal(closes, allocations);
  assert.equal(server.listening, false);
});

test("fetch listener startup and close errors propagate without retries", async t => {
  const failure = new Error("startup failed");
  let starts = 0;
  await assert.rejects(startFetchServer(async () => { starts++; throw failure; }), error => error === failure);
  assert.equal(starts, 1);
  const server = createServer();
  t.mock.method(server, "address", () => ({ address: "127.0.0.1", family: "IPv4", port: 6000 }));
  starts = 0;
  await assert.rejects(startFetchServer(async () => {
    starts++;
    return { server, close: async () => { throw failure; } };
  }), error => error === failure);
  assert.equal(starts, 1);
});

test("HTTP file mutations reuse shared validation, strict bodies and allowlisted roots", async t => {
  const { a, b, outside, send, trashed, base } = await fixture(t);
  const file = path.join(a, "document.md");
  const original = fs.readFileSync(file);
  assert.equal((await send("/api/file", "GET")).status, 405);
  assert.equal((await send("/api/file", "PATCH", {root:a, path:file, name:"CON"})).status, 400);
  assert.equal((await send("/api/file", "DELETE", {root:a, path:path.join(outside,"document.md")})).status, 403);
  assert.equal((await send("/api/file", "PATCH", {root:a, path:file, name:"renamed"})).status, 200);
  const renamed = path.join(a, "renamed.md");
  assert.deepEqual(fs.readFileSync(renamed), original);
  assert.equal((await send("/api/file", "DELETE", {root:a, path:renamed})).status, 200);
  assert.equal(fs.existsSync(renamed), false);
  assert.deepEqual(trashed, [renamed]);
  assert.deepEqual(fs.readFileSync(path.join(base, "trashed-renamed.md")), original);
  const folder = path.join(a, "child"); fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "saved.txt"), "saved");
  assert.equal((await send("/api/folder-trash", "GET")).status, 405);
  assert.equal((await send("/api/folder-trash", "POST", { root: a, path: a })).status, 400);
  const preview = await send("/api/folder-trash", "POST", { root: a, path: folder, checkOnly: true });
  assert.equal(preview.status, 200);
  const checked = await preview.json();
  assert.equal(checked.fileCount, 1);
  const deleted = await send("/api/folder-trash", "POST", { root: a, path: folder, expectedIdentity: checked.identity, expectedRevision: checked.revision });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).receipt.source, "moved");
  assert.equal(fs.readFileSync(path.join(base, "trashed-child", "saved.txt"), "utf8"), "saved");
  const source = nativeSource(":::{figure} ./image.png\n\nCaption.\n:::\n");
  fs.writeFileSync(file, source); fs.writeFileSync(path.join(b, "document.md"), source);
  fs.unlinkSync(path.join(b, "image.png")); fs.linkSync(path.join(a, "image.png"), path.join(b, "image.png"));
  fs.writeFileSync(path.join(a, "foreign.md"), "<div>Unsupported HTML</div>");
  const request = { root:a, path:path.join(a, "image.png"), name:"changed" };
  const dirty = await send("/api/file", "PATCH", { ...request, openDocuments:[{path:file}] });
  assert.equal(dirty.status, 400);
  assert.deepEqual((await dirty.json()).references, ["document.md"]);
  const changed = await send("/api/file", "PATCH", request);
  assert.equal(changed.status, 200);
  assert.deepEqual(await changed.json(), { path:path.join(a, "changed.png"), updatedDocuments:[file], skippedDocuments:["foreign.md"] });
  assert.match(fs.readFileSync(file, "utf8"), /\.\/changed.png/);
  assert.equal(fs.readFileSync(path.join(b, "document.md"), "utf8"), source, "another allowed root is outside the chosen opened folder");
});

test("recovery Source mode preserves HTTP Root checks for existing and absent files", async t => {
  const { a, outside, send } = await fixture(t);
  const endpoint = "/api/document-source?recovery=1";
  const file = path.join(a, "document.md");
  const opened = loadDocumentFile(file);
  const response = await send(endpoint, "POST", {path:file,save:{revision:opened.revision,base:{source:opened.source}}});
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.disk.source, opened.source);
  assert.ok(result.markdown);
  for (const name of ["document.md", "absent.md"]) {
    assert.equal((await send(endpoint,"POST",{path:path.join(outside,name)})).status,403);
  }
  const missing = path.join(a,"absent.md");
  assert.deepEqual(await (await send(endpoint,"POST",{path:missing})).json(),{disk:null});
  assert.equal(fs.existsSync(missing),false);
  assert.equal(fs.readFileSync(file,"utf8"),opened.source);
});

test("folder image preview is read-only, root bounded and isolated for GET, HEAD and direct SVG URLs", async t => {
  const { a, outside, send } = await fixture(t);
  const route = (root: string, file: string) => `/api/file-preview?${new URLSearchParams({ root, path: file })}`;
  const response = await send(route(a, path.join(a, "image.png")));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  const pdf = path.join(a, "reading.pdf");
  fs.writeFileSync(pdf, "%PDF-1.7\nfixture");
  const pdfResponse = await send(route(a, pdf));
  assert.equal(pdfResponse.status, 200);
  assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
  assert.equal(await pdfResponse.text(), "%PDF-1.7\nfixture");
  const outsidePdf = path.join(outside, "reading.pdf");
  fs.writeFileSync(outsidePdf, "%PDF-1.7\nfixture");
  assert.equal((await send(route(a, outsidePdf))).status, 403);
  fs.truncateSync(pdf, 25 * 1024 * 1024 + 1);
  assert.equal((await send(route(a, pdf))).status, 413);
  fs.writeFileSync(pdf, "invalid");
  assert.equal((await send(route(a, pdf))).status, 400);
  const svg = path.join(a, "active.svg");
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
  for (const method of ["GET", "HEAD"]) {
    const result = await send(route(a, svg), method);
    assert.equal(result.status, 200);
    assert.match(result.headers.get("content-security-policy")!, /^sandbox;.*script-src 'none'/);
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    assert.equal(result.headers.get("cache-control"), "no-store");
    if (method === "HEAD") assert.equal(await result.text(), "");
    assert.equal((await send(route(a, path.join(outside, "image.png")), method)).status, 403);
  }
  assert.equal((await send(route(outside, path.join(outside, "image.png")))).status, 403);
  assert.equal((await send(route(a, svg), "POST", {})).status, 405);
  assert.equal((await send(route(a, path.join(a, "document.md")))).status, 400);
  assert.equal((await send(route(a, path.join(a, "missing.png")))).status, 400);
  fs.writeFileSync(path.join(a, "bad.png"), "<svg/>");
  assert.equal((await send(route(a, path.join(a, "bad.png")))).status, 400);
  fs.truncateSync(path.join(a, "bad.png"), 10 * 1024 * 1024 + 1);
  assert.equal((await send(route(a, path.join(a, "bad.png")), "HEAD")).status, 413);
});

async function fixture(t: TestContext, external?: string, controlled: boolean | "desktop" = false, bind = "127.0.0.1", warn?: (message: string) => void) {
  const base = fs.mkdtempSync(path.join(tmpdir(), "litzio-http-"));
  const a = path.join(base, "문서 A"), b = path.join(base, "documents-B");
  const outside = path.join(base, "문서 A-other"), editorDir = path.join(base, "editor");
  for (const dir of [a, b, outside, editorDir]) fs.mkdirSync(dir);
  for (const dir of [a, b, outside]) {
    fs.writeFileSync(path.join(dir, "document.md"), nativeSource("# Title\n\nAlpha.\n"));
    fs.writeFileSync(path.join(dir, "image.png"), png);
  }
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>Editor</title>");
  fs.writeFileSync(path.join(editorDir, "app.js"), "export {};");
  const trashed: string[] = [];
  const health = { processStartedAt: "test", daemonHome: "test", executable: process.execPath, roots: [], nonLoopback: false, launcher: controlled === "desktop" ? "desktop" as const : "cli-run" as const, pid: process.pid, startedAt: new Date().toISOString(), instanceId: randomUUID(), productVersion: "test-product", protocolVersion: DAEMON_PROTOCOL };
  let stopped = false;
  const host = await startFetchServer(() => startHttpHost({ editorDir, roots: controlled && !external ? [] : [a, b], port: 0, host: bind, publicOrigin: external, warn,
    ...(controlled ? { daemon: { health, stop: () => { stopped = true; } } } : {}),
    removeFile: file => { trashed.push(file); fs.renameSync(file, path.join(base, "trashed-" + path.basename(file))); } }));
  const address = host.server.address();
  assert.ok(address && typeof address !== "string");
  const url = new URL(`http://${bind.includes(":") ? `[${bind}]` : bind}:${address.port}`).origin;
  t.after(async () => { await host.close(); fs.rmSync(base, { recursive: true, force: true }); });
  const send = (route: string, method = "GET", body?: unknown, headers?: Record<string, string>) => fetch(url + route, {
    method, headers: { Origin: url, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { base, a, b, outside, editorDir, host, url, send, trashed, health, stopped: () => stopped };
}

test("daemon checks protocol/product versions and only stops its own instance", async t => {
  const { url, health, send, stopped } = await fixture(t, undefined, true);
  const headers = { "X-Litzio-Protocol": DAEMON_PROTOCOL };
  assert.deepEqual(await (await send("/api/document")).json(), { start: true });
  assert.equal((await send("/")).status, 200);
  assert.equal((await send("/daemon/health", "GET", undefined, { "X-Litzio-Protocol": "incompatible" })).status, 409);
  assert.equal((await send("/daemon/health", "GET", undefined, { "X-Litzio-Protocol": "3" })).status, 409, "pre-assistant daemon protocol must be refused before connection");
  const warnings: string[] = [], record = { ...health, url };
  const identity = await hostIdentity();
  assert.deepEqual(await inspectDaemon(record, "new-product", message => warnings.push(message)), { ...health, identity, screenInstanceGuard: true });
  const { runAs } = identity;
  if (process.platform === "win32") assert.match(runAs, /^[^\\]+\\[^\\]+$/);
  assert.equal(runAs.split("\\").at(-1)!.toLowerCase(), userInfo().username.toLowerCase());

  assert.match(warnings.join(), /WARNING.*restart explicitly/);
  await assert.rejects(stopDaemon({ ...record, instanceId: "another-instance" }, health.productVersion), /identity changed/);
  const invalidStop = await send("/daemon/stop", "POST", { ...health, startedAt: "other-start", confirm: true }, headers);
  assert.equal(invalidStop.status, 409); assert.equal(stopped(), false);
  await stopDaemon(record, health.productVersion);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped(), true);
});

test("daemon RPC uses fresh connections after idle closure and never retries a lost stop response", async t => {
  const sockets: import("node:net").Socket[] = [];
  let idleClosed: Promise<unknown> | undefined;
  let stopRequests = 0;
  const server = createServer({ keepAliveTimeout: 20, keepAliveTimeoutBuffer: 0 }, (req, res) => {
    sockets.push(req.socket);
    // Advertise longer than the actual timeout so pooled clients initially retain sockets.
    res.setHeader("Keep-Alive", "timeout=60");
    if (req.url === "/seed") {
      idleClosed = once(req.socket, "close");
    } else {
      assert.equal(req.headers["x-litzio-protocol"], DAEMON_PROTOCOL);
      assert.equal(req.headers.origin, record.url);
    }
    if (req.url === "/daemon/stop") {
      stopRequests++;
      assert.equal(req.method, "POST");
      req.resume();
      req.on("end", () => req.socket.destroy());
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ healthy: true }));
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  await listenForFetch(server);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const record = { url: `http://127.0.0.1:${address.port}` } as DaemonRecord;
  await (await fetch(record.url + "/seed")).json();
  assert.ok(idleClosed);
  await idleClosed;
  assert.deepEqual(await daemonRpc(record, "/daemon/health"), { healthy: true });
  // Give a pooled implementation a chance to return its socket to the idle pool.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await daemonRpc(record, "/daemon/health"), { healthy: true });
  assert.notEqual(sockets[1], sockets[2], "control requests must not share an idle connection");
  await assert.rejects(daemonRpc(record, "/daemon/stop", { confirm: true }), /fetch failed/);
  assert.equal(stopRequests, 1, "a stop with a lost response must not be replayed");
});

test("non-loopback binding still requires an explicit public origin", async () => {
  await assert.rejects(startHttpHost({ roots: [], editorDir: "unused", host: "0.0.0.0" }), /Non-loopback binding requires --public-origin/);
});

test("HTTP trash failure preserves the original file without permanent deletion", async t => {
  const { a, editorDir } = await fixture(t);
  const host = await startFetchServer(() => startHttpHost({ roots: [a], editorDir, port: 0,
    removeFile: file => trashFile(file, { platform: "linux", dataHome: path.join(a, "test-data"), rename: async () => {
      throw Object.assign(new Error("rename outside-secret-path"), { code: "EXDEV" });
    } }) }));
  t.after(() => host.close());
  assert.deepEqual(await (await fetch(host.url + "/api/host-capabilities")).json(), { fileDeletion: "trash", identity: await hostIdentity() });
  const file = path.join(a, "document.md"), original = fs.readFileSync(file);
  const response = await fetch(host.url + "/api/file", { method: "DELETE", headers: { Origin: host.url, "Content-Type": "application/json" }, body: JSON.stringify({ root: a, path: file }) });
  assert.equal(response.status, 400); assert.deepEqual(fs.readFileSync(file), original);
  const message = (await response.json()).error;
  assert.match(message, /OS trash unavailable.*different devices.*EXDEV/);
  assert.doesNotMatch(message, /outside-secret-path/);
});

test("Host close waits for an accepted filesystem mutation even after its caller disconnects", async t => {
  const { a, editorDir } = await fixture(t);
  let begin!: () => void, permit!: () => void, complete!: () => void;
  const began = new Promise<void>(resolve => { begin = resolve; });
  const allowed = new Promise<void>(resolve => { permit = resolve; });
  const completed = new Promise<void>(resolve => { complete = resolve; });
  const host = await startFetchServer(() => startHttpHost({ roots: [a], editorDir, port: 0, removeFile: async file => {
    begin(); await allowed;
    try { fs.renameSync(file, file + ".trashed"); } finally { complete(); }
  } }));
  const controller = new AbortController(), file = path.join(a, "document.md");
  const mutation = fetch(host.url + "/api/file", { method: "DELETE", headers: { Origin: host.url, "Content-Type": "application/json" },
    body: JSON.stringify({ root: a, path: file }), signal: controller.signal }).catch(error => { if (error.name !== "AbortError") throw error; });
  await began; controller.abort(); await mutation;
  let closed = false;
  const listenerClosed = once(host.server, "close");
  const closing = host.close().then(() => { closed = true; });
  try {
    await listenerClosed;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false, "a closed socket is not proof that its accepted write finished");
  } finally { permit(); await completed; await closing; }
  assert.equal(fs.existsSync(file + ".trashed"), true);
});

const documentQuery = (file: string) => `/api/document?${new URLSearchParams({ path: file })}`;

test("fast Save verifies the original work, corrects only its own bytes, and keeps verification state across worker exit", { timeout: 30_000 }, async t => {
  const warnings: string[] = [];
  const { a, send, host, editorDir } = await fixture(t, undefined, false, "127.0.0.1", message => warnings.push(message));
  const post = Worker.prototype.postMessage;
  let pause: ((worker: Worker, release: () => void) => void) | undefined;
  let inject: "different" | "rejected" | undefined;
  t.mock.method(Worker.prototype, "postMessage", function (this: Worker, message: any) {
    if (message.kind === "save" && inject) {
      const replacement = inject;
      inject = undefined;
      post.call(this, { ...message, request: { ...message.request, paragraphs: [{ path: [2],
        content: [{ kind: "text", text: replacement === "different" ? "Injected candidate." : "Unexpectedly accepted." }] }] } });
      return;
    }
    if (message.kind === "verify-local-write" && pause) {
      const callback = pause;
      pause = undefined;
      callback(this, () => post.call(this, message));
      return;
    }
    post.call(this, message);
  });
  const hold = () => new Promise<{ worker: Worker; release: () => void }>(resolve => {
    pause = (worker, release) => resolve({ worker, release });
  });
  const open = async (name: string) => {
    const file = path.join(a, name + ".md");
    fs.writeFileSync(file, nativeSource("# Title\n\nAlpha.\n\nBeta.\n"));
    const response = await send(documentQuery(file));
    assert.equal(response.status, 200);
    return await response.json() as { path: string; revision: string; source: string };
  };
  const submit = (file: Awaited<ReturnType<typeof open>>, text: string, revision = file.revision, previous?: string, describe = false) =>
    send("/api/document", "POST", { path: file.path, revision, base: { source: file.source,
      ...(previous ? { savedEdits: { paragraphs: [{ path: [2], content: [{ kind: "text", text: previous }] }] } } : {}) },
    paragraphs: [{ path: [2], content: [{ kind: "text", text }] }], ...(describe ? { describe: true } : {}) });
  // A described Save reports the accepted document's inspect nodes of the block it changed.
  const savedBlock = (file: string, index: number) =>
    [{ path: [index], nodes: machineNodes(getEditableDocument(parse(fs.readFileSync(file, "utf8")))).filter(node => node.path[0] === index) }];
  const query = (file: string, revision: string) => `/api/local-write-status?${new URLSearchParams({ path: file, revision })}`;
  const receipt = async (file: string, revision: string) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await send(query(file, revision));
      assert.equal(response.status, 200);
      const status = await response.json();
      if (status.state !== "pending") return status;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    assert.fail("the verification receipt was not settled");
  };

  const first = await open("first");
  const waiting = hold();
  const firstSave = await (await submit(first, "First edit.", first.revision, undefined, true)).json();
  assert.equal(firstSave.pendingLocalWrite, true);
  assert.match(fs.readFileSync(first.path, "utf8"), /First edit/);
  assert.deepEqual(firstSave.blocks, savedBlock(first.path, 2), "the quick path describes its candidate");
  const check = await waiting;
  const save = DocumentThread.prototype.save;
  const submitted = Promise.withResolvers<void>();
  t.mock.method(DocumentThread.prototype, "save", function (this: DocumentThread, ...args: Parameters<typeof save>) {
    const result = save.apply(this, args);
    submitted.resolve();
    return result;
  });
  const queued = submit(first, "Second edit.", firstSave.revision, "First edit.", true);
  await submitted.promise;
  check.release();
  const second = await queued;
  assert.equal(second.status, 200);
  const secondSave = await second.json();
  assert.equal(secondSave.pendingLocalWrite, undefined);
  assert.match(fs.readFileSync(first.path, "utf8"), /Second edit/);
  assert.deepEqual(secondSave.blocks, savedBlock(first.path, 2), "the full path describes its readback");

  const corrected = await open("corrected");
  inject = "different";
  const different = await (await submit(corrected, "Full result.")).json();
  assert.equal(different.pendingLocalWrite, true);
  const status = await receipt(corrected.path, different.revision);
  assert.deepEqual(status, { state: "corrected", revision: documentRevision(fs.readFileSync(corrected.path, "utf8")) });
  assert.equal(fs.readFileSync(corrected.path, "utf8"), corrected.source.replace("Alpha.", "Full result."));
  const next = await (await submit(corrected, "Regular save.", status.revision, "Full result.")).json();
  assert.equal(next.pendingLocalWrite, undefined);
  assert.equal(next.blocks, undefined, "only a described Save carries blocks");

  const rejected = await open("rejected");
  inject = "rejected";
  const invalid = await (await submit(rejected, "")).json();
  assert.equal(invalid.pendingLocalWrite, true);
  const rejection = await receipt(rejected.path, invalid.revision);
  assert.equal(rejection.state, "rejected");
  assert.equal(rejection.revision, rejected.revision);
  assert.equal(fs.readFileSync(rejected.path, "utf8"), rejected.source);
  const refusedAgain = await submit(rejected, "");
  assert.equal(refusedAgain.status, 400);
  const diagnostic = await refusedAgain.json();
  assert.equal(rejection.reason, diagnostic.error);
  assert.deepEqual(rejection.failure, diagnostic.failure);
  assert.deepEqual(rejection.failure.target, { path: [2], part: 0 });
  const accepted = await submit(rejected, "Valid retry.");
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).pendingLocalWrite, undefined);

  const external = await open("external");
  const waitingExternal = hold();
  inject = "different";
  const externalSave = await (await submit(external, "Intended")).json();
  const externalCheck = await waitingExternal;
  const outside = external.source + "\nNew external bytes.\n";
  fs.writeFileSync(external.path, outside);
  externalCheck.release();
  assert.deepEqual(await receipt(external.path, externalSave.revision), { state: "uncorrected" });
  assert.equal(fs.readFileSync(external.path, "utf8"), outside);

  const interrupted = await open("worker-exit");
  const waitingWorker = hold();
  const interruptedSave = await (await submit(interrupted, "Remain saved.")).json();
  assert.equal(interruptedSave.pendingLocalWrite, true);
  await (await waitingWorker).worker.terminate();
  assert.deepEqual(await receipt(interrupted.path, interruptedSave.revision), { state: "done", verified: true });
  assert.equal(fs.readFileSync(interrupted.path, "utf8"), interrupted.source.replace("Alpha.", "Remain saved."));

  const stats = await (await send("/api/local-write-statistics")).json();
  assert.equal(stats.paragraph.completed, 5);
  assert.equal(stats.paragraph.mismatches, 3);
  assert.equal(stats.paragraph.documents, 5);
  assert.equal(stats.fallback["verification-pending"], 1);
  assert.equal(stats.fallback["verification-disabled-for-document"], 3);
  assert.match(warnings.join("\n"), /verify-local-write: paragraph, rejected\/corrected, 3 blocks, block 2/);
  assert.match(warnings.join("\n"), /verify-local-write: paragraph, different\/uncorrected, 3 blocks/);
  for (const entry of warnings) assert.doesNotMatch(entry, /Alpha|Injected|\.md|New external/);

  const receiptFolder = path.join(a, "receipt-folder");
  const receiptAlias = path.join(a, "receipt-alias");
  fs.mkdirSync(receiptFolder);
  fs.symlinkSync(receiptFolder, receiptAlias, process.platform === "win32" ? "junction" : "dir");
  const aliasDocument = await open(path.join("receipt-alias", "moved"));
  const waitingMove = hold();
  const movedSave = await (await submit(aliasDocument, "Save before moving.")).json();
  assert.equal(movedSave.pendingLocalWrite, true);
  const movedCheck = await waitingMove;
  try {
    const aliasPath = path.join(receiptAlias, "moved.md");
    const statusQuery = query(aliasPath, movedSave.revision);
    assert.deepEqual(await (await send(statusQuery)).json(), { state: "pending" });
    fs.renameSync(receiptFolder, path.join(a, "receipt-folder-moved"));
    const result = await send(statusQuery);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { state: "done" });
    assert.equal((await send(query(aliasPath, "invalid"))).status, 400);
  } finally {
    movedCheck.release();
  }

  const shutdown = await open("host-exit");
  const waitingHost = hold();
  const shutdownSave = await (await submit(shutdown, "Open after restart.")).json();
  assert.equal(shutdownSave.pendingLocalWrite, true);
  await waitingHost;
  await host.close();
  const reopened = await startHttpHost({ editorDir, roots: [a], port: 0 });
  try {
    const address = reopened.server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}${documentQuery(shutdown.path)}`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.kind, "native");
    assert.equal(result.revision, shutdownSave.revision);
    assert.match(result.source, /Open after restart/);
  } finally { await reopened.close(); }
});

test("HTTP document worker preserves save order, external changes, and uncommitted bytes on cancellation or exit", { timeout: 30_000 }, async t => {
  const { a, host, url, send } = await fixture(t);
  const file = path.join(a, "document.md");
  const opening = fs.readFileSync(file, "utf8");
  const revision = documentRevision(opening);
  const body = (text: string) => ({ path: file, revision, base: { source: opening },
    paragraphs: [{ path: [2], content: [{ kind: "text", text }] }] });
  const submit = (text: string) => send("/api/document", "POST", body(text));

  // Pause a real dispatch after the Host has read the disk and before Core's result
  // can be used. Fixtures stay small and exercise actual TCP requests and worker IO.
  const postMessage = Worker.prototype.postMessage;
  type Dispatch = { worker: Worker; release(): void };
  let nextSave: ((dispatch: Dispatch) => void) | undefined;
  t.mock.method(Worker.prototype, "postMessage", function (this: Worker, message: any) {
    if (message?.kind === "save" && nextSave) {
      const observed = nextSave;
      nextSave = undefined;
      observed({ worker: this, release: () => postMessage.call(this, message) });
    } else postMessage.call(this, message);
  });
  const observeSave = () => new Promise<Dispatch>(resolve => { nextSave = resolve; });

  const firstDispatch = observeSave();
  const first = submit("First writer.");
  const waiting = await firstDispatch;
  const second = submit("Second writer.");
  waiting.release();
  const [accepted, conflicted] = await Promise.all([first, second]);
  assert.equal(accepted.status, 200);
  assert.equal(conflicted.status, 409);
  assert.match(fs.readFileSync(file, "utf8"), /First writer/);
  await accepted.arrayBuffer();
  await conflicted.arrayBuffer();
  fs.writeFileSync(file, opening);

  const staleDispatch = observeSave();
  const stale = submit("Must not overwrite.");
  const computing = await staleDispatch;
  const external = opening + "\nUpdated outside the Host.\n";
  fs.writeFileSync(file, external);
  computing.release();
  const conflict = await stale;
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).failure.phase, "revision");
  assert.equal(fs.readFileSync(file, "utf8"), external);
  fs.writeFileSync(file, opening);

  const killedDispatch = observeSave();
  const killed = submit("Worker lost.");
  const lost = await killedDispatch;
  lost.release();
  await lost.worker.terminate();
  const failed = await killed;
  assert.equal(failed.status, 503);
  assert.match((await failed.json()).error, /document worker stopped/);
  assert.equal(fs.readFileSync(file, "utf8"), opening);
  const recovered = await submit("Recovered.");
  assert.equal(recovered.status, 200);
  await recovered.arrayBuffer();
  assert.match(fs.readFileSync(file, "utf8"), /Recovered/);
  fs.writeFileSync(file, opening);

  const cancelledDispatch = observeSave();
  const controller = new AbortController();
  const cancelled = fetch(url + "/api/document", {
    method: "POST", headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify(body("Client disconnected.")), signal: controller.signal,
  });
  const disconnected = await cancelledDispatch;
  const terminated = once(disconnected.worker, "exit");
  const cancelledReply = assert.rejects(cancelled, { name: "AbortError" });
  controller.abort();
  await Promise.all([cancelledReply, terminated]);
  assert.equal(fs.readFileSync(file, "utf8"), opening);

  const closingDispatch = observeSave();
  const closingSave = submit("Host closed.");
  const finishing = await closingDispatch;
  const exited = once(finishing.worker, "exit");
  await host.close();
  await exited;
  const closingReply = await closingSave;
  assert.equal(closingReply.status, 503);
  await closingReply.arrayBuffer();
  assert.equal(finishing.worker.threadId, -1);
  assert.equal(fs.readFileSync(file, "utf8"), opening);
});
// fetch normalizes/overrides Host; use an actual Node request to test a forged wire header.
const rawStatus = (url: string, headers: Record<string, string>) => new Promise<number>((resolve, reject) => {
  const req = request(url, { headers }, res => { res.resume(); res.on("end", () => resolve(res.statusCode!)); });
  req.on("error", reject); req.end();
});
const saveBody = (file: string, text = "Edited.") => {
  const loaded = loadDocumentFile(file);
  return { path: file, revision: loaded.revision, base: { source: loaded.source },
    paragraphs: [{ path: [2], content: [{ kind: "text", text }] }] };
};

test("table replay preserves the first cell refusal and commits no partial edits", async t => {
  const { a, send } = await fixture(t);
  const file = path.join(a, "tables.md");
  const source = nativeSource("| First |\n| --- |\n| Before |\n\nDivider\n\n| Second |\n| --- |\n| Before |\n");
  fs.writeFileSync(file, source);
  const body = { path: file, revision: documentRevision(source), base: { source } };
  const cell = (path: number[], text: string) => ({ path, content: [{ kind: "text", text }] });
  const first = cell([3, 0, 0], "Edited");
  const invalid = cell([1, 1, 0], "invalid\0text");
  const repair = cell(invalid.path, "Repaired");
  // Table 3's bad edit is later in request order, even though that table occurs first in the request.
  const cells = [first, invalid, cell([3, 1, 0], " also invalid"), repair];
  const expectedTarget = { path: invalid.path, part: 0 };
  const expectedError = 'table cell text cannot be preserved through canonical round-trip (Block 2: root > container > table > tableRow > tableCell > text: value "invalid\\u0000text" became "invalid�text")';
  for (const route of ["/api/document-source", "/api/document"]) {
    for (const edits of [cells, [cell([1, 0, 0], "Edited"), invalid, repair]]) {
      const response = await send(route, "POST", { ...body, cells: edits });
      assert.equal(response.status, 400);
      const rejection = await response.json();
      assert.equal(rejection.error, expectedError);
      assert.deepEqual(rejection.target, expectedTarget);
      assert.equal(rejection.failure.code, "round-trip-mismatch");
      assert.deepEqual(rejection.failure.target, expectedTarget);
      assert.deepEqual(fs.readFileSync(file), Buffer.from(source));
    }
  }
  const repeated = { ...body, cells: [first, cell(repair.path, "Intermediate"), repair] };
  const preview = await send("/api/document-source", "POST", repeated);
  assert.equal(preview.status, 200);
  const { markdown } = await preview.json();
  assert.match(markdown, /\| Repaired \|/);
  assert.equal((await send("/api/document", "POST", repeated)).status, 200);
  assert.deepEqual(fs.readFileSync(file), Buffer.from(markdown));
});

test("HTTP authored creation preserves Core validity, receipt and exclusive publication", async t => {
  const { a, outside, send } = await fixture(t);
  const file = path.join(a, "new", "nested", "authored.md");
  const authoring = { title: "Measurements", inputs: [{ key: "filtered", blocks: [{ kind: "admonition", variant: "note", text: "Above 15" }, { kind: "table", rows: [["Value"], ["18"], ["24"]] }, { kind: "figure", imageAsset: "chart", imageAlt: "Chart", caption: "" }] }] };
  const images = [{ key: "chart", mime: "image/png", base64: png.toString("base64") }];
  const response = await send("/api/document", "PUT", { path: file, authoring, images });
  assert.equal(response.status, 201, await response.clone().text());
  const receipt = await response.json();
  assert.equal(receipt.path, file);
  assert.equal(receipt.revision, documentRevision(receipt.source));
  assert.ok(receipt.identity);
  assert.equal(receipt.inputs[0].targets.length, 3);
  const reopened = await (await send(documentQuery(file))).json();
  assert.equal(reopened.kind, "native");
  assert.equal(reopened.source, receipt.source);
  assert.match(receipt.source, /> \[!NOTE\]\n> Above 15/);
  const [, relative] = /!\[Chart\]\((\.\/assets\/[^\s]+\.png)\)/.exec(receipt.source)!;
  assert.deepEqual(fs.readFileSync(path.resolve(path.dirname(file), relative)), png);
  const collision = await send("/api/document", "PUT", { path: file, authoring, images });
  assert.equal(collision.status, 400);
  assert.match((await collision.json()).error, /already exists/);
  assert.equal(fs.readFileSync(file, "utf8"), receipt.source);
  for (const payload of [{ path: path.join(a, "invalid.md"), authoring: {} }, { authoring }, { path: path.join(a, "mixed.md"), authoring, template: "builtin:technical-document" }]) {
    assert.equal((await send("/api/document", "PUT", payload)).status, 400);
  }
  assert.equal(fs.existsSync(path.join(a, "invalid.md")), false);
  for (const [invalid, message] of [
    [[{ ...images[0], key: "wrong" }], "Image keys must match Figure asset references"],
    [[{ ...images[0], base64: "%%%" }], "Invalid image base64"],
  ] as const) {
    const rejected = path.join(a, "bad-image", "nested", "bad-image.md");
    const response = await send("/api/document", "PUT", { path: rejected, authoring, images: invalid });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, message);
    assert.equal(fs.existsSync(path.join(a, "bad-image")), false);
    assert.equal(fs.readFileSync(file, "utf8"), receipt.source);
    assert.deepEqual(fs.readFileSync(path.resolve(path.dirname(file), relative)), png);
  }

  assert.equal((await send("/api/document", "PUT", { path: path.join(outside, "new", "blocked.md"), authoring })).status, 403);
  assert.equal(fs.existsSync(path.join(outside, "new")), false);
});

test("HTTP starts with only allowed places and saves both roots through Core and revision checks", async t => {
  const { a, b, send, host, url } = await fixture(t);
  assert.deepEqual(await (await send("/api/document")).json(), { start: true, allowedRoots: [a, b] });
  const places = await (await send("/api/folder-places")).json();
  assert.deepEqual(places.places.map((place: { path: string }) => place.path), [a, b]);
  assert.ok(places.places.every((place: { kind: string }) => place.kind === "root"));
  for (const root of [a, b]) {
    const file = path.join(root, "document.md"), body = saveBody(file);
    const preview = await send("/api/document-source", "POST", body);
    assert.equal(preview.status, 200);
    assert.match((await preview.json()).markdown, /Edited\./);
    assert.match(fs.readFileSync(file, "utf8"), /Alpha/);
    assert.equal((await send("/api/document", "POST", body)).status, 200);
    const reopened = await (await send(documentQuery(file))).json();
    assert.equal(reopened.source, nativeSource("# Title\n\nEdited.\n"));
    assert.equal((await send("/api/document", "POST", body)).status, 409);
    assert.equal(fs.readFileSync(file, "utf8"), reopened.source);
    const created = path.join(root, "new.md");
    assert.equal((await send("/api/document", "PUT", { path: created })).status, 201);
    assert.equal((await send("/api/document", "PUT", { path: created })).status, 400);
    assert.equal((await send("/api/folder", "POST", { parent: root, name: "sub" })).status, 201);
    const listing = await (await send(`/api/folder?${new URLSearchParams({ root })}`)).json();
    assert.ok(listing.entries.some((entry: { path: string }) => entry.path === created));
    const browse = await (await send(`/api/folder-browse?${new URLSearchParams({ path: path.join(root, "sub") })}`)).json();
    assert.deepEqual(browse.crumbs.map((crumb: { path: string }) => crumb.path), [root, path.join(root, "sub")]);
    if (process.platform === "win32") {
      const alternateCase = await (await send(`/api/folder-browse?${new URLSearchParams({ path: root.toUpperCase() })}`)).json();
      assert.equal(alternateCase.crumbs.length, 1, "Different casing must still stop at the allowed root");
    }
  }
  const blocked = path.join(a, "readonly.md"), original = nativeSource("Press {kbd}`Ctrl` now.\n\n# Heading\n\nBody.\n");
  fs.writeFileSync(blocked, original);
  const loaded = await (await send(documentQuery(blocked))).json();
  assert.equal(loaded.kind, "text");
  assert.equal(loaded.source, original);
  assert.equal((await send("/api/document", "POST", { path: blocked, revision: documentRevision(original), base: { source: original } })).status, 400);
  assert.equal(fs.readFileSync(blocked, "utf8"), original);
  const textRequest = { kind: "text", path: blocked, revision: loaded.revision, source: "\t한글 <kbd>\r\n  " };
  for (const invalid of [{ ...textRequest, base: { source: original } }, { ...textRequest, paragraphs: [] }]) {
    assert.equal((await send("/api/document", "POST", invalid)).status, 400);
    assert.equal(fs.readFileSync(blocked, "utf8"), original);
  }
  assert.equal((await send("/api/document", "POST", textRequest)).status, 200);
  assert.equal(fs.readFileSync(blocked, "utf8"), textRequest.source);
  const corrected = "Ordinary Markdown.\n";
  const correction = await send("/api/document", "POST", { ...textRequest, revision: documentRevision(textRequest.source), source: corrected });
  assert.equal(correction.status, 200);
  const checkpoint = (await correction.json()).revision;
  const moved = path.join(a, "moved.md");
  assert.equal((await send("/api/file", "PATCH", { root: a, path: blocked, name: "moved" })).status, 200);
  const nextTextSave = { ...textRequest, path: moved, revision: checkpoint, source: "Second text save.\r\n" };
  assert.equal((await send("/api/document", "POST", nextTextSave)).status, 200);
  assert.equal((await send("/api/document", "POST", nextTextSave)).status, 409);
  const reopenedTextSave = await (await send(documentQuery(moved))).json();
  assert.equal(reopenedTextSave.kind, "native");
  assert.equal(reopenedTextSave.source, nextTextSave.source);
  const plain = path.join(a, "notes.txt"); fs.writeFileSync(plain, "plain");
  const plainFile = await (await send(documentQuery(plain))).json();
  assert.equal(plainFile.kind, "text");
  assert.equal((await send("/api/document", "POST", { kind: "text", path: plain, revision: plainFile.revision, source: "exact\n" })).status, 200);
  const preview = await (await send("/api/document-source?recovery=1", "POST", { path: plain })).json();
  assert.equal(preview.disk.source, "exact\n");
  const native = path.join(b, "document.md"), nativeBytes = fs.readFileSync(native, "utf8");
  assert.equal((await send("/api/document", "POST", { ...textRequest, path: native, revision: documentRevision(nativeBytes) })).status, 200);
  assert.equal(fs.readFileSync(native, "utf8"), textRequest.source);
  await host.close();
  await assert.rejects(fetch(url), /fetch failed/);
});

test("HTTP opens and saves an ordinary README as a structured document", async t => {
  const { a, send } = await fixture(t);
  const file = path.join(a, "README.md");
  const body = [
    "# Example project", "", "Read the [manual][guide].", "",
    "- Install", "- Run", "", "| Command | Result |", "| --- | --- |", "| start | ready |", "",
    "```sh", "npm start", "```", "",
  ].join("\n");
  const source = body + "\n[guide]: https://example.com/manual\n";
  fs.writeFileSync(file, source);
  const opened = await (await send(documentQuery(file))).json();
  assert.equal(opened.kind, "native");
  assert.equal(opened.source, source);
  assert.deepEqual(opened.document.blocks.map((block: { block: string }) => block.block),
    ["heading", "paragraph", "list", "table", "code"]);
  const [heading, paragraph] = opened.document.blocks;
  assert.deepEqual(heading.path, [1]);
  const content = paragraph.content.map((item: { kind: string; text?: string }) =>
    item.text === "Read the " ? { ...item, text: "See the " } : item);
  const saved = await send("/api/document", "POST", {
    path: file, revision: opened.revision, base: { source: opened.source },
    paragraphs: [{ path: paragraph.path, content }],
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const reopened = await (await send(documentQuery(file))).json();
  assert.equal(reopened.kind, "native");
  assert.equal(reopened.source, body.replace("Read the [manual][guide]", "See the [manual](https://example.com/manual)"));
  assert.equal(reopened.revision, (await saved.json()).revision);
  assert.equal(fs.readFileSync(file, "utf8"), reopened.source);
});

test("HTTP keeps an unused link definition when correcting a README in text mode", async t => {
  const { a, send } = await fixture(t);
  const file = path.join(a, "README.md");
  const source = "# Runbook\n\nFix typo.\n\n[backup-console]: https://ops.example.org/recovery\n";
  fs.writeFileSync(file, source);
  const opened = await (await send(documentQuery(file))).json();
  const structured = await send("/api/document", "POST", {
    path: file, revision: opened.revision, base: { source },
    paragraphs: [{ path: [2], content: [{ kind: "text", text: "Fixed typo." }] }],
  });
  assert.equal(structured.status, 400);
  assert.match((await structured.json()).error, /Unused link reference definition/i);
  assert.equal(fs.readFileSync(file, "utf8"), source);
  assert.equal(opened.kind, "text");
  const corrected = source.replace("Fix typo.", "Fixed typo.");
  assert.equal((await send("/api/document", "POST", { kind: "text", path: file, revision: opened.revision, source: corrected })).status, 200);
  assert.equal(fs.readFileSync(file, "utf8"), corrected);
});

test("HTTP rejects an escaped surrogate locator and preserves valid Unicode names", async t => {
  const { a, send } = await fixture(t);
  const before = fs.readdirSync(a).sort();
  const rejected = await send("/api/document", "PUT", { path: path.join(a, "X\uD800Y.md") });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { error: "Invalid Unicode: unpaired surrogate; nothing was written" });
  assert.deepEqual(fs.readdirSync(a).sort(), before);

  const name = "한글 😀 �.md";
  const created = await send("/api/document", "PUT", { path: path.join(a, name) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).path, path.join(a, name));
  assert.deepEqual(fs.readdirSync(a).sort(), [...before, name].sort());
});

test("every file endpoint denies outside paths without exposing or modifying the outside folder", async t => {
  const { a, outside, base, send, url } = await fixture(t);
  const outsideFile = path.join(outside, "document.md"), original = fs.readFileSync(outsideFile);
  const body = saveBody(outsideFile);
  const cases: [string, string, unknown?][] = [
    [documentQuery(outsideFile), "GET"],
    [documentQuery(`${a}${path.sep}..${path.sep}${path.basename(outside)}${path.sep}document.md`), "GET"],
    ["/api/document", "PUT", { path: path.join(outside, "new.md") }],
    ["/api/document", "POST", body], ["/api/document-source", "POST", body],
    [`/api/folder-version?${new URLSearchParams({ root: outside })}`, "GET"],
    [`/api/folder?${new URLSearchParams({ root: outside })}`, "GET"],
    [`/api/folder?${new URLSearchParams({ root: a, path: outside })}`, "GET"],
    [`/api/folder-browse?${new URLSearchParams({ path: base })}`, "GET"],
    [`/api/folder-browse?${new URLSearchParams({ path: outside, files: "image" })}`, "GET"],
    ["/api/asset", "POST", { documentPath: path.join(a, "document.md"), source: path.join(outside, "image.png") }],
    ["/api/folder", "POST", { parent: outside, name: "new-folder" }],
    [`/document/image.png?${new URLSearchParams({ path: outsideFile })}`, "GET"],
  ];
  for (const [route, method, requestBody] of cases) {
    const response = await send(route, method, requestBody);
    assert.equal(response.status, 403, `${method} ${route}`);
    assert.ok(!(await response.text()).includes(outside));
  }
  const upload = (file: string) => fetch(`${url}/api/asset?${new URLSearchParams({ path: file })}`, {
    method: "POST", headers: { Origin: url, "Content-Type": "image/png" }, body: png,
  });
  assert.equal((await upload(outsideFile)).status, 403);
  const created = await (await upload(path.join(a, "document.md"))).json();
  assert.equal((await send("/api/asset", "DELETE", { documentPath: outsideFile, ...created })).status, 403);
  assert.equal((await send("/api/asset", "DELETE", { documentPath: path.join(a, "document.md"), ...created })).status, 204);
  const retained = await (await upload(path.join(a, "document.md"))).json();
  fs.renameSync(path.join(a, "assets"), path.join(a, "original-assets"));
  fs.symlinkSync(outside, path.join(a, "assets"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await upload(path.join(a, "document.md"))).status, 403);
  assert.equal((await send("/api/asset", "DELETE", { documentPath: path.join(a, "document.md"), ...retained })).status, 403);
  assert.equal(fs.existsSync(path.join(a, "original-assets", path.basename(retained.path))), true);
  assert.deepEqual(fs.readFileSync(outsideFile), original);
  assert.deepEqual(fs.readdirSync(outside).sort(), ["document.md", "image.png"]);
});

test("symlink/junction escapes and replaced roots cannot grant file or asset access", async t => {
  const { a, b, outside, send } = await fixture(t);
  const link = path.join(a, "escape");
  fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  const escaped = path.join(link, "document.md"), outsideBody = saveBody(path.join(outside, "document.md"));
  for (const [route, method, body] of [
    [documentQuery(escaped), "GET"], ["/api/document", "POST", { ...outsideBody, path: escaped }],
    ["/api/document", "PUT", { path: path.join(link, "new.md") }],
    // A missing name behind the link must look the same as an existing one.
    [documentQuery(path.join(link, "missing.md")), "GET"], ["/api/document", "PUT", { path: path.join(link, "missing", "new.md") }],
    [`/api/folder-version?${new URLSearchParams({ root: link })}`, "GET"],
    [`/api/folder-browse?${new URLSearchParams({ path: link })}`, "GET"],
    ["/api/folder", "POST", { parent: link, name: "new-folder" }],
    [`/document/image.png?${new URLSearchParams({ path: escaped })}`, "GET"],
  ] as [string, string, unknown?][]) assert.equal((await send(route, method, body)).status, 403, route);
  const listing = await (await send(`/api/folder?${new URLSearchParams({ root: a })}`)).json();
  assert.ok(!listing.entries.some((entry: { name: string }) => entry.name === "escape"));
  fs.symlinkSync(b, path.join(a, "other"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await send(`/document/other/image.png?${new URLSearchParams({ path: path.join(a, "document.md") })}`)).status, 400);
  fs.renameSync(b, b + "-old");
  fs.symlinkSync(outside, b, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await send(documentQuery(path.join(b, "document.md")))).status, 403);
  assert.equal(fs.readFileSync(path.join(outside, "document.md"), "utf8"), nativeSource("# Title\n\nAlpha.\n"));
});

test("root validation handles duplicates/nesting and rejects Windows special locators", async t => {
  const { a, b, base } = await fixture(t);
  fs.mkdirSync(path.join(a, "child"));
  const access = new RootAccess([a, a, b, path.join(a, "child")]);
  assert.deepEqual(access.roots, [a, b, path.join(a, "child")]);
  assert.equal(access.boundary(path.join(a, "child")), path.join(a, "child"));
  assert.throws(() => new RootAccess([]), /--root/);
  assert.throws(() => new RootAccess([path.join(a, "missing")]), /ENOENT/);
  assert.throws(() => new RootAccess([path.join(a, "document.md")]), /directory/);
  for (const value of ["C:relative.md", "\\\\?\\C:\\outside.md", "\\\\.\\C:\\outside.md", "bad\0.md"]) assert.throws(() => access.resolve(value), /Invalid/);
  if (process.platform === "win32") assert.throws(() => access.resolve(path.join(a, "document.md:stream")), /Invalid/);
  // JavaScript case folding equates KELVIN SIGN with "k"; NTFS keeps these sibling folders distinct.
  const book = path.join(base, "book"), alias = path.join(base, "boo\u212A");
  fs.mkdirSync(book);
  const narrow = new RootAccess([book]);
  assert.throws(() => narrow.resolve(path.join(alias, "missing.md")), /outside/, "A missing look-alike is outside too");
  fs.mkdirSync(alias);
  assert.throws(() => narrow.resolve(alias), /outside/);
  assert.throws(() => narrow.resolve(path.join(alias, "new.md"), true), /outside/);
  fs.symlinkSync(book, path.join(alias, "link"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => narrow.resolve(path.join(alias, "link")), /outside/, "The locator must also be inside the root");
  // Both are real roots; the same directory in another case is still one root.
  const both = new RootAccess([book, alias, ...(process.platform === "win32" ? [book.toUpperCase()] : [])]);
  assert.deepEqual(both.roots, [book, alias]);
  assert.equal(both.resolve(path.join(alias, "new.md"), true), path.join(alias, "new.md"));
  assert.equal(both.boundary(alias), alias);
});

test("HTTP rejects foreign/missing origins, forged hosts and malformed requests; media cannot execute scripts", async t => {
  const { a, send, url } = await fixture(t), file = path.join(a, "document.md");
  for (const origin of [undefined, "null", "https://attacker.example"]) {
    const response = await fetch(url + "/api/document", { method: "POST", headers: { "Content-Type": "application/json",
      ...(origin === undefined ? {} : { Origin: origin }) }, body: JSON.stringify(saveBody(file)) });
    assert.equal(response.status, 403);
  }
  assert.equal(await rawStatus(url + "/api/document", { Host: "attacker.example" }), 403);
  assert.equal((await send("/api/document", "GET", undefined, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await send("/api/document", "POST", {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await send("/api/document", "OPTIONS")).status, 405);
  for (const route of ["/%GG", "/%00", "/document/%252e%252e/secret", "/api/document?path=x&path=y",
    "/api/document?path=x&%70ath=y", "/api/document?path=%ED%A0%80", "/api/folder?root=%FF",
    "/api/folder-browse?path=%GG", "/api/document?%ED%A0%80=x", "/api/document?path=%"]) assert.equal((await send(route)).status, 400);
  for (const route of ["/missing.js", "/assets/..%2f..%2fsecret", "/api/missing"]) assert.equal((await send(route)).status, 404);
  const html = await send("/");
  assert.equal(html.status, 200);
  assert.match(html.headers.get("content-security-policy")!, /script-src 'self'/);
  assert.equal(html.headers.get("access-control-allow-origin"), null);
  assert.equal((await send("/", "HEAD")).headers.get("content-type"), "text/html; charset=utf-8");
  fs.writeFileSync(path.join(a, "unsafe.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/document")</script></svg>');
  const media = await send(`/document/unsafe.svg?${new URLSearchParams({ path: file })}`);
  assert.equal(media.status, 200);
  assert.match(media.headers.get("content-security-policy")!, /^sandbox;.*script-src 'none'/);
  assert.equal(media.headers.get("x-content-type-options"), "nosniff");
  assert.equal(media.headers.get("cache-control"), "no-store");
});

test("body limits count chunked bytes and leave original files and the server usable", async t => {
  const { a, url, send } = await fixture(t);
  const chunked = (route: string, type: string, chunks: Buffer[]) => new Promise<number>((resolve, reject) => {
    const req = request(url + route, { method: "POST", headers: { Origin: url, "Content-Type": type } }, res => {
      res.resume(); res.on("end", () => resolve(res.statusCode!));
    });
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
  assert.equal(await chunked("/api/figure-validation", "application/json", [Buffer.alloc(MAX_JSON_BYTES, " "), Buffer.from("{}")]), 413);
  const withinLimit = await chunked("/api/document", "application/json", [Buffer.alloc(MAX_JSON_BYTES - 2, " "), Buffer.from("{}")]);
  assert.equal(withinLimit, 400, "A complete in-limit JSON body reaches ordinary request validation");
  assert.equal(await chunked(`/api/asset?${new URLSearchParams({ path: path.join(a, "document.md") })}`, "image/png", [Buffer.alloc(10 * 1024 * 1024 + 1)]), 413);
  assert.equal((await send("/api/asset", "DELETE", { documentPath: "x", path: "x", rollbackToken: "x".repeat(8192) })).status, 413);
  assert.equal((await fetch(url + "/api/document", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" }, body: "{" })).status, 400);
  await new Promise<void>(resolve => {
    const req = request(url + "/api/document", { method: "POST", headers: { Origin: url, "Content-Type": "application/json", "Content-Length": "1000" } });
    req.on("error", () => resolve()); req.write('{"path":'); req.destroy();
  });
  assert.equal((await send(documentQuery(path.join(a, "document.md")))).status, 200);
  assert.deepEqual(fs.readdirSync(a).sort(), ["document.md", "image.png"]);
});

test("a protected reverse proxy serves HTML, APIs and media; forwarded headers cannot grant access", async t => {
  const proxy = createServer();
  await listenForFetch(proxy);
  const address = proxy.address();
  assert.ok(address && typeof address !== "string");
  const external = `http://127.0.0.1:${address.port}`;
  const { a, url, send } = await fixture(t, external);
  t.after(() => new Promise<void>(resolve => { proxy.closeAllConnections(); proxy.close(() => resolve()); }));
  proxy.on("request", (req, res) => {
    if (req.headers.authorization !== "Bearer test-operator") { res.writeHead(401); res.end(); return; }
    const upstream = request(url + req.url, { method: req.method, headers: { ...req.headers, host: new URL(external).host } }, response => {
      res.writeHead(response.statusCode!, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
  });
  for (const route of ["/", "/app.js", documentQuery(path.join(a, "document.md")), `/document/image.png?${new URLSearchParams({ path: path.join(a, "document.md") })}`]) {
    assert.equal((await fetch(external + route)).status, 401);
    assert.equal((await fetch(external + route, { headers: { Authorization: "Bearer test-operator" } })).status, 200);
  }
  assert.equal((await fetch(external + "/api/document", { method: "POST", headers: {
    Authorization: "Bearer test-operator", Origin: external, "Content-Type": "application/json",
  }, body: JSON.stringify(saveBody(path.join(a, "document.md"))) })).status, 200);
  assert.equal(await rawStatus(url + "/api/document", { Host: "unapproved.example", "X-Forwarded-Host": new URL(external).host }), 403);
});
test("HTTP bibliography route reads only admitted declarations within fixed Roots and respects source revision", async t => {
  const { a, b, outside, send } = await fixture(t);
  fs.mkdirSync(path.join(a, "chapters"));
  const file = path.join(a, "chapters", "paper.md");
  const bib = "@standard{s,title={Standard},organization={Body},number={S-1},year={2024}}";
  fs.writeFileSync(path.join(a, "refs.bib"), bib);
  fs.writeFileSync(path.join(outside, "refs.bib"), "private");
  fs.writeFileSync(file, "---\nlitzio: 1\nbibliography: [../refs.bib, ../../outside.bib]\n---\n\n{cite}`s`\n");
  const opened = await (await send(documentQuery(file))).json();
  const query = new URLSearchParams({ path: file, revision: opened.revision, root: outside, source: path.join(outside, "refs.bib") });
  const response = await send(`/api/bibliography?${query}`);
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.sources[0].text, bib);
  assert.deepEqual(snapshot.sources[1], { source: "../../outside.bib", status: "error", code: "bibliography-unreadable" });
  assert.equal(snapshot.sources.length, 2, "caller cannot add undeclared targets");
  assert.equal((await send(`/api/bibliography?${query}`, "POST", {})).status, 405);
  assert.equal((await send(`/api/bibliography?${new URLSearchParams({ path: path.join(outside, "document.md"), revision: opened.revision })}`)).status, 403);
  assert.equal((await send(`/api/bibliography?${new URLSearchParams({ path: path.join(a, "refs.bib"), revision: opened.revision })}`)).status, 400);
  // A second approved root is readable regardless of the supplied Sidebar context.
  fs.writeFileSync(path.join(b, "refs.bib"), bib);
  fs.writeFileSync(file, `---\nlitzio: 1\nbibliography: [../../documents-B/refs.bib]\n---\n\n{cite}\`s\`\n`);
  const stale = await (await send(`/api/bibliography?${query}`)).json();
  assert.ok(stale.sources.every((s: { code: string }) => s.code === "bibliography-changed"));
  const refreshed = await (await send(documentQuery(file))).json();
  query.set("revision", refreshed.revision);
  assert.equal((await (await send(`/api/bibliography?${query}`)).json()).sources[0].text, bib);
  assert.equal(fs.readFileSync(path.join(a, "refs.bib"), "utf8"), bib);
  assert.equal(fs.readFileSync(path.join(b, "refs.bib"), "utf8"), bib);
});

test("folder notifications distinguish identities that collide as numbers", t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "litzio-watch-precision-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = fs.statSync(root, { bigint: true });
  let ino = 2n ** 54n;
  assert.equal(Number(ino), Number(ino + 1n), "the replacement identities collide as numbers");
  t.mock.method(fs, "statSync", (_root: fs.PathLike, options?: fs.StatOptions) => ({
    ...original, dev: options?.bigint ? original.dev : Number(original.dev),
    ino: options?.bigint ? ino : Number(ino), isDirectory: () => true,
  }));
  let closed = 0;
  t.mock.method(fs, "watch", () => Object.assign(new EventEmitter(), { close() { closed++; } }));
  const first = folderVersion(root, null).version;
  assert.equal(folderVersion(root, null).version, first, "the same identity retains its watch");
  ino++;
  const replacement = folderVersion(root, null).version;
  assert.equal(closed, 1, "a distinct bigint identity releases the old watch");
  assert.notEqual(replacement, first);
  t.mock.timers.tick(15_000);
  assert.equal(closed, 2, "the replacement watch expires too");
});

test("folder notifications replace a dead watch when an inode is reused", t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "litzio-watch-reused-"));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(root + "-old", { recursive: true, force: true }); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const original = fs.statSync(root, { bigint: true });
  // Inode reuse depends on the filesystem allocator. Pin dev/ino and creation
  // time to model Linux reuse deterministically, including nanosecond precision.
  let birthtimeNs = 2n ** 54n;
  t.mock.method(fs, "statSync", () => ({ ...original, birthtimeNs, isDirectory: () => true }));
  const watches: { notify(): void; closed: boolean }[] = [];
  t.mock.method(fs, "watch", (_root: string, _options: fs.WatchOptions, notify: () => void) => {
    const watch = { notify, closed: false };
    watches.push(watch);
    return Object.assign(new EventEmitter(), { close() { watch.closed = true; } });
  });
  const first = folderVersion(root, null).version;
  fs.renameSync(root, root + "-old"); fs.mkdirSync(root);
  birthtimeNs++;
  const replacement = folderVersion(root, null).version;
  assert.notEqual(replacement, first, "a new creation with reused dev/ino must replace the dead watch");
  assert.equal(watches[0]!.closed, true);
  fs.writeFileSync(path.join(root, "external.txt"), "external");
  watches[1]!.notify(); t.mock.timers.tick(150);
  assert.notEqual(folderVersion(root, null).version, replacement, "the replacement watch observes subsequent writes");
  birthtimeNs = 0n;
  const unsupported = folderVersion(root, null).version;
  assert.equal(folderVersion(root, null).version, unsupported, "missing creation time retains dev/ino fallback");
  t.mock.timers.tick(15_000);
  assert.ok(watches.every(watch => watch.closed));
});

test("folder notifications debounce versions, renew leases and release watchers", t => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "litzio-watch-"));
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(root + "-old", { recursive: true, force: true }); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let notify: () => void = () => {};
  let closed = 0;
  t.mock.method(fs, "watch", (_root: string, options: fs.WatchOptions, callback: () => void) => {
    assert.equal(options.recursive, true);
    assert.equal(options.persistent, false);
    notify = callback;
    return Object.assign(new EventEmitter(), { close() { closed++; } });
  });
  const first = folderVersion(root, null).version;
  notify(); t.mock.timers.tick(100); notify(); t.mock.timers.tick(100);
  assert.equal(folderVersion(root, null).version, first, "a burst remains debounced");
  t.mock.timers.tick(50);
  assert.notEqual(folderVersion(root, null).version, first);
  fs.renameSync(root, root + "-old"); fs.mkdirSync(root);
  const replacement = folderVersion(root, null).version;
  assert.notEqual(replacement, first);
  assert.equal(closed, 1, "replacing the directory releases the watch of its old identity");
  t.mock.timers.tick(14_999);
  assert.equal(closed, 1, "checks renew the watch lease");
  t.mock.timers.tick(1);
  assert.equal(closed, 2, "an unused watch is closed");
});


test("background folder disappearance is an availability result; manual errors and access denial stay explicit", async t => {
  const { a, outside, send } = await fixture(t);
  const missing = path.join(a, "removed");
  const query = new URLSearchParams({ root: missing, background: "1" });
  const background = await send(`/api/folder?${query}`);
  assert.equal(background.status, 200);
  assert.equal((await background.json()).unavailable, true);
  assert.equal((await send(`/api/folder?${new URLSearchParams({ root: missing })}`)).status, 400);
  const version = await send(`/api/folder-version?${query}`);
  assert.equal(version.status, 200);
  assert.deepEqual(await version.json(), { unavailable: true });
  assert.equal((await send(`/api/folder?${new URLSearchParams({ root: outside, background: "1" })}`)).status, 403);
});


test("only the bundled Desktop origin receives CORS API/media access and bounded preflight", async t => {
  const { send, url, a, health } = await fixture(t, undefined, true);
  const headers = { Origin: "litzio://app", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors" };
  const query = new URLSearchParams({ path: path.join(a, "document.md") });
  const loaded = await send(`/api/document?${query}`, "GET", undefined, headers);
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get("access-control-allow-origin"), "litzio://app");
  const response = await send("/api/document", "POST", saveBody(path.join(a, "document.md")), headers);
  assert.equal(response.status, 200);
  const media = `/document/image.png?${query}`;
  const image = await send(media, "GET", undefined, headers);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.match(image.headers.get("content-security-policy")!, /^sandbox;.*script-src 'none'/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await send(media)).headers.get("cross-origin-resource-policy"), "same-origin");
  const preview = await send(`/api/file-preview?${new URLSearchParams({ root:a, path:path.join(a,"image.png") })}`, "GET", undefined, headers);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("content-security-policy")!, /^sandbox;.*script-src 'none'/);
  const healthPreflight = { ...headers, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-litzio-protocol" };
  const healthOptions = await send("/daemon/health", "OPTIONS", undefined, healthPreflight);
  assert.equal(healthOptions.status, 204);
  assert.equal(healthOptions.headers.get("access-control-allow-methods"), "GET");
  assert.equal(healthOptions.headers.get("access-control-allow-headers"), "X-Litzio-Protocol");
  assert.equal((await send("/daemon/health", "GET", undefined, { ...headers, "X-Litzio-Protocol": DAEMON_PROTOCOL })).status, 200);
  for (const route of ["/daemon/stop", "/daemon/unknown", "/daemon/health?extra=1"]) assert.equal((await send(route, "OPTIONS", undefined, healthPreflight)).status, 403);
  for (const invalid of [{ "Access-Control-Request-Method": "POST" }, { "Access-Control-Request-Headers": "content-type" }, { "Access-Control-Request-Headers": "x-arbitrary" }, { Origin: "https://foreign.example" }]) assert.equal((await send("/daemon/health", "OPTIONS", undefined, { ...healthPreflight, ...invalid })).status, 403);
  const preflight = { ...headers, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" };
  assert.equal((await send("/api/document", "OPTIONS", undefined, preflight)).status, 204);
  const creationPreflight = await send("/api/document", "OPTIONS", undefined, {
    ...preflight, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": `content-type, ${DAEMON_INSTANCE_HEADER}`,
  });
  assert.equal(creationPreflight.status, 204);
  assert.ok(creationPreflight.headers.get("access-control-allow-headers")?.includes(DAEMON_INSTANCE_HEADER));
  const newFile = path.join(a, "screen-result.md");
  const creation = { path: newFile, authoring: { title: "Screen result", inputs: [] } };
  assert.equal((await send("/api/document", "PUT", creation, { ...headers, [DAEMON_INSTANCE_HEADER]: "old-instance" })).status, 409);
  assert.equal(fs.existsSync(newFile), false);
  assert.equal((await send("/api/document", "PUT", creation, { ...headers, [DAEMON_INSTANCE_HEADER]: health.instanceId })).status, 201);
  for (const invalid of [{ "Access-Control-Request-Headers": "x-arbitrary" }, { "Access-Control-Request-Method": "TRACE" }]) {
    assert.equal((await send("/api/document", "OPTIONS", undefined, { ...preflight, ...invalid })).status, 403);
  }
  for (const origin of ["null", "litzio://app.evil", "litzio://foreign", "https://foreign.example"]) {
    for (const route of ["/api/document", media]) {
      const denied = await send(route, "GET", undefined, { ...headers, Origin:origin });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
    }
    assert.equal((await send("/api/document", "OPTIONS", undefined, { ...preflight, Origin:origin })).status, 403);
  }
  assert.equal((await fetch(url + media, { headers: { "Sec-Fetch-Site":"cross-site" } })).status, 403);
  assert.equal(await rawStatus(url + "/api/document", { ...headers, Host:"app" }), 403);
});

test("document comparison accepts only supplied native snapshots and returns read-only receipts", async t => {
  const { a, send } = await fixture(t);
  const before = nativeSource("## Title\n"), after = nativeSource("### Title\n");
  const disk = fs.readFileSync(path.join(a, "document.md"), "utf8");
  assert.equal((await send("/api/document-compare")).status, 405);
  const result = await send("/api/document-compare", "POST", { before, after });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.changes[0].kind, "changed");
  assert.deepEqual(body.receipt, { beforeRevision: documentRevision(before), afterRevision: documentRevision(after) });
  for (const input of [{ before, after: false }, { before, after: "<div>Unsupported HTML</div>" }, { before: "x".repeat(1000001), after }]) {
    const response = await send("/api/document-compare", "POST", input);
    assert.equal(response.ok, false);
    assert.equal(typeof (await response.json()).error, "string");
  }
  assert.equal(fs.readFileSync(path.join(a, "document.md"), "utf8"), disk);
});

test("Copilot MCP discovery and calls cross the real daemon Origin gate", async t => {
  const { CopilotAcp } = await import("../server/copilot-acp.ts");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const log = path.join(isolatedData, "copilot-daemon-acp.jsonl");
  const originalConnect = CopilotAcp.prototype.connect;
  // Replace only the provider executable. The daemon, services, ACP framing,
  // admitted turn and MCP handler all remain the production implementations.
  t.mock.method(CopilotAcp.prototype, "connect", function (this: InstanceType<typeof CopilotAcp>) {
    Object.assign(this, { options: { bin: process.execPath, args: [fileURLToPath(new URL("./fixtures/copilot-acp.mjs", import.meta.url)), log] } });
    return originalConnect.call(this);
  });
  const previous = process.env.LITZIO_ASSISTANT_CWD;
  process.env.LITZIO_ASSISTANT_CWD = path.join(isolatedData, "copilot-daemon-assistant");
  const { a, send, url } = await fixture(t);
  t.after(() => { if (previous === undefined) delete process.env.LITZIO_ASSISTANT_CWD; else process.env.LITZIO_ASSISTANT_CWD = previous; });
  const sent = await send("/api/assistant/conversations", "POST", { action: "send", provider: "copilot", permissionMode: "opened-folders", message: "Inspect documents", folders: [a], model: "auto", reasoningEffort: "low" });
  assert.equal(sent.status, 200, await sent.clone().text());
  const conversation = await sent.json();
  assert.equal(conversation.turns.at(-1).status, "inProgress");
  // session/new is logged before its response; session/prompt may still be appending.
  // Parse complete JSONL records without treating an unfinished tail as a record.
  const rows = fs.readFileSync(log, "utf8").split("\n").slice(0, -1).map(line => JSON.parse(line));
  const config = rows.filter(row => row.method === "session/new" && row.params.mcpServers.length).at(-1).params.mcpServers[0];
  assert.equal(new URL(config.url).origin, url);
  const client = new Client({ name: "daemon-regression", version: "1" });
  t.after(() => client.close());
  const headers = Object.fromEntries(config.headers.map((header: { name: string; value: string }) => [header.name, header.value]));
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers } }));
  assert.ok((await client.listTools()).tools.some(tool => tool.name === "read_document"));
  const result = await client.callTool({ name: "read_document", arguments: { path: path.join(a, "document.md") } });
  assert.equal(result.isError, false);
  assert.match(JSON.stringify(result.content), /Alpha/);
  // Neither an absent Origin nor an unrelated one becomes a new policy exception.
  for (const origin of [undefined, "https://foreign.invalid"]) {
    const response = await fetch(config.url, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: "{}" });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Request origin is not allowed." });
  }
  await client.close();
  await send("/api/assistant/conversations", "POST", { action: "interrupt", id: conversation.id });
});

test("plugins CLI installs a GitHub folder, checks it and updates it over a real Host", async t => {
  const github = new FakeGitHub(), repo = github.repository("acme", "tools");
  const files = (label: string, version: string) => ({
    "plugins/alpha/litzio-plugin.json": JSON.stringify({ id: "acme.alpha", name: "Alpha", version, entry: "host.mjs", screen: "screen.jsx", operations: [{ id: "read", outputSchema: { type: "string" } }] }),
    "plugins/alpha/screen.jsx": "export default function Screen(){return null}",
    "plugins/alpha/host.mjs": `export function activate(){return {operations:{read:()=>${JSON.stringify(label)}},status:()=>({available:true,message:'Ready'}),dispose(){}}}`,
  });
  repo.push("main", files("first", "0.1.0"));
  process.env.LITZIO_GITHUB_API_URL = await github.start();
  t.after(async () => { delete process.env.LITZIO_GITHUB_API_URL; await github.close(); });
  const { url, send } = await fixture(t, undefined, true);
  // The built CLI is not required here: tsx runs the same entry with its exit code and JSON output.
  const cli = async (...args: string[]) => {
    try {
      const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../../packages/cli/src/cli.ts", import.meta.url)), "plugins", ...args, "--host", url, "--json"], { windowsHide: true });
      return { code: 0, value: JSON.parse(stdout) };
    } catch (error) { return { code: (error as { code: number }).code, value: JSON.parse((error as { stdout: string }).stdout) }; }
  };
  const read = async () => (await (await send("/api/plugins", "POST", { action: "invoke", operation: "acme.alpha.read", input: {} })).json()).result;
  const source = "https://github.com/acme/tools/tree/main/plugins/alpha";
  const refused = await cli("install", source, "--track", "release");
  assert.equal(refused.code, 1); assert.match(refused.value.errors[0].message, /no formal GitHub release/);
  assert.equal((await cli("install", source)).code, 0);
  assert.equal(await read(), "first");
  repo.push("main", files("second", "0.2.0"));
  assert.deepEqual((await cli("check-updates")).value.updates, [{ id: "acme.alpha", currentVersion: "0.1.0", sourceVersion: "0.2.0", available: true, track: "branch" }]);
  github.failures.set(/\/tarball\//, { status: 500 });
  assert.equal((await cli("update", "acme.alpha")).code, 1, "a failed download exits with failure");
  github.failures.clear();
  assert.equal(await read(), "first");
  assert.equal((await cli("update", "acme.alpha")).code, 0);
  assert.equal(await read(), "second");
});

const LOG_LINE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z \S/;

test("daemon log lines carry UTC time; paths keep only file names; one daemon.log generation rotates", () => {
  let written = "";
  daemonLog("daemon starting: version=x", { write: text => { written += text; } });
  assert.match(written, LOG_LINE); assert.ok(written.endsWith(" daemon starting: version=x\n"));
  const error = new Error("open 'C:\\Users\\Private Person\\문서\\plan.md' failed\nsecond line");
  error.stack = String.raw`Error: ignored
    at read (C:\Users\Private Person\AppData\Local\Programs\Litzio\resources\cli\cli.mjs:12:5)
    at file:///C:/Users/Private%20Person/x/host.mjs:3:1
    at load (/home/private-user/work/server.ts:7:9)
    at \\server\share\private-user\unc.ts:1:1
    at node:internal/process/task_queues:95:5`;
  const described = describeError(error);
  assert.equal(described, "Error: open 'plan.md' failed second line | at read (cli.mjs:12:5) | at /host.mjs:3:1 | at load (server.ts:7:9) | at unc.ts:1:1 | at node:internal/process/task_queues:95:5");
  assert.equal(shortenPaths("http://127.0.0.1:20001/api/folder"), "http://127.0.0.1:20001/api/folder", "URLs are not paths");
  assert.equal(describeError("document text"), "non-error value string", "a rejection value can be document text");

  const directory = fs.mkdtempSync(path.join(isolatedData, "rotate-")), log = path.join(directory, "daemon.log");
  fs.writeFileSync(log, "small");
  rotateDaemonLog(log);
  assert.equal(fs.existsSync(`${log}.old`), false, "below the limit the file keeps growing");
  fs.writeFileSync(`${log}.old`, "older generation");
  fs.writeFileSync(log, "x".repeat(DAEMON_LOG_ROTATE_BYTES + 1));
  rotateDaemonLog(log);
  assert.equal(fs.existsSync(log), false);
  assert.equal(fs.statSync(`${log}.old`).size, DAEMON_LOG_ROTATE_BYTES + 1, "one generation replaces the older one");
  rotateDaemonLog(path.join(directory, "missing.log"));
});

test("daemon log records failed, slow and aborted requests once per repeated run, without queries or bodies", () => {
  const lines: string[] = [];
  const recorder = requestRecorder(message => lines.push(message), 100);
  const record = (method: string, url: string, status: number, ms: number, finished = true, failure?: { error: unknown }, routed = true) =>
    recorder.record({ method, url } as any, { statusCode: status, writableFinished: finished } as any, ms, failure, routed);
  record("GET", "/api/folder?root=C%3A%5Csecret", 404, 5);
  record("GET", "/api/folder", 200, 5);
  assert.deepEqual(lines, [], "reads that are refused or fine stay out of the log");
  for (let i = 0; i < 3; i++) record("POST", "/api/folder?name=secret", 415, 4);
  record("POST", "/api/folder", 201, 3);
  record("GET", "/api/plugins", 500, 12, true, { error: Object.assign(new Error("plugin failed at C:\\Users\\secret\\x.ts"), { stack: "" }) });
  record("GET", "/api/document", 200, 150);
  record("GET", "/api/document", 200, 160);
  record("GET", "/api/document", 200, 10);
  record("POST", "/api/assistant/mcp/lease-token-secret", 200, 60_000);
  record("GET", "/document/secret%20file.png?path=x", 200, 5, false);
  record("HEAD", "/document/other.png", 503, 1);
  for (const url of ["/C:/Users/secret/plan.md", "/secret-folder/a.md", "/api/secret-route"]) record("POST", url, 405, 2, true, undefined, false);
  recorder.flush();
  assert.deepEqual(lines, [
    "request failed POST /api/folder 415 in 4ms",
    "repeated 2 more times: request failed POST /api/folder 415",
    "request failed GET /api/plugins 500 in 12ms: Error: plugin failed at x.ts",
    "request slow GET /api/document 200 in 150ms",
    "repeated 1 more time: request slow GET /api/document",
    "request aborted GET /document/* after 5ms",
    "request failed HEAD /document/* 503 in 1ms",
    "request failed POST (unmatched) 405 in 2ms",
    "repeated 2 more times: request failed POST (unmatched) 405",
  ]);
  const bounded: string[] = [];
  const runs = repeatLog(message => bounded.push(message), 2);
  for (const group of ["a", "a", "b", "c"]) runs.report(group, `event ${group}`);
  assert.deepEqual(bounded, ["event a", "event b", "repeated 1 more time: event a", "event c"], "the oldest open run ends at the limit");
  assert.equal(LONG_RUNNING_ROUTES.length, 1);
  assert.equal(logRoute("/api/assistant/mcp/token"), "/api/assistant/mcp/*");
  assert.equal(SLOW_REQUEST_MS, 2_000);
});

test("daemon log reports an event loop stall once per run", async () => {
  const lines: string[] = [];
  const stop = watchEventLoop(repeatLog(message => lines.push(message)), 150, 20);
  try {
    await new Promise(resolve => setTimeout(resolve, 60));
    const until = performance.now() + 600;
    while (performance.now() < until) { /* synchronous work blocks every timer */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  } finally { stop(); }
  const stalls = lines.filter(line => line.startsWith("event loop stalled for "));
  assert.ok(stalls.length >= 1, lines.join("\n"));
  assert.ok(Number(stalls[0]!.match(/for (\d+\.\d)s$/)![1]) >= 0.15, stalls[0]);
});

test("HTTP Host records a thrown 500 with its cause and state-changing refusals, never the query or body", async t => {
  const editorDir = fs.mkdtempSync(path.join(isolatedData, "log-editor-"));
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>Editor</title>");
  const lines: string[] = [];
  const identity = { pid: 1, startedAt: new Date(0).toISOString(), instanceId: "fixture" };
  const health = { ...identity, launcher: "cli-run" as const, daemonHome: "unused", executable: "unused", roots: [], nonLoopback: false, productVersion: "test", protocolVersion: DAEMON_PROTOCOL,
    get processStartedAt(): string { throw new Error(`health failed in ${path.join(isolatedData, "private-user", "health.ts")}`); } };
  const host = await startHttpHost({ roots: [], editorDir, port: 0, daemon: { health, stop() {} }, log: message => lines.push(message) });
  t.after(() => host.close());
  const headers = { Origin: host.url, "X-Litzio-Protocol": DAEMON_PROTOCOL };
  assert.equal((await fetch(host.url + "/daemon/health?secret-query=1", { headers })).status, 500);
  const json = { Origin: host.url, "Content-Type": "application/json" };
  const missingParent = JSON.stringify({ parent: path.join(isolatedData, "secret-missing"), name: "x" });
  assert.ok((await fetch(host.url + "/api/folder?root=secret-query", { method: "POST", headers: json, body: missingParent })).status >= 400);
  assert.equal((await fetch(host.url + "/api/folder?root=secret-query", { method: "POST", headers: { Origin: host.url }, body: "secret-body" })).status, 415);
  assert.equal((await fetch(host.url + "/secret-folder/plan.md", { method: "POST", headers: json, body: "{}" })).status, 405);
  assert.equal((await fetch(host.url + "/api/secret-route", { method: "POST", headers: json, body: "{}" })).status, 404);
  assert.equal((await fetch(host.url + "/missing-page")).status, 404);
  await host.close();
  assert.equal(lines.length, 5, lines.join("\n"));
  assert.match(lines[0]!, /^request failed GET \/daemon\/health 500 in \d+ms: Error: health failed in health\.ts \| at /);
  assert.match(lines[1]!, /^request failed POST \/api\/folder 4\d\d in \d+ms$/, "a known route keeps its path");
  // Refused before routing (415), no static route (405) and no API route (404): never the path itself.
  assert.match(lines[2]!, /^request failed POST \(unmatched\) 415 in \d+ms$/);
  assert.match(lines[3]!, /^request failed POST \(unmatched\) 405 in \d+ms$/);
  assert.match(lines[4]!, /^request failed POST \(unmatched\) 404 in \d+ms$/);
  assert.doesNotMatch(lines.join("\n"), /secret|private-user/);
});
