import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { test } from "node:test";
import { RemoteHostRegistry, remoteHostOrigin } from "../../../apps/editor/server/remote-host-registry.ts";
import { DAEMON_PROTOCOL } from "../../../apps/editor/server/daemon-protocol.ts";
import { runCliAsync } from "../src/cli.ts";

test("shared registry preserves identity, rejects invalid/duplicate origins and protects removal; CLI uses same store", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-host-registry-"));
  const previous = process.env.LITZIO_DATA_DIR;
  process.env.LITZIO_DATA_DIR = root;
  t.after(() => { if (previous === undefined) delete process.env.LITZIO_DATA_DIR; else process.env.LITZIO_DATA_DIR = previous; rmSync(root, { recursive: true, force: true }); });
  const registry = new RemoteHostRegistry();
  assert.deepEqual(registry.list(), []);
  const { host } = registry.register("https://EXAMPLE.com:443/", "Remote");
  assert.equal(host.origin, "https://example.com");
  assert.throws(() => registry.register("https://example.com", "Duplicate"), /already registered/);
  const original = readFileSync(registry.file, "utf8");
  for (const origin of ["https://x/path", "https://x/a/..", "https://u:p@x", "https://x?", "https://x#", "file:///tmp", "https://*.example.com", "https://x;script-src *", "https://x\\evil"]) assert.throws(() => remoteHostOrigin(origin));
  // Canonicalization must never turn accepted input into an unreadable registry or CSP wildcard.
  for (const origin of ["https://%2a.example.com", "https://%2A.example.com", "https://＊.example.com", "https://%EF%BC%8A.example.com", "https://x%3b.example.com"]) {
    assert.equal(await runCliAsync(["host", "register", origin, "Remote"]), 1, origin);
    assert.equal(readFileSync(registry.file, "utf8"), original);
    assert.deepEqual(registry.list(), [host]);
  }
  for (const origin of ["HTTPS://EXAMPLE.COM:443/", "https://%65xample.com", "https://ＥＸＡＭＰＬＥ.com"]) {
    assert.equal(remoteHostOrigin(origin), host.origin);
    assert.throws(() => registry.register(origin, "Duplicate"), /already registered/);
  }
  const idn = registry.register("https://BÜCHER.example:443/", "IDN").host;
  assert.equal(idn.origin, "https://xn--bcher-kva.example");
  for (const origin of ["https://xn--bcher-kva.example", "https://b%C3%BCcher.example"]) {
    assert.equal(remoteHostOrigin(origin), idn.origin);
    assert.throws(() => registry.register(origin, "Duplicate IDN"), /already registered/);
  }
  assert.deepEqual(registry.list(), [host, idn]);
  registry.remove(idn.hostId, () => ({ confirmed: true, workCleared: true, recoveryCleared: true }));
  assert.throws(() => registry.remove(host.hostId), /protection cannot be verified/);
  assert.equal(readFileSync(registry.file, "utf8"), original);
  assert.equal(await runCliAsync(["host", "rename", host.hostId, "New label"]), 0);
  assert.deepEqual(registry.get(host.hostId), { ...host, label: "New label" });
  assert.equal(await runCliAsync(["host", "remove", host.hostId]), 1);
  assert.equal(await runCliAsync(["host", "remove", host.hostId, "--confirm"]), 1);
  assert.equal(registry.list().length, 1);
  writeFileSync(registry.file + ".lock", "locked");
  assert.throws(() => registry.rename(host.hostId, "Lost update"), /EEXIST/);
  rmSync(registry.file + ".lock");
  assert.throws(() => registry.remove(host.hostId, () => ({ confirmed: true, workCleared: true, recoveryCleared: false })), /Removal refused/);
  registry.remove(host.hostId, () => ({ confirmed: true, workCleared: true, recoveryCleared: true }));
  assert.deepEqual(registry.list(), []);
});

test("registered health probe checks protocol, warns product difference, never follows redirects or controls daemon", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-host-probe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let protocol = DAEMON_PROTOCOL, status = 200;
  const server = createServer((req, res) => {
    assert.equal(req.method, "GET"); assert.equal(req.url, "/daemon/health");
    assert.equal(req.headers["x-litzio-protocol"], DAEMON_PROTOCOL);
    res.writeHead(status, { "Content-Type": "application/json", Location: "/unexpected" });
    res.end(JSON.stringify({ protocolVersion: protocol, productVersion: "different" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const registry = new RemoteHostRegistry(path.join(root, "hosts.json"));
  const address = server.address() as { port: number };
  const { host } = registry.register(`http://127.0.0.1:${address.port}`, "Remote");
  const result = await registry.status(host.hostId, "client");
  assert.equal(result.outcome, "success"); assert.ok("warning" in result); assert.equal(result.windowObserved, false);
  protocol = "incompatible"; assert.equal((await registry.status(host.hostId, "client")).state, "protocol-mismatch");
  status = 409; assert.equal((await registry.status(host.hostId, "client")).outcome, "refused");
  status = 302; assert.equal((await registry.status(host.hostId, "client")).outcome, "failure");
  await assert.rejects(registry.status("unknown", "client"), /Unknown/);
});
