import test from "node:test";
import assert from "node:assert/strict";
import { validateManifest, compileSchema } from "../src/index.ts";
const manifest = () => ({ schemaVersion: 1, id: "example.demo", tier: "community", publisher: { id: "example", name: "Example" }, name: "Demo", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: {} });
test("manifest rejects unsupported extensions, invalid identities, versions and unknown declarations before execution", () => {
  assert.equal(validateManifest(manifest()).id, "example.demo");
  for (const change of [{ id: "../escape" }, { requiresSdk: "^2.0.0" }, { version: "bad" }, { entry: "../host.js" }, { contributes: { surprise: [] } }, { contributes: { dataViews: [{ id: "table", operation: "read", version: 1 }] } }, { contributes: { generatedUi: [{ id: "ui", catalog: "table", schemaVersion: 1 }] } }, { contributes: { views: [{ id: "saved", definition: "view.json" }] } }, { secrets: [{ id: "token", scope: "connection", required: true }] }, { contributes: { secretUses: [{ operation: "read", secret: "token" }] } }]) assert.throws(() => validateManifest({ ...manifest(), ...change }));
  assert.throws(() => compileSchema({ $ref: "https://example.test/schema" }));
  assert.throws(() => compileSchema({ type: "not-a-type" }));
});
