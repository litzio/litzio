import { PluginSettingsError } from "../shared/plugin-settings-error.ts";
import { PluginArtifactChangedError } from "../shared/plugin-artifact-error.ts";
// Use the published ESM entry: its UMD factory leaves dynamic relative require calls in CLI bundles.

import { browseFolder, documentRevision, listFolder, loadDocumentFile, loadEditorFile, MEDIA_TYPES } from "./document-reader.ts";
export { browseFolder, documentRevision, listFolder, loadDocumentFile, loadEditorFile, MEDIA_TYPES } from "./document-reader.ts";
import { executeCompareOperation } from "./document-compare.ts";
import { ASSISTANT_TRANSPORT_LIMITS } from "../shared/assistant-limits.ts";
import { VIEW_TRANSPORT_LIMITS } from "../shared/view-limits.ts";
import { executeViewOperation } from "./views.ts";
import { hostIdentity } from "./host-identity.ts";
import { executeTemplateOperation } from "./document-templates.ts";
import { createDocumentSourceFile } from "./document-create.ts";
import { createAuthoredDocumentFile } from "./document-authoring.ts";
import { hostPaths } from "./host-paths.ts";
import { folderVersion } from "./folder-watch.ts";
import { documentRevisions } from "./document-revisions.ts";
import { readBibliographySources } from "./bibliography.ts";
import type { HostServices } from "./host-services.ts";
import { MAX_ASSET_BYTES } from "../shared/asset-policy.ts";
import { ImageValidationError, validateImage } from "./image-validation.ts";
import fs, { readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { createDocument, serialize, NativeDocumentError, writeIssueOf } from "@litzio/core";
import { assertUnicode, commitFile, decodeUtf8, FileChangedError } from "@litzio/file-commit";
import { accessPath, canonicalFilePath, FileAccessError, fileErrorMessage, fileErrorStatus, inside, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { readRequestBody, RequestBodyError } from "./request-body.ts";
import { requestQuery } from "./request-query.ts";
import { executeFolderTrash, deleteFile, renameFile, ReferencedImageError, ImageRenameError } from "./file-operations.ts";
import { osTrashAvailable, trashFile } from "./os-trash.ts";
import type { FileOperationRequest, RenameFileRequest } from "../shared/file-operations.ts";
import { resolveDocumentPath, resolveEditorPath, resolveMediaPath } from "./document-path.ts";
export { resolveDocumentPath, resolveMediaPath } from "./document-path.ts";
import {
  readModel,
  prepareReplay,
  replayEdits,
  SaveContentError,
  validateFigureRequest,
} from "./document-replay.ts";
import type { DocumentSaveCache } from "./document-save-cache.ts";
import { DocumentConflictError, prepareDocumentSave, replayCurrent, verifySaveRevision, type FileSaveRequest } from "./document-save-compute.ts";
export { DocumentConflictError } from "./document-save-compute.ts";
import { DocumentThreadError, type DocumentThread } from "./document-thread.ts";
import { saveDiagnostic } from "./document-worker-protocol.ts";
import { changedBlocks, describeBlocks } from "./document-save-describe.ts";

import type {
  SampleAvailability,
  SaveRequest,
  SupportedEdits,
  DocumentFileResponse,
  EditorFileResponse,
  TextSaveRequest,
  SaveResponse,
  SourceResponse,
  RecoveryPreviewResponse,
  DocumentErrorResponse,
  FolderCreateResponse,
  FolderPlacesResponse,
} from "../shared/document-protocol.ts";
import type { SaveFailure } from "../shared/save-error.ts";

function errorPayload(error: unknown, access: FileAccess = LOCAL_FILE_ACCESS): DocumentErrorResponse {
  if (error instanceof SaveContentError) {
    return { error: error.phase === "file" ? fileErrorMessage(error.cause ?? error, access) : error.reason,
      target: error.target, failure: saveDiagnostic(error).failure };
  }
  return { error: error instanceof NativeDocumentError ? error.message : fileErrorMessage(error, access),
    ...(error instanceof NativeDocumentError ? { code: error.code, issue: writeIssueOf(error) } : {}),
    ...(error instanceof DocumentConflictError ? { failure: { phase: "revision", action:
      "Keep editing, or copy applied content from Source. Reload only when you are ready to discard local changes." } satisfies SaveFailure } : {}),
  };
}

function fileStep<T>(apply: () => T): T {
  try { return apply(); }
  catch (error) {
    if (error instanceof DocumentConflictError) throw error;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const action = code === "EACCES" || code === "EPERM" ? "Check file/folder write permission and whether another application has locked the file."
      : code === "ENOSPC" ? "Free disk space before trying to save again."
      : code === "EROFS" ? "The filesystem is read-only. Use a writable location."
      : code === "ENOENT" ? "Check that the document and its parent folder still exist."
      : "Check the document location, file permissions and available disk space. If the problem persists, report this error.";
    throw new SaveContentError(error instanceof Error ? error.message : String(error), undefined, { phase: "file", action, cause: error });
  }
}

const EMPTY_DOCUMENT_MARKDOWN = serialize(createDocument());

/** Text Save writes the submitted string to the checked revision. Open owns document classification. */
export function saveTextFile(request: TextSaveRequest, access: FileAccess = LOCAL_FILE_ACCESS): SaveResponse {
  const filePath = fileStep(() => resolveEditorPath(request.path, access));
  const source = fileStep(() => decodeUtf8(readFileSync(accessPath(filePath, access))));
  if (documentRevision(source) !== request.revision) throw new DocumentConflictError();
  assertUnicode(request.source);
  fileStep(() => replaceDocumentFile(accessPath(filePath, access), request.source, request.revision));
  return { revision: documentRevision(request.source) };
}

export function createDocumentFile(requestedPath?: string, access: FileAccess = LOCAL_FILE_ACCESS, source = EMPTY_DOCUMENT_MARKDOWN): DocumentFileResponse {
  const created = createDocumentSourceFile(requestedPath ?? "", source, access);
  return { ...created, kind: "native", ...readModel(created.source) };
}

export function saveDocumentFile(
  requestedPath: string | undefined,
  request: FileSaveRequest,
  access: FileAccess = LOCAL_FILE_ACCESS,
  cache?: DocumentSaveCache,
): SaveResponse & { path: string; markdown: string } {
  const filePath = fileStep(() => resolveDocumentPath(requestedPath, access));
  const disk = fileStep(() => decodeUtf8(readFileSync(accessPath(filePath, access))));
  const { describe, ...save } = request as FileSaveRequest & { describe?: true };
  const revision = verifySaveRevision(disk, save.revision);
  const { saved, snapshot, source } = prepareDocumentSave(disk, revision, save, cache && { path: filePath, cache });
  fileStep(() => replaceDocumentFile(accessPath(filePath, access), saved.markdown, save.revision));
  const { path: _path, base, revision: _revision, ...edits } = save;
  if (cache) cache.remember(filePath, source, snapshot, edits, saved);
  const changed = describe && changedBlocks(base === undefined || base.source === disk ? {} : base.savedEdits ?? {}, edits);
  return { markdown: saved.markdown, revision: saved.revision, path: filePath, ...(changed ? { blocks: describeBlocks(saved.document, changed) } : {}) };
}

async function openEditorFile(
  requestedPath: string | undefined, access: FileAccess, thread: DocumentThread, signal: AbortSignal,
): Promise<EditorFileResponse> {
  const filePath = resolveEditorPath(requestedPath, access);
  const source = decodeUtf8(readFileSync(filePath));
  const file = { path: filePath, source, revision: documentRevision(source) };
  const model = path.extname(filePath).toLowerCase() === ".md"
    ? await thread.read({ kind: "open", path: canonicalFilePath(filePath), source }, signal)
    : undefined;
  return model ? { ...file, kind: "native", ...model } : { ...file, kind: "text" };
}

async function saveFileInOrder(request: SaveRequest | TextSaveRequest, access: FileAccess, thread: DocumentThread, signal: AbortSignal): Promise<SaveResponse> {
  const text = "kind" in request;
  const filePath = fileStep(() => text ? resolveEditorPath(request.path, access) : resolveDocumentPath(request.path, access));
  const target = fileStep(() => canonicalFilePath(filePath));
  const currentPath = () => {
    const checked = accessPath(filePath, access);
    if (canonicalFilePath(checked) !== target) throw new DocumentConflictError();
    return checked;
  };
  const commit = (markdown: string, revision = request.revision) => fileStep(() => replaceDocumentFile(currentPath(), markdown, revision));
  return thread.inSaveOrder(target, async () => {
    signal.throwIfAborted();
    const disk = fileStep(() => decodeUtf8(readFileSync(currentPath())));
    verifySaveRevision(disk, request.revision);
    if (!text) {
      // The edits are fingerprinted and replayed; describing is only a reply option.
      const { describe, ...edits } = request;
      const { revision, localWrite, blocks } = await thread.save({ kind: "save", path: target, disk, request: edits, ...(describe ? { describe } : {}) }, signal,
        saved => commit(saved.markdown),
        markdown => {
          try { return readFileSync(currentPath()).equals(Buffer.from(markdown, "utf8")); }
          catch { return false; }
        }, commit);
      return { revision, ...(localWrite ? { pendingLocalWrite: true } : {}), ...(blocks ? { blocks } : {}) };
    }
    assertUnicode(request.source);
    commit(request.source);
    return { revision: documentRevision(request.source) };
  });
}

/** A reply closing before completion cancels the uncommitted calculation. The
 * synchronous commit, once entered, retains the normal uncertain-reply behavior. */
async function withDocumentResponse<T>(res: ServerResponse, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (res.destroyed) abort();
  res.once("close", abort);
  try { return await run(controller.signal); }
  finally { res.off("close", abort); }
}

/** The shared file commit; a failed write keeps the original. */
function replaceDocumentFile(filePath: string, markdown: string, revision: string | undefined): void {
  if (revision === undefined) throw new DocumentConflictError();
  try {
    commitFile(filePath, markdown, revision);
  } catch (error) {
    if (error instanceof FileChangedError) throw new DocumentConflictError();
    throw error;
  }
}

/**
 * The canonical Markdown this save request would write, through the same Core
 * save path. The file is only read, never written.
 */
export function previewDocumentFile(requestedPath: string | undefined, request: FileSaveRequest, access: FileAccess = LOCAL_FILE_ACCESS): SourceResponse {
  const filePath = resolveDocumentPath(requestedPath, access);
  if (request.base) {
    // A preview describes this session, even after an external conflict. Validate its
    // acknowledged revision without writing or requiring the disk to remain unchanged.
    return previewSession(request);
  }
  return { markdown: saveCurrentDocument(decodeUtf8(readFileSync(filePath)), request).markdown };
}

function previewSession(request: FileSaveRequest & { base?: SaveRequest["base"] }): SourceResponse {
  if (!request.base) throw new Error("invalid session source");
  const { source, savedEdits } = request.base;
  let snapshot: ReturnType<typeof prepareReplay> | undefined;
  const opening = () => snapshot ??= prepareReplay(source);
  const previous = savedEdits ? replayEdits(opening(), savedEdits).markdown : source;
  verifySaveRevision(previous, request.revision);
  return { markdown: replayCurrent(opening, request).saved.markdown };
}

/** Current disk bytes and an independent session dry run. No acknowledgement or file commit. */
export function previewRecoveryFile(requestedPath: string, request?: SaveRequest, access: FileAccess = LOCAL_FILE_ACCESS): RecoveryPreviewResponse {
  const filePath = resolveEditorPath(requestedPath, access, true);
  let disk: RecoveryPreviewResponse["disk"] = null;
  try {
    const source = decodeUtf8(readFileSync(accessPath(filePath, access, true)));
    disk = { source, revision: documentRevision(source) };
    try { if (path.extname(filePath).toLowerCase() === ".md") disk.document = readModel(source).document; }
    catch (error) { disk.error = errorPayload(error, access).error; }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!request) return { disk };
  try { return { disk, ...previewSession(request) }; }
  catch (error) { return { disk, ...errorPayload(error, access) }; }
}

export function saveCurrentDocument(
  source: string,
  request: FileSaveRequest,
): { markdown: string; revision: string } {
  const { saved } = prepareDocumentSave(source, verifySaveRevision(source, request.revision), request);
  return { markdown: saved.markdown, revision: saved.revision };
}

export function commitDocumentSave(
  readSource: () => string,
  writeSource: (markdown: string) => void,
  request: FileSaveRequest,
): { markdown: string; revision: string } {
  const source = readSource();
  const saved = saveCurrentDocument(source, request);
  writeSource(saved.markdown);
  return saved;
}

export async function handleDocumentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
  access: FileAccess = LOCAL_FILE_ACCESS,
  bodyLimit = Infinity,
  removeFile?: (file: string) => void | Promise<void>,
  sampleAvailability?: SampleAvailability,
  services?: HostServices,
  templatesDirectory = hostPaths().templates,
): Promise<void> {
  const readBody = async (request: IncomingMessage) => decodeUtf8(await readRequestBody(request, bodyLimit));
  const documents = services?.documents;
  const failure = (error: unknown) => sendJson(res,
    error instanceof DocumentConflictError ? 409 : error instanceof DocumentThreadError ? 503
      : error instanceof RequestBodyError || error instanceof ImageValidationError ? error.status
      : fileErrorStatus(error instanceof SaveContentError && error.phase === "file" ? error.cause : error),
    errorPayload(error, access));
  let query: URLSearchParams;
  try { query = requestQuery(req.url ?? ""); }
  catch (error) { failure(error); return; }
  const url = new URL(req.url ?? "", "http://localhost").pathname;
  if (url === "/api/local-write-statistics" || url === "/api/local-write-status") {
    if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
    try {
      if (url === "/api/local-write-statistics") {
        if (!documents?.localWrite) { res.statusCode = 404; res.end(); return; }
        sendJson(res, 200, documents.localWrite.statistics());
      } else {
        const revision = query.get("revision") ?? "";
        if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("invalid document revision");
        let file: string;
        try {
          file = canonicalFilePath(resolveDocumentPath(query.get("path") ?? undefined, access));
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
          // A move or deletion can invalidate the locator before the client stops polling.
          sendJson(res, 200, { state: "done" });
          return;
        }
        sendJson(res, 200, documents?.localWrite?.status(file, revision) ?? { state: "done" });
      }
    } catch (error) { failure(error); }
    return;
  }
  if (url.startsWith("/api/assistant/")) {
    try { if (await services?.assistant?.http(req, res)) return; }
    catch (error) { failure(error); return; }
  }
  if (url === "/api/plugin-screens") {
    if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
    try {
      const text = decodeUtf8(await readRequestBody(req, Math.min(bodyLimit, VIEW_TRANSPORT_LIMITS.requestBytes)));
      const input = JSON.parse(text);
      const result = services?.views ? await services.views.execute(input) : await executeViewOperation(input, { access });
      sendJson(res, result.receipt.outcome === "success" ? 200 : 400, result);
    } catch (error) { failure(error); }
    return;
  }
  if (url === "/api/host-capabilities" && req.method === "GET") {
    sendJson(res, 200, { fileDeletion: removeFile && (removeFile !== trashFile || await osTrashAvailable()) ? "trash" : "permanent", identity: await hostIdentity() }); return;
  }
  if (url === "/api/templates" || url === "/api/template") {
    try {
      if (req.method === "GET") {
        const input = { language: query.get("language") ?? "en" }, scope = { access, directory: templatesDirectory };
        sendJson(res, 200, url === "/api/templates" ? executeTemplateOperation("list", input, scope)
          : executeTemplateOperation("read", { ...input, template: query.get("id") ?? "" }, scope));
      } else if (req.method === "POST" && url === "/api/templates") {
        sendJson(res, 201, executeTemplateOperation("save", JSON.parse(await readBody(req)), { access, directory: templatesDirectory }));
      } else { res.statusCode = 405; res.end(); }
    } catch (error) { failure(error); }
    return;
  }
  if (url === "/api/file") {
    if (req.method !== "DELETE" && req.method !== "PATCH") { res.statusCode = 405; res.end(); return; }
    try {
      const request = JSON.parse(await readBody(req));
      sendJson(res, 200, req.method === "DELETE" ? await deleteFile(request as FileOperationRequest, access, removeFile) : renameFile(request as RenameFileRequest, access));
    } catch (error) {
      if (error instanceof ReferencedImageError) sendJson(res, 400, { error: error.message, references: error.references });
      else if (error instanceof ImageRenameError) sendJson(res, 400, { error: error.message, updatedDocuments: error.updatedDocuments, skippedDocuments: error.skippedDocuments });
      else failure(error);
    }
    return;
  }
  if (url === "/api/folder-trash") {
    if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
    try {
      const folderTrash = removeFile === trashFile && !await osTrashAvailable() ? undefined : removeFile;
      const result = await executeFolderTrash(JSON.parse(await readBody(req)), { access, remove: folderTrash });
      sendJson(res, result.receipt.outcome === "success" ? 200 : 400, result);
    } catch (error) { failure(error); }
    return;
  }
  if (url === "/api/file-preview") {
    if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; res.end(); return; }
    try {
      const { bytes, mime } = readFilePreview(query.get("root") ?? undefined, query.get("path") ?? undefined, access);
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch (error) { failure(error); }
    return;
  }
  if (url.startsWith("/document/")) {
    if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; res.end(); return; }
    serveMedia(url.slice("/document/".length), res, query.get("path") ?? undefined, access, req.method === "HEAD");
    return;
  }
  if (url === "/api/bibliography") {
    if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
    try {
      // Read only declarations from an admitted document, never arbitrary caller-supplied targets.
      const requestedPath = query.get("path") ?? undefined;
      const filePath = resolveDocumentPath(requestedPath, access);
      const source = decodeUtf8(readFileSync(filePath));
      const revision = documentRevision(source);
      const declarations = documents
        ? await withDocumentResponse(res, signal => documents.read({ kind: "bibliography", path: filePath, source }, signal))
        : readModel(source).bibliography.declarations;
      const sources = query.get("revision") !== revision
        ? declarations.map(source => ({ source, status: "error", code: "bibliography-changed" }))
        : readBibliographySources(filePath, declarations, access, query.get("root") ?? undefined);
      sendJson(res, 200, { revision, sources });
    } catch (error) { failure(error); }
    return;
  }
  if (url === "/api/figure-validation") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      sendJson(res, 200, { error: validateFigureRequest(JSON.parse(await readBody(req))) ?? null });
    } catch (error) {
      failure(error);
    }
    return;
  }
  if (url === "/api/document-compare") {
    if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
    try { sendJson(res, 200, executeCompareOperation(JSON.parse(await readBody(req)))); }
    catch (error) { failure(error); }
    return;
  }
  if (url === "/api/document-source") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      if (query.get("recovery") === "1") {
        const body: unknown = JSON.parse(await readBody(req));
        if (!isObject(body) || typeof body.path !== "string" || !body.path.trim()) throw new Error("document path is required");
        if (body.save !== undefined && !isObject(body.save)) throw new Error("invalid session source");
        const request = body.save === undefined ? undefined : saveRequestOf({ ...body.save as object, path: body.path });
        sendJson(res, 200, previewRecoveryFile(body.path, request, access));
        return;
      }
      const request = saveRequestOf(JSON.parse(await readBody(req)));
      sendJson(res, 200, previewDocumentFile(request.path, request, access));
    } catch (error) {
      failure(error);
    }
    return;
  }
  if (url === "/api/folder-browse" || url === "/api/folder-places") {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      sendJson(res, 200, url === "/api/folder-places" ? folderPlaces(access)
        : browseFolder(query.get("path") ?? undefined, access, query.get("files") === "image" ? "image" : query.get("files") === "pdf" ? "pdf" : "document"));
    } catch (error) {
      failure(error);
    }
    return;
  }
  if (url === "/api/folder-version") {
    if (req.method !== "GET") { res.statusCode = 405; res.end(); return; }
    try {
      const paths: unknown = query.has("paths") ? JSON.parse(query.get("paths")!) : [];
      if (!Array.isArray(paths) || paths.some(path => typeof path !== "string" || !path.trim())) throw new Error("paths must be an array of file paths");
      const root = query.get("root");
      sendJson(res, 200, { ...(root || !paths.length ? folderVersion(root ?? undefined, access) : {}),
        ...(paths.length ? { revisions: documentRevisions(paths, access) } : {}) });
    }
    catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) sendJson(res, 200, { unavailable: true });
      else failure(error);
    }
    return;
  }
  if (url === "/api/folder") {
    if (req.method !== "GET" && req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      if (req.method === "POST") {
        const body = JSON.parse(await readBody(req)) as { parent?: unknown; name?: unknown };
        sendJson(res, 201, createFolder(typeof body.parent === "string" ? body.parent : undefined, typeof body.name === "string" ? body.name : undefined, access));
        return;
      }
      sendJson(res, 200, listFolder(query.get("root") ?? undefined, query.get("path") ?? undefined, access));
    } catch (error) {
      // Disappearance during a background refresh is an availability result, not a failed command.
      if (req.method === "GET" && query.get("background") === "1" && error instanceof Error &&
          (error.message === "folder does not exist" || ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))) {
        sendJson(res, 200, { error: fileErrorMessage(error, access), unavailable: true });
      } else failure(error);
    }
    return;
  }
  if (url !== "/api/document") {
    if (url.startsWith("/api/")) {
    try {
      if (url === "/api/plugins/icon" && req.method === "GET" && services?.plugins) {
        const icon = await services.plugins.host.icon(query.get("id") ?? "", query.get("digest") ?? "");
        res.setHeader("Content-Type", icon.mime);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader("Cache-Control", "no-store");
        res.end(icon.bytes); return;
      }
      const service = (url.startsWith("/api/plugins") || url === "/api/reviews") ? services?.plugins : url.startsWith("/api/assistant/") ? services?.assistant : undefined;
      const route = service?.route(url);
      if (route) {
        const operation = route[req.method ?? ""];
        if (!operation) { res.statusCode = 405; res.end(); return; }
        const args = req.method === "GET" ? Object.fromEntries(query) : JSON.parse(url.startsWith("/api/assistant/") ? decodeUtf8(await readRequestBody(req, Math.min(bodyLimit, ASSISTANT_TRANSPORT_LIMITS.requestBytes))) : await readBody(req));
        let result;
        try { result = await service!.invoke(operation, args); }
        catch (error) {
          if (error instanceof PluginSettingsError) { sendJson(res, 400, { error: error.message, settingsIssues: error.settingsIssues }); return; }
          if (error instanceof PluginArtifactChangedError) { sendJson(res, 400, { error: error.message, artifactChanged: true }); return; }
          throw error;
        }
        sendJson(res, 200, result);
        return;
      }
    } catch (error) { failure(error); return; }
  }
  next();
    return;
  }

  try {
    if (req.method === "GET") {
      const requestedPath = query.get("path") ?? undefined;
      if (access && !requestedPath?.trim()) {
        sendJson(res, 200, { start: true, allowedRoots: access.roots, ...sampleAvailability });
      } else {
        const opened = documents ? await withDocumentResponse(res, signal => openEditorFile(requestedPath, access, documents, signal))
          : loadEditorFile(requestedPath, access);
        sendJson(res, 200, { ...opened, ...sampleAvailability });
      }
      return;
    }
    if (req.method === "PUT") {
      const body = JSON.parse(await readBody(req)) as { path?: unknown; template?: unknown; language?: unknown; authoring?: unknown; images?: unknown };
      if (Object.hasOwn(body, "authoring")) {
        if (body.template !== undefined || body.language !== undefined) throw new Error("authoring cannot be combined with template or language");
        if (typeof body.path !== "string" || !body.path.trim()) throw new Error("document path is required");
        const created = await createAuthoredDocumentFile(body.path, { authoring: body.authoring, images: body.images ?? [] }, access);
        sendJson(res, 201, created);
        return;
      }
      const receipt = body.template === undefined ? undefined : executeTemplateOperation("create", body, { access, directory: templatesDirectory });
      const created = receipt ? { ...receipt, kind: "native", ...readModel(receipt.source) }
        : createDocumentFile(typeof body.path === "string" ? body.path : undefined, access);
      sendJson(res, 201, created);
      return;
    }
    if (req.method === "POST") {
      const body: unknown = JSON.parse(await readBody(req));
      if (isObject(body) && body.kind === "text") {
        if (Object.keys(body).some(key => !["kind", "path", "revision", "source"].includes(key)) ||
            typeof body.path !== "string" || !body.path.trim() || typeof body.source !== "string" ||
            typeof body.revision !== "string" || !/^[a-f0-9]{64}$/.test(body.revision)) throw new Error("invalid text save request");
        const request = body as TextSaveRequest;
        const saved = documents ? await withDocumentResponse(res, signal => saveFileInOrder(request, access, documents, signal))
          : saveTextFile(request, access);
        sendJson(res, 200, saved);
        return;
      }
      const request = saveRequestOf(body);
      try {
        const saved = documents ? await withDocumentResponse(res, signal => saveFileInOrder(request, access, documents, signal))
          : saveDocumentFile(request.path, request, access);
        sendJson(res, 200, { revision: saved.revision, ...(saved.pendingLocalWrite ? { pendingLocalWrite: true } : {}),
          ...(saved.blocks ? { blocks: saved.blocks } : {}) } satisfies SaveResponse);
      } catch (error) {
        if (error instanceof DocumentConflictError) {
          sendJson(res, 409, errorPayload(error, access));
          return;
        }
        throw error;
      }
      return;
    }
    res.statusCode = 405;
    res.end();
  } catch (error) {
    failure(error);
  }
}

function saveRequestOf(value: unknown): SaveRequest {
  if (!isObject(value) || typeof value.path !== "string" || !value.path.trim()) throw new Error("document path is required");
  const { path, revision, base, describe, ...edits } = value;
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision)) throw new Error("invalid document revision");
  if (!isObject(base) || typeof base.source !== "string") throw new Error("invalid session source");
  if (describe !== undefined && describe !== true) throw new Error("invalid describe request");
  const savedEdits = base.savedEdits === undefined ? undefined : supportedEditsOf(base.savedEdits);
  return { ...supportedEditsOf(edits), path, revision,
    base: { source: base.source, ...(savedEdits === undefined ? {} : { savedEdits }) }, ...(describe ? { describe } : {}) };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function supportedEditsOf(value: unknown): SupportedEdits {
  if (!isObject(value)) throw new Error("invalid session edits");
  const arrayFields = ["headings", "headingLevels", "paragraphs", "equations", "figures", "cells", "tables", "tableCaptions", "tableNotes",
    "admonitions", "quotes", "footnotes", "lists", "codes", "labels", "enumerators", "splits", "merges", "inserts", "deletes", "order", "bibliography"] as const;
  for (const key of Object.keys(value)) {
    if (key !== "status" && key !== "title" && key !== "headingNumbering" && key !== "referenceTemplates" && !arrayFields.some(field => field === key)) throw new Error(`invalid ${key} edits`);
  }
  for (const key of arrayFields) {
    if (value[key] !== undefined && !Array.isArray(value[key])) throw new Error(`invalid ${key} edits`);
  }
  if (value.title !== undefined && value.title !== null && typeof value.title !== "string") throw new Error("invalid document title");
  if (value.headingNumbering !== undefined && typeof value.headingNumbering !== "boolean") throw new Error("invalid heading numbering");
  return value as SupportedEdits;
}

/** Where choosing a folder can start: the home and Documents folders, then each drive or `/`. */
export function folderPlaces(access: FileAccess = LOCAL_FILE_ACCESS): FolderPlacesResponse {
  if (access) return { places: access.roots.map(root => ({ kind: "root", name: path.basename(root) || root, path: access.resolve(root) })) };
  const home = os.homedir();
  const documents = path.join(home, "Documents");
  const drives = process.platform === "win32"
    ? [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(letter => `${letter}:\\`).filter(drive => fs.existsSync(drive))
    : ["/"];
  return {
    places: [
      { kind: "home", name: "Home", path: home },
      ...(isDirectory(documents) ? [{ kind: "documents" as const, name: "Documents", path: documents }] : []),
      ...drives.map(drive => ({ kind: "drive" as const, name: drive, path: drive })),
    ],
  };
}

/**
 * Creates one folder inside an existing folder; an existing file or folder is never replaced.
 * The name is a single portable name, so the folder can be listed and moved between systems.
 */
export function createFolder(requestedParent: string | undefined, requestedName: string | undefined, access: FileAccess = LOCAL_FILE_ACCESS): FolderCreateResponse {
  if (!requestedParent?.trim()) throw new Error("folder path is required");
  const name = requestedName ?? "";
  assertUnicode(name);
  if (!name.trim()) throw new Error("folder name is required");
  if (name === "." || name === ".." || /[\\/]/.test(name)) throw new Error("folder name cannot contain a directory path");
  // Hidden folders are not listed, so one created here would seem to disappear.
  if (name.startsWith(".")) throw new Error("folder name cannot start with a dot");
  if (/[<>:"|?*\u0000-\u001f]/.test(name)) throw new Error("folder name cannot contain < > : \" | ? * or control characters");
  if (/[. ]$/.test(name)) throw new Error("folder name cannot end with a dot or space");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name)) throw new Error("folder name is reserved on Windows");
  const parent = path.resolve(accessPath(requestedParent.trim(), access));
  const folder = accessPath(path.join(parent, name), access, true);
  try {
    if (!statSync(parent).isDirectory()) throw new Error("folder path must point to a directory");
    fs.mkdirSync(folder);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") throw new Error("a file or folder with that name already exists");
    if (code === "ENOENT") throw new Error("folder does not exist");
    if (code === "ENOTDIR") throw new Error("folder path must point to a directory");
    if (code === "EACCES" || code === "EPERM") throw new Error("folder cannot be created: permission denied");
    throw error;
  }
  return { path: folder };
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function serveMedia(assetPath: string, res: ServerResponse, documentPath?: string, access: FileAccess = LOCAL_FILE_ACCESS, head = false): void {
  let file: string;
  try {
    file = resolveMediaPath(assetPath, documentPath, access);
  } catch (error) {
    res.statusCode = fileErrorStatus(error);
    res.end();
    return;
  }
  try {
    const data = readFileSync(accessPath(file, access));
    res.statusCode = 200;
    res.setHeader("Content-Type", MEDIA_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(head ? undefined : data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.destroyed) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** Folder preview is independent of document admission and document-relative media permissions. */
export function readFilePreview(requestedRoot: string | undefined, requestedPath: string | undefined, access: FileAccess = LOCAL_FILE_ACCESS): { bytes: Buffer; mime: string } {
  if (!requestedRoot?.trim() || !requestedPath?.trim()) throw new Error("folder and preview paths are required");
  const root = path.resolve(accessPath(requestedRoot, access));
  const file = path.resolve(accessPath(requestedPath, access));
  const verify = () => {
    if (!statSync(root).isDirectory() || !inside(root, file) || root === file) throw new FileAccessError();
    if (!inside(fs.realpathSync(root), fs.realpathSync(file))) throw new FileAccessError();
    // Unlike document media, preview accepts no symlink below the selected root, even within it.
    for (let current = file; path.relative(root, current) !== ""; current = path.dirname(current)) {
      if (fs.lstatSync(current).isSymbolicLink()) throw new FileAccessError();
    }
    accessPath(file, access);
  };
  verify();
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile()) throw new FileAccessError("Only regular image or PDF files can be previewed.");
  const pdf = path.extname(file).toLowerCase() === ".pdf";
  const limit = pdf ? 25 * 1024 * 1024 : MAX_ASSET_BYTES;
  const tooLarge = () => new ImageValidationError(pdf ? "PDF exceeds the 25 MiB limit." : "Image exceeds the 10 MiB limit.", 413);
  const mime = pdf ? "application/pdf" : MEDIA_TYPES[path.extname(file).toLowerCase()];
  if (!mime) throw new Error("Unsupported preview format.");
  if (before.size > limit) throw tooLarge();
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new FileAccessError();
    // Bounded even if the file grows after stat; never read an unbounded stream into memory.
    const buffer = Buffer.alloc(limit + 1);
    let length = 0, count: number;
    while (length < buffer.length && (count = fs.readSync(descriptor, buffer, length, buffer.length - length, null)) > 0) length += count;
    if (length > limit) throw tooLarge();
    verify();
    const current = fs.lstatSync(file, { bigint: true });
    if (current.dev !== opened.dev || current.ino !== opened.ino || current.size !== opened.size || current.mtimeMs !== opened.mtimeMs) throw new FileAccessError();
    const bytes = buffer.subarray(0, length);
    if (pdf) {
      if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF.");
    } else if (mime === "image/svg+xml") {
      // Sniff the SVG root after an optional exported prolog. Never parse a DTD or resolve entities;
      // the browser's image decoder handles XML. This is not sanitization; CSP/img isolate active SVG.
      if (!/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*(?:<!DOCTYPE\s+svg\b[^<>\[\]]*>\s*)?(?:<!--[^]*?-->\s*)*<svg(?:\s|\/?>)/i.test(decodeUtf8(bytes))) throw new Error("Invalid SVG image.");
    } else validateImage(mime, bytes);
    return { bytes, mime };
  } finally { fs.closeSync(descriptor); }
}
