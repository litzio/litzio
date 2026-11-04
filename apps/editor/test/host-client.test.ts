import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHostRegistry } from "../src/host-client.ts";
import { createDocumentRequests } from "../src/document-session.ts";
import { createAssetHost, chooseHostImage } from "../src/image-assets.ts";
import { createAssistantRequest } from "../src/assistant-api.ts";
import { createTemplateRequest } from "../src/template-api.ts";
import { resolveFigureSource } from "../src/node-views/figure-view.tsx";

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
      else if (req.url === "/api/host-capabilities") value = { fileDeletion: name === "a" ? "trash" : "permanent" };
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
  a.server.closeAllConnections(); await new Promise<void>(resolve => a.server.close(() => resolve()));
  await assert.rejects(createDocumentRequests(registry.get("a").client).requestSave({ kind: "text", path: "/same.md", revision: "a", source: "unsure" }), /may already have been saved/);
  await registry.connect("a");
  assert.equal(registry.get("a").state, "disconnected");
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
    return Promise.resolve(Response.json({ fileDeletion: "trash" }));
  });
  const module = await import(new URL("../src/host-client.ts?desktop-reconnect", import.meta.url).href);
  const client = module.getHostClient("local");
  const bootstrap = client.request("/initial"); await Promise.resolve();
  assert.equal(requests.length, 0);
  module.setDesktopHost("http://first"); await bootstrap;
  const saving = client.request("/save"); await Promise.resolve(); await Promise.resolve();
  module.setDesktopHost("http://second");
  await client.request("/next");
  finish!(Response.json({ revision: "first" })); await saving;
  assert.ok(requests.includes("http://first/initial"));
  assert.equal(requests.filter(url => url.endsWith("/save")).join(), "http://first/save");
  assert.ok(requests.includes("http://second/next"));
  assert.equal(client.url("/image"), "http://second/image");
});
