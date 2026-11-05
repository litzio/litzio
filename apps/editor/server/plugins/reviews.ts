import { completedReviewSchema } from "@litzio/plugin-sdk";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parse, serialize, updateNodeTextAtPath } from "@litzio/core";
import { commitFile, decodeUtf8, textRevision } from "@litzio/file-commit";
import { reviewBundleSchema, reviewPageSchema, reviewMappingSchema, reviewProposalSchema, reviewBaselineSchema, REVIEW_LIMITS, type ReviewContribution, type ReviewBundle, type ReviewProposal } from "@litzio/core/views-v2";
import { RootAccess, accessPath, type FileAccess } from "../file-access.ts";
import { validateImage } from "../image-validation.ts";
import { publicOperationError } from "./operation-result.ts";
import { loadDocumentFile } from "../document-reader.ts";

const ref = z.string().min(1).max(512);
export const reviewRequestSchema = z.strictObject({ action: z.enum(["read", "propose", "approve", "reject", "undo", "status"]), plugin: ref, review: ref, root: ref,
  bundleRef: ref, generation: ref.optional(), kind: z.enum(["bundle", "document", "page", "mapping", "proposals", "image", "snapshot"]).optional(), pageNo: z.number().int().positive().optional(),
  continuation: ref.optional(), proposalId: ref.optional(), baseline: reviewBaselineSchema.optional(), requestId: z.string().uuid().optional(), input: z.json().optional() });
const editSchema = z.strictObject({ kind: z.literal("text"), path: z.array(z.number().int().nonnegative()), from: z.string().min(1).max(32768), to: z.string().min(1).max(32768) });
type Edit = z.infer<typeof editSchema>;
type Bundle = { plugin: string; review: string; root: string; access: RootAccess; file: string; documentSource: string; source: string; sourceHash: string; bundle: ReviewBundle;
  pages: z.infer<typeof reviewPageSchema>[]; mapping?: z.infer<typeof reviewMappingSchema>; images: z.infer<typeof completedReviewSchema>["images"];
  proposals: Map<string, ReviewProposal>; edits: Map<string, Edit>; revision: string; undo: Map<string, { edit: Edit; before: string }> };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function bounded<T>(value: T): T { if (Buffer.byteLength(JSON.stringify(value)) > REVIEW_LIMITS.jsonBytes) throw new Error("Review JSON exceeds limit"); return value; }
/** Daemon-owned completed artifacts and no-replay observations, scoped to one PluginHost. */
export class PluginReviews {
  private bundles = new Map<string, Bundle>();
  private busy = new Set<string>();
  private requests = new Map<string, { owner: string; value: unknown }>();
  constructor(private access: FileAccess, private declaration: (plugin: string, review: string) => ReviewContribution,
    private invoke: (name: string, input: unknown, version: number) => Promise<{ result?: unknown; error?: string; errorKind?: string }>) {}
  publish(plugin: string, root: string, file: string, source: string, raw: unknown) {
    const data = completedReviewSchema.parse(bounded(raw)); this.declaration(plugin, data.review);
    const boundary = new RootAccess([accessPath(root, this.access)]);
    boundary.resolve(accessPath(file, this.access)); boundary.resolve(accessPath(source, this.access));
    const revision = textRevision(decodeUtf8(readFileSync(file))), sourceHash = hash(readFileSync(source));
    if (data.bundle.documentRevision !== revision || data.bundle.documentHash !== revision || data.bundle.sourceRevision !== sourceHash) throw new Error("Mixed review document/source revisions");
    for (const page of data.pages) if (page.generation !== data.bundle.generation || page.sourceRevision !== sourceHash) throw new Error("Mixed review generations");
    if (new Set(data.pages.map(p => p.pageNo)).size !== data.pages.length || new Set(data.images.map(i => i.ref)).size !== data.images.length) throw new Error("Duplicate review material");
    if (data.mapping && (data.mapping.generation !== data.bundle.generation || data.mapping.sourceRevision !== sourceHash || data.mapping.documentRevision !== revision || data.mapping.documentHash !== revision || data.mapping.mappingRevision !== data.bundle.mappingRevision)) throw new Error("Mixed review mapping");
    if (!!data.mapping !== !!data.bundle.mappingRevision) throw new Error("Missing review mapping");
    const bundle: ReviewBundle = { ...data.bundle, bundleRef: randomUUID(), documentRef: randomUUID() };
    const record: Bundle = { plugin, review: data.review, root: boundary.resolve(root), access: boundary, file, documentSource: decodeUtf8(readFileSync(file)), source, sourceHash, bundle, pages: data.pages, mapping: data.mapping, images: data.images, proposals: new Map(), edits: new Map(), revision: randomUUID(), undo: new Map() };
    for (const image of data.images) this.image(record, image.ref);
    for (const page of data.pages) if (page.imageRef && !data.images.some(i => i.ref === page.imageRef)) throw new Error("Missing image");
    const regions = new Set(data.pages.flatMap(p => p.regions.map(r => r.id)));
    for (const entry of data.mapping?.entries ?? []) {
      if (entry.sourceIds.some(id => !regions.has(id)) || entry.targets.some(t => t.documentRevision !== revision || t.documentHash !== revision)) throw new Error("Mixed mapping targets");
    }
    this.bundles.set(bundle.bundleRef, record); return structuredClone(bundle);
  }
  private image(b: Bundle, ref: string) {
    const image = b.images.find(i => i.ref === ref); if (!image || path.isAbsolute(image.path)) throw new Error("Unknown image");
    const file = accessPath(b.access.resolve(path.join(b.root, image.path)), this.access);
    if (statSync(file).size > REVIEW_LIMITS.imageBytes) throw new Error("Image exceeds limit");
    const bytes = readFileSync(file); if (hash(bytes) !== image.revision) throw new Error("Image changed");
    // Initial review images use the existing validated PNG container; other encodings are explicitly unsupported.
    validateImage("image/png", bytes);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width * height > REVIEW_LIMITS.imagePixels) throw new Error("Image exceeds pixel limit");
    return { mime: "image/png", data: bytes.toString("base64"), width, height };
  }
  private check(b: Bundle) {
    for (const file of [b.root, b.file, b.source]) accessPath(b.access.resolve(file), this.access);
    for (const image of b.images) this.image(b, image.ref);
    if (hash(readFileSync(b.source)) !== b.sourceHash || textRevision(decodeUtf8(readFileSync(b.file))) !== b.bundle.documentRevision) throw new Error("Review baseline is stale");
  }
  private baseline(b: Bundle) { return { documentRevision: b.bundle.documentRevision, proposalRevision: b.revision, sourceRevision: b.bundle.sourceRevision, mappingRevision: b.bundle.mappingRevision }; }
  /** Validate a view reference without querying plugins, publishing materials or changing proposals. */
  validateSource(source: { plugin: string; review: string; bundleRef: string }) {
    const b = this.bundles.get(source.bundleRef);
    if (!b || b.plugin !== source.plugin || b.review !== source.review) throw new Error("Review bundle unavailable on this Host");
    this.declaration(b.plugin, b.review); this.check(b);
  }
  private actions(p: ReviewProposal) {
    p.actions = (["approve", "reject", "undo"] as const).map(action => {
      const allowed = action === "undo" ? p.state === "approved" : p.state === "pending" && !!p.actions.find(a => a.action === action)?.allowed;
      return { action, allowed, ...(!allowed ? { reason: "Proposal state or contribution does not allow this action" } : {}) };
    });
  }
  async execute(raw: unknown): Promise<any> {
    const input = reviewRequestSchema.parse(raw), b = this.bundles.get(input.bundleRef);
    if (!b && input.action === "status") return { state: "unknown", receipt: { requestId: input.requestId ?? randomUUID(), operation: "review.status", version: 1, scope: accessPath(input.root, this.access), outcome: "unknown" } };
    if (!b || b.plugin !== input.plugin || b.review !== input.review || b.root !== accessPath(input.root, this.access) || input.generation !== undefined && b.bundle.generation !== input.generation) throw new Error("Review bundle unavailable on this Host/Root/generation");
    for (const file of [b.root, b.file, b.source]) accessPath(b.access.resolve(file), this.access);
    const owner = `${input.plugin}/${input.review}/${input.bundleRef}`;
    const receipt = (outcome: string) => ({ requestId: input.requestId ?? randomUUID(), operation: `review.${input.action}`, version: 1, scope: b.root, outcome });
    if (input.action === "status") { const observed = this.requests.get(input.requestId ?? ""); return observed?.owner === owner ? structuredClone(observed.value) : { state: "unknown", receipt: receipt("unknown") }; }
    const binding = this.declaration(input.plugin, input.review);
    if (input.action === "read") {
      let stale = false; try { this.check(b); } catch { stale = true; }
      if (stale) for (const p of b.proposals.values()) { p.state = "stale"; this.actions(p); }
      const kind = input.kind ?? (input.pageNo ? "snapshot" : "bundle");
      if (kind === "snapshot") {
        if (input.continuation) throw new Error("Review material unavailable");
        const page = b.pages.find(p => p.pageNo === (input.pageNo ?? 1));
        if (!page) throw new Error("Review page unavailable");
        const document = loadDocumentFile(accessPath(b.file, this.access), b.access);
        const snapshot = bounded({ bundle: b.bundle, page, mapping: b.mapping, proposals: [...b.proposals.values()],
          document: document.document, documentRevision: document.revision, documentHash: document.revision, documentPath: document.path,
          baseline: { ...this.baseline(b), sourceRevision: hash(readFileSync(b.source)) }, pageCount: b.pages.length });
        const image = page.imageRef ? this.image(b, page.imageRef) : undefined;
        return { snapshot: structuredClone({ ...snapshot, ...(image ? { imageUrl: `data:${image.mime};base64,${image.data}` } : {}) }), state: stale ? "stale" : "ready", receipt: receipt("success") };
      }
      const data = kind === "bundle" ? b.bundle : kind === "document" ? { source: b.documentSource, documentRef: b.bundle.documentRef, revision: b.bundle.documentRevision } : kind === "page" ? b.pages.find(p => p.pageNo === input.pageNo) : kind === "mapping" ? b.mapping : kind === "proposals" ? [...b.proposals.values()] : this.image(b, b.pages.find(p => p.pageNo === input.pageNo)?.imageRef ?? "");
      if (input.continuation || data === undefined) throw new Error("Review material unavailable");
      if (kind !== "image") bounded(data);
      return { data: structuredClone(data), baseline: this.baseline(b), state: stale ? "stale" : "ready", receipt: receipt("success") };
    }
    if (!input.requestId || !input.baseline) throw new Error("requestId and baseline required");
    if (this.requests.has(input.requestId)) throw new Error("Duplicate requestId; use review status, never replay");
    if (this.busy.has(owner)) throw new Error("Review mutation in progress");
    this.check(b);
    if (JSON.stringify(reviewBaselineSchema.parse(input.baseline)) !== JSON.stringify(reviewBaselineSchema.parse(this.baseline(b)))) throw new Error("Review baseline conflict");
    const pending = { owner, value: { state: "uncertain", receipt: receipt("uncertain") } as any }; this.requests.set(input.requestId, pending); this.busy.add(owner);
    try {
      const action = input.action;
      const proposal = action === "propose" ? undefined : b.proposals.get(input.proposalId ?? "");
      if (action !== "propose" && (!proposal || !proposal.actions.some(a => a.action === action && a.allowed))) throw new Error("Proposal action unavailable");
      const result = await this.invoke(binding[action].operation, structuredClone({ bundle: b.bundle, baseline: this.baseline(b), requestId: input.requestId, proposal: proposal ?? null, input: input.input ?? null }), binding[action].version);
      if (result.error) throw Object.assign(new Error("Review operation failed"), { kind: result.errorKind });
      // Recheck after plugin execution, immediately before any mutation.
      this.declaration(b.plugin, b.review); this.check(b);
      if (action === "propose") {
        const p = reviewProposalSchema.parse(result.result);
        if (p.state !== "pending" || b.proposals.has(p.id) || JSON.stringify(p.baseline) !== JSON.stringify(input.baseline) || p.targets.some(t => t.documentRevision !== b.bundle.documentRevision || t.documentHash !== b.bundle.documentHash)) throw new Error("Invalid pending proposal");
        if (b.proposals.size >= REVIEW_LIMITS.items) throw new Error("Proposal limit exceeded");
        // Pin the reviewed change at admission. An approve response cannot redefine it.
        const edit = p.targets.length === 1 && p.before.type === "plain" && p.after.type === "plain"
          ? editSchema.safeParse({ kind: "text", path: p.targets[0]!.path, from: p.before.text, to: p.after.text }) : undefined;
        if (edit?.success) b.edits.set(p.id, structuredClone(edit.data));
        else p.actions = p.actions.map(a => a.action === "approve" ? { action: a.action, allowed: false, reason: "Unsupported review edit" } : a);
        this.actions(p); b.proposals.set(p.id, p);
      } else if (action === "reject") { proposal!.state = "rejected"; }
      else {
        const old = decodeUtf8(readFileSync(b.file));
        const saved = b.undo.get(proposal!.id);
        const edit = action === "undo" ? saved?.edit : b.edits.get(proposal!.id);
        if (action === "approve" && JSON.stringify(editSchema.parse(result.result)) !== JSON.stringify(edit)) throw new Error("Approval differs from the reviewed change");
        if (!edit || !proposal!.targets.some(t => JSON.stringify(t.path) === JSON.stringify(edit.path))) { proposal!.state = "inapplicable"; this.actions(proposal!); throw new Error("Unsupported review edit target"); }
        const next = serialize(updateNodeTextAtPath(parse(old), edit.path, edit.from, edit.to));
        if (action === "undo" && next !== saved!.before) throw new Error("Undo no longer applies");
        this.check(b); commitFile(accessPath(b.access.resolve(b.file), this.access), next, b.bundle.documentRevision);
        b.documentSource = next; b.bundle.documentRevision = textRevision(next); b.bundle.documentHash = textRevision(next);
        // A text operation preserves the path; bind the acted-on target to the committed snapshot for Undo.
        proposal!.targets = proposal!.targets.map(t => ({ ...t, documentRevision: b.bundle.documentRevision, documentHash: b.bundle.documentHash }));
        if (action === "approve") b.undo.set(proposal!.id, { before: old, edit: { ...edit, from: edit.to, to: edit.from } });
        proposal!.state = action === "approve" ? "approved" : "rejected";
        for (const p of b.proposals.values()) if (p !== proposal) { p.state = "stale"; this.actions(p); }
        // Old map targets cannot navigate the newly committed document.
        b.mapping = undefined; b.bundle.mappingRevision = undefined;
      }
      b.revision = randomUUID();
      for (const p of b.proposals.values()) { this.actions(p); if (p.state !== "stale") p.baseline = this.baseline(b); }
      pending.value = { baseline: this.baseline(b), changedDocumentRefs: ["approve", "undo"].includes(action) ? [b.bundle.documentRef] : [], proposals: structuredClone([...b.proposals.values()]), receipt: receipt("success") };
    } catch (cause) { pending.value = { state: "uncertain", ...publicOperationError(cause, "write"), receipt: receipt("uncertain") }; }
    this.busy.delete(owner);
    return structuredClone(pending.value);
  }
}
