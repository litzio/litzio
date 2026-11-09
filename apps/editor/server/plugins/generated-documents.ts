import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitFile, createFile, commitFileFromPath, textRevision } from "@litzio/file-commit";
import { generatedDocumentLinkSchema, generatedDocumentRequestSchema, generatedDocumentStateSchema, authoredDocumentRequestSchema, JOB_FILE_MAX_BYTES, type GeneratedDocumentLink } from "@litzio/plugin-sdk";
import { generatedDocumentLinkPath } from "../generated-document.ts";
import { createAuthoredDocumentFile, regenerateAuthoredDocumentFile } from "../document-authoring.ts";
import { RootAccess, accessPath, canonicalFilePath, type FileAccess } from "../file-access.ts";

const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const revision = (file: string) => existsSync(file) ? hash(file) : null;
type Provider = { operation: string; version: number; assertCurrent: () => void };
/** Only connections are Host state. Plugin-owned source files carry the portable correction ledger. */
export class GeneratedDocuments {
  private busy = new Set<string>();
  private requests = new Map<string, unknown>();
  constructor(private access: FileAccess, private declaration: (plugin: string, job: string) => Provider,
    private invoke: (operation: string, input: unknown, version: number) => Promise<{ result?: unknown; error?: string }>) {}
  private paths(root: string, document: string) {
    root = accessPath(root, this.access);
    const boundary = new RootAccess([root]);
    const resolve = (file: string, create = false) => accessPath(boundary.resolve(file, create), this.access, create);
    const relative = (value: string, create = false) => {
      if (path.isAbsolute(value) || /^[a-z]:|^\\\\/i.test(value)) throw new Error("Expected a Root-relative path");
      return resolve(path.join(root, value), create);
    };
    const file = relative(document, true), linkFile = generatedDocumentLinkPath(file);
    if (path.extname(file).toLowerCase() !== ".md") throw new Error("Expected a Markdown document");
    return { file, linkFile, resolve, relative };
  }
  private readLink(file: string) {
    if (statSync(file).size > 16384) throw new Error("Generated document connection is too large");
    return generatedDocumentLinkSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  }
  private saveLink(file: string, link: GeneratedDocumentLink, before: string | null) {
    mkdirSync(path.dirname(file), { recursive: true });
    const text = JSON.stringify(generatedDocumentLinkSchema.parse(link), null, 2) + "\n";
    if (before === null) createFile(file, text); else commitFile(file, text, before);
    return textRevision(text);
  }
  /** Called on the same K1 publication path, without interpreting source filenames or bytes. */
  register(plugin: string, job: string, root: string, source: string, file: string, documentRevision: string, sourceRevision: string) {
    const p = this.paths(root, path.relative(root, file));
    p.resolve(source); this.declaration(plugin, job).assertCurrent();
    if (hash(source) !== sourceRevision) throw new Error("Generated source changed during document creation");
    this.saveLink(p.linkFile, { plugin, job, source: path.relative(path.dirname(file), source).split(path.sep).join("/"), generatedFrom: sourceRevision, generatedRevision: documentRevision }, revision(p.linkFile));
  }
  async execute(raw: unknown): Promise<any> {
    const input = generatedDocumentRequestSchema.parse(raw);
    if (input.action === "generated-status") return structuredClone(this.requests.get(input.requestId) ?? { state: "unknown", guidance: "Read the files after a daemon restart; never automatically replay edits." });
    const p = this.paths(input.root, input.document), opening = input.action === "generated-open", writing = input.action !== "generated-read";
    const requestId = input.action === "generated-read" ? randomUUID() : input.requestId;
    if (writing && this.requests.has(requestId)) throw new Error("Duplicate requestId; query status");
    const link: GeneratedDocumentLink = opening ? { plugin: input.plugin, job: input.job, source: path.relative(path.dirname(p.file), p.relative(input.source)).split(path.sep).join("/"), generatedFrom: null, generatedRevision: null } : this.readLink(p.linkFile);
    const source = p.resolve(path.resolve(path.dirname(p.file), link.source));
    const keys = [source, p.file].map(file => canonicalFilePath(file, true));
    if (keys[0] === keys[1] || existsSync(p.linkFile) && keys[0] === canonicalFilePath(p.linkFile)) throw new Error("Source must be separate from generated results");
    // A missing Windows leaf has no filesystem spelling yet. Serialize new leaves
    // within their actual parent, while existing independent documents stay parallel.
    const creating = [source, p.file].map(file => `creating:${canonicalFilePath(path.dirname(file))}`);
    if ([...keys, ...creating].some(key => this.busy.has(key))) throw new Error("Generated document operation in progress");
    if (!existsSync(p.file)) keys.push(creating[1]!);
    keys.forEach(key => this.busy.add(key));
    const receipt = (outcome: "success" | "failure" | "uncertain") => ({ requestId, operation: `review.${input.action.slice(10)}`, version: 1, scope: input.root, outcome });
    if (writing) this.requests.set(requestId, { state: "pending", receipt: receipt("uncertain") });
    let correctionsSaved = false, documentRegenerated = false, linkSaved = false, staging: string | undefined;
    try {
      const provider = this.declaration(link.plugin, link.job);
      const baseline = () => ({ sourceRevision: hash(p.resolve(source)), documentRevision: revision(p.resolve(p.file, true)), linkRevision: revision(p.linkFile) });
      let before = baseline();
      const check = () => {
        provider.assertCurrent();
        if (JSON.stringify(baseline()) !== JSON.stringify(before)) throw new Error("Generated document baseline conflict; read before writing");
      };
      const call = async (mode: string, extra = {}) => {
        check();
        const response = await this.invoke(provider.operation, { mode, file: source, ...extra }, provider.version);
        if (response.error) throw new Error("Generated document provider unavailable or rejected input");
        check(); return response.result;
      };
      if (writing && JSON.stringify(input.baseline) !== JSON.stringify(before)) throw new Error("Generated document baseline conflict; read before writing");
      if (opening && before.linkRevision !== null) throw new Error("Generated document connection already exists");
      if (input.action === "generated-read") {
        const details = generatedDocumentStateSchema.parse(await call("read"));
        const state = link.generatedFrom !== before.sourceRevision || before.documentRevision === null ? "regeneration-required"
          : link.generatedRevision !== before.documentRevision ? "externally-modified" : "generated";
        return { ...details, baseline: before, state, receipt: receipt("success") };
      }
      // Validate before publishing even an opening connection.
      generatedDocumentStateSchema.parse(await call("read"));
      if (opening) { before.linkRevision = this.saveLink(p.linkFile, link, null); linkSaved = true; }
      if (input.action === "generated-patch") {
        staging = mkdtempSync(path.join(tmpdir(), "litzio-generated-"));
        const staged = path.join(staging, "result"); writeFileSync(staged, "", { flag: "wx", mode: 0o600 });
        generatedDocumentStateSchema.parse(await call("patch", { patches: input.patches, resultFile: { path: staged, maxBytes: JOB_FILE_MAX_BYTES } }));
        check();
        before.sourceRevision = await commitFileFromPath(p.resolve(source), staged, before.sourceRevision, JOB_FILE_MAX_BYTES, check);
        correctionsSaved = true;
      }
      const built = authoredDocumentRequestSchema.parse(await call("build"));
      const created = before.documentRevision === null
        ? await createAuthoredDocumentFile(p.file, built, this.access, check)
        : await regenerateAuthoredDocumentFile(p.file, built, before.documentRevision, this.access, check);
      documentRegenerated = true;
      before.documentRevision = created.revision;
      check();
      link.generatedFrom = before.sourceRevision; link.generatedRevision = created.revision;
      before.linkRevision = this.saveLink(p.linkFile, link, before.linkRevision);
      const result = { baseline: before, state: "generated", correctionsSaved, documentRegenerated, path: created.path, revision: created.revision, inputs: created.inputs, receipt: receipt("success") };
      this.requests.set(requestId, result); return structuredClone(result);
    } catch (error) {
      const result = { state: correctionsSaved || documentRegenerated || linkSaved ? "regeneration-required" : "failed", correctionsSaved, documentRegenerated,
        error: error instanceof Error ? error.message : "Generated document operation failed", guidance: "Read the files before the next write. Query the requestId after a lost response; never automatically resend edits.", receipt: receipt("failure") };
      if (writing) this.requests.set(requestId, result); return result;
    } finally { keys.forEach(key => this.busy.delete(key)); if (staging) rmSync(staging, { recursive: true, force: true }); }
  }
}
