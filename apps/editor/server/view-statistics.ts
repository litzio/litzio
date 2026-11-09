import fs from "node:fs";
import path from "node:path";
import { getEditableDocument, hasNativeMarker, parse } from "@litzio/core";
import { VIEW_LIMITS, type StatisticsRow } from "@litzio/core/views";
import { decodeUtf8 } from "@litzio/file-commit";
import { accessPath, RootAccess, type FileAccess } from "./file-access.ts";

// An app-owned built-in source; this is not a plugin SDK folder-scope extension.
export const STATISTICS_PLUGIN_ID = "litzio.statistics";
export const STATISTICS_LIMITS = { files: 1000, fileBytes: 1048576, entries: 5000, depth: 16, favourites: 200 };

export function folderStatistics(root: string, folder: string | undefined, access: FileAccess): StatisticsRow[] {
  root = fs.realpathSync(accessPath(root, access));
  const boundary = new RootAccess([root]);
  const selected = accessPath(path.resolve(root, folder ?? "."), boundary);
  let files = 0, entries = 0;
  const rows: StatisticsRow[] = [];
  function walk(directory: string, depth: number): void {
    if (depth > STATISTICS_LIMITS.depth) throw new Error("Statistics depth limit exceeded");
    const row: StatisticsRow = { folder: path.relative(root, directory).split(path.sep).join("/") || ".", documents: 0, headings: 0, modified: null };
    const children: string[] = [];
    // Every directory gets a row, including empty folders; only native .md documents count.
    for (const entry of fs.readdirSync(accessPath(directory, boundary), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (++entries > STATISTICS_LIMITS.entries) throw new Error("Statistics entry limit exceeded");
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const file = accessPath(path.join(directory, entry.name), boundary);
      if (entry.isDirectory()) { children.push(file); continue; }
      if (!entry.isFile() || path.extname(file).toLowerCase() !== ".md") continue;
      if (++files > STATISTICS_LIMITS.files) throw new Error("Statistics file count limit exceeded");
      const info = fs.statSync(file);
      if (info.size > STATISTICS_LIMITS.fileBytes) throw new Error("Statistics document size limit exceeded");
      const bytes = fs.readFileSync(accessPath(file, boundary));
      if (bytes.length > STATISTICS_LIMITS.fileBytes) throw new Error("Statistics document size limit exceeded");
      const source = decodeUtf8(bytes);
      if (!hasNativeMarker(source)) continue;
      const document = getEditableDocument(parse(source));
      row.documents++;
      row.headings += document.blocks.filter(block => block.block === "heading").length;
      const modified = info.mtime.toISOString();
      if (row.modified === null || modified > row.modified) row.modified = modified;
    }
    rows.push(row);
    if (rows.length > VIEW_LIMITS.rows) throw new Error("Statistics row limit exceeded");
    for (const child of children) walk(child, depth + 1);
  }
  walk(selected, 0);
  return rows;
}
