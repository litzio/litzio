import { NativeDocumentError, writeIssueOf, type LocalWriteKind } from "@litzio/core";
import type { SaveRequest, SaveResponse } from "../shared/document-protocol.ts";
import { SaveContentError, type SaveFailure } from "../shared/save-error.ts";
import type { readModel } from "./document-replay.ts";
import { DocumentConflictError } from "./document-save-compute.ts";

export type DocumentReadModel = ReturnType<typeof readModel>;
export type SaveWork = { kind: "save"; path: string; disk: string; request: Omit<SaveRequest, "describe">; local?: boolean;
  /** Reply with the changed blocks' inspect nodes (SaveRequest.describe). */
  describe?: true };
export type DocumentWork =
  | { kind: "open"; path: string; source: string }
  | { kind: "bibliography"; path: string; source: string }
  | { kind: "check-text"; source: string }
  | SaveWork
  | { kind: "verify-local-write"; save: SaveWork; expected: string };

export type DocumentResults = {
  open: DocumentReadModel | undefined;
  bibliography: string[];
  "check-text": boolean;
  save: SaveResponse & { markdown: string; localWrite?: { kind: LocalWriteKind; blockCount: number; path: readonly number[] }; fallback?: string };
  "verify-local-write": { outcome: "equal" } | { outcome: "different"; markdown: string; revision: string }
    | ({ outcome: "rejected" } & Pick<Extract<Diagnostic, { kind: "save" }>, "reason" | "failure">);
};

type Diagnostic =
  | { kind: "conflict" }
  | { kind: "native"; code: NativeDocumentError["code"]; issue: ReturnType<typeof writeIssueOf> }
  | { kind: "save"; reason: string; failure: SaveFailure }
  | { kind: "error"; message: string };

export type DocumentWorkReply = { result: DocumentResults[keyof DocumentResults] } | { error: Diagnostic; fallback?: string };

export function documentDiagnostic(error: unknown): Diagnostic {
  if (error instanceof DocumentConflictError) return { kind: "conflict" };
  if (error instanceof NativeDocumentError) return { kind: "native", code: error.code, issue: writeIssueOf(error) };
  if (error instanceof SaveContentError) {
    return { kind: "save", ...saveDiagnostic(error) };
  }
  return { kind: "error", message: error instanceof Error ? error.message : String(error) };
}

export function saveDiagnostic({ reason, code, phase, action, target, block, cell, line }: SaveContentError) {
  return { reason, failure: { code, phase, action, target, block, cell, line } };
}

export function documentWorkError(diagnostic: Diagnostic): Error {
  switch (diagnostic.kind) {
    case "conflict": return new DocumentConflictError();
    case "native": {
      const { reason, path, line } = diagnostic.issue;
      return new NativeDocumentError(diagnostic.code, reason, path && [...path], line);
    }
    case "save": return new SaveContentError(diagnostic.reason, diagnostic.failure.target, diagnostic.failure);
    case "error": return new Error(diagnostic.message);
  }
}
