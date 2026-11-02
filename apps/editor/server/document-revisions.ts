import fs from "node:fs";
import { createHash } from "node:crypto";
import { accessPath, FileAccessError, type FileAccess } from "./file-access.ts";

/** Read-only byte revisions, without parsing documents or retaining Host sessions. */
export function documentRevisions(paths: string[], access: FileAccess): { path: string; revision: string | null }[] {
  return [...new Set(paths)].map(path => {
    try {
      const target = accessPath(path, access, true);
      return { path, revision: createHash("sha256").update(fs.readFileSync(target)).digest("hex") };
    } catch (error) {
      // Policy/locator refusals still fail the request; filesystem failures belong to one item.
      if (error instanceof FileAccessError || !(error as NodeJS.ErrnoException).code) throw error;
      return { path, revision: null };
    }
  });
}
