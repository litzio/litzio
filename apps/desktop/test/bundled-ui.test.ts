import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bundledUiResponse } from "../src/bundled-ui.ts";

test("bundled origin serves only app files; CSP permits Host data and blob plugin modules", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "litzio-bundle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ui = path.join(root, "ui"); mkdirSync(ui);
  writeFileSync(path.join(ui, "index.html"), "<title>App</title>");
  writeFileSync(path.join(root, "private.txt"), "private");
  const respond = (url: string, method = "GET") => bundledUiResponse(ui, new Request(url, { method }), "http://127.0.0.1:23456", ["https://remote.example:8443"]);
  const page = respond("litzio://app/index.html");
  assert.equal(await page.text(), "<title>App</title>");
  const csp = page.headers.get("content-security-policy")!;
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:23456/);
  assert.match(csp, /img-src 'self' data: blob: http:\/\/127\.0\.0\.1:23456/);
  assert.match(csp, /connect-src[^;]* https:\/\/remote\.example:8443;/);
  assert.match(csp, /img-src[^;]* https:\/\/remote\.example:8443;/);
  assert.doesNotMatch(csp, /https:\/\/unregistered/);
  assert.throws(() => bundledUiResponse(ui, new Request("litzio://app/"), "http://127.0.0.1:23456", ["https://*.example"]));
  assert.match(csp, /script-src 'self' blob:;/);
  assert.match(csp, /frame-src 'none'/);
  assert.equal(respond("litzio://foreign/index.html").status, 403);
  assert.equal(respond("litzio://app/index.html", "POST").status, 405);
  assert.equal(await respond("litzio://app/index.html", "HEAD").text(), "");
  for (const file of ["api/document", "document/private.svg", "..%2fprivate.txt"]) {
    assert.equal(respond(`litzio://app/${file}`).status, 404);
  }
});
