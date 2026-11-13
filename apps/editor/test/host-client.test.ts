import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HostStatus } from "../src/components/HostStatus.tsx";
import { i18n } from "../src/i18n.ts";
import { once } from "node:events";
import { createHostRegistry, monitorDesktopHosts, hostRegistry, setHostRegistry } from "../src/host-client.ts";
import { createDocumentRequests } from "../src/document-session.ts";
import { createAssetHost, chooseHostImage } from "../src/image-assets.ts";
import { createAssistantRequest } from "../src/assistant-api.ts";
import { createTemplateRequest } from "../src/template-api.ts";
import { resolveFigureSource } from "../src/node-views/figure-view.tsx";
import { saveScreenDocument } from "../src/views/screen-document.ts";

test("screen document saves require opened folders and do not replay failures", async () => {
  const requests: unknown[] = [];
  const client = { assertCurrent() {}, async request(url: string, init: RequestInit) {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json({ error: "file already exists" }, { status: 400 });
  } } as any;
  const input = { name: "results.md", authoring: { inputs: [] } };
  await assert.rejects(saveScreenDocument(client, [], input), /Open a folder/);
  await assert.rejects(saveScreenDocument(client, ["D:/remote"], { ...input, folder: "C:/other" }), /Open a folder/);
  await assert.rejects(saveScreenDocument(client, ["D:/remote"], { ...input, name: "../results.md" }), /filename/);
  assert.equal(requests.length, 0);
  await assert.rejects(saveScreenDocument(client, ["D:/remote"], input), /already exists/);
  assert.deepEqual(requests, [{ url: "/api/document", body: { path: "D:/remote/results.md", authoring: input.authoring } }]);
});

// Real independent HTTP fixtures exercise the client boundary, not document semantics.
test("Host-bound operations retain origin, isolate outage, and never replay writes", async t => {
  async function fixture(name: string) {
    const requests: { url: string; method: string; body: string }[] = [];
    const server = createServer(async (req, res) => {
      let body = ""; for await (const chunk of req) body += chunk;
      requests.push({ url: req.url!, method: req.method!, body });
      let value: unknown = { host: name };
      if (req.url?.startsWith("/api/document") && req.method === "GET") value = { kind: "text", path: "/same.md", source: name, revision: name };
      else if (req.url === "/api/document") value = { revision: `${name}-saved` };
      else if (req.url?.startsWith("/api/asset")) value = { path: "assets/image.png", rollbackToken: name };
      else if (req.url === "/api/host-capabilities") value = { fileDeletion: name === "a" ? "trash" : "permanent", identity: { runAs: `${name}-user` } };
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value));
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    t.after(() => { server.closeAllConnections(); server.close(); });
    const address = server.address(); assert.ok(address && typeof address !== "string");
    return { server, requests, origin: `http://127.0.0.1:${address.port}` };
  }
  const a = await fixture("a"), b = await fixture("b");
  const registry = createHostRegistry([{ hostId: "a", origin: a.origin }, { hostId: "b", origin: b.origin }]);
  assert.throws(() => registry.get("unknown"), /Unavailable Host/);
  await Promise.all([registry.connect("a"), registry.connect("b")]);
  assert.equal(registry.get("a").capabilities?.fileDeletion, "trash");
  assert.equal(registry.get("b").capabilities?.fileDeletion, "permanent");
  assert.deepEqual(registry.get("a").identity, { runAs: "a-user" });
  assert.deepEqual(registry.get("b").identity, { runAs: "b-user" });
  for (const [id, fixture] of [["a", a], ["b", b]] as const) {
    const client = registry.get(id).client;
    const docs = createDocumentRequests(client), assets = createAssetHost(client);
    const file = await docs.requestDocument("GET", "/same.md");
    assert.ok(!("start" in file)); assert.equal(file.source, id);
    assert.deepEqual(await docs.requestSave({ kind: "text", path: "/same.md", revision: id, source: id }), { revision: `${id}-saved` });
    const created = await assets.create(new File(["image"], "image.png", { type: "image/png" }), "/same.md", "paste");
    await chooseHostImage("/same.md", "/image.png", client);
    // Another active target cannot redirect the receipt's rollback.
    registry.get(id === "a" ? "b" : "a");
    await assets.rollback(created, "/same.md");
    assert.equal(JSON.parse(fixture.requests.find(req => req.method === "DELETE")!.body).rollbackToken, id);
    assert.equal(await (await fetch(resolveFigureSource("assets/image.png", "/same.md", client))).json().then(body => body.host), id);
    assert.equal((await createAssistantRequest(client)<{ host: string }>("/api/assistant/conversations", { action: "create" })).host, id);
    assert.equal((await createTemplateRequest(client)("templates") as unknown as { host: string }).host, id);
    assert.ok(fixture.requests.some(req => req.url === "/api/document" && req.method === "POST"));
  }
  const desktop = await import(new URL("../src/host-client.ts?receipt-reconnect", import.meta.url).href);
  desktop.setDesktopHost(a.origin);
  const originalAssets = createAssetHost(desktop.getHostClient("local"));
  const receipt = await originalAssets.create(new File(["image"], "image.png", { type: "image/png" }), "/same.md", "paste");
  const deletesBefore = b.requests.filter(req => req.method === "DELETE").length;
  desktop.setDesktopHost(b.origin);
  await assert.rejects(originalAssets.rollback(receipt, "/same.md"), /connection changed/);
  assert.equal(b.requests.filter(req => req.method === "DELETE").length, deletesBefore);
  a.server.closeAllConnections(); await new Promise<void>(resolve => a.server.close(() => resolve()));
  await assert.rejects(createDocumentRequests(registry.get("a").client).requestSave({ kind: "text", path: "/same.md", revision: "a", source: "unsure" }), /may already have been saved/);
  await registry.connect("a");
  assert.equal(registry.get("a").state, "disconnected");
  assert.equal(registry.get("a").identity, undefined);
  assert.equal(registry.get("b").state, "connected");
  const before = b.requests.length;
  assert.equal((await createDocumentRequests(registry.get("b").client).requestSave({ kind: "text", path: "/same.md", revision: "b", source: "ok" })).revision, "b-saved");
  assert.equal(b.requests.length, before + 1);
});

test("late capability responses cannot replace newer observations or delay another Host", async t => {
  const pending: ((response: Response) => void)[] = [];
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => pending.push(resolve)));
  const registry = createHostRegistry([{ hostId: "a", origin: "http://a" }, { hostId: "b", origin: "http://b" }]);
  const old = registry.connect("a"); await Promise.resolve();
  const latest = registry.connect("a"), other = registry.connect("b"); await Promise.resolve();
  pending[2](Response.json({ fileDeletion: "trash" })); await other;
  assert.equal(registry.get("b").state, "connected");
  pending[1](Response.json({ fileDeletion: "trash" })); await latest;
  pending[0](Response.json({ fileDeletion: "permanent" })); await old;
  assert.equal(registry.get("a").capabilities?.fileDeletion, "trash");
});

test("Desktop bootstrap and reconnect keep in-flight targets while new work uses the verified address", async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { litzioDesktop: {} } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); });
  const requests: string[] = [];
  let finish: ((value: Response) => void) | undefined;
  t.mock.method(globalThis, "fetch", (url: string) => {
    requests.push(url);
    if (url.endsWith("/save")) return new Promise<Response>(resolve => { finish = resolve; });
    return Promise.resolve(Response.json({ fileDeletion: "trash", path: "assets/a.png", rollbackToken: "first-receipt", revision: "saved" }));
  });
  const module = await import(new URL("../src/host-client.ts?desktop-reconnect", import.meta.url).href);
  const client = module.getHostClient("local");
  const observation = module.hostRegistry.connect("local");
  const bootstrap = client.request("/initial"); await Promise.resolve();
  assert.equal(requests.length, 0);
  module.setDesktopHost("http://first"); await Promise.all([bootstrap, observation]);
  const saving = client.request("/save"); await Promise.resolve(); await Promise.resolve();
  const assets = createAssetHost(client);
  const receipt = await assets.create(new File(["image"], "a.png", { type: "image/png" }), "/same.md", "paste");
  const docs = createDocumentRequests(client), assistant = createAssistantRequest(client), templates = createTemplateRequest(client);
  module.setDesktopHost("http://second");
  const workRequests = () => requests.filter(url => !url.endsWith("/api/host-capabilities"));
  const afterReconnect = workRequests().length;
  await assert.rejects(assets.rollback(receipt, "/same.md"), /connection changed/);
  await assert.rejects(docs.requestSave({ kind: "text", path: "/same.md", revision: "first", source: "edits" }), /connection changed/);
  await assert.rejects(assistant("/api/assistant/conversations", { action: "send", id: "first" }), /connection changed/);
  await assert.rejects(templates("templates", { name: "first", from: "/same.md", description: "" }), /connection changed/);
  assert.equal(workRequests().length, afterReconnect, "stale follow-ups never reach either connection");
  module.setDesktopHost("http://first");
  await assets.rollback(receipt, "/same.md");
  module.setDesktopHost("http://second");
  await assert.rejects(client.request("/next"), /connection changed/);
  await module.getHostClient("local").request("/next");
  finish!(Response.json({ revision: "first" })); await saving;
  assert.ok(requests.includes("http://first/initial"));
  assert.equal(requests.filter(url => url.endsWith("/save")).join(), "http://first/save");
  assert.ok(requests.includes("http://second/next"));
  assert.equal(client.url("/image"), "http://first/image");
});

test("registered connections recheck health, reject protocol, warn product and recover without writes", async t => {
  let protocol = "4", product = "different", offline = false;
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    assert.equal(init?.method ?? "GET", "GET");
    if (offline) throw new Error("offline");
    if (String(url).endsWith("/daemon/health")) {
      assert.equal((init?.headers as Record<string, string>)["X-Litzio-Protocol"], "4");
      return Response.json({ protocolVersion: protocol, productVersion: product });
    }
    return Response.json({ fileDeletion: "trash" });
  });
  const registry = createHostRegistry([]);
  registry.add("remote", "https://remote.example");
  await assert.rejects(registry.get("remote").client.request("/api/document"), /not connected/);
  await registry.connect("remote", "client");
  assert.match(registry.get("remote").warning!, /different/);
  offline = true; await registry.connect("remote", "client");
  assert.equal(registry.get("remote").state, "disconnected");
  assert.equal(registry.get("remote").failure, "unreachable");
  offline = false; protocol = "other";
  await registry.connect("remote");
  assert.match(registry.get("remote").reason!, /protocol mismatch/);
  assert.equal(registry.get("remote").failure, "protocol-mismatch");
  protocol = "4"; product = "client";
  await registry.connect("remote", "client");
  assert.equal(registry.get("remote").state, "connected");
  assert.equal(registry.get("remote").warning, undefined);
  const client = registry.get("remote").client;
  registry.remove("remote");
  await assert.rejects(client.request("/api/document"), /not connected/);
  assert.ok(calls.every(url => !url.includes("stop") && !url.includes("document")));
});

test("registered monitor automatically connects and reconnects using only reads, and stops its timers", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let offline = true, probes = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (String(url).endsWith("/daemon/health")) {
      probes++;
      if (offline) throw new Error("offline");
      return Response.json({ protocolVersion: "4", productVersion: "client" });
    }
    return Response.json({ fileDeletion: "trash" });
  });
  const stop = monitorDesktopHosts([{ hostId: "auto-test", origin: "https://auto.example" }], "client");
  t.after(() => { stop(); hostRegistry.remove("auto-test"); });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(hostRegistry.get("auto-test").state, "disconnected");
  offline = false; t.mock.timers.tick(5000);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(hostRegistry.get("auto-test").state, "connected");
  stop(); const before = probes;
  t.mock.timers.tick(10000);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(probes, before);
});

test("registered Host metadata and observation changes publish to shell subscribers", async t => {
  const registry = createHostRegistry([{ hostId: "local", origin: "/", label: "Local" }]);
  let observed = registry.snapshot();
  const stop = registry.subscribe(() => { observed = registry.snapshot(); });
  t.after(stop);
  registry.add("remote", "https://remote.example", "Remote");
  assert.ok(observed > 0);
  assert.equal(registry.list().find(host => host.hostId === "remote")?.label, "Remote");
  const beforeRename = observed;
  registry.add("remote", "https://remote.example", "Renamed");
  assert.ok(observed > beforeRename);
  assert.equal(registry.list().find(host => host.hostId === "remote")?.label, "Renamed");
  assert.throws(() => registry.add("remote", "https://other.example", "Changed"), /origin cannot change/);
  registry.remove("remote");
  assert.ok(!registry.list().some(host => host.hostId === "remote"));
});

test("Desktop observes the local Host without remote registrations and recovers a failed startup observation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const previous = hostRegistry;
  const registry = createHostRegistry([{ hostId: "local", origin: "http://local.example" }]);
  setHostRegistry(registry);
  const status = () => renderToStaticMarkup(createElement(HostStatus, { runtime: registry.get("local"), showDetails: false }));
  let firstCapability = true, offline = false;
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(String(url));
    if (offline) throw new TypeError("fetch failed");
    if (url.endsWith("/daemon/health")) return Response.json({ protocolVersion: "4", productVersion: "client" });
    if (url.endsWith("/api/host-capabilities")) {
      if (firstCapability) { firstCapability = false; throw new TypeError("startup socket error"); }
      return Response.json({ fileDeletion: "trash", identity: { runAs: "local-user" } });
    }
    return Response.json({ source: "Document work is available" });
  });
  t.after(() => setHostRegistry(previous));
  await registry.connect("local");
  assert.equal(registry.get("local").state, "disconnected");
  assert.equal(registry.get("local").reason, "startup socket error");
  assert.ok(status().includes(i18n.t("Unreachable")));
  assert.equal((await (await registry.get("local").client.request("/api/document")).json()).source, "Document work is available");
  const stop = monitorDesktopHosts([], "client");
  t.after(stop);
  const settled = () => new Promise<void>(resolve => setImmediate(resolve));
  await settled();
  assert.equal(registry.get("local").state, "connected");
  assert.deepEqual(registry.get("local").identity, { runAs: "local-user" });
  assert.equal(registry.get("local").reason, undefined);
  assert.ok(status().includes(i18n.t("Connected")));
  offline = true; t.mock.timers.tick(5000); await settled();
  assert.equal(registry.get("local").state, "disconnected", "a real loss is reported on the next check without a grace period");
  assert.equal(registry.get("local").reason, "fetch failed");
  assert.ok(status().includes(i18n.t("Unreachable")));
  offline = false; t.mock.timers.tick(5000); await settled();
  assert.equal(registry.get("local").state, "connected");
  stop(); const before = requests.length;
  t.mock.timers.tick(10000); await settled();
  assert.equal(requests.length, before);
  assert.ok(requests.every(url => !url.includes("stop")), "observation never starts or stops a daemon");
});
