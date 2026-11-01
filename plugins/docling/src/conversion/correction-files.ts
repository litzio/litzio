import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { convertWithDoclingCorrections, emptyCorrections, readDoclingCorrections, type DoclingCorrection, type DoclingCorrections } from "./corrections.ts";
import { loadDoclingImages } from "./files.ts";
import { sha256 } from "../shared/map.ts";
import type { Conversion } from "./convert.ts";

type Options = { resolveSource?: (file: string) => string; beforePublish?: () => void };
const read = (file: string): string => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(file));

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

function regenerate(folder: string, update: (record: DoclingCorrections) => void, options: Options): Conversion {
  folder = realpathSync(folder);
  const parent = path.dirname(folder), base = path.basename(folder);
  if (parent === folder) throw new Error("Choose a conversion folder, not a filesystem root");
  const lock = path.join(parent, `.${base}.corrections.lock`);
  try { mkdirSync(lock); } catch (cause) { throw new Error("Conversion folder is already being updated (corrections lock)", { cause }); }
  let staging: string | undefined, backup: string | undefined, published = false;
  try {
    const before = revision(folder), record = readFolderCorrections(folder);
    update(record);
    readDoclingCorrections(JSON.stringify(record));
    const sourcePath = path.resolve(folder, record.source.file);
    const input = options.resolveSource?.(sourcePath) ?? realpathSync(sourcePath), source = read(input);
    const { images, assets } = loadDoclingImages(input, source, path.dirname(input) === folder);
    const result = convertWithDoclingCorrections(source, record, { images });
    // Publish a complete sibling generation. Two directory renames can briefly
    // make the path absent, but never expose a mixed Markdown/map/ledger pair.
    staging = mkdtempSync(path.join(parent, `.${base}.corrections-`));
    cpSync(folder, staging, { recursive: true, preserveTimestamps: true });
    for (const [name, bytes] of assets) {
      const file = path.join(staging, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
    }
    writeFileSync(path.join(staging, "document.md"), result.markdown, "utf8");
    writeFileSync(path.join(staging, "document.docling-map.json"), JSON.stringify(result.map, null, 2) + "\n", "utf8");
    writeFileSync(path.join(staging, "corrections.json"), JSON.stringify(record, null, 2) + "\n", "utf8");
    options.beforePublish?.();
    if (revision(folder) !== before || sha256(read(input)) !== record.source.sha256) throw new Error("Conversion source/folder changed after it was read; nothing was written");
    backup = path.join(parent, `.${base}.previous-${randomUUID()}`);
    renameSync(folder, backup);
    try { renameSync(staging, folder); staging = undefined; published = true; }
    catch (cause) {
      try { renameSync(backup, folder); backup = undefined; }
      catch (rollback) { throw new Error(`Could not restore conversion folder; complete previous generation retained at ${backup}`, { cause: new AggregateError([cause, rollback]) }); }
      throw cause;
    }
    return result;
  } finally {
    // Never remove a backup if restoring the public path failed.
    if (backup && published) rmSync(backup, { recursive: true, force: true });
    if (staging) rmSync(staging, { recursive: true, force: true });
    rmSync(lock, { recursive: true, force: true });
  }
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
