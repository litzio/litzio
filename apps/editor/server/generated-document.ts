import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { generatedDocumentLinkSchema } from "@litzio/plugin-sdk";
import { accessPath, canonicalFilePath, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { hostPaths } from "./host-paths.ts";

/** Host storage metadata, outside the portable plugin-owned source. */
export const storedGeneratedDocumentSchema = generatedDocumentLinkSchema.extend({ documentPath: generatedDocumentLinkSchema.shape.source });
export const generatedDocumentLinksDirectory = () => hostPaths().settingsFile("generated-documents") + ".d";

/** Logical document identity is its canonical Host path; atomic Saves retain that identity. */
export function generatedDocumentIdentity(file: string) {
  return canonicalFilePath(file, true);
}
export function generatedDocumentLinkPath(file: string) {
  return path.join(generatedDocumentLinksDirectory(), createHash("sha256").update(generatedDocumentIdentity(file)).digest("hex") + ".json");
}
export { GENERATED_DOCUMENT_WARNING } from "../shared/generated-document.ts";
/** No filename inference about the source format. Missing links mean ordinary editing. */
export function isManagedGeneratedDocument(file: string, access: FileAccess = LOCAL_FILE_ACCESS): boolean {
  try {
    file = accessPath(file, access);
    const link = generatedDocumentLinkPath(file);
    if (statSync(link).size > 16384) return true;
    storedGeneratedDocumentSchema.parse(JSON.parse(readFileSync(link, "utf8")));
    return true;
  } catch (error) { return (error as NodeJS.ErrnoException).code !== "ENOENT"; }
}
