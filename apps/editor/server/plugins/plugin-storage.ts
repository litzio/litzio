import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { commitFile, createFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import {
  PLUGIN_STORAGE_LIMITS as limits, PluginPublicError, preparePluginStorageValue, validatePluginStorageKey, type JsonValue,
} from "@litzio/plugin-sdk";

type Entries = Record<string, JsonValue>;

const corrupt = () => new PluginPublicError("storage_corrupt", "Plugin storage is damaged. Inspect the original file or explicitly clear storage.");
const limit = (name: string, actual: number, maximum: number, unit: string) =>
  new PluginPublicError("storage_limit", `Storage ${name} is ${actual}${unit}. The limit is ${maximum}${unit}.`);

export class PluginStorageStore {
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor(private readonly directory: string) {}

  run(id: string, action: unknown, key?: unknown, value?: unknown): Promise<unknown> {
    const previous = this.pending.get(id) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(() => {
      try { return this.execute(id, action, key, value); }
      catch (error) {
        if (error instanceof PluginPublicError) throw error;
        throw new PluginPublicError("storage_io", "Plugin storage could not be accessed. Check the Host data folder.");
      }
    });
    this.pending.set(id, run);
    return run.finally(() => {
      if (this.pending.get(id) === run) this.pending.delete(id);
    });
  }

  private read(file: string, size: number | undefined): { entries: Entries; revision?: string } {
    const entries: Entries = Object.create(null);
    if (size === undefined) return { entries };
    if (size > limits.totalBytes) throw limit("total size", size, limits.totalBytes, " bytes");
    const bytes = fs.readFileSync(file);
    if (bytes.length > limits.totalBytes) throw limit("total size", bytes.length, limits.totalBytes, " bytes");
    let text: string;
    try {
      text = decodeUtf8(bytes);
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw corrupt();
      const keys = Object.keys(parsed);
      if (keys.length > limits.keys) throw limit("key count", keys.length, limits.keys, "");
      for (const key of keys) {
        validatePluginStorageKey(key);
        entries[key] = preparePluginStorageValue(parsed[key]);
      }
    } catch (error) {
      if (error instanceof PluginPublicError && error.code === "storage_limit") throw error;
      throw corrupt();
    }
    return { entries, revision: textRevision(text) };
  }

  private execute(id: string, action: unknown, key: unknown, value: unknown) {
    const file = path.join(this.directory, createHash("sha256").update(id).digest("hex") + ".json");
    const directory = fs.lstatSync(this.directory, { throwIfNoEntry: false });
    if (directory && !directory.isDirectory()) throw corrupt();
    const info = fs.lstatSync(file, { throwIfNoEntry: false });
    if (info && !info.isFile()) throw corrupt();
    if (action === "clear") {
      if (info) fs.unlinkSync(file);
      return;
    }
    const { entries, revision } = this.read(file, info?.size);
    if (action === "show") return entries;
    validatePluginStorageKey(key);
    if (action === "get") return entries[key];
    if (action === "delete") {
      if (!Object.hasOwn(entries, key)) return;
      delete entries[key];
    } else if (action === "set") {
      entries[key] = preparePluginStorageValue(value);
    } else {
      throw new PluginPublicError("storage_invalid_action", "Storage action must be get, set or delete.");
    }
    const count = Object.keys(entries).length;
    if (count > limits.keys) throw limit("key count", count, limits.keys, "");
    const text = JSON.stringify(entries);
    const size = Buffer.byteLength(text);
    if (size > limits.totalBytes) throw limit("total size", size, limits.totalBytes, " bytes");
    if (revision === undefined) {
      fs.mkdirSync(this.directory, { recursive: true });
      createFile(file, text);
    } else {
      commitFile(file, text, revision);
    }
  }
}
