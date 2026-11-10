import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { authorDocument, parse, serialize, getEditableDocument } from "@litzio/core";
import { commitFileFromPath, textRevision } from "@litzio/file-commit";
import { REVIEW_AUTHORING_CONTRACT, JOB_FILE_MAX_BYTES, workspaceRequestSchema, workspaceStateSchema, type WorkspaceSnapshot } from "@litzio/plugin-sdk";
import { validatedAuthoringRequest } from "../document-authoring.ts";
import { readModel } from "../document-replay.ts";
import { RootAccess, accessPath, canonicalFilePath, type FileAccess } from "../file-access.ts";

type Provider = { operation: string; version: number; assertCurrent(): void };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const revision = (file: string) => { if (statSync(file).size > JOB_FILE_MAX_BYTES) throw new Error("Workspace exceeds Host limit"); return hash(readFileSync(file)); };

/** Source formats remain opaque. The Host owns canonical validation, admission and one-file commit. */
export class ReviewWorkspaces {
  private requests = new Map<string, unknown>();
  constructor(private access: FileAccess, private declaration: (plugin: string, job: string) => Provider,
    private invoke: (operation: string, input: unknown, version: number) => Promise<{ result?: unknown; error?: string }>,
    private busy: Set<string>) {}

  async execute(raw: unknown): Promise<any> {
    const input = workspaceRequestSchema.parse(raw);
    if (input.action === "workspace-status") return structuredClone(this.requests.get(input.requestId) ?? { state: "unknown", guidance: "Read the workspace; never automatically replay writes." });
    const root = accessPath(input.root, this.access), boundary = new RootAccess([root]);
    if (path.isAbsolute(input.workspace) || /^[a-z]:|^\\\\/i.test(input.workspace)) throw new Error("Expected a Root-relative workspace");
    const file = accessPath(boundary.resolve(path.join(root, input.workspace)), this.access), key = canonicalFilePath(file);
    const writing = input.action !== "workspace-read", requestId = "requestId" in input ? input.requestId : randomUUID();
    if (writing && this.requests.has(requestId)) throw new Error("Duplicate requestId; query status");
    if (this.busy.has(key)) throw new Error("Workspace operation in progress");
    this.busy.add(key);
    const receipt = (outcome: "success" | "failure" | "uncertain") => ({ requestId, operation: `review.${input.action}`, version: 1, scope: root, outcome });
    if (writing) this.requests.set(requestId, { state: "pending", receipt: receipt("uncertain") });
    let staging: string | undefined, publishing = false, saved = false;
    try {
      const provider = this.declaration(input.plugin, input.job), before = revision(file);
      const check = () => { provider.assertCurrent(); accessPath(boundary.resolve(file), this.access); if (revision(file) !== before) throw new Error("Workspace baseline conflict; read before writing"); };
      const call = async (mode: string, target = file, extra = {}) => {
        check();
        const response = await this.invoke(provider.operation, { mode, file: target, sourceRevision: revision(target), ...extra }, provider.version);
        check(); if (response.error) throw new Error("Workspace provider unavailable or rejected input");
        return response.result;
      };
      if (writing && input.baseline !== before) throw new Error("Workspace baseline conflict; read before writing");
      const original = workspaceStateSchema.parse(await call("workspace-read"));
      if (original.snapshot) {
        try { validateSnapshot(original.snapshot); }
        catch { original.snapshot = null; original.cacheState = "invalid"; }
      }
      const result = (state: typeof original, baseline: string, saved: boolean) => ({ ...state, baseline, workspace: { plugin: input.plugin, job: input.job, root, workspace: input.workspace },
        ...(state.snapshot ? { document: readModel(state.snapshot.source).document, documentRevision: state.snapshot.documentRevision, contentRevision: state.snapshot.contentRevision } : {}),
        completion: "not-evaluated", saved, receipt: receipt("success") });
      if (!writing || input.action === "workspace-open" && ["current", "created-version"].includes(original.cacheState)) {
        check(); const value = result(original, before, false); if (writing) this.requests.set(requestId, value); return value;
      }
      if (["workspace-patch", "workspace-progress"].includes(input.action) && original.cacheState !== "current") throw new Error("Explicit regeneration is required before changing this workspace");
      staging = mkdtempSync(path.join(tmpdir(), "litzio-review-workspace-"));
      const candidate = path.join(staging, "candidate"); writeFileSync(candidate, "", { flag: "wx", mode: 0o600 });
      const resultFile = { path: candidate, maxBytes: JOB_FILE_MAX_BYTES };
      const plan: any = await call("workspace-prepare", file, { resultFile, ...("patches" in input ? { patches: input.patches } : {}), ...("progress" in input ? { progress: input.progress } : {}) });
      let expected: Omit<WorkspaceSnapshot, "cacheKey"> | undefined;
      if (input.action !== "workspace-progress") {
        const { input: build, images } = validatedAuthoringRequest(plan.build);
        // An internal image identity addresses bytes supplied by the provider, never an external path/URL.
        if (build.authoring.inputs.some(item => item.blocks.some(block => block.kind === "figure" && block.imageAsset === undefined))) throw new Error("Workspace images require stable asset bindings");
        const bindings: Record<string, string> = Object.create(null);
        const imageRefs = images.map(image => {
          const ref = plan.imageRefs?.find((ref: any) => ref.key === image.key);
          const digest = hash(image.bytes);
          if (!ref || ref.revision !== digest || ref.mime !== image.mime) throw new Error("Mixed workspace image binding");
          bindings[image.key] = `review-asset:${digest}`;
          return ref;
        });
        if (plan.imageRefs?.length !== images.length) throw new Error("Unbound workspace image");
        const authored = await authorDocument(build.authoring, bindings);
        expected = { source: authored.source, documentRevision: authored.documentRevision, inputs: authored.inputs, contentRevision: plan.contentRevision,
          adapterVersion: plan.adapterVersion, authoringContract: REVIEW_AUTHORING_CONTRACT, images: imageRefs };
        await call("workspace-seal", candidate, { snapshot: expected, resultFile });
      }
      const prepared = workspaceStateSchema.parse(await call("workspace-read", candidate));
      if (!prepared.snapshot || prepared.cacheState !== "current") throw new Error("Candidate has no current validated snapshot");
      validateSnapshot(prepared.snapshot);
      const { cacheKey: _cacheKey, ...actual } = prepared.snapshot;
      if (expected && JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Provider changed the Host canonical snapshot");
      if (input.action === "workspace-progress" && JSON.stringify(prepared.snapshot) !== JSON.stringify(original.snapshot)) throw new Error("Progress changed the canonical snapshot");
      check();
      const after = await commitFileFromPath(file, candidate, before, JOB_FILE_MAX_BYTES, () => { check(); publishing = true; });
      saved = true;
      const value = result(prepared, after, true); this.requests.set(requestId, value); return value;
    } catch (error) {
      const value = { state: publishing && !saved ? "uncertain" : "failed", saved, error: error instanceof Error ? error.message : "Workspace operation failed",
        guidance: "Read the workspace before another write. After a lost response query this requestId; never automatically resend.", receipt: receipt(publishing && !saved ? "uncertain" : "failure") };
      if (writing) this.requests.set(requestId, value); return value;
    } finally {
      this.busy.delete(key);
      if (staging) { unlinkSync(path.join(staging, "candidate")); rmdirSync(staging); }
    }
  }
}

function validateSnapshot(snapshot: WorkspaceSnapshot) {
  if (Buffer.byteLength(snapshot.source) > 4 * 1024 * 1024 || textRevision(snapshot.source) !== snapshot.documentRevision) throw new Error("Mixed workspace document revision");
  const parsed = parse(snapshot.source);
  if (serialize(parsed) !== snapshot.source) throw new Error("Workspace source is not canonical");
  const paths = new Set(getEditableDocument(parsed).blocks.map(block => JSON.stringify(block.path))), seen = new Set<string>();
  if (new Set(snapshot.inputs.map(item => item.key)).size !== snapshot.inputs.length) throw new Error("Duplicate workspace input key");
  for (const item of snapshot.inputs) for (const target of item.targets) {
    const key = JSON.stringify(target.path);
    if (target.documentHash !== snapshot.documentRevision || target.documentRevision !== snapshot.documentRevision || !paths.has(key) || seen.has(key)) throw new Error("Mixed workspace targets");
    seen.add(key);
  }
  if (seen.size !== paths.size) throw new Error("Incomplete workspace targets");
}
