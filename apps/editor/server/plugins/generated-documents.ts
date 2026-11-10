import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitFile, createFile, commitFileFromPath, textRevision } from "@litzio/file-commit";
import { generatedDocumentRequestSchema, generatedDocumentStateSchema, authoredDocumentRequestSchema, JOB_FILE_MAX_BYTES, generatedInputsSchema, generatedProgressSchema, type GeneratedDocumentLink } from "@litzio/plugin-sdk";
import { generatedDocumentLinkPath, generatedDocumentLinksDirectory, storedGeneratedDocumentSchema } from "../generated-document.ts";
import { createAuthoredDocumentFile, regenerateAuthoredDocumentFile } from "../document-authoring.ts";
import { RootAccess, accessPath, canonicalFilePath, type FileAccess } from "../file-access.ts";
import { ReviewWorkspaces } from "./review-workspaces.ts";

const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const revision = (file: string) => existsSync(file) ? hash(file) : null;
type Provider = { workspace?: boolean; comparison?: string; operation: string; version: number; assertCurrent: () => void };
/** Only connections are Host state. Plugin-owned source files carry the portable correction ledger. */
export class GeneratedDocuments {
  private busy = new Set<string>();
  private reads = new Map<string, Promise<void>>();
  private progressWrites = new Map<string, { readers: number; closing: boolean; done: Promise<void>; release(): void; idle?: () => void }>();
  private requests = new Map<string, unknown>();
  private workspaces: ReviewWorkspaces;
  constructor(private access: FileAccess, private declaration: (plugin: string, job: string) => Provider,
    private invoke: (operation: string, input: unknown, version: number) => Promise<{ result?: unknown; error?: string }>,
    private publish?: (plugin: string, root: string, file: string, source: string, raw: unknown, imageBytes?: Buffer, embedded?:{source:string}) => any,
    private readComparison?: (input: unknown) => Promise<any>,
    findWorkspace?: (file?:string)=>{plugin:string;job:string;accept:string[]}[]) { this.workspaces = new ReviewWorkspaces(access, declaration, invoke, this.busy, publish, readComparison, findWorkspace); }
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
    if (statSync(file).size > 4 * 1024 * 1024) throw new Error("Generated document connection is too large");
    const { documentPath: _, ...link } = storedGeneratedDocumentSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    return link;
  }
  private saveLink(file: string, link: GeneratedDocumentLink, before: string | null, documentPath: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    const text = JSON.stringify(storedGeneratedDocumentSchema.parse({ ...link, documentPath: canonicalFilePath(documentPath, true) }), null, 2) + "\n";
    if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error("Generated document connection is too large");
    if (before === null) createFile(file, text); else commitFile(file, text, before);
    return textRevision(text);
  }
  /** Called on the same K1 publication path, without interpreting source filenames or bytes. */
  register(plugin: string, job: string, root: string, source: string, file: string, documentRevision: string, sourceRevision: string, inputs?: unknown) {
    const p = this.paths(root, path.relative(root, file));
    p.resolve(source); const provider=this.declaration(plugin, job); provider.assertCurrent();
    if(provider.workspace) throw new Error("Use the review workspace operations and explicit current export");
    if (hash(source) !== sourceRevision) throw new Error("Generated source changed during document creation");
    this.saveLink(p.linkFile, { plugin, job, source: path.relative(path.dirname(file), source).split(path.sep).join("/"), generatedFrom: sourceRevision, generatedRevision: documentRevision, ...(inputs ? { inputs: generatedInputsSchema.parse(inputs) } : {}) }, revision(p.linkFile), p.file);
  }
  /** Discover connections without interpreting file extensions or invoking plugin code. */
  private find(root: string, locator?: string) {
    root = canonicalFilePath(accessPath(root, this.access));
    const boundary = new RootAccess([root]);
    const resolve = (file: string) => canonicalFilePath(accessPath(boundary.resolve(file, true), this.access, true), true);
    if (locator && (path.isAbsolute(locator) || /^[a-z]:|^\\\\/i.test(locator))) throw new Error("Expected a Root-relative path");
    const target = locator ? resolve(path.resolve(root, locator)) : undefined;
    const documents: { root: string; document: string; source: string; plugin: string; job: string; match?: "document" | "source" }[] = [];
    const directory = generatedDocumentLinksDirectory();
    for (const name of existsSync(directory) ? readdirSync(directory) : []) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const file = path.join(directory, name);
        if (statSync(file).size > 4 * 1024 * 1024) continue;
        const { documentPath, ...link } = storedGeneratedDocumentSchema.parse(JSON.parse(readFileSync(file, "utf8")));
        const document = resolve(documentPath);
        if (generatedDocumentLinkPath(document) !== file) continue;
        const source = resolve(path.resolve(path.dirname(document), link.source));
        if (target && target !== document && target !== source) continue;
        const provider = this.declaration(link.plugin, link.job); provider.assertCurrent();
        if (!provider.comparison) continue;
        documents.push({ root, document: path.relative(root, document).split(path.sep).join("/"), source: path.relative(root, source).split(path.sep).join("/"), plugin: link.plugin, job: link.job, ...(target ? { match: target === document ? "document" as const : "source" as const } : {}) });
      } catch { /* Unavailable, malformed or out-of-Root connections are not actionable. */ }
    }
    documents.sort((a, b) => a.document.localeCompare(b.document));
    return { documents, receipt: { requestId: randomUUID(), operation: "review.find", version: 1, scope: root, outcome: "success" } };
  }
  async execute(raw: unknown): Promise<any> {
    if (raw && typeof raw === "object" && "action" in raw && String(raw.action).startsWith("workspace-")) return this.workspaces.execute(raw);
    const input = generatedDocumentRequestSchema.parse(raw);
    if (input.action === "generated-find") return this.find(input.root, input.path);
    if (input.action === "generated-status") return structuredClone(this.requests.get(input.requestId) ?? { state: "unknown", guidance: "Read the files after a daemon restart; never automatically replay edits." });
    const p = this.paths(input.root, input.document), opening = input.action === "generated-open", writing = !["generated-read", "generated-compare"].includes(input.action);
    const requestId = "requestId" in input ? input.requestId : randomUUID();
    if (writing && this.requests.has(requestId)) throw new Error("Duplicate requestId; query status");
    const link: GeneratedDocumentLink = opening ? { plugin: input.plugin, job: input.job, source: path.relative(path.dirname(p.file), p.relative(input.source)).split(path.sep).join("/"), generatedFrom: null, generatedRevision: null } : this.readLink(p.linkFile);
    const source = p.resolve(path.resolve(path.dirname(p.file), link.source), input.action === "generated-compare");
    const keys = [source, p.file].map(file => canonicalFilePath(file, true));
    if (keys[0] === keys[1] || existsSync(p.linkFile) && keys[0] === canonicalFilePath(p.linkFile)) throw new Error("Source must be separate from generated results");
    // A missing Windows leaf has no filesystem spelling yet. Serialize new leaves
    // within their actual parent, while existing independent documents stay parallel.
    const creating = [source, p.file].map(file => `creating:${canonicalFilePath(path.dirname(file))}`);
    const readingProgress = !writing ? this.progressWrites.get(keys[0]!) : undefined;
    if (readingProgress?.closing) { await readingProgress.done; return this.execute(raw); }
    // A closed comparison can still have a neighbouring page read in the Host.
    // New readers wait for that read's coherent baseline instead of failing on reopen.
    const priorRead = !writing ? keys.map(key => this.reads.get(key)).find(Boolean) : undefined;
    if (priorRead) { await priorRead; return this.execute(raw); }
    if ([...keys, ...creating].some(key => this.busy.has(key) && (!readingProgress || this.progressWrites.get(key) !== readingProgress))) throw new Error("Generated document operation in progress");
    if (!existsSync(p.file)) keys.push(creating[1]!);
    if (readingProgress) readingProgress.readers++;
    else keys.forEach(key => this.busy.add(key));
    let releaseRead: (() => void) | undefined;
    if (!writing && !readingProgress) {
      const done = new Promise<void>(resolve => { releaseRead = resolve; });
      keys.forEach(key => this.reads.set(key, done));
    }
    let progressWrite: typeof readingProgress;
    if (input.action === "generated-progress") {
      let release!: () => void;
      progressWrite = { readers: 0, closing: false, done: new Promise<void>(resolve => { release = resolve; }), release: () => release() };
      keys.forEach(key => this.progressWrites.set(key, progressWrite!));
    }
    const receipt = (outcome: "success" | "failure" | "uncertain") => ({ requestId, operation: `review.${input.action.slice(10)}`, version: 1, scope: input.root, outcome });
    if (writing) this.requests.set(requestId, { state: "pending", receipt: receipt("uncertain") });
    let progressSaved = false, correctionsSaved = false, documentRegenerated = false, linkSaved = false, staging: string | undefined;
    try {
      const provider = this.declaration(link.plugin, link.job);
      if(provider.workspace) throw new Error("Use the review workspace operations and explicit current export");
      const baseline = () => ({ sourceRevision: hash(p.resolve(source)), documentRevision: revision(p.resolve(p.file, true)), linkRevision: revision(p.linkFile) });
      let before = baseline();
      const check = () => {
        provider.assertCurrent();
        if (JSON.stringify(baseline()) !== JSON.stringify(before)) throw new Error("Generated document baseline conflict; read before writing");
      };
      const call = async (mode: string, extra = {}) => {
        check();
        const response = await this.invoke(provider.operation, { mode, file: source, ...(provider.comparison ? { sourceRevision: before.sourceRevision } : {}), ...extra }, provider.version);
        if (response.error) throw new Error("Generated document provider unavailable or rejected input");
        check(); return response.result;
      };
      if (writing && "baseline" in input && JSON.stringify(input.baseline) !== JSON.stringify(before)) throw new Error("Generated document baseline conflict; read before writing");
      if (opening && before.linkRevision !== null) throw new Error("Generated document connection already exists");
      if (input.action === "generated-compare") {
        if (!provider.comparison || !this.publish || !this.readComparison || !link.inputs || link.generatedFrom !== before.sourceRevision || link.generatedRevision !== before.documentRevision) return { state: "regeneration-required", error: "Comparison requires the current saved generated document; regenerate and reopen", receipt: receipt("failure") };
        staging = mkdtempSync(path.join(tmpdir(), "litzio-generated-"));
        const imageFile = path.join(staging, "page.png"); writeFileSync(imageFile, "", { flag: "wx", mode: 0o600 });
        const material: any = await call("compare", { pageNo: input.pageNo, result: { path: p.file, revision: before.documentRevision, inputs: generatedInputsSchema.parse(link.inputs) }, sourceRevision: before.sourceRevision, generation: randomUUID(), resultFile: { path: imageFile, maxBytes: 16 * 1024 * 1024 } });
        if (material.review !== provider.comparison || material.images?.length !== 1 || material.images[0].path !== imageFile || statSync(imageFile).size > 16 * 1024 * 1024) throw new Error("Invalid comparison material");
        const bundle = this.publish(link.plugin, input.root, p.file, source, material, readFileSync(imageFile));
        const details = generatedDocumentStateSchema.parse(await call("read"));
        const progress = generatedProgressSchema.parse({ checkedPages: details.record.checkedPages, lastPage: details.record.lastPage });
        const pages = new Set(material.pages.map((page: { pageNo: number }) => page.pageNo));
        if (progress.checkedPages.some(page => !pages.has(page)) || progress.lastPage !== null && !pages.has(progress.lastPage)) throw new Error("Unknown comparison progress page");
        const pageNo = input.pageNo ?? Number(progress.lastPage ?? 1);
        const result = await this.readComparison({ action: "read", plugin: link.plugin, review: provider.comparison, root: input.root, bundleRef: bundle.bundleRef, pageNo });
        check();
        return { ...result, generatedBaseline: before, progress };
      }
      if (input.action === "generated-read") {
        const details = generatedDocumentStateSchema.parse(await call("read"));
        const state = link.generatedFrom !== before.sourceRevision || before.documentRevision === null ? "regeneration-required"
          : link.generatedRevision !== before.documentRevision ? "externally-modified" : "generated";
        return { ...details, baseline: before, state, receipt: receipt("success") };
      }
      if (input.action === "generated-progress" && (link.generatedFrom !== before.sourceRevision || link.generatedRevision !== before.documentRevision)) throw new Error("Progress requires the current saved generated document");
      // Validate before publishing even an opening connection.
      generatedDocumentStateSchema.parse(await call("read"));
      if (opening) { before.linkRevision = this.saveLink(p.linkFile, link, null, p.file); linkSaved = true; }
      if (input.action === "generated-patch" || input.action === "generated-progress") {
        staging = mkdtempSync(path.join(tmpdir(), "litzio-generated-"));
        const staged = path.join(staging, "result"); writeFileSync(staged, "", { flag: "wx", mode: 0o600 });
        generatedDocumentStateSchema.parse(await call(input.action === "generated-progress" ? "progress" : "patch", { ...(input.action === "generated-progress" ? { progress: input.progress } : { patches: input.patches }), resultFile: { path: staged, maxBytes: JOB_FILE_MAX_BYTES } }));
        // Progress preserves document semantics. Readers may use the old coherent baseline while
        // its replacement is prepared; publication waits for them and excludes new readers.
        if (progressWrite) { progressWrite.closing = true; if (progressWrite.readers) await new Promise<void>(resolve => { progressWrite!.idle = resolve; }); }
        check();
        before.sourceRevision = await commitFileFromPath(p.resolve(source), staged, before.sourceRevision, JOB_FILE_MAX_BYTES, check);
        if (input.action === "generated-progress") {
          // Progress does not change the conversion input. Keep its saved document and targets.
          progressSaved = true; check();
          link.generatedFrom = before.sourceRevision;
          before.linkRevision = this.saveLink(p.linkFile, link, before.linkRevision, p.file);
          check();
          const result = { baseline: before, progressSaved: true, receipt: receipt("success") };
          this.requests.set(requestId, result); return result;
        }
        correctionsSaved = true;
      }
      const built = authoredDocumentRequestSchema.parse(await call("build"));
      const created = before.documentRevision === null
        ? await createAuthoredDocumentFile(p.file, built, this.access, check)
        : await regenerateAuthoredDocumentFile(p.file, built, before.documentRevision, this.access, check);
      documentRegenerated = true;
      before.documentRevision = created.revision;
      check();
      link.generatedFrom = before.sourceRevision; link.generatedRevision = created.revision; link.inputs = generatedInputsSchema.parse(created.inputs);
      before.linkRevision = this.saveLink(p.linkFile, link, before.linkRevision, p.file);
      const result = { baseline: before, state: "generated", correctionsSaved, documentRegenerated, path: created.path, revision: created.revision, inputs: created.inputs, receipt: receipt("success") };
      this.requests.set(requestId, result); return structuredClone(result);
    } catch (error) {
      const result = { state: progressSaved || correctionsSaved || documentRegenerated || linkSaved || input.action === "generated-compare" && (error as NodeJS.ErrnoException).code === "ENOENT" ? "regeneration-required" : "failed", correctionsSaved, documentRegenerated,
        ...(input.action === "generated-progress" ? { progressSaved } : {}), error: error instanceof Error ? error.message : "Generated document operation failed", guidance: "Read the files before the next write. Query the requestId after a lost response; never automatically resend edits.", receipt: receipt("failure") };
      if (writing) this.requests.set(requestId, result); return result;
    } finally {
      if (readingProgress) { if (!--readingProgress.readers) readingProgress.idle?.(); }
      else keys.forEach(key => this.busy.delete(key));
      if (releaseRead) { keys.forEach(key => this.reads.delete(key)); releaseRead(); }
      if (progressWrite) { keys.forEach(key => this.progressWrites.delete(key)); progressWrite.release(); }
      if (staging) rmSync(staging, { recursive: true, force: true });
    }
  }
}
