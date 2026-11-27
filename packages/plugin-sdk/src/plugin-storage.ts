import { PluginPublicError } from "./public-error.ts";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface PluginStorage {
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
}

/** @internal Shared by the screen, child process and Host. */
export const PLUGIN_STORAGE_LIMITS = { keys: 128, keyBytes: 128, valueBytes: 64 * 1024, totalBytes: 1024 * 1024 } as const;

const bytes = (text: string) => new TextEncoder().encode(text).length;
const invalidValue = () => new PluginPublicError("storage_invalid_value", "Storage requires a JSON value with finite numbers, dense arrays and plain objects.");

/** @internal Validate before JSON transport can coerce a value. */
export function validatePluginStorageKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || key.length === 0) {
    throw new PluginPublicError("storage_invalid_key", "Storage keys must be non-empty strings.");
  }
  const size = bytes(key);
  if (size > PLUGIN_STORAGE_LIMITS.keyBytes) {
    throw new PluginPublicError("storage_limit", `Storage key size is ${size} bytes. The limit is ${PLUGIN_STORAGE_LIMITS.keyBytes} bytes.`);
  }
}

/** @internal Snapshot the value before transport and check its serialized size. */
export function preparePluginStorageValue(input: unknown): JsonValue {
  const ancestors = new Set<object>();
  const copy = (value: unknown): JsonValue => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || ancestors.has(value)) throw invalidValue();
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (Reflect.ownKeys(value).length !== value.length + 1) throw invalidValue();
        const items: JsonValue[] = [];
        for (let index = 0; index < value.length; index++) {
          const item = Object.getOwnPropertyDescriptor(value, index);
          if (!item?.enumerable || !("value" in item)) throw invalidValue();
          items.push(copy(item.value));
        }
        return items;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw invalidValue();
      const entries: [string, JsonValue][] = [];
      for (const key of Reflect.ownKeys(value)) {
        const entry = Object.getOwnPropertyDescriptor(value, key);
        if (typeof key !== "string" || !entry?.enumerable || !("value" in entry)) throw invalidValue();
        entries.push([key, copy(entry.value)]);
      }
      return Object.fromEntries(entries);
    } finally {
      ancestors.delete(value);
    }
  };
  let value: JsonValue;
  let size: number;
  try {
    value = copy(input);
    size = bytes(JSON.stringify(value));
  } catch {
    throw invalidValue();
  }
  if (size > PLUGIN_STORAGE_LIMITS.valueBytes) {
    throw new PluginPublicError("storage_limit", `Storage value size is ${size} bytes. The limit is ${PLUGIN_STORAGE_LIMITS.valueBytes} bytes.`);
  }
  return value;
}
