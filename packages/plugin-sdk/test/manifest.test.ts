import test from "node:test";
import assert from "node:assert/strict";
import { validateManifest, compileSchema } from "../src/index.ts";
const manifest = () => ({ schemaVersion: 1, id: "example.demo", tier: "community", publisher: { id: "example", name: "Example" }, name: "Demo", version: "0.1.0", requiresSdk: "^0.1.0", entry: "host.js", contributes: {} });
test("manifest rejects unsupported extensions, invalid identities, versions and unknown declarations before execution", () => {
  assert.equal(validateManifest(manifest()).id, "example.demo");
  for (const change of [{ settingsSchema: { type: "invalid" } }, { id: "../escape" }, { requiresSdk: "^2.0.0" }, { version: "bad" }, { entry: "../host.js" }, { contributes: { surprise: [] } }, { contributes: { dataViews: [{ id: "table", operation: "read", version: 1 }] } }, { contributes: { generatedUi: [{ id: "ui", catalog: "table", schemaVersion: 1 }] } }, { contributes: { views: [{ id: "saved", definition: "view.json" }] } }, { contributes: { secretUses: [{ operation: "read", secret: "token" }] } }]) assert.throws(() => validateManifest({ ...manifest(), ...change }));
  assert.throws(() => compileSchema({ $ref: "https://example.test/schema" }));
  assert.throws(() => compileSchema({ type: "not-a-type" }));
});

test("declared secrets accept unique identifiers only", () => {
 const secret = { id: "token", scope: "connection", required: true };
 assert.equal(validateManifest({ ...manifest(), secrets: [secret] }).secrets.length, 1);
 assert.throws(() => validateManifest({ ...manifest(), secrets: [secret, secret] }));
});

test("read operation row schema is normalized and rejects invalid declarations", () => {
  const operation = { id: "read", version: 1, effect: "read", scope: "host", inputSchema: { type: "object" }, outputSchema: { type: "array", items: { type: "object" } }, rowSchema: { points: { type: "number", label: "Points" } } };
  const withOperation = (op: unknown) => ({ ...manifest(), contributes: { operations: [op] } });
  assert.equal(validateManifest(withOperation(operation)).contributes.operations[0]!.rowSchema!.points.secret, false);
  assert.throws(() => validateManifest(withOperation({ ...operation, effect: "write" })));
  for (const name of ["group", "value", "a".repeat(81)]) assert.throws(() => validateManifest(withOperation({ ...operation, rowSchema: { [name]: { type: "number", label: "Points" } } })));
  assert.ok(validateManifest(withOperation({ ...operation, rowSchema: { ["a".repeat(80)]: { type: "number", label: "Points" } } })));

  assert.throws(() => validateManifest(withOperation({ ...operation, rowSchema: { points: { type: "number", label: "Points", date: true } } })));
});
