import fs from "node:fs";
import { createHash } from "node:crypto";
import { accessPath, type FileAccess } from "./file-access.ts";

/** Read-only byte revisions, without parsing documents or retaining Host sessions. */
export function documentRevisions(paths: string[], access: FileAccess): { path: string; revision: string | null }[] {
  return [...new Set(paths)].map(path => {
    const target = accessPath(path, access, true);
    try {
      return { path, revision: createHash("sha256").update(fs.readFileSync(target)).digest("hex") };
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return { path, revision: null };
      throw error;
    }
  });
}
