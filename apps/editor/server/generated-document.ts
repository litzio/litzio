import { readFileSync, statSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { generatedDocumentLinkSchema } from "@litzio/plugin-sdk";
import { accessPath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { hostPaths } from "./host-paths.ts";

/** Logical document identity is its canonical Host path; atomic Saves retain that identity. */
export function generatedDocumentIdentity(file: string) {
  const canonical = path.join(realpathSync(path.dirname(file)), path.basename(file));
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}
export function generatedDocumentLinkPath(file: string) {
  return path.join(hostPaths().settingsFile("generated-documents") + ".d", createHash("sha256").update(generatedDocumentIdentity(file)).digest("hex") + ".json");
}
export { GENERATED_DOCUMENT_WARNING } from "../shared/generated-document.ts";
/** No filename inference about the source format. Missing links mean ordinary editing. */
export function isManagedGeneratedDocument(file: string, access: FileAccess = LOCAL_FILE_ACCESS): boolean {
  try {
    file = accessPath(file, access);
    const link = generatedDocumentLinkPath(file);
    if (statSync(link).size > 16384) return true;
    generatedDocumentLinkSchema.parse(JSON.parse(readFileSync(link, "utf8")));
    return true;
  } catch (error) { return (error as NodeJS.ErrnoException).code !== "ENOENT"; }
}
