import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { convertWithDoclingCorrections, emptyCorrections, readDoclingCorrections, type DoclingCorrection, type DoclingCorrections } from "./corrections.ts";
import { loadDoclingImages } from "./files.ts";
import { sha256 } from "../shared/map.ts";
import type { Conversion } from "./convert.ts";

type Options = { resolveSource?: (file: string) => string; beforePublish?: () => void; updateFiles?: (staging: string) => void };
const read = (file: string): string => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(file));
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);

/** Publication succeeded; callers must not treat cleanup failure as a rollback. */
export class PublishedCorrectionCleanupError extends AggregateError {}

/** Optimistic revision of the complete folder, including user files and source images. */
function revision(folder: string): string {
  const files: unknown[] = [];
  function walk(relative: string): void {
    const absolute = path.join(folder, relative), stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error(`Conversion folder contains a nonregular file: ${relative}`);
    files.push([relative, stat.mode, stat.isFile() ? sha256(readFileSync(absolute)) : null]);
    if (stat.isDirectory()) for (const name of readdirSync(absolute).sort()) walk(path.join(relative, name));
  }
  walk(""); return sha256(JSON.stringify(files));
}

/** Read the one ledger. Saved PDF bundles can start with an implicit empty ledger. */
export function readFolderCorrections(folder: string): DoclingCorrections {
  const file = path.join(folder, "corrections.json");
  const ledger = existsSync(file) ? readDoclingCorrections(read(file)) : emptyCorrections("document.json", read(path.join(folder, "document.json")));
  const map = JSON.parse(read(path.join(folder, "document.docling-map.json")));
  if (map.format !== "litzio-docling-map" || map.version !== 1 || map.source?.sha256 !== ledger.source.sha256) throw new Error("Docling correction source SHA-256 mismatch");
  return ledger;
}

/** Shared complete-generation publication for corrections and their review state. */
export function updateConversionFolder(folder: string, prepare: () => (staging: string) => void, beforePublish?: () => void): void {
  // Native Windows resolution expands 8.3 aliases before naming the public
  // generation and its shared lock. JS realpath can retain the short spelling.
  folder = realpathSync.native(folder);
  const parent = path.dirname(folder), base = path.basename(folder);
  if (parent === folder) throw new Error("Choose a conversion folder, not a filesystem root");
  const lock = path.join(parent, `.${base}.corrections.lock`);
  try { mkdirSync(lock); } catch (cause) { throw new Error("Conversion folder is already being updated (corrections lock)", { cause }); }
  let staging: string | undefined, backup: string | undefined, published = false;
  let failed = false, failure: unknown;
  try {
    const before = revision(folder), write = prepare();
    // Publish a complete sibling generation. Two directory renames can briefly
    // make the path absent, but never expose a mixed Markdown/map/ledger pair.
    staging = mkdtempSync(path.join(parent, `.${base}.corrections-`));
    cpSync(folder, staging, { recursive: true, preserveTimestamps: true });
    write(staging);
    beforePublish?.();
    if (revision(folder) !== before) throw new Error("Conversion source/folder changed after it was read; nothing was written");
    backup = path.join(parent, `.${base}.previous-${randomUUID()}`);
    renameSync(folder, backup);
    try { renameSync(staging, folder); staging = undefined; published = true; }
    catch (cause) {
      try { renameSync(backup, folder); backup = undefined; }
      catch (rollback) { throw new Error(`Could not restore conversion folder; publication failed: ${message(cause)}; rollback failed: ${message(rollback)}; complete previous generation retained at ${backup}`, { cause: new AggregateError([cause, rollback]) }); }
      throw cause;
    }
  } catch (error) {
    failed = true; failure = error; throw error;
  } finally {
    const cleanupErrors: Error[] = [];
    // A failed sibling deletion must not skip releasing our lock. Never delete
    // the retained previous generation when restoring the public path failed.
    for (const [kind, target] of [["backup", published ? backup : undefined], ["staging", staging], ["lock", lock]] as const) {
      if (!target) continue;
      try { rmSync(target, { recursive: true, force: true }); }
      catch (cause) { cleanupErrors.push(new Error(`Could not remove correction ${kind} at ${target}: ${message(cause)}`, { cause })); }
    }
    if (cleanupErrors.length) {
      const outcome = failed ? message(failure) : "Correction result was published";
      const CleanupError = failed ? AggregateError : PublishedCorrectionCleanupError;
      throw new CleanupError(failed ? [failure, ...cleanupErrors] : cleanupErrors,
        `${outcome}; cleanup failed: ${cleanupErrors.map(error => error.message).join("; ")}`, { cause: failure });
    }
  }
}

function regenerate(folder: string, update: (record: DoclingCorrections) => void, options: Options): Conversion {
  folder = realpathSync.native(folder);
  let result: Conversion, input: string, record: DoclingCorrections;
  updateConversionFolder(folder, () => {
    record = readFolderCorrections(folder);
    update(record);
    readDoclingCorrections(JSON.stringify(record));
    const sourcePath = path.resolve(folder, record.source.file);
    input = realpathSync.native(options.resolveSource?.(sourcePath) ?? sourcePath);
    const source = read(input);
    const { images, assets } = loadDoclingImages(input, source, path.dirname(input) === folder);
    result = convertWithDoclingCorrections(source, record, { images });
    return staging => {
      for (const [name, bytes] of assets) {
        const file = path.join(staging, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
      }
      writeFileSync(path.join(staging, "document.md"), result.markdown, "utf8");
      writeFileSync(path.join(staging, "document.docling-map.json"), JSON.stringify(result.map, null, 2) + "\n", "utf8");
      writeFileSync(path.join(staging, "corrections.json"), JSON.stringify(record, null, 2) + "\n", "utf8");
      options.updateFiles?.(staging);
    };
  }, () => {
    options.beforePublish?.();
    if (sha256(read(input)) !== record.source.sha256) throw new Error("Conversion source/folder changed after it was read; nothing was written");
  });
  return result!;
}

export function applyDoclingCorrections(folder: string, options: Options = {}): Conversion {
  return regenerate(folder, () => {}, options);
}
export function addDoclingCorrection(folder: string, entry: DoclingCorrection, options: Options = {}): Conversion {
  return regenerate(folder, record => { record.entries.push(entry); }, options);
}
export function removeDoclingCorrection(folder: string, id: string, options: Options = {}): Conversion {
  return regenerate(folder, record => {
    const index = record.entries.findIndex(entry => entry.id === id);
    if (index < 0) throw new Error(`Correction does not exist: ${id}`);
    record.entries.splice(index, 1);
  }, options);
}
