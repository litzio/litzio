import { z } from "zod";
// Snapshot-local Core read-model path; never a DOM node or ProseMirror position.
const opaque = z.string().min(1).max(512).regex(/^[a-zA-Z0-9_.-]+$/, "Opaque Host reference required");
export const documentTargetRefSchema = z.strictObject({ path: z.array(z.number().int().nonnegative()), documentRevision: opaque, documentHash: opaque });
export type DocumentTargetRef = z.infer<typeof documentTargetRefSchema>;
