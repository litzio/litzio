import { readFileSync, statSync } from "node:fs";
import { documentReviewRecordSchema } from "@litzio/plugin-sdk";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";

/** Missing metadata is ordinary editing. Unreadable review metadata must not hide the warning. */
export function activeDocumentReview(file: string, access: FileAccess = LOCAL_FILE_ACCESS): boolean {
  try {
    const record = accessPath(file + ".review.json", access);
    if (statSync(record).size > 1024 ** 2) return true;
    documentReviewRecordSchema.parse(JSON.parse(readFileSync(record, "utf8")));
    return true;
  } catch (error) { return (error as NodeJS.ErrnoException).code !== "ENOENT"; }
}
