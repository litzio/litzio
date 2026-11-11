import fs from "node:fs";
import { getEditableDocument, parse } from "@litzio/core";
import { figureMediaPath } from "../shared/figure-media-path.ts";
import { resolveMediaPath } from "./document-path.ts";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

/** Asset availability is separate from canonical document validity. Never copies files. */
export function figureReadiness(source: string, file: string, access: FileAccess = LOCAL_FILE_ACCESS) {
  return getEditableDocument(parse(source)).blocks.flatMap(block => {
    if (block.block !== "figure") return [];
    const base = { path: block.path, label: block.label, source: block.imageUrl };
    if (block.contentKind !== "image") return [{ ...base, status: block.contentKind === "none" ? "pending" : "embedded" }];
    const media = figureMediaPath(block.imageUrl);
    if (media === undefined) return [{ ...base, status: "unchecked" }];
    let resolved: string;
    // The destination document may not exist yet. The caller checks its write scope;
    // resolveMediaPath checks the document-directory boundary, then check asset access.
    try { resolved = accessPath(resolveMediaPath(media, file), access, true); }
    catch { return [{ ...base, status: "unavailable" }]; }
    try { if (fs.statSync(resolved).isFile()) return [{ ...base, status: "available" }]; }
    catch { /* Same warning-only stat contract as CLI check. */ }
    return [{ ...base, status: "missing_or_unreadable" }];
  });
}
