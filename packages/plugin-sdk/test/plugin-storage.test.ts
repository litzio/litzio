import assert from "node:assert/strict";
import test from "node:test";
import { PluginPublicError, preparePluginStorageValue, validatePluginStorageKey } from "../src/index.ts";

test("plugin storage validates the original value before JSON transport can change it", () => {
  const cyclic = { self: {} };
  cyclic.self = cyclic;
  for (const value of [undefined, NaN, Infinity, 1n, new Date(), { field: undefined }, [, 1], cyclic]) {
    assert.throws(() => preparePluginStorageValue(value), { name: "PluginPublicError", code: "storage_invalid_value" });
  }
  const value = JSON.parse('{"__proto__":{"value":null},"items":[1,false,"한글"]}');
  const prepared = preparePluginStorageValue(value);
  assert.notEqual(prepared, value);
  assert.deepEqual(prepared, value);
});

test("plugin storage limits count encoded bytes and report size without value content", () => {
  validatePluginStorageKey("é".repeat(64));
  assert.throws(() => validatePluginStorageKey("é".repeat(65)), (error) =>
    error instanceof PluginPublicError && error.code === "storage_limit" && /130 bytes.*128 bytes/.test(error.message));
  const value = "é".repeat(32768);
  assert.throws(() => preparePluginStorageValue(value), (error) =>
    error instanceof PluginPublicError && error.code === "storage_limit" && /65538 bytes.*65536 bytes/.test(error.message) && !error.message.includes("é"));
});
